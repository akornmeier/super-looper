#!/usr/bin/env python3
"""Deterministic workflow kernel and state engine for sl-run.

The kernel is the only caller allowed to mutate run-state.json. Agents receive
bounded packets and return typed JSON; they never call this script or edit the
plan, strategy, state, packets, or results.
"""

from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile
import time
from typing import Any, Iterator


EX_USAGE = 2
EX_INVALID = 3
EX_RESUME = 4
EX_STATE = 5
EX_GOAL_DRIFT = 8
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
RUN_ID_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,127})$")
PHASE_RE = re.compile(r"^## P\d+\.\s+.+?\s+`([a-z0-9-]+)`\s*$", re.MULTILINE)
UNIT_RE = re.compile(
    r"^### U\d+\.\s+.+?\s+`([a-z0-9-]+)`\s+`(\[\]|\[wip\]|\[x\]|\[f\])`\s*$",
    re.MULTILINE,
)
TERMINAL_STATUSES = {"completed", "failed", "cancelled"}
KERNEL_STAGES = {
    "idle",
    "awaiting-router",
    "awaiting-proposal-approval",
    "awaiting-worker",
    "checking",
    "awaiting-repair",
    "awaiting-verifier",
    "review-ready",
    "delivery-ready",
    "awaiting-ci",
    "awaiting-closeout",
    "completed",
    "failed",
}
PROFILE_NAMES = {"chore", "bug", "feature", "hotfix"}
ISOLATION_MODES = {"sandbox", "worktree", "shared"}


class RunError(Exception):
    def __init__(self, code: int, message: str, **details: Any):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def emit(value: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(value, sort_keys=True) + "\n")


def atomic_write(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(temp_name)


def atomic_write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(value)
            if not value.endswith("\n"):
                handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(temp_name)


def read_json(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RunError(EX_INVALID, f"unable to read {label}: {error}", path=str(path)) from error
    if not isinstance(value, dict):
        raise RunError(EX_INVALID, f"{label} must be a JSON object", path=str(path))
    return value


@contextlib.contextmanager
def state_lock(state_path: Path) -> Iterator[None]:
    lock = Path(f"{state_path}.lock")
    try:
        lock.mkdir()
    except FileExistsError as error:
        raise RunError(EX_STATE, "run state is already being updated", state_path=str(state_path)) from error
    try:
        yield
    finally:
        with contextlib.suppress(OSError):
            lock.rmdir()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as error:
        raise RunError(EX_INVALID, f"unable to hash file: {error}", path=str(path)) from error
    return digest.hexdigest()


def git(target: Path, *args: str, check: bool = True) -> str:
    process = subprocess.run(
        ["git", *args], cwd=target, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    if check and process.returncode != 0:
        raise RunError(
            EX_RESUME,
            f"git {' '.join(args)} failed: {process.stderr.strip()}",
            target=str(target),
        )
    return process.stdout.strip()


def resolve_inside(target: Path, value: str, label: str, must_exist: bool = True) -> tuple[Path, str]:
    candidate = Path(value)
    absolute = candidate.resolve() if candidate.is_absolute() else (target / candidate).resolve()
    try:
        relative = absolute.relative_to(target)
    except ValueError as error:
        raise RunError(EX_INVALID, f"{label} must stay inside the target repository", path=value) from error
    if must_exist and not absolute.is_file():
        raise RunError(EX_INVALID, f"{label} not found", path=value)
    return absolute, relative.as_posix()


def scalar(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        return value[1:-1]
    return value


def frontmatter(markdown: str) -> tuple[dict[str, str], str]:
    if not markdown.startswith("---\n"):
        raise RunError(EX_INVALID, "plan must start with YAML frontmatter")
    end = markdown.find("\n---\n", 4)
    if end == -1:
        raise RunError(EX_INVALID, "plan frontmatter is not terminated")
    values: dict[str, str] = {}
    for line in markdown[4:end].splitlines():
        if not line.strip() or line.lstrip().startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        values[key.strip()] = scalar(value)
    return values, markdown[end + 5 :]


def section(markdown: str, heading: str) -> str:
    match = re.search(rf"^{re.escape(heading)}\s*$", markdown, re.MULTILINE)
    if not match:
        return ""
    rest = markdown[match.end() :]
    next_heading = re.search(r"^##\s+", rest, re.MULTILINE)
    return rest[: next_heading.start()] if next_heading else rest


def list_items(block: str, label: str) -> list[str]:
    marker = re.search(rf"^\*\*{re.escape(label)}:\*\*\s*$", block, re.MULTILINE)
    if not marker:
        return []
    values: list[str] = []
    for line in block[marker.end() :].splitlines():
        stripped = line.strip()
        if stripped.startswith("**") or stripped.startswith("#"):
            break
        if stripped.startswith("- "):
            item = stripped[2:].strip()
            code_span = re.fullmatch(r"`([^`]+)`", item)
            if code_span:
                item = code_span.group(1)
            if item:
                values.append(item)
    return values


def inline(block: str, label: str, required: bool = False) -> str:
    match = re.search(rf"^\*\*{re.escape(label)}:\*\*\s*(.+?)\s*$", block, re.MULTILINE)
    value = match.group(1).strip() if match else ""
    if required and not value:
        raise RunError(EX_INVALID, f"missing required plan field: {label}")
    return value


def ids(value: str) -> list[str]:
    cleaned = value.replace("`", "").strip()
    if not cleaned or cleaned.lower() == "none":
        return []
    return [item.strip() for item in cleaned.split(",") if item.strip()]


def inline_list(value: str) -> list[str]:
    cleaned = value.strip()
    if not cleaned or cleaned.lower() == "none":
        return []
    return [item.strip() for item in re.split(r"\s*[;,]\s*", cleaned) if item.strip()]


def validate_graph(items: list[dict[str, Any]], child_key: str | None = None) -> None:
    candidates = items
    if child_key is not None:
        for item in items:
            validate_graph(item[child_key])
        return
    names = [item["id"] for item in candidates]
    if len(names) != len(set(names)):
        raise RunError(EX_INVALID, "plan contains duplicate IDs")
    known = set(names)
    for item in candidates:
        if not ID_RE.fullmatch(item["id"]):
            raise RunError(EX_INVALID, "plan ID must be lowercase hyphen-case", id=item["id"])
        for dependency in item["depends_on"]:
            if dependency not in known:
                raise RunError(EX_INVALID, "plan contains an unknown dependency", dependency=dependency)
            if dependency == item["id"]:
                raise RunError(EX_INVALID, "plan item cannot depend on itself", id=item["id"])
    visiting: set[str] = set()
    visited: set[str] = set()
    by_id = {item["id"]: item for item in candidates}

    def visit(name: str) -> None:
        if name in visited:
            return
        if name in visiting:
            raise RunError(EX_INVALID, "plan dependency graph contains a cycle", id=name)
        visiting.add(name)
        for dependency in by_id[name]["depends_on"]:
            visit(dependency)
        visiting.remove(name)
        visited.add(name)

    for name in names:
        visit(name)


def parse_plan(path: Path) -> dict[str, Any]:
    markdown = path.read_text(encoding="utf-8")
    meta, body = frontmatter(markdown)
    if meta.get("schema_version") != "1":
        raise RunError(EX_INVALID, "plan schema_version must be 1")
    goal = meta.get("goal", "").strip()
    if not goal:
        raise RunError(EX_INVALID, "plan frontmatter must contain one goal")

    requirements = [
        re.sub(r"^R\d+\.\s*", "", line.strip()[2:]).strip()
        for line in section(body, "## Requirements").splitlines()
        if line.strip().startswith("- ")
    ]
    phase_matches = list(PHASE_RE.finditer(body))
    if not phase_matches:
        raise RunError(EX_INVALID, "plan must contain at least one canonical phase heading")
    phases: list[dict[str, Any]] = []
    for phase_index, phase_match in enumerate(phase_matches):
        phase_end = phase_matches[phase_index + 1].start() if phase_index + 1 < len(phase_matches) else len(body)
        phase_block = body[phase_match.end() : phase_end]
        unit_matches = list(UNIT_RE.finditer(phase_block))
        if not unit_matches:
            raise RunError(EX_INVALID, "each phase must contain at least one canonical unit", phase=phase_match.group(1))
        phase_header = phase_block[: unit_matches[0].start()]
        units: list[dict[str, Any]] = []
        for unit_index, unit_match in enumerate(unit_matches):
            unit_end = unit_matches[unit_index + 1].start() if unit_index + 1 < len(unit_matches) else len(phase_block)
            unit_block = phase_block[unit_match.end() : unit_end]
            completion_marker = unit_block.find("**Phase completion gate:**")
            if completion_marker >= 0:
                unit_block = unit_block[:completion_marker]
            unit = {
                "id": unit_match.group(1),
                "scope": inline(unit_block, "Scope", required=True),
                "files_or_area": list_items(unit_block, "Files or area"),
                "acceptance": list_items(unit_block, "Acceptance"),
                "verification": list_items(unit_block, "Verification"),
                "depends_on": ids(inline(unit_block, "Depends on")),
                "non_goals": list_items(unit_block, "Non-goals"),
            }
            for field in ("files_or_area", "acceptance", "verification"):
                if not unit[field]:
                    raise RunError(EX_INVALID, f"unit {unit['id']} has no {field}")
            units.append(unit)
        completion_gate = list_items(phase_block, "Phase completion gate")
        if not completion_gate:
            raise RunError(EX_INVALID, "phase has no completion gate", phase=phase_match.group(1))
        phases.append(
            {
                "id": phase_match.group(1),
                "goal": inline(phase_header, "Goal", required=True),
                "depends_on": ids(inline(phase_header, "Depends on")),
                "work_units": units,
                "risks": inline_list(inline(phase_header, "Risks")),
                "completion_gate": completion_gate,
            }
        )
    validate_graph(phases)
    validate_graph(phases, "work_units")
    plan: dict[str, Any] = {
        "schema_version": 1,
        "goal": goal,
        "plan_type": meta.get("type", "").strip() or "plan",
        "requirements": requirements,
        "phases": phases,
    }
    profile = meta.get("workflow_profile", "").strip().lower()
    if profile:
        if profile not in PROFILE_NAMES:
            raise RunError(EX_INVALID, "plan workflow_profile is unsupported", profile=profile)
        plan["workflow_profile"] = profile
    return plan


def load_profile_catalog() -> dict[str, Any]:
    path = Path(__file__).resolve().parent.parent / "references" / "workflow-profiles.json"
    catalog = read_json(path, "workflow profile catalog")
    if catalog.get("schema_version") != 1 or set(catalog.get("profiles", {})) != PROFILE_NAMES:
        raise RunError(EX_INVALID, "workflow profile catalog does not match the U7 contract", path=str(path))
    return catalog


def route_workflow(plan: dict[str, Any], override: str | None, catalog: dict[str, Any]) -> dict[str, Any]:
    plan_profile = plan.get("workflow_profile")
    plan_type = plan.get("plan_type", "").strip().lower()
    risks = [risk for phase in plan["phases"] for risk in phase["risks"]]
    text = " ".join([plan["goal"], *plan["requirements"], *risks]).lower()
    phase_count = len(plan["phases"])
    unit_count = sum(len(phase["work_units"]) for phase in plan["phases"])
    floor: str | None
    source: str
    rationale: str
    signals: list[str]
    signal_floor: str | None = None
    signal = ""
    signal_rationale = ""
    if plan_type == "hotfix" or re.search(r"\b(hotfix|sev[- ]?[01]|production (?:down|outage)|active incident)\b", text):
        signal_floor, signal = "hotfix", "incident-or-hotfix"
        signal_rationale = "Incident or urgent production signal requires the hotfix profile."
    elif plan_type in {"fix", "bug"} or re.search(r"\b(bug|regression|reproduce|root cause)\b", text):
        signal_floor, signal = "bug", "defect"
        signal_rationale = "Defect signals require reproduction and regression evidence."
    elif plan_type in {"feat", "feature", "refactor"} or phase_count > 1 or unit_count > 1:
        signal_floor, signal = "feature", "feature-or-cross-cutting"
        signal_rationale = "Feature, refactor, or multi-unit scope requires the feature profile."
    elif plan_type in {"chore", "docs", "doc", "test", "ci", "build"}:
        signal_floor, signal = "chore", "bounded-maintenance"
        signal_rationale = "A bounded maintenance plan qualifies for the chore profile."
    if plan_profile:
        if signal_floor and catalog["profiles"][plan_profile]["risk_rank"] < catalog["profiles"][signal_floor]["risk_rank"]:
            raise RunError(EX_INVALID, "plan workflow_profile is below the deterministic safety floor", profile=plan_profile, safety_floor=signal_floor)
        floor, source = plan_profile, "explicit-plan"
        rationale = "Plan frontmatter selected the workflow profile without lowering observed risk."
        signals = [signal or "explicit-plan", f"workflow_profile:{plan_profile}"]
        signal_floor = signal_floor or plan_profile
    elif signal_floor:
        floor, source, rationale, signals = signal_floor, "deterministic", signal_rationale, [signal]
    elif plan_type == "plan":
        floor, source = "feature", "deterministic"
        rationale, signals, signal_floor = "An unclassified canonical plan uses the conservative feature profile.", ["canonical-plan-default"], "feature"
    else:
        floor, source = None, "agent"
        rationale, signals = "Deterministic signals are insufficient to classify the work safely.", ["ambiguous"]
    if override:
        if floor and catalog["profiles"][override]["risk_rank"] < catalog["profiles"][floor]["risk_rank"]:
            raise RunError(EX_INVALID, "profile override is below the deterministic safety floor", override=override, safety_floor=floor)
        return {
            "status": "selected",
            "profile": override,
            "source": "override",
            "rationale": "User selected a profile without lowering the deterministic safety floor.",
            "signals": [*signals, f"override:{override}"],
            "safety_floor": signal_floor,
        }
    if floor:
        return {"status": "selected", "profile": floor, "source": source, "rationale": rationale, "signals": signals, "safety_floor": signal_floor or floor}
    return {"status": "needs-agent", "profile": None, "source": "agent", "rationale": rationale, "signals": signals, "safety_floor": None}


def scopes_overlap(left: list[str], right: list[str]) -> bool:
    def normalize(value: str) -> str:
        return value.replace("\\", "/").removeprefix("./").rstrip("/")
    for left_value in left:
        for right_value in right:
            first, second = normalize(left_value), normalize(right_value)
            if not first or not second or first == "." or second == "." or "*" in first or "*" in second:
                return True
            if first == second or first.startswith(f"{second}/") or second.startswith(f"{first}/"):
                return True
    return False


def depends_transitively(unit_id: str, target_id: str, units: dict[str, dict[str, Any]], seen: set[str] | None = None) -> bool:
    visited = seen or set()
    if unit_id in visited:
        return False
    visited.add(unit_id)
    return any(
        dependency == target_id or depends_transitively(dependency, target_id, units, visited)
        for dependency in units[unit_id]["depends_on"]
    )


def select_isolation(
    plan: dict[str, Any], profile: str, catalog: dict[str, Any], available: list[str], requested_workers: int
) -> dict[str, Any]:
    capabilities = list(dict.fromkeys(available or ["shared"]))
    selected = "sandbox" if "sandbox" in capabilities else "worktree" if "worktree" in capabilities else "shared"
    hard_limit = max(1, min(3, requested_workers, catalog["profiles"][profile]["max_workers"]))
    best_group: list[str] = []
    for phase in plan["phases"]:
        units = {unit["id"]: unit for unit in phase["work_units"]}
        group: list[str] = []
        for unit in phase["work_units"]:
            if len(group) >= hard_limit:
                break
            independent = all(
                not depends_transitively(unit["id"], other_id, units)
                and not depends_transitively(other_id, unit["id"], units)
                and not scopes_overlap(unit["files_or_area"], units[other_id]["files_or_area"])
                for other_id in group
            )
            if independent:
                group.append(unit["id"])
        if len(group) > len(best_group):
            best_group = group
    parallel = selected != "shared" and hard_limit > 1 and len(best_group) > 1
    if selected == "shared":
        reason = "shared checkout forces serial execution"
    elif parallel:
        reason = "isolated, DAG-independent, non-overlapping units are eligible"
    else:
        reason = "profile, dependency, or ownership constraints force serial execution"
    return {
        "available": capabilities,
        "selected": selected,
        "requested_workers": requested_workers,
        "max_workers": min(hard_limit, len(best_group)) if parallel else 1,
        "parallel_eligible": parallel,
        "eligible_group": best_group if parallel else [],
        "reason": reason,
    }


def load_bundle(state_path: Path) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    state = read_json(state_path, "run state")
    plan = read_json(state_path.parent / "execution-plan.json", "execution plan")
    meta = read_json(state_path.parent / "run-meta.json", "run metadata")
    if state.get("schema_version") != 1 or plan.get("schema_version") != 1:
        raise RunError(EX_INVALID, "unsupported run schema version", state_path=str(state_path))
    return state, plan, meta


def check_resume(state: dict[str, Any], meta: dict[str, Any]) -> Path:
    if state.get("status") in {"completed", "failed", "cancelled"}:
        raise RunError(EX_STATE, "terminal run state cannot resume", status=state.get("status"))
    target = Path(meta["target"]).resolve()
    if not target.is_dir():
        raise RunError(EX_RESUME, "target repository is unavailable", target=str(target))

    plan_path = target / state["plan"]["path"]
    if not plan_path.is_file():
        raise RunError(
            EX_GOAL_DRIFT,
            "plan disappeared after run initialization",
            typed_failure="goal-drift",
            file=state["plan"]["path"],
            expected=state["plan"]["sha256"],
            actual="absent",
        )
    actual_plan = sha256(plan_path)
    if actual_plan != state["plan"]["sha256"]:
        raise RunError(
            EX_GOAL_DRIFT,
            "plan changed after run initialization",
            typed_failure="goal-drift",
            file=state["plan"]["path"],
            expected=state["plan"]["sha256"],
            actual=actual_plan,
        )

    strategy_meta = meta["strategy"]
    strategy_path = target / strategy_meta["path"]
    if strategy_meta["absent"]:
        if strategy_path.exists():
            raise RunError(
                EX_GOAL_DRIFT,
                "strategy appeared after run initialization",
                typed_failure="goal-drift",
                file=strategy_meta["path"],
                expected="absent",
                actual=sha256(strategy_path),
            )
    else:
        if not strategy_path.is_file():
            raise RunError(
                EX_GOAL_DRIFT,
                "strategy disappeared after run initialization",
                typed_failure="goal-drift",
                file=strategy_meta["path"],
                expected=state["strategy"]["sha256"],
                actual="absent",
            )
        actual_strategy = sha256(strategy_path)
        if actual_strategy != state["strategy"]["sha256"]:
            raise RunError(
                EX_GOAL_DRIFT,
                "strategy changed after run initialization",
                typed_failure="goal-drift",
                file=strategy_meta["path"],
                expected=state["strategy"]["sha256"],
                actual=actual_strategy,
            )

    branch = git(target, "rev-parse", "--abbrev-ref", "HEAD")
    if branch != state["git"]["branch"]:
        raise RunError(
            EX_RESUME,
            "run branch changed",
            expected=state["git"]["branch"],
            actual=branch,
        )
    reachable = subprocess.run(
        ["git", "merge-base", "--is-ancestor", state["git"]["head_sha"], "HEAD"], cwd=target
    )
    if reachable.returncode != 0:
        raise RunError(EX_RESUME, "recorded run head is no longer reachable", head=state["git"]["head_sha"])
    return target


def current_unit(state: dict[str, Any]) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    phase = next((item for item in state["phases"] if item["status"] == "in_progress"), None)
    if not phase:
        return None, None
    unit = next((item for item in phase["units"] if item["status"] == "in_progress"), None)
    return phase, unit


def workflow(state: dict[str, Any]) -> dict[str, Any]:
    value = state.get("workflow")
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise RunError(EX_STATE, "run was not initialized for the workflow kernel")
    if value.get("stage") not in KERNEL_STAGES:
        raise RunError(EX_INVALID, "workflow state has an unsupported stage", stage=value.get("stage"))
    value.setdefault(
        "route",
        {
            "status": "selected",
            "profile": "feature",
            "source": "deterministic",
            "rationale": "Legacy U6 run resumes through the conservative feature profile.",
            "signals": ["legacy-u6-state"],
            "safety_floor": "feature",
        },
    )
    value.setdefault(
        "isolation",
        {
            "available": ["shared"],
            "selected": "shared",
            "requested_workers": 1,
            "max_workers": 1,
            "parallel_eligible": False,
            "eligible_group": [],
            "reason": "legacy U6 state resumes serially in the shared checkout",
        },
    )
    return value


def workflow_key(phase_id: str, unit_id: str) -> str:
    return f"{phase_id}/{unit_id}"


def node_id(kind: str, phase_id: str, unit_id: str | None, attempt: int) -> str:
    parts = [kind, phase_id]
    if unit_id:
        parts.append(unit_id)
    parts.append(str(attempt))
    return ".".join(parts)


def append_node(
    state: dict[str, Any],
    *,
    identifier: str,
    kind: str,
    status: str,
    attempt: int,
    phase_id: str | None,
    unit_id: str | None,
    input_paths: list[str] | None = None,
    output_paths: list[str] | None = None,
    session_handle: str | None = None,
    evidence: list[dict[str, Any]] | None = None,
    next_action: str | None = None,
    started_at: str | None = None,
) -> dict[str, Any]:
    flow = workflow(state)
    timestamp = now()
    node = {
        "id": identifier,
        "kind": kind,
        "status": status,
        "attempt": attempt,
        "phase_id": phase_id,
        "unit_id": unit_id,
        "input_paths": input_paths or [],
        "output_paths": output_paths or [],
        "session_handle": session_handle,
        "evidence": evidence or [],
        "next": next_action,
        "started_at": started_at or timestamp,
        "ended_at": timestamp if status in {"passed", "failed", "blocked"} else None,
    }
    flow["nodes"].append(node)
    flow["current_node"] = identifier if status in {"pending", "running"} else None
    return node


def finish_current_node(
    state: dict[str, Any],
    status: str,
    *,
    output_paths: list[str] | None = None,
    session_handle: str | None = None,
    evidence: list[dict[str, Any]] | None = None,
    next_action: str | None = None,
) -> dict[str, Any]:
    flow = workflow(state)
    identifier = flow.get("current_node")
    node = next((item for item in reversed(flow["nodes"]) if item["id"] == identifier), None)
    if not node or node["status"] not in {"pending", "running"}:
        raise RunError(EX_STATE, "workflow has no active node to finish")
    node["status"] = status
    node["output_paths"] = output_paths or node["output_paths"]
    node["session_handle"] = session_handle
    node["evidence"] = evidence or []
    node["next"] = next_action
    node["ended_at"] = now()
    flow["current_node"] = None
    return node


def summary(state: dict[str, Any], state_path: Path, **extra: Any) -> dict[str, Any]:
    phase, unit = current_unit(state)
    flow = state.get("workflow")
    if state["status"] in TERMINAL_STATUSES:
        next_action = "none"
    elif flow and flow["stage"] == "review-ready":
        next_action = "await-engineer-review"
    elif flow and flow["stage"] == "delivery-ready":
        next_action = "deliver"
    elif flow and flow["stage"] == "awaiting-ci":
        next_action = "observe-ci"
    elif flow and flow["stage"] == "awaiting-closeout":
        next_action = "dispatch-closeout"
    elif flow and flow["stage"] == "awaiting-router":
        next_action = "reconcile-in-progress-router"
    elif flow and flow["stage"] == "awaiting-proposal-approval":
        next_action = "await-hotfix-proposal-approval"
    elif state["status"] == "blocked":
        next_action = "resolve-blocker"
    elif flow and flow["stage"] in {"awaiting-worker", "awaiting-repair"}:
        next_action = "reconcile-in-progress-agent"
    elif flow and flow["stage"] == "checking":
        next_action = "run-checks"
    elif flow and flow["stage"] == "awaiting-verifier":
        next_action = "reconcile-in-progress-verifier"
    elif unit:
        next_action = "reconcile-in-progress-unit"
    elif phase and all(item["status"] == "completed" for item in phase["units"]):
        next_action = "verify-phase"
    else:
        next_action = "start-next"
    result = {
        "run_id": state["run_id"],
        "status": state["status"],
        "current_phase": phase["id"] if phase else None,
        "current_unit": unit["id"] if unit else None,
        "current_node": flow.get("current_node") if flow else None,
        "completed_gates": [item["id"] for item in state["phases"] if item["status"] == "completed"],
        "next_action": next_action,
        "state_path": str(state_path),
        "terminal_reason": state["terminal"]["reason"] if state.get("terminal") else None,
        "profile": flow.get("route", {}).get("profile") if flow else None,
        "route_source": flow.get("route", {}).get("source") if flow else None,
        "isolation_mode": flow.get("isolation", {}).get("selected") if flow else None,
        "max_workers": flow.get("isolation", {}).get("max_workers") if flow else None,
    }
    result.update(extra)
    return result


def initial_state(
    run_id: str,
    plan_rel: str,
    plan_hash: str,
    strategy: dict[str, str] | None,
    branch: str,
    base_ref: str,
    head: str,
    plan: dict[str, Any],
    kernel: bool = False,
    max_repair_attempts: int = 1,
    route: dict[str, Any] | None = None,
    isolation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    timestamp = now()
    state = {
        "schema_version": 1,
        "run_id": run_id,
        "plan": {"path": plan_rel, "sha256": plan_hash},
        "strategy": strategy,
        "git": {"branch": branch, "base_ref": base_ref, "head_sha": head},
        "status": "initialized",
        "current_phase": None,
        "phases": [
            {
                "id": phase["id"],
                "depends_on": phase["depends_on"],
                "status": "pending",
                "units": [
                    {
                        "id": unit["id"],
                        "depends_on": unit["depends_on"],
                        "status": "pending",
                        "worker_id": None,
                        "changed_files": [],
                        "evidence": [],
                        "unresolved": [],
                    }
                    for unit in phase["work_units"]
                ],
                "verification": {"status": "not_run", "evidence": []},
                "commits": [],
            }
            for phase in plan["phases"]
        ],
        "usage": {"available": False, "by_role": {}, "by_phase": {}},
        "learning_candidates": [],
        "strategy_observations": [],
        "started_at": timestamp,
        "updated_at": timestamp,
        "terminal": None,
    }
    if kernel:
        state["workflow"] = {
            "schema_version": 1,
            "stage": "idle",
            "current_node": None,
            "max_repair_attempts": max_repair_attempts,
            "repair_attempts": {},
            "sessions": {},
            "nodes": [],
            "route": route,
            "isolation": isolation,
            "review": {"status": "not-ready", "packet_path": None},
            "delivery": {
                "status": "not-authorized",
                "packet_path": None,
                "commit_sha": None,
                "pr_url": None,
                "ci_path": None,
            },
            "closeout": {
                "status": "not-started",
                "packet_path": None,
                "result_path": None,
                "learning": "pending",
                "strategy": "pending",
            },
        }
    return state


def open_hotfix_proposal_gate(
    state: dict[str, Any], state_path: Path, plan: dict[str, Any], catalog: dict[str, Any]
) -> str:
    flow = workflow(state)
    packet = {
        "schema_version": 1,
        "run_id": state["run_id"],
        "profile": "hotfix",
        "goal": plan["goal"],
        "requirements": plan["requirements"],
        "risks": [risk for phase in plan["phases"] for risk in phase["risks"]],
        "owned_scopes": [
            scope for phase in plan["phases"] for unit in phase["work_units"] for scope in unit["files_or_area"]
        ],
        "required_evidence": catalog["profiles"]["hotfix"]["required_evidence"],
        "question": "Approve this bounded hotfix proposal for implementation?",
        "delivery_authorized": False,
    }
    packet_path = state_path.parent / "hotfix-proposal.json"
    atomic_write(packet_path, packet)
    append_node(
        state,
        identifier="human.hotfix-proposal.0",
        kind="human",
        status="pending",
        attempt=0,
        phase_id=None,
        unit_id=None,
        input_paths=[str(packet_path)],
        next_action="await-hotfix-proposal-approval",
    )
    flow["stage"] = "awaiting-proposal-approval"
    return str(packet_path)


def run_changed_files(state: dict[str, Any]) -> list[str]:
    return sorted(
        {
            changed
            for phase in state["phases"]
            for unit in phase["units"]
            for changed in unit["changed_files"]
        }
    )


def conventional_title(plan: dict[str, Any]) -> str:
    plan_type = plan.get("plan_type", "chore").lower()
    prefix = {
        "feature": "feat",
        "feat": "feat",
        "fix": "fix",
        "bug": "fix",
        "hotfix": "fix",
        "refactor": "refactor",
        "docs": "docs",
        "test": "test",
        "ci": "ci",
        "build": "build",
    }.get(plan_type, "chore")
    goal = plan["goal"].strip().rstrip(".")
    summary_text = goal[:1].lower() + goal[1:]
    return f"{prefix}(run): {summary_text}"[:120]


def create_review_packet(
    state: dict[str, Any], plan: dict[str, Any], meta: dict[str, Any], state_path: Path, target: Path
) -> str:
    flow = workflow(state)
    changed_files = run_changed_files(state)
    diff_summary = git(target, "diff", "--stat", state["git"]["base_ref"], check=False)
    checks: list[dict[str, Any]] = []
    semantic: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []
    for node in flow["nodes"]:
        node_evidence = [
            {"summary": item["summary"], "path": item.get("path")}
            for item in node.get("evidence", [])
        ]
        if node["kind"] == "code" and node["id"].startswith("code.check"):
            checks.extend(node_evidence)
        if node["kind"] == "agent" and node["id"].startswith("agent.verifier"):
            semantic.extend(node_evidence)
        if node["status"] in {"failed", "blocked"}:
            failed.extend(node_evidence or [{"summary": f"{node['id']} ended {node['status']}", "path": None}])
    unresolved = sorted(
        {
            item
            for phase in state["phases"]
            for unit in phase["units"]
            for item in unit["unresolved"]
        }
        | {risk for phase in plan["phases"] for risk in phase["risks"]}
    )
    title = conventional_title(plan)
    body_path = state_path.parent / "proposed-pr-body.md"
    atomic_write_text(
        body_path,
        "\n".join(
            [
                f"## Summary\n\n{plan['goal']}",
                "## Verification\n\n" + ("\n".join(f"- {item['summary']}" for item in checks + semantic) or "- Review packet contains the recorded evidence."),
                "## Risks\n\n" + ("\n".join(f"- {item}" for item in unresolved) or "- No unresolved risks recorded."),
            ]
        ),
    )
    proposal_decision = state_path.parent / "hotfix-proposal-decision.json"
    proposal_approved = False
    if proposal_decision.is_file():
        proposal_approved = read_json(proposal_decision, "hotfix proposal decision").get("decision") == "approved"
    packet = {
        "schema_version": 1,
        "run_id": state["run_id"],
        "status": "review_ready",
        "intent": {"goal": plan["goal"], "requirements": plan["requirements"]},
        "scope": {"changed_files": changed_files, "diff_summary": diff_summary},
        "deterministic_checks": checks,
        "semantic_verification": semantic,
        "failed_attempts": failed,
        "unresolved_risks": unresolved,
        "workflow_profile": flow["route"]["profile"],
        "route_rationale": flow["route"]["rationale"],
        "authority": {
            "proposal_approved": proposal_approved,
            "delivery_authorized": False,
            "final_engineer_approval_required": True,
        },
        "proposed_delivery": {
            "action": meta.get("delivery_action", "commit-push-pr"),
            "commit_message": title,
            "pr_title": title,
            "pr_body_path": str(body_path),
        },
        "generated_at": now(),
    }
    review_path = state_path.parent / "review-packet.json"
    atomic_write(review_path, packet)
    return str(review_path)


def create_closeout_gate(state: dict[str, Any], state_path: Path, target: Path) -> str:
    flow = workflow(state)
    solution_index: list[dict[str, str]] = []
    solutions_root = target / "docs" / "solutions"
    if solutions_root.is_dir():
        for solution in sorted(solutions_root.rglob("*.md")):
            relative = solution.relative_to(target).as_posix()
            first_heading = next(
                (line.removeprefix("# ").strip() for line in solution.read_text(encoding="utf-8").splitlines() if line.startswith("# ")),
                relative,
            )
            solution_index.append({"path": relative, "title": first_heading})
    evidence_paths = sorted(
        {
            path
            for node in flow["nodes"]
            for path in [*node.get("input_paths", []), *node.get("output_paths", [])]
            if path
        }
    )
    packet = {
        "schema_version": 1,
        "run_id": state["run_id"],
        "review_packet_path": flow["review"]["packet_path"],
        "review_decision_path": flow["review"].get("decision_path"),
        "delivery": flow["delivery"],
        "changed_files": run_changed_files(state),
        "failed_attempts": [node["id"] for node in flow["nodes"] if node["status"] in {"failed", "blocked"}],
        "evidence_paths": evidence_paths,
        "existing_solutions": solution_index,
        "learning_gate": ["reusable", "evidence_backed", "novel", "behavior_changing"],
        "strategy_rule": "record observations or a proposal; never edit STRATEGY.md during the run",
    }
    packet_path = state_path.parent / "closeout-packet.json"
    atomic_write(packet_path, packet)
    append_node(
        state,
        identifier="agent.closeout.0",
        kind="agent",
        status="running",
        attempt=0,
        phase_id=None,
        unit_id=None,
        input_paths=[str(packet_path)],
        next_action="record-closeout",
    )
    flow["stage"] = "awaiting-closeout"
    flow["closeout"] = {
        "status": "awaiting-assessment",
        "packet_path": str(packet_path),
        "result_path": None,
        "learning": "pending",
        "strategy": "pending",
    }
    return str(packet_path)


def write_run_record(state: dict[str, Any], state_path: Path) -> str:
    flow = workflow(state)
    record = {
        "schema_version": 1,
        "run_id": state["run_id"],
        "outcome": state["status"],
        "profile": flow.get("route", {}).get("profile"),
        "started_at": state["started_at"],
        "ended_at": state.get("terminal", {}).get("ended_at") if state.get("terminal") else None,
        "pointers": {
            "state": str(state_path),
            "review_packet": flow.get("review", {}).get("packet_path"),
            "review_decision": flow.get("review", {}).get("decision_path"),
            "delivery_packet": flow.get("delivery", {}).get("packet_path"),
            "ci": flow.get("delivery", {}).get("ci_path"),
            "closeout": flow.get("closeout", {}).get("result_path"),
            "pr_url": flow.get("delivery", {}).get("pr_url"),
        },
        "learning": flow.get("closeout", {}).get("learning"),
        "strategy": flow.get("closeout", {}).get("strategy"),
    }
    record_path = state_path.parent / "run-record.json"
    atomic_write(record_path, record)
    return str(record_path)


def command_init(args: argparse.Namespace) -> None:
    target = Path(args.target).resolve()
    if not (target / ".git").exists():
        raise RunError(EX_INVALID, "target must be a git repository", target=str(target))
    plan_path, plan_rel = resolve_inside(target, args.plan, "plan")
    plan = parse_plan(plan_path)
    catalog = load_profile_catalog()
    route = route_workflow(plan, args.profile, catalog)
    run_id = args.run_id or f"run-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}-{os.getpid()}"
    if not RUN_ID_RE.fullmatch(run_id):
        raise RunError(EX_INVALID, "run id must be 1-128 portable filename characters", run_id=run_id)
    state_path = (
        Path(args.state).resolve()
        if args.state
        else Path("/tmp/super-looper/sl-run") / run_id / "run-state.json"
    )
    strategy_value = args.strategy or "STRATEGY.md"
    strategy_path, strategy_rel = resolve_inside(target, strategy_value, "strategy", must_exist=False)
    strategy_absent = not strategy_path.is_file()
    strategy_state = None if strategy_absent else {"path": strategy_rel, "sha256": sha256(strategy_path)}
    branch = git(target, "rev-parse", "--abbrev-ref", "HEAD")
    head = git(target, "rev-parse", "HEAD")
    base_ref = args.base_ref or head
    provisional_profile = route["profile"] or "feature"
    isolation_capabilities = args.isolation_capability or ["shared"]
    isolation = select_isolation(plan, provisional_profile, catalog, isolation_capabilities, args.max_workers)
    repair_cap = args.max_repair_attempts
    if repair_cap is None:
        repair_cap = catalog["profiles"][provisional_profile]["max_repair_attempts"]
    state = initial_state(
        run_id,
        plan_rel,
        sha256(plan_path),
        strategy_state,
        branch,
        base_ref,
        head,
        plan,
        kernel=args.kernel,
        max_repair_attempts=repair_cap,
        route=route,
        isolation=isolation,
    )
    meta = {
        "schema_version": 1,
        "target": str(target),
        "strategy": {"path": strategy_rel, "absent": strategy_absent},
        "isolation_capabilities": isolation_capabilities,
        "requested_workers": args.max_workers,
        "delivery_action": args.delivery_action,
    }
    state_path.parent.mkdir(parents=True, exist_ok=True)
    with state_lock(state_path):
        if state_path.exists():
            raise RunError(EX_STATE, "run state already exists; resume it instead", state_path=str(state_path))
        atomic_write(state_path.parent / "execution-plan.json", plan)
        atomic_write(state_path.parent / "run-meta.json", meta)
        if args.kernel and route["status"] == "needs-agent":
            route_packet = {
                "schema_version": 1,
                "run_id": run_id,
                "goal": plan["goal"],
                "requirements": plan["requirements"],
                "risks": [risk for phase in plan["phases"] for risk in phase["risks"]],
                "plan_type": plan.get("plan_type"),
                "phase_count": len(plan["phases"]),
                "unit_count": sum(len(phase["work_units"]) for phase in plan["phases"]),
                "available_profiles": sorted(PROFILE_NAMES),
                "deterministic_signals": route["signals"],
                "safety_floor": route["safety_floor"],
            }
            route_path = state_path.parent / "route-packet.json"
            atomic_write(route_path, route_packet)
            append_node(
                state,
                identifier="agent.router.0",
                kind="agent",
                status="running",
                attempt=0,
                phase_id=None,
                unit_id=None,
                input_paths=[str(route_path)],
                next_action="record-router",
            )
            workflow(state)["stage"] = "awaiting-router"
        elif args.kernel and route["profile"] == "hotfix":
            open_hotfix_proposal_gate(state, state_path, plan, catalog)
        atomic_write(state_path, state)
    extra: dict[str, Any] = {"plan_contract_path": str(state_path.parent / "execution-plan.json")}
    if args.kernel and route["status"] == "needs-agent":
        extra.update(next_action="dispatch-router", packet_path=str(state_path.parent / "route-packet.json"))
    elif args.kernel and route["profile"] == "hotfix":
        extra.update(next_action="await-hotfix-proposal-approval", packet_path=str(state_path.parent / "hotfix-proposal.json"))
    emit(summary(state, state_path, **extra))


def command_inspect(args: argparse.Namespace) -> None:
    state_path = Path(args.state).resolve()
    state, _, _ = load_bundle(state_path)
    emit(summary(state, state_path))


def command_resume(args: argparse.Namespace) -> None:
    state_path = Path(args.state).resolve()
    state, _, meta = load_bundle(state_path)
    check_resume(state, meta)
    emit(summary(state, state_path, resume_valid=True))


def phase_definition(plan: dict[str, Any], phase_id: str) -> dict[str, Any]:
    return next(item for item in plan["phases"] if item["id"] == phase_id)


def unit_definition(phase: dict[str, Any], unit_id: str) -> dict[str, Any]:
    return next(item for item in phase["work_units"] if item["id"] == unit_id)


ROUTER_KEYS = {"schema_version", "run_id", "role", "profile", "rationale", "signals_considered"}


def validate_router_result(value: dict[str, Any]) -> None:
    if set(value) != ROUTER_KEYS or value.get("schema_version") != 1 or value.get("role") != "router":
        raise RunError(EX_INVALID, "router result fields do not match the workflow contract")
    if value.get("profile") not in PROFILE_NAMES:
        raise RunError(EX_INVALID, "router result selected an unsupported profile")
    if not isinstance(value.get("rationale"), str) or not value["rationale"].strip():
        raise RunError(EX_INVALID, "router result requires a rationale")
    signals = value.get("signals_considered")
    if not isinstance(signals, list) or not signals or not all(isinstance(item, str) and item for item in signals):
        raise RunError(EX_INVALID, "router result signals_considered must be a non-empty array of strings")


def command_record_router(args: argparse.Namespace) -> None:
    state_path = Path(args.state).resolve()
    result_path = Path(args.result).resolve()
    if result_path.name.startswith("router-result-"):
        raise RunError(EX_INVALID, "router result input uses a kernel-reserved filename; use incoming-router-*.json")
    result = read_json(result_path, "router result")
    validate_router_result(result)
    with state_lock(state_path):
        state, plan, meta = load_bundle(state_path)
        check_resume(state, meta)
        flow = workflow(state)
        if flow["stage"] != "awaiting-router":
            raise RunError(EX_STATE, "workflow is not awaiting a router result", stage=flow["stage"])
        if result["run_id"] != state["run_id"]:
            raise RunError(EX_INVALID, "router result run_id does not match active run")
        catalog = load_profile_catalog()
        safety_floor = flow["route"].get("safety_floor")
        if safety_floor and catalog["profiles"][result["profile"]]["risk_rank"] < catalog["profiles"][safety_floor]["risk_rank"]:
            raise RunError(EX_INVALID, "router result is below the deterministic safety floor", profile=result["profile"], safety_floor=safety_floor)
        stored_result = state_path.parent / "router-result-0.json"
        if stored_result.exists():
            raise RunError(EX_STATE, "immutable router result already exists", path=str(stored_result))
        atomic_write(stored_result, result)
        finish_current_node(
            state,
            "passed",
            output_paths=[str(stored_result)],
            evidence=[{"summary": result["rationale"], "path": None, "command": None, "exit_code": None}],
            next_action="await-hotfix-proposal-approval" if result["profile"] == "hotfix" else "start-next",
        )
        flow["route"] = {
            "status": "selected",
            "profile": result["profile"],
            "source": "agent",
            "rationale": result["rationale"],
            "signals": result["signals_considered"],
            "safety_floor": safety_floor,
        }
        flow["max_repair_attempts"] = catalog["profiles"][result["profile"]]["max_repair_attempts"]
        flow["isolation"] = select_isolation(
            plan,
            result["profile"],
            catalog,
            meta.get("isolation_capabilities", ["shared"]),
            meta.get("requested_workers", 1),
        )
        packet_path: str | None = None
        if result["profile"] == "hotfix":
            packet_path = open_hotfix_proposal_gate(state, state_path, plan, catalog)
            next_action = "await-hotfix-proposal-approval"
        else:
            flow["stage"] = "idle"
            next_action = "start-next"
        state["updated_at"] = now()
        atomic_write(state_path, state)
    emit(summary(state, state_path, next_action=next_action, packet_path=packet_path, router_result_path=str(stored_result)))


def command_record_proposal_decision(args: argparse.Namespace) -> None:
    state_path = Path(args.state).resolve()
    with state_lock(state_path):
        state, _, meta = load_bundle(state_path)
        check_resume(state, meta)
        flow = workflow(state)
        if flow["stage"] != "awaiting-proposal-approval" or flow.get("route", {}).get("profile") != "hotfix":
            raise RunError(EX_STATE, "workflow is not awaiting hotfix proposal approval", stage=flow["stage"])
        evidence = [{"summary": f"hotfix proposal {args.decision} by {args.approved_by}", "path": None, "command": None, "exit_code": None}]
        if args.decision == "approved":
            finish_current_node(state, "passed", evidence=evidence, next_action="start-next")
            flow["stage"] = "idle"
            next_action = "start-next"
        else:
            finish_current_node(state, "blocked", evidence=evidence, next_action="resolve-blocker")
            flow["stage"] = "failed"
            state["status"] = "blocked"
            next_action = "resolve-blocker"
        decision_path = state_path.parent / "hotfix-proposal-decision.json"
        atomic_write(
            decision_path,
            {
                "schema_version": 1,
                "run_id": state["run_id"],
                "decision": args.decision,
                "approved_by": args.approved_by,
                "delivery_authorized": False,
                "recorded_at": now(),
            },
        )
        state["updated_at"] = now()
        atomic_write(state_path, state)
    emit(summary(state, state_path, next_action=next_action, proposal_decision_path=str(decision_path)))


def command_start_next(args: argparse.Namespace) -> None:
    state_path = Path(args.state).resolve()
    with state_lock(state_path):
        state, plan, meta = load_bundle(state_path)
        check_resume(state, meta)
        if state["status"] == "initialized":
            state["status"] = "running"
        if state["status"] != "running":
            raise RunError(EX_STATE, "run is not ready to start work", status=state["status"])
        flow = workflow(state) if state.get("workflow") else None
        if flow and flow["stage"] != "idle":
            raise RunError(EX_STATE, "workflow kernel is not ready to start another unit", stage=flow["stage"])

        phase_state, active_unit = current_unit(state)
        if active_unit:
            raise RunError(
                EX_STATE,
                "a unit is already in progress; resume must not dispatch it again",
                phase_id=phase_state["id"],
                unit_id=active_unit["id"],
            )
        if phase_state and all(item["status"] == "completed" for item in phase_state["units"]):
            raise RunError(EX_STATE, "current phase is ready for independent verification", phase_id=phase_state["id"])

        if not phase_state:
            completed = {item["id"] for item in state["phases"] if item["status"] == "completed"}
            phase_state = next(
                (
                    item
                    for item in state["phases"]
                    if item["status"] in {"pending", "ready"} and set(item["depends_on"]).issubset(completed)
                ),
                None,
            )
            if not phase_state:
                raise RunError(EX_STATE, "no dependency-ready phase remains")
            phase_state["status"] = "in_progress"
            state["current_phase"] = phase_state["id"]

        completed_units = {item["id"] for item in phase_state["units"] if item["status"] == "completed"}
        unit_state = next(
            (
                item
                for item in phase_state["units"]
                if item["status"] in {"pending", "ready"}
                and set(item["depends_on"]).issubset(completed_units)
            ),
            None,
        )
        if not unit_state:
            raise RunError(EX_STATE, "no dependency-ready unit remains", phase_id=phase_state["id"])
        unit_state["status"] = "in_progress"
        unit_state["worker_id"] = args.worker_id or f"worker-{phase_state['id']}-{unit_state['id']}"
        state["updated_at"] = now()

        phase = phase_definition(plan, phase_state["id"])
        unit = unit_definition(phase, unit_state["id"])
        catalog = load_profile_catalog()
        profile_name = flow["route"]["profile"] if flow else "feature"
        profile = catalog["profiles"][profile_name]
        packet = {
            "schema_version": 1,
            "run_id": state["run_id"],
            "plan": state["plan"],
            "phase_id": phase["id"],
            "unit_id": unit["id"],
            "phase_goal": phase["goal"],
            "unit_scope": unit["scope"],
            "acceptance": unit["acceptance"],
            "owned_scope": unit["files_or_area"],
            "non_goals": unit["non_goals"],
            "strategy_excerpt": None,
            "solution_pointers": [],
            "evidence_dossier": None,
            "verification_commands": unit["verification"],
            "workflow_profile": profile_name,
            "profile_required_evidence": profile["required_evidence"],
            "isolation": flow["isolation"] if flow else None,
        }
        packet_path = state_path.parent / f"phase-packet-{phase['id']}-{unit['id']}.json"
        atomic_write(packet_path, packet)
        if flow:
            identifier = node_id("agent.implementation", phase["id"], unit["id"], 0)
            append_node(
                state,
                identifier=identifier,
                kind="agent",
                status="running",
                attempt=0,
                phase_id=phase["id"],
                unit_id=unit["id"],
                input_paths=[str(packet_path)],
                next_action="record-agent",
            )
            flow["stage"] = "awaiting-worker"
        atomic_write(state_path, state)
    emit(
        summary(
            state,
            state_path,
            packet_path=str(packet_path),
            worker_id=unit_state["worker_id"],
            next_action="dispatch-agent" if flow else "dispatch-worker",
            agent_role="implementation" if flow else None,
        )
    )


WORKER_KEYS = {
    "schema_version",
    "run_id",
    "phase_id",
    "unit_id",
    "status",
    "changed_files",
    "evidence",
    "verification",
    "risks",
    "unresolved",
}


def validate_worker_result(value: dict[str, Any]) -> None:
    if set(value) != WORKER_KEYS:
        raise RunError(EX_INVALID, "worker result fields do not match the contract")
    if value["schema_version"] != 1 or value["status"] not in {"completed", "blocked", "failed"}:
        raise RunError(EX_INVALID, "worker result has an invalid schema version or status")
    for field in ("changed_files", "evidence", "verification", "risks", "unresolved"):
        if not isinstance(value[field], list) or not all(isinstance(item, str) and item for item in value[field]):
            raise RunError(EX_INVALID, f"worker result field must be an array of strings: {field}")
    for changed in value["changed_files"]:
        path = Path(changed)
        if (
            path.is_absolute()
            or "\\" in changed
            or re.match(r"^[A-Za-z]:", changed)
            or ".." in path.parts
        ):
            raise RunError(EX_INVALID, "worker result contains a path outside the repository", path=changed)


def path_is_owned(changed: str, owned_scope: list[str]) -> bool:
    normalized = changed.rstrip("/")
    return any(
        normalized == scope.rstrip("/") or normalized.startswith(f"{scope.rstrip('/')}/")
        for scope in owned_scope
    )


def command_record_worker(args: argparse.Namespace) -> None:
    state_path = Path(args.state).resolve()
    result_path = Path(args.result).resolve()
    result = read_json(result_path, "worker result")
    validate_worker_result(result)
    with state_lock(state_path):
        state, plan, meta = load_bundle(state_path)
        target = check_resume(state, meta)
        phase, unit = current_unit(state)
        if not phase or not unit:
            raise RunError(EX_STATE, "no worker-owned unit is in progress")
        for field, actual in (("run_id", state["run_id"]), ("phase_id", phase["id"]), ("unit_id", unit["id"])):
            if result[field] != actual:
                raise RunError(EX_INVALID, f"worker result {field} does not match active work", expected=actual, actual=result[field])
        phase_contract = phase_definition(plan, phase["id"])
        unit_contract = unit_definition(phase_contract, unit["id"])
        for changed in result["changed_files"]:
            if not path_is_owned(changed, unit_contract["files_or_area"]):
                raise RunError(
                    EX_INVALID,
                    "worker result claims a file outside the unit owned scope",
                    path=changed,
                    owned_scope=unit_contract["files_or_area"],
                )

        unit["status"] = result["status"]
        unit["changed_files"] = result["changed_files"]
        unit["evidence"] = result["evidence"] + result["verification"]
        unit["unresolved"] = result["unresolved"]
        head = git(target, "rev-parse", "HEAD")
        if head != state["git"]["head_sha"]:
            phase["commits"].append(head)
            state["git"]["head_sha"] = head

        if result["status"] == "blocked":
            phase["status"] = "blocked"
            state["current_phase"] = None
            state["status"] = "blocked"
        elif result["status"] == "failed":
            phase["status"] = "failed"
            state["current_phase"] = None
            timestamp = now()
            state["status"] = "failed"
            state["terminal"] = {
                "status": "failed",
                "reason": f"worker failed: {phase['id']}/{unit['id']}",
                "ended_at": timestamp,
            }
        state["updated_at"] = now()
        stored_result = state_path.parent / f"worker-result-{phase['id']}-{unit['id']}.json"
        if stored_result.exists():
            raise RunError(EX_STATE, "immutable worker result already exists", path=str(stored_result))
        atomic_write(stored_result, result)
        atomic_write(state_path, state)
    emit(summary(state, state_path, worker_result_path=str(stored_result)))


AGENT_KEYS = {
    "schema_version",
    "run_id",
    "phase_id",
    "unit_id",
    "role",
    "status",
    "session",
    "changed_files",
    "evidence",
    "risks",
    "unresolved",
}


def validate_agent_result(value: dict[str, Any]) -> None:
    if set(value) != AGENT_KEYS:
        raise RunError(EX_INVALID, "agent result fields do not match the workflow contract")
    if value["schema_version"] != 1 or value["role"] not in {"implementation", "repair"}:
        raise RunError(EX_INVALID, "agent result has an invalid schema version or role")
    if value["status"] not in {"completed", "blocked", "failed"}:
        raise RunError(EX_INVALID, "agent result has an invalid status")
    session = value["session"]
    if session is not None:
        if set(session) != {"handle", "resumable"}:
            raise RunError(EX_INVALID, "agent session fields do not match the workflow contract")
        if not isinstance(session["handle"], str) or not session["handle"] or not isinstance(session["resumable"], bool):
            raise RunError(EX_INVALID, "agent session has invalid values")
    for field in ("changed_files", "evidence", "risks", "unresolved"):
        if not isinstance(value[field], list) or not all(isinstance(item, str) and item for item in value[field]):
            raise RunError(EX_INVALID, f"agent result field must be an array of strings: {field}")
    for changed in value["changed_files"]:
        changed_path = Path(changed)
        if changed_path.is_absolute() or "\\" in changed or re.match(r"^[A-Za-z]:", changed) or ".." in changed_path.parts:
            raise RunError(EX_INVALID, "agent result contains a path outside the repository", path=changed)


def fail_kernel_run(
    state: dict[str, Any], phase: dict[str, Any], unit: dict[str, Any] | None, reason: str
) -> None:
    timestamp = now()
    if unit:
        unit["status"] = "failed"
    phase["status"] = "failed"
    state["current_phase"] = None
    state["status"] = "failed"
    state["terminal"] = {"status": "failed", "reason": reason, "ended_at": timestamp}
    flow = workflow(state)
    flow["stage"] = "failed"
    flow["current_node"] = None
    state["updated_at"] = timestamp


def command_record_agent(args: argparse.Namespace) -> None:
    state_path = Path(args.state).resolve()
    result_path = Path(args.result).resolve()
    if result_path.name.startswith("agent-result-"):
        raise RunError(EX_INVALID, "agent result input uses a kernel-reserved filename; use incoming-agent-*.json")
    result = read_json(result_path, "agent result")
    validate_agent_result(result)
    with state_lock(state_path):
        state, plan, meta = load_bundle(state_path)
        target = check_resume(state, meta)
        flow = workflow(state)
        expected_role = "implementation" if flow["stage"] == "awaiting-worker" else "repair"
        if flow["stage"] not in {"awaiting-worker", "awaiting-repair"}:
            raise RunError(EX_STATE, "workflow is not awaiting an implementation or repair result", stage=flow["stage"])
        if result["role"] != expected_role:
            raise RunError(EX_INVALID, "agent role does not match the active workflow node", expected=expected_role, actual=result["role"])
        phase, unit = current_unit(state)
        if not phase or not unit:
            raise RunError(EX_STATE, "no agent-owned unit is in progress")
        for field, actual in (("run_id", state["run_id"]), ("phase_id", phase["id"]), ("unit_id", unit["id"])):
            if result[field] != actual:
                raise RunError(EX_INVALID, f"agent result {field} does not match active work", expected=actual, actual=result[field])
        phase_contract = phase_definition(plan, phase["id"])
        unit_contract = unit_definition(phase_contract, unit["id"])
        for changed in result["changed_files"]:
            if not path_is_owned(changed, unit_contract["files_or_area"]):
                raise RunError(
                    EX_INVALID,
                    "agent result claims a file outside the unit owned scope",
                    path=changed,
                    owned_scope=unit_contract["files_or_area"],
                )

        key = workflow_key(phase["id"], unit["id"])
        session = result["session"]
        if session:
            flow["sessions"][key] = session
        attempt = flow["repair_attempts"].get(key, 0) if expected_role == "repair" else 0
        stored_result = state_path.parent / f"agent-result-{phase['id']}-{unit['id']}-{attempt}.json"
        if stored_result.exists():
            raise RunError(EX_STATE, "immutable agent result already exists", path=str(stored_result))
        atomic_write(stored_result, result)

        node_status = {"completed": "passed", "blocked": "blocked", "failed": "failed"}[result["status"]]
        finish_current_node(
            state,
            node_status,
            output_paths=[str(stored_result)],
            session_handle=session["handle"] if session else None,
            evidence=[{"summary": item, "path": None, "command": None, "exit_code": None} for item in result["evidence"]],
            next_action="run-checks" if result["status"] == "completed" else None,
        )
        unit["worker_id"] = session["handle"] if session else unit["worker_id"]
        unit["changed_files"] = sorted(set(unit["changed_files"] + result["changed_files"]))
        unit["evidence"].extend(result["evidence"])
        unit["unresolved"] = result["unresolved"]
        head = git(target, "rev-parse", "HEAD")
        if head != state["git"]["head_sha"]:
            phase["commits"].append(head)
            state["git"]["head_sha"] = head

        if result["status"] == "completed":
            flow["stage"] = "checking"
        elif result["status"] == "blocked":
            phase["status"] = "blocked"
            state["current_phase"] = None
            state["status"] = "blocked"
            flow["stage"] = "failed"
        else:
            fail_kernel_run(state, phase, unit, f"agent failed: {phase['id']}/{unit['id']}")
        state["updated_at"] = now()
        atomic_write(state_path, state)
    extra = {"agent_result_path": str(stored_result)}
    if result["status"] == "completed":
        extra["next_action"] = "run-checks"
    emit(summary(state, state_path, **extra))


def safe_argv(command: str) -> list[str]:
    if not command.strip() or "\n" in command or "\r" in command or "`" in command or "$(" in command:
        raise RunError(EX_INVALID, "verification command is empty or requires shell evaluation", command=command)
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars="|&;<>()")
        lexer.whitespace_split = True
        argv = list(lexer)
    except ValueError as error:
        raise RunError(EX_INVALID, "verification command cannot be parsed as argv", command=command) from error
    controls = {"|", "||", "&", "&&", ";", ";;", "<", "<<", ">", ">>", "(", ")"}
    if not argv or any(token in controls for token in argv):
        raise RunError(EX_INVALID, "verification command requires unsupported shell control flow", command=command)
    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", argv[0]):
        raise RunError(EX_INVALID, "verification command cannot begin with an environment assignment", command=command)
    if Path(argv[0]).name in {"sh", "bash", "zsh", "dash", "fish", "ksh"} and "-c" in argv[1:]:
        raise RunError(EX_INVALID, "verification command cannot invoke a shell command string", command=command)
    return argv


def execute_check(command: str, target: Path, state_path: Path, node_name: str, timeout_seconds: int) -> dict[str, Any]:
    argv = safe_argv(command)
    stdout_path = state_path.parent / f"{node_name}.stdout.log"
    stderr_path = state_path.parent / f"{node_name}.stderr.log"
    started = time.monotonic()
    timed_out = False
    exit_code: int | None = None
    with stdout_path.open("wb") as stdout_handle, stderr_path.open("wb") as stderr_handle:
        try:
            result = subprocess.run(
                argv,
                cwd=target,
                stdin=subprocess.DEVNULL,
                stdout=stdout_handle,
                stderr=stderr_handle,
                timeout=timeout_seconds,
                check=False,
            )
            exit_code = result.returncode
        except subprocess.TimeoutExpired:
            timed_out = True
    duration_ms = int((time.monotonic() - started) * 1000)
    return {
        "argv": argv,
        "exit_code": exit_code,
        "timed_out": timed_out,
        "duration_ms": duration_ms,
        "stdout_path": str(stdout_path),
        "stderr_path": str(stderr_path),
    }


def route_repair(
    state: dict[str, Any],
    state_path: Path,
    phase: dict[str, Any],
    unit: dict[str, Any],
    reason: str,
    evidence_paths: list[str],
) -> tuple[str | None, str | None]:
    flow = workflow(state)
    key = workflow_key(phase["id"], unit["id"])
    attempts = flow["repair_attempts"].get(key, 0)
    if attempts >= flow["max_repair_attempts"]:
        fail_kernel_run(state, phase, unit, f"repair budget exhausted: {phase['id']}/{unit['id']}")
        return None, None
    attempt = attempts + 1
    flow["repair_attempts"][key] = attempt
    unit["status"] = "in_progress"
    phase["status"] = "in_progress"
    state["status"] = "running"
    state["current_phase"] = phase["id"]
    session = flow["sessions"].get(key)
    repair_packet = {
        "schema_version": 1,
        "run_id": state["run_id"],
        "phase_id": phase["id"],
        "unit_id": unit["id"],
        "attempt": attempt,
        "reason": reason,
        "failure_evidence_paths": evidence_paths,
        "changed_files": unit["changed_files"],
        "session": session,
    }
    packet_path = state_path.parent / f"repair-packet-{phase['id']}-{unit['id']}-{attempt}.json"
    atomic_write(packet_path, repair_packet)
    identifier = node_id("agent.repair", phase["id"], unit["id"], attempt)
    append_node(
        state,
        identifier=identifier,
        kind="agent",
        status="running",
        attempt=attempt,
        phase_id=phase["id"],
        unit_id=unit["id"],
        input_paths=[str(packet_path), *evidence_paths],
        session_handle=session["handle"] if session else None,
        next_action="record-agent",
    )
    flow["stage"] = "awaiting-repair"
    action = "resume-agent" if session and session["resumable"] else "dispatch-agent"
    return action, str(packet_path)


def command_run_checks(args: argparse.Namespace) -> None:
    state_path = Path(args.state).resolve()
    with state_lock(state_path):
        state, plan, meta = load_bundle(state_path)
        target = check_resume(state, meta)
        flow = workflow(state)
        if flow["stage"] != "checking":
            raise RunError(EX_STATE, "workflow is not ready to run deterministic checks", stage=flow["stage"])
        phase, unit = current_unit(state)
        if not phase or not unit:
            raise RunError(EX_STATE, "no implementation unit is ready for deterministic checks")
        phase_contract = phase_definition(plan, phase["id"])
        unit_contract = unit_definition(phase_contract, unit["id"])
        key = workflow_key(phase["id"], unit["id"])
        attempt = flow["repair_attempts"].get(key, 0)
        identifier = node_id("code.checks", phase["id"], unit["id"], attempt)
        append_node(
            state,
            identifier=identifier,
            kind="code",
            status="running",
            attempt=attempt,
            phase_id=phase["id"],
            unit_id=unit["id"],
            next_action="classify-checks",
        )
        commands = [
            command
            for command in unit_contract["verification"]
            if not command.lower().startswith("inspect ")
        ]
        inspection_requirements = [
            command
            for command in unit_contract["verification"]
            if command.lower().startswith("inspect ")
        ]
        results = [
            execute_check(command, target, state_path, f"{identifier}.{index}", args.timeout)
            for index, command in enumerate(commands, start=1)
        ]
        results_path = state_path.parent / f"check-results-{phase['id']}-{unit['id']}-{attempt}.json"
        atomic_write(
            results_path,
            {
                "schema_version": 1,
                "results": results,
                "inspection_requirements": inspection_requirements,
            },
        )
        failed = [item for item in results if item["timed_out"] or item["exit_code"] != 0]
        evidence = [
            {
                "summary": "command timed out" if item["timed_out"] else f"command exited {item['exit_code']}",
                "path": item["stderr_path"] if item["exit_code"] else item["stdout_path"],
                "command": item["argv"],
                "exit_code": item["exit_code"],
            }
            for item in results
        ]
        if not results:
            evidence.append(
                {
                    "summary": "no deterministic commands configured; semantic inspection remains verifier-owned",
                    "path": None,
                    "command": None,
                    "exit_code": None,
                }
            )
        if failed:
            finish_current_node(
                state,
                "failed",
                output_paths=[str(results_path)],
                evidence=evidence,
                next_action="repair",
            )
            failure_paths = [path for item in failed for path in (item["stdout_path"], item["stderr_path"])]
            next_action, packet_path = route_repair(
                state,
                state_path,
                phase,
                unit,
                "deterministic checks failed",
                failure_paths,
            )
        else:
            finish_current_node(
                state,
                "passed",
                output_paths=[str(results_path)],
                evidence=evidence,
                next_action="start-next-or-verify",
            )
            unit["status"] = "completed"
            unit["evidence"].append(f"deterministic checks passed: {results_path}")
            if all(item["status"] == "completed" for item in phase["units"]):
                verifier_attempt = sum(
                    1
                    for item in flow["nodes"]
                    if item["kind"] == "agent" and item["phase_id"] == phase["id"] and item["unit_id"] is None
                )
                verifier_packet = {
                    "schema_version": 1,
                    "run_id": state["run_id"],
                    "phase_id": phase["id"],
                    "phase_goal": phase_contract["goal"],
                    "completion_gate": phase_contract["completion_gate"],
                    "workflow_profile": flow["route"]["profile"],
                    "verifier_lenses": load_profile_catalog()["profiles"][flow["route"]["profile"]]["verifier_lenses"],
                    "profile_required_evidence": load_profile_catalog()["profiles"][flow["route"]["profile"]]["required_evidence"],
                    "units": [
                        {
                            "id": item["id"],
                            "changed_files": item["changed_files"],
                            "evidence": item["evidence"],
                            "unresolved": item["unresolved"],
                            "inspection_requirements": [
                                requirement
                                for requirement in unit_definition(phase_contract, item["id"])["verification"]
                                if requirement.lower().startswith("inspect ")
                            ],
                        }
                        for item in phase["units"]
                    ],
                }
                verifier_path = state_path.parent / f"verifier-packet-{phase['id']}-{verifier_attempt}.json"
                atomic_write(verifier_path, verifier_packet)
                verifier_id = node_id("agent.verifier", phase["id"], None, verifier_attempt)
                append_node(
                    state,
                    identifier=verifier_id,
                    kind="agent",
                    status="running",
                    attempt=verifier_attempt,
                    phase_id=phase["id"],
                    unit_id=None,
                    input_paths=[str(verifier_path)],
                    next_action="record-verifier",
                )
                flow["stage"] = "awaiting-verifier"
                next_action = "dispatch-verifier"
                packet_path = str(verifier_path)
            else:
                flow["stage"] = "idle"
                next_action = "start-next"
                packet_path = None
        state["updated_at"] = now()
        atomic_write(state_path, state)
    emit(summary(state, state_path, next_action=next_action, packet_path=packet_path, check_results_path=str(results_path)))


VERIFIER_KEYS = {
    "schema_version",
    "run_id",
    "phase_id",
    "role",
    "status",
    "evidence",
    "findings",
    "repair_unit_id",
}


def validate_verifier_result(value: dict[str, Any]) -> None:
    if set(value) != VERIFIER_KEYS or value.get("schema_version") != 1 or value.get("role") != "verifier":
        raise RunError(EX_INVALID, "verifier result fields do not match the workflow contract")
    if value.get("status") not in {"passed", "failed", "blocked"}:
        raise RunError(EX_INVALID, "verifier result has an invalid status")
    for field in ("evidence", "findings"):
        if not isinstance(value[field], list) or not all(isinstance(item, str) and item for item in value[field]):
            raise RunError(EX_INVALID, f"verifier result field must be an array of strings: {field}")
    if value["repair_unit_id"] is not None and (not isinstance(value["repair_unit_id"], str) or not ID_RE.fullmatch(value["repair_unit_id"])):
        raise RunError(EX_INVALID, "verifier repair_unit_id must be null or lowercase hyphen-case")


def command_record_verifier(args: argparse.Namespace) -> None:
    state_path = Path(args.state).resolve()
    result_path = Path(args.result).resolve()
    if result_path.name.startswith("verifier-result-"):
        raise RunError(EX_INVALID, "verifier result input uses a kernel-reserved filename; use incoming-verifier-*.json")
    result = read_json(result_path, "verifier result")
    validate_verifier_result(result)
    with state_lock(state_path):
        state, plan, meta = load_bundle(state_path)
        target = check_resume(state, meta)
        flow = workflow(state)
        if flow["stage"] != "awaiting-verifier":
            raise RunError(EX_STATE, "workflow is not awaiting semantic verification", stage=flow["stage"])
        phase, active_unit = current_unit(state)
        if not phase or active_unit or any(item["status"] != "completed" for item in phase["units"]):
            raise RunError(EX_STATE, "phase is not ready for semantic verification")
        for field, actual in (("run_id", state["run_id"]), ("phase_id", phase["id"])):
            if result[field] != actual:
                raise RunError(EX_INVALID, f"verifier result {field} does not match active phase", expected=actual, actual=result[field])
        active_node = next((item for item in reversed(flow["nodes"]) if item["id"] == flow["current_node"]), None)
        if not active_node:
            raise RunError(EX_STATE, "workflow has no active verifier node")
        stored_result = state_path.parent / f"verifier-result-{phase['id']}-{active_node['attempt']}.json"
        if stored_result.exists():
            raise RunError(EX_STATE, "immutable verifier result already exists", path=str(stored_result))
        atomic_write(stored_result, result)
        node_status = {"passed": "passed", "failed": "failed", "blocked": "blocked"}[result["status"]]
        finish_current_node(
            state,
            node_status,
            output_paths=[str(stored_result)],
            evidence=[{"summary": item, "path": None, "command": None, "exit_code": None} for item in result["evidence"]],
            next_action="start-next" if result["status"] == "passed" else "repair",
        )

        packet_path: str | None = None
        if result["status"] == "passed":
            phase["verification"] = {"status": "passed", "evidence": result["evidence"]}
            phase["status"] = "completed"
            state["current_phase"] = None
            if all(item["status"] == "completed" for item in state["phases"]):
                review_path = Path(create_review_packet(state, plan, meta, state_path, target))
                review_attempt = sum(1 for item in flow["nodes"] if item["id"].startswith("human.final-review."))
                append_node(
                    state,
                    identifier=f"human.final-review.{review_attempt}",
                    kind="human",
                    status="pending",
                    attempt=0,
                    phase_id=None,
                    unit_id=None,
                    input_paths=[str(review_path)],
                    next_action="await-engineer-review",
                )
                flow["stage"] = "review-ready"
                flow["review"] = {"status": "ready", "packet_path": str(review_path), "decision_path": None}
                flow["delivery"] = {
                    "status": "not-authorized",
                    "packet_path": None,
                    "commit_sha": None,
                    "pr_url": None,
                    "ci_path": None,
                }
                state["status"] = "review_ready"
                next_action = "await-engineer-review"
                packet_path = str(review_path)
            else:
                flow["stage"] = "idle"
                next_action = "start-next"
        elif result["status"] == "failed":
            repair_id = result["repair_unit_id"] or phase["units"][-1]["id"]
            unit = next((item for item in phase["units"] if item["id"] == repair_id), None)
            if not unit:
                raise RunError(EX_INVALID, "verifier named an unknown repair unit", repair_unit_id=repair_id)
            next_action, packet_path = route_repair(
                state,
                state_path,
                phase,
                unit,
                "semantic verifier requested repair",
                [str(stored_result)],
            )
        else:
            phase["status"] = "blocked"
            state["current_phase"] = None
            state["status"] = "blocked"
            flow["stage"] = "failed"
            next_action = "resolve-blocker"
        state["updated_at"] = now()
        atomic_write(state_path, state)
    emit(summary(state, state_path, next_action=next_action, packet_path=packet_path, verifier_result_path=str(stored_result)))


def command_record_review_decision(args: argparse.Namespace) -> None:
    state_path = Path(args.state).resolve()
    with state_lock(state_path):
        state, _, meta = load_bundle(state_path)
        check_resume(state, meta)
        flow = workflow(state)
        if flow["stage"] != "review-ready" or flow["review"]["status"] != "ready":
            raise RunError(EX_STATE, "workflow is not awaiting final engineer review", stage=flow["stage"])
        if args.decision == "repair-requested" and not args.repair_unit_id:
            raise RunError(EX_INVALID, "repair-requested requires --repair-unit-id")
        if args.decision != "repair-requested" and args.repair_unit_id:
            raise RunError(EX_INVALID, "--repair-unit-id is valid only for repair-requested")
        decision = {
            "schema_version": 1,
            "run_id": state["run_id"],
            "decision": args.decision,
            "decided_by": args.decided_by,
            "rationale": args.rationale,
            "repair_unit_id": args.repair_unit_id,
            "decided_at": now(),
        }
        review_attempt = sum(1 for item in flow["nodes"] if item["id"].startswith("human.final-review.")) - 1
        decision_path = state_path.parent / f"review-decision-{max(0, review_attempt)}.json"
        if decision_path.exists():
            raise RunError(EX_STATE, "immutable review decision already exists", path=str(decision_path))
        atomic_write(decision_path, decision)
        evidence = [{"summary": f"final review {args.decision} by {args.decided_by}: {args.rationale}", "path": str(decision_path), "command": None, "exit_code": None}]
        flow["review"]["status"] = args.decision if args.decision != "repair-requested" else "repair-requested"
        flow["review"]["decision_path"] = str(decision_path)
        packet_path: str | None = None
        run_record_path: str | None = None
        if args.decision == "approved":
            finish_current_node(state, "passed", evidence=evidence, next_action="deliver")
            review_packet = read_json(Path(flow["review"]["packet_path"]), "review packet")
            proposed = review_packet["proposed_delivery"]
            delivery_packet = {
                "schema_version": 1,
                "run_id": state["run_id"],
                "authorized_by": args.decided_by,
                "review_decision_path": str(decision_path),
                "action": proposed["action"],
                "changed_files": run_changed_files(state),
                "commit_message": proposed["commit_message"],
                "pr_title": proposed["pr_title"],
                "pr_body_path": proposed["pr_body_path"],
            }
            delivery_path = state_path.parent / "delivery-packet.json"
            atomic_write(delivery_path, delivery_packet)
            flow["delivery"] = {
                "status": "authorized",
                "packet_path": str(delivery_path),
                "commit_sha": None,
                "pr_url": None,
                "ci_path": None,
            }
            flow["stage"] = "delivery-ready"
            state["status"] = "running"
            next_action = "deliver"
            packet_path = str(delivery_path)
        elif args.decision == "rejected":
            finish_current_node(state, "blocked", evidence=evidence, next_action=None)
            flow["stage"] = "failed"
            state["status"] = "cancelled"
            state["terminal"] = {"status": "cancelled", "reason": f"engineer rejected final review: {args.rationale}", "ended_at": now()}
            next_action = "none"
        else:
            finish_current_node(state, "passed", evidence=evidence, next_action="repair")
            phase = next((item for item in state["phases"] if any(unit["id"] == args.repair_unit_id for unit in item["units"])), None)
            unit = next((item for item in phase["units"] if item["id"] == args.repair_unit_id), None) if phase else None
            if not phase or not unit:
                raise RunError(EX_INVALID, "review repair names an unknown unit", repair_unit_id=args.repair_unit_id)
            phase["verification"] = {"status": "not_run", "evidence": []}
            next_action, packet_path = route_repair(
                state,
                state_path,
                phase,
                unit,
                f"engineer requested repair: {args.rationale}",
                [str(decision_path), flow["review"]["packet_path"]],
            )
        state["updated_at"] = now()
        atomic_write(state_path, state)
        if state["status"] in TERMINAL_STATUSES:
            run_record_path = write_run_record(state, state_path)
    emit(summary(state, state_path, next_action=next_action, packet_path=packet_path, review_decision_path=str(decision_path), run_record_path=run_record_path))


def command_deliver(args: argparse.Namespace) -> None:
    state_path = Path(args.state).resolve()
    with state_lock(state_path):
        state, _, meta = load_bundle(state_path)
        target = check_resume(state, meta)
        flow = workflow(state)
        if flow["stage"] != "delivery-ready" or flow["delivery"]["status"] != "authorized":
            raise RunError(EX_STATE, "workflow does not have delivery authority", stage=flow["stage"])
        packet = read_json(Path(flow["delivery"]["packet_path"]), "delivery packet")
        if packet.get("run_id") != state["run_id"]:
            raise RunError(EX_INVALID, "delivery packet run_id does not match state")
        allowed = set(packet["changed_files"])
        dirty = set(filter(None, git(target, "diff", "--name-only").splitlines()))
        dirty.update(filter(None, git(target, "diff", "--cached", "--name-only").splitlines()))
        dirty.update(filter(None, git(target, "ls-files", "--others", "--exclude-standard").splitlines()))
        unexpected = sorted(dirty - allowed)
        if unexpected:
            raise RunError(EX_STATE, "delivery found changes outside agent-reported scope", paths=unexpected)
        if dirty:
            git(target, "add", "--", *sorted(dirty))
            staged = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=target)
            if staged.returncode == 1:
                git(target, "commit", "-m", packet["commit_message"])
            elif staged.returncode not in {0, 1}:
                raise RunError(EX_STATE, "unable to inspect staged delivery changes")
        commit_sha = git(target, "rev-parse", "HEAD")
        if commit_sha == state["git"]["base_ref"] and not dirty:
            raise RunError(EX_STATE, "delivery has no change to commit")
        state["git"]["head_sha"] = commit_sha
        pr_url: str | None = None
        action = packet["action"]
        if action == "commit-push-pr":
            git(target, "push", "-u", args.remote, "HEAD")
            try:
                existing = subprocess.run(
                    ["gh", "pr", "view", "--json", "url", "--jq", ".url"],
                    cwd=target,
                    text=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )
            except FileNotFoundError as error:
                raise RunError(EX_STATE, "gh is required for the approved commit-push-pr delivery") from error
            if existing.returncode == 0 and existing.stdout.strip():
                pr_url = existing.stdout.strip()
            else:
                created = subprocess.run(
                    ["gh", "pr", "create", "--title", packet["pr_title"], "--body-file", packet["pr_body_path"]],
                    cwd=target,
                    text=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )
                if created.returncode != 0 or not created.stdout.strip():
                    raise RunError(EX_STATE, f"gh pr create failed: {created.stderr.strip()}")
                pr_url = created.stdout.strip().splitlines()[-1]
        delivery_result_path = state_path.parent / "delivery-result.json"
        atomic_write(
            delivery_result_path,
            {
                "schema_version": 1,
                "run_id": state["run_id"],
                "action": action,
                "commit_sha": commit_sha,
                "pr_url": pr_url,
                "delivered_at": now(),
            },
        )
        append_node(
            state,
            identifier="code.delivery.0",
            kind="code",
            status="passed",
            attempt=0,
            phase_id=None,
            unit_id=None,
            input_paths=[flow["delivery"]["packet_path"]],
            output_paths=[str(delivery_result_path)],
            evidence=[{"summary": f"approved delivery created commit {commit_sha}", "path": str(delivery_result_path), "command": None, "exit_code": 0}],
            next_action="observe-ci" if pr_url else "dispatch-closeout",
        )
        flow["delivery"].update({"status": "awaiting-ci" if pr_url else "committed", "commit_sha": commit_sha, "pr_url": pr_url})
        if pr_url:
            flow["stage"] = "awaiting-ci"
            next_action = "observe-ci"
            packet_path = None
        else:
            packet_path = create_closeout_gate(state, state_path, target)
            next_action = "dispatch-closeout"
        state["updated_at"] = now()
        atomic_write(state_path, state)
    emit(summary(state, state_path, next_action=next_action, packet_path=packet_path, delivery_result_path=str(delivery_result_path), pr_url=pr_url))


def command_observe_ci(args: argparse.Namespace) -> None:
    state_path = Path(args.state).resolve()
    with state_lock(state_path):
        state, _, meta = load_bundle(state_path)
        target = check_resume(state, meta)
        flow = workflow(state)
        if flow["stage"] != "awaiting-ci" or not flow["delivery"].get("pr_url"):
            raise RunError(EX_STATE, "workflow is not awaiting pull-request CI", stage=flow["stage"])
        process = subprocess.run(
            ["gh", "pr", "checks", flow["delivery"]["pr_url"], "--json", "bucket,link,name,state"],
            cwd=target,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if process.returncode != 0:
            raise RunError(EX_STATE, f"gh pr checks failed: {process.stderr.strip()}")
        try:
            checks = json.loads(process.stdout)
        except json.JSONDecodeError as error:
            raise RunError(EX_INVALID, "gh pr checks returned invalid JSON") from error
        if not isinstance(checks, list):
            raise RunError(EX_INVALID, "gh pr checks did not return an array")
        buckets = {str(item.get("bucket", "pending")).lower() for item in checks}
        if buckets & {"fail", "cancel"}:
            disposition = "failed"
        elif checks and buckets <= {"pass", "skipping"}:
            disposition = "passed"
        else:
            disposition = "pending"
        attempt = len(list(state_path.parent.glob("ci-disposition-*.json")))
        ci_path = state_path.parent / f"ci-disposition-{attempt}.json"
        atomic_write(
            ci_path,
            {
                "schema_version": 1,
                "run_id": state["run_id"],
                "disposition": disposition,
                "checks": [
                    {
                        "name": str(item.get("name", "unknown")),
                        "bucket": str(item.get("bucket", "pending")),
                        "state": str(item.get("state", "unknown")),
                        "link": item.get("link"),
                    }
                    for item in checks
                ],
                "observed_at": now(),
            },
        )
        append_node(
            state,
            identifier=f"code.ci.{attempt}",
            kind="code",
            status="failed" if disposition == "failed" else "passed",
            attempt=attempt,
            phase_id=None,
            unit_id=None,
            output_paths=[str(ci_path)],
            evidence=[{"summary": f"CI disposition: {disposition}", "path": str(ci_path), "command": ["gh", "pr", "checks"], "exit_code": process.returncode}],
            next_action="repair" if disposition == "failed" else "dispatch-closeout" if disposition == "passed" else "observe-ci",
        )
        flow["delivery"]["ci_path"] = str(ci_path)
        packet_path: str | None = None
        run_record_path: str | None = None
        if disposition == "passed" and flow.get("closeout", {}).get("status") == "completed":
            flow["delivery"]["status"] = "passed"
            flow["stage"] = "completed"
            state["status"] = "completed"
            state["terminal"] = {"status": "completed", "reason": "approved delivery and evidence closeout completed", "ended_at": now()}
            next_action = "none"
        elif disposition == "passed":
            flow["delivery"]["status"] = "passed"
            packet_path = create_closeout_gate(state, state_path, target)
            next_action = "dispatch-closeout"
        elif disposition == "pending":
            next_action = "observe-ci"
        elif flow.get("closeout", {}).get("status") == "completed":
            flow["delivery"]["status"] = "failed"
            key = "closeout"
            attempts = flow["repair_attempts"].get(key, 0)
            if attempts >= flow["max_repair_attempts"]:
                flow["stage"] = "failed"
                state["status"] = "failed"
                state["terminal"] = {"status": "failed", "reason": "closeout CI repair budget exhausted", "ended_at": now()}
                next_action = None
            else:
                attempt_number = attempts + 1
                flow["repair_attempts"][key] = attempt_number
                repair_packet = {
                    "schema_version": 1,
                    "run_id": state["run_id"],
                    "reason": "CI failed after the evidence closeout commit",
                    "prior_closeout_result": flow["closeout"]["result_path"],
                    "failure_evidence_paths": [str(ci_path)],
                    "required_action": "repair only the written learning, then return the closeout result contract again",
                }
                closeout_repair_path = state_path.parent / f"closeout-repair-packet-{attempt_number}.json"
                atomic_write(closeout_repair_path, repair_packet)
                append_node(
                    state,
                    identifier=f"agent.closeout.{attempt_number}",
                    kind="agent",
                    status="running",
                    attempt=attempt_number,
                    phase_id=None,
                    unit_id=None,
                    input_paths=[str(closeout_repair_path), str(ci_path)],
                    next_action="record-closeout",
                )
                flow["stage"] = "awaiting-closeout"
                flow["closeout"].update({"status": "awaiting-assessment", "packet_path": str(closeout_repair_path), "learning": "pending"})
                packet_path = str(closeout_repair_path)
                next_action = "dispatch-closeout"
        else:
            flow["delivery"]["status"] = "failed"
            phase = next((item for item in reversed(state["phases"]) if any(unit["changed_files"] for unit in item["units"])), state["phases"][-1])
            unit = next((item for item in reversed(phase["units"]) if item["changed_files"]), phase["units"][-1])
            phase["verification"] = {"status": "not_run", "evidence": []}
            next_action, packet_path = route_repair(
                state,
                state_path,
                phase,
                unit,
                "pull-request CI failed after approved delivery",
                [str(ci_path)],
            )
        state["updated_at"] = now()
        atomic_write(state_path, state)
        if state["status"] in TERMINAL_STATUSES:
            run_record_path = write_run_record(state, state_path)
    emit(summary(state, state_path, next_action=next_action, packet_path=packet_path, ci_path=str(ci_path), ci_disposition=disposition, run_record_path=run_record_path))


CLOSEOUT_KEYS = {"schema_version", "run_id", "learning", "strategy"}
LEARNING_KEYS = {"status", "reason", "claim", "path", "reusable", "evidence_backed", "novel", "behavior_changing", "existing_matches", "evidence_paths"}
STRATEGY_KEYS = {"observations", "proposed_delta"}


def validate_closeout_result(value: dict[str, Any]) -> None:
    if set(value) != CLOSEOUT_KEYS or value.get("schema_version") != 1:
        raise RunError(EX_INVALID, "closeout result fields do not match the workflow contract")
    learning = value.get("learning")
    strategy = value.get("strategy")
    if not isinstance(learning, dict) or set(learning) != LEARNING_KEYS:
        raise RunError(EX_INVALID, "learning closeout fields do not match the workflow contract")
    if not isinstance(strategy, dict) or set(strategy) != STRATEGY_KEYS:
        raise RunError(EX_INVALID, "strategy closeout fields do not match the workflow contract")
    if learning["status"] not in {"no-learning", "written"} or not isinstance(learning["reason"], str) or not learning["reason"]:
        raise RunError(EX_INVALID, "learning closeout has an invalid status or reason")
    for field in ("reusable", "evidence_backed", "novel", "behavior_changing"):
        if not isinstance(learning[field], bool):
            raise RunError(EX_INVALID, f"learning closeout field must be boolean: {field}")
    for field in ("existing_matches", "evidence_paths"):
        if not isinstance(learning[field], list) or not all(isinstance(item, str) and item for item in learning[field]):
            raise RunError(EX_INVALID, f"learning closeout field must be an array of strings: {field}")
    if not isinstance(strategy["observations"], list) or not all(isinstance(item, str) and item for item in strategy["observations"]):
        raise RunError(EX_INVALID, "strategy observations must be an array of strings")
    if strategy["proposed_delta"] is not None and (not isinstance(strategy["proposed_delta"], str) or not strategy["proposed_delta"]):
        raise RunError(EX_INVALID, "strategy proposed_delta must be null or a non-empty string")


def command_record_closeout(args: argparse.Namespace) -> None:
    state_path = Path(args.state).resolve()
    result_path = Path(args.result).resolve()
    if result_path.name.startswith("closeout-result-"):
        raise RunError(EX_INVALID, "closeout result input uses a kernel-reserved filename; use incoming-closeout-*.json")
    result = read_json(result_path, "closeout result")
    validate_closeout_result(result)
    with state_lock(state_path):
        state, _, meta = load_bundle(state_path)
        target = check_resume(state, meta)
        flow = workflow(state)
        if flow["stage"] != "awaiting-closeout":
            raise RunError(EX_STATE, "workflow is not awaiting closeout assessment", stage=flow["stage"])
        if result["run_id"] != state["run_id"]:
            raise RunError(EX_INVALID, "closeout result run_id does not match state")
        learning = result["learning"]
        passes = all(learning[field] for field in ("reusable", "evidence_backed", "novel", "behavior_changing"))
        learning_rel: str | None = None
        if learning["status"] == "written":
            if not passes or learning["existing_matches"] or not learning["claim"] or not learning["path"]:
                raise RunError(EX_INVALID, "written learning did not pass every evidence and novelty gate")
            learning_path, learning_rel = resolve_inside(target, learning["path"], "learning")
            if not learning_rel.startswith("docs/solutions/"):
                raise RunError(EX_INVALID, "written learning must live under docs/solutions/", path=learning_rel)
            if not learning_path.is_file():
                raise RunError(EX_INVALID, "written learning path does not exist", path=learning_rel)
            state["learning_candidates"] = [learning["claim"]]
            learning_status = "written"
        else:
            if learning["path"] is not None:
                raise RunError(EX_INVALID, "no-learning cannot name a written path")
            learning_status = "no-learning"
        proposal_path: str | None = None
        observations = result["strategy"]["observations"]
        state["strategy_observations"] = observations
        if result["strategy"]["proposed_delta"]:
            proposal = {
                "schema_version": 1,
                "run_id": state["run_id"],
                "observations": observations,
                "proposed_delta": result["strategy"]["proposed_delta"],
                "requires_explicit_strategy_approval": True,
            }
            proposal_file = state_path.parent / "strategy-proposal.json"
            atomic_write(proposal_file, proposal)
            proposal_path = str(proposal_file)
            strategy_status = "proposed"
        else:
            strategy_status = "no-change"
        closeout_attempt = len(list(state_path.parent.glob("closeout-result-*.json")))
        stored_result = state_path.parent / f"closeout-result-{closeout_attempt}.json"
        atomic_write(stored_result, result)
        finish_current_node(
            state,
            "passed",
            output_paths=[str(stored_result), *([proposal_path] if proposal_path else [])],
            evidence=[{"summary": f"closeout recorded {learning_status}; strategy {strategy_status}", "path": str(stored_result), "command": None, "exit_code": None}],
            next_action=None,
        )
        flow["closeout"] = {
            "status": "completed",
            "packet_path": flow["closeout"]["packet_path"],
            "result_path": str(stored_result),
            "learning": learning_status,
            "strategy": strategy_status,
        }
        next_action = "none"
        if learning_status == "written":
            dirty = set(filter(None, git(target, "diff", "--name-only").splitlines()))
            dirty.update(filter(None, git(target, "diff", "--cached", "--name-only").splitlines()))
            dirty.update(filter(None, git(target, "ls-files", "--others", "--exclude-standard").splitlines()))
            if dirty != {learning_rel}:
                raise RunError(EX_STATE, "closeout writer must leave only the validated learning dirty", expected=learning_rel, actual=sorted(dirty))
            git(target, "add", "--", learning_rel)
            git(target, "commit", "-m", "docs(run): capture evidence-backed learning")
            learning_commit = git(target, "rev-parse", "HEAD")
            state["git"]["head_sha"] = learning_commit
            if flow["delivery"].get("pr_url"):
                git(target, "push", "origin", "HEAD")
            append_node(
                state,
                identifier=f"code.learning-delivery.{closeout_attempt}",
                kind="code",
                status="passed",
                attempt=closeout_attempt,
                phase_id=None,
                unit_id=None,
                input_paths=[str(stored_result)],
                evidence=[{"summary": f"validated learning committed as {learning_commit}", "path": learning_rel, "command": None, "exit_code": 0}],
                next_action="observe-ci" if flow["delivery"].get("pr_url") else None,
            )
            if flow["delivery"].get("pr_url"):
                flow["delivery"]["status"] = "awaiting-ci"
                flow["stage"] = "awaiting-ci"
                state["status"] = "running"
                state["terminal"] = None
                next_action = "observe-ci"
            else:
                flow["stage"] = "completed"
                state["status"] = "completed"
                state["terminal"] = {"status": "completed", "reason": "approved delivery and evidence closeout completed", "ended_at": now()}
        else:
            flow["stage"] = "completed"
            state["status"] = "completed"
            state["terminal"] = {"status": "completed", "reason": "approved delivery and evidence closeout completed", "ended_at": now()}
        state["updated_at"] = now()
        atomic_write(state_path, state)
        run_record_path = write_run_record(state, state_path) if state["status"] in TERMINAL_STATUSES else None
    emit(summary(state, state_path, next_action=next_action, closeout_result_path=str(stored_result), strategy_proposal_path=proposal_path, run_record_path=run_record_path))


def command_verify_phase(args: argparse.Namespace) -> None:
    state_path = Path(args.state).resolve()
    with state_lock(state_path):
        state, _, meta = load_bundle(state_path)
        check_resume(state, meta)
        phase, unit = current_unit(state)
        if not phase or unit:
            raise RunError(EX_STATE, "phase is not ready for independent verification")
        if any(item["status"] != "completed" for item in phase["units"]):
            raise RunError(EX_STATE, "phase verification requires every unit completed")
        evidence = args.evidence or []
        if not evidence:
            raise RunError(EX_INVALID, "phase verification requires evidence")
        phase["verification"] = {"status": args.status, "evidence": evidence}
        timestamp = now()
        if args.status == "passed":
            phase["status"] = "completed"
            state["current_phase"] = None
            if all(item["status"] == "completed" for item in state["phases"]):
                state["status"] = "completed"
                state["terminal"] = {
                    "status": "completed",
                    "reason": "all phase completion gates passed",
                    "ended_at": timestamp,
                }
        else:
            phase["status"] = "failed"
            state["current_phase"] = None
            state["status"] = "failed"
            state["terminal"] = {
                "status": "failed",
                "reason": f"phase verification failed: {phase['id']}",
                "ended_at": timestamp,
            }
        state["updated_at"] = timestamp
        atomic_write(state_path, state)
    emit(summary(state, state_path))


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="Manage one sl-run state bundle")
    commands = root.add_subparsers(dest="command", required=True)
    init = commands.add_parser("init")
    init.add_argument("--target", required=True)
    init.add_argument("--plan", required=True)
    init.add_argument("--strategy")
    init.add_argument("--run-id")
    init.add_argument("--state")
    init.add_argument("--base-ref")
    init.add_argument("--kernel", action="store_true")
    init.add_argument("--profile", choices=sorted(PROFILE_NAMES))
    init.add_argument("--isolation-capability", action="append", choices=sorted(ISOLATION_MODES))
    init.add_argument("--max-workers", type=int, default=1, choices=range(1, 4))
    init.add_argument("--max-repair-attempts", type=int, default=None, choices=range(0, 4))
    init.add_argument("--delivery-action", default="commit-push-pr", choices=("commit", "commit-push-pr"))
    init.set_defaults(handler=command_init)
    for name, handler in (("inspect", command_inspect), ("resume", command_resume)):
        command = commands.add_parser(name)
        command.add_argument("--state", required=True)
        command.set_defaults(handler=handler)
    start = commands.add_parser("start-next")
    start.add_argument("--state", required=True)
    start.add_argument("--worker-id")
    start.set_defaults(handler=command_start_next)
    record = commands.add_parser("record-worker")
    record.add_argument("--state", required=True)
    record.add_argument("--result", required=True)
    record.set_defaults(handler=command_record_worker)
    agent = commands.add_parser("record-agent")
    agent.add_argument("--state", required=True)
    agent.add_argument("--result", required=True)
    agent.set_defaults(handler=command_record_agent)
    router = commands.add_parser("record-router")
    router.add_argument("--state", required=True)
    router.add_argument("--result", required=True)
    router.set_defaults(handler=command_record_router)
    proposal = commands.add_parser("record-proposal-decision")
    proposal.add_argument("--state", required=True)
    proposal.add_argument("--decision", required=True, choices=("approved", "rejected"))
    proposal.add_argument("--approved-by", required=True)
    proposal.set_defaults(handler=command_record_proposal_decision)
    checks = commands.add_parser("run-checks")
    checks.add_argument("--state", required=True)
    checks.add_argument("--timeout", type=int, default=300, choices=range(1, 1801))
    checks.set_defaults(handler=command_run_checks)
    verifier = commands.add_parser("record-verifier")
    verifier.add_argument("--state", required=True)
    verifier.add_argument("--result", required=True)
    verifier.set_defaults(handler=command_record_verifier)
    review = commands.add_parser("record-review-decision")
    review.add_argument("--state", required=True)
    review.add_argument("--decision", required=True, choices=("approved", "rejected", "repair-requested"))
    review.add_argument("--decided-by", required=True)
    review.add_argument("--rationale", required=True)
    review.add_argument("--repair-unit-id")
    review.set_defaults(handler=command_record_review_decision)
    deliver = commands.add_parser("deliver")
    deliver.add_argument("--state", required=True)
    deliver.add_argument("--remote", default="origin")
    deliver.set_defaults(handler=command_deliver)
    ci = commands.add_parser("observe-ci")
    ci.add_argument("--state", required=True)
    ci.set_defaults(handler=command_observe_ci)
    closeout = commands.add_parser("record-closeout")
    closeout.add_argument("--state", required=True)
    closeout.add_argument("--result", required=True)
    closeout.set_defaults(handler=command_record_closeout)
    verify = commands.add_parser("verify-phase")
    verify.add_argument("--state", required=True)
    verify.add_argument("--status", required=True, choices=("passed", "failed"))
    verify.add_argument("--evidence", action="append")
    verify.set_defaults(handler=command_verify_phase)
    return root


def main() -> None:
    try:
        args = parser().parse_args()
        args.handler(args)
    except RunError as error:
        payload = {"error": error.message, **error.details}
        sys.stderr.write(json.dumps(payload, sort_keys=True) + "\n")
        raise SystemExit(error.code) from error
    except (KeyError, TypeError, ValueError) as error:
        sys.stderr.write(json.dumps({"error": f"invalid state shape: {error}"}, sort_keys=True) + "\n")
        raise SystemExit(EX_INVALID) from error


if __name__ == "__main__":
    main()
