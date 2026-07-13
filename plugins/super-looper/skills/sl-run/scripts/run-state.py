#!/usr/bin/env python3
"""Deterministic state engine for the sl-run coordinator.

The parent coordinator is the only caller allowed to mutate run-state.json.
Workers receive phase packets and return worker-result JSON; they never call this
script or edit the plan, strategy, or state.
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
import subprocess
import sys
import tempfile
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
    return {"schema_version": 1, "goal": goal, "requirements": requirements, "phases": phases}


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


def summary(state: dict[str, Any], state_path: Path, **extra: Any) -> dict[str, Any]:
    phase, unit = current_unit(state)
    if state["status"] in {"completed", "failed", "cancelled"}:
        next_action = "none"
    elif state["status"] == "blocked":
        next_action = "resolve-blocker"
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
        "completed_gates": [item["id"] for item in state["phases"] if item["status"] == "completed"],
        "next_action": next_action,
        "state_path": str(state_path),
        "terminal_reason": state["terminal"]["reason"] if state.get("terminal") else None,
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
) -> dict[str, Any]:
    timestamp = now()
    return {
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


def command_init(args: argparse.Namespace) -> None:
    target = Path(args.target).resolve()
    if not (target / ".git").exists():
        raise RunError(EX_INVALID, "target must be a git repository", target=str(target))
    plan_path, plan_rel = resolve_inside(target, args.plan, "plan")
    plan = parse_plan(plan_path)
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
    state = initial_state(run_id, plan_rel, sha256(plan_path), strategy_state, branch, base_ref, head, plan)
    meta = {
        "schema_version": 1,
        "target": str(target),
        "strategy": {"path": strategy_rel, "absent": strategy_absent},
    }
    state_path.parent.mkdir(parents=True, exist_ok=True)
    with state_lock(state_path):
        if state_path.exists():
            raise RunError(EX_STATE, "run state already exists; resume it instead", state_path=str(state_path))
        atomic_write(state_path.parent / "execution-plan.json", plan)
        atomic_write(state_path.parent / "run-meta.json", meta)
        atomic_write(state_path, state)
    emit(summary(state, state_path, plan_contract_path=str(state_path.parent / "execution-plan.json")))


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


def command_start_next(args: argparse.Namespace) -> None:
    state_path = Path(args.state).resolve()
    with state_lock(state_path):
        state, plan, meta = load_bundle(state_path)
        check_resume(state, meta)
        if state["status"] == "initialized":
            state["status"] = "running"
        if state["status"] != "running":
            raise RunError(EX_STATE, "run is not ready to start work", status=state["status"])

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
        }
        packet_path = state_path.parent / f"phase-packet-{phase['id']}-{unit['id']}.json"
        atomic_write(packet_path, packet)
        atomic_write(state_path, state)
    emit(
        summary(
            state,
            state_path,
            packet_path=str(packet_path),
            worker_id=unit_state["worker_id"],
            next_action="dispatch-worker",
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
