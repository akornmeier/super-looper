#!/usr/bin/env bash
#
# loop.sh — unattended run-until-green driver for the lfg pipeline.
#
# Runs the `lfg` skill pipeline (plan -> work -> simplify -> review -> commit ->
# push -> PR -> CI-watch -> autofix) headlessly against a *target* directory, with
# a wall-clock + retry cap and a TARGET-SCOPED stop predicate. It is a thin
# invoker, not a second loop: lfg already loops CI to green and emits
# <promise>DONE</promise> in every exit path. This driver adds only what lfg
# lacks for unattended use — headless launch, permission bypass, a cap,
# target/plugin wiring, and a final stop-predicate check.
#
# DONE is a ROUTING signal, never a success signal: lfg emits DONE even when it
# gives up on red CI (its "CI Failures Unresolved" path). Success therefore
# requires DONE *and* an independent, target-scoped green verification.
#
# This driver never runs this repo's own gate scripts (solutions / plugin /
# release validators) against the target — those validate *this* repo and would
# fail spuriously on a throwaway target.
#
# See docs/loop-driver.md (operator usage) and docs/loop-driver-acceptance.md.
#
# Testing seams (env): LOOP_CLAUDE_BIN, LOOP_GH_BIN, LOOP_TIMEOUT_BIN let a test
# substitute stub executables so every code path below is exercised without a
# live Claude or GitHub call.

set -euo pipefail

# --- Exit codes (stable contract; documented in docs/loop-driver.md) ----------
readonly EX_OK=0
readonly EX_USAGE=2
readonly EX_ISOLATION=3
readonly EX_NO_VERIFY=4
readonly EX_CAP=5
readonly EX_TIMEOUT=6
readonly EX_DONE_RED=7
readonly EX_GOAL_DRIFT=8
# coreutils timeout(1) exits 124 when it terminates a timed-out command.
readonly TIMEOUT_EXIT_STATUS=124

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"

# Injectable binaries (default to PATH lookups). The claude invocation runs under
# an `env -i` allowlist, so these are passed as argv paths, not environment.
CLAUDE_BIN="${LOOP_CLAUDE_BIN:-claude}"
GH_BIN="${LOOP_GH_BIN:-gh}"
# jq validates the run-progress file's shape before a resume (U8). A missing jq is
# treated as a validation failure (cold restart), so this never weakens the guard.
JQ_BIN="${LOOP_JQ_BIN:-jq}"

# --- Headless invocation form -------------------------------------------------
# SINGLE SOURCE of the prompt that routes the headless session into lfg. The
# exact trigger form (this inline instruction vs. a `/lfg` slash command) is the
# execution-time unknown the U2 smoke pins; keep it here and mirrored in
# scripts/loop.example.env so the acceptance and the driver never diverge.
readonly LOOP_PROMPT_PREFIX='Run the lfg workflow to completion on the task below, fully unattended. lfg plans, implements, simplifies, reviews, applies fixes, commits, pushes, opens a pull request, watches CI, and autofixes to green, then outputs <promise>DONE</promise> as its final output. Do not stop to ask for confirmation. Task:'

# Plan-input variant: the task is ALREADY planned, so lfg skips planning and
# executes the supplied plan. The plan is NAMED (not inlined) using the literal
# `plan:<path>` marker lfg's plan-input branch detects; a relative path resolves
# against the target (the agent's CWD), an absolute path is used as-is. Built in
# the same inline-instruction
# style as LOOP_PROMPT_PREFIX (not a `/lfg` slash command) per the same
# execution-time-unknown pinned by the acceptance smoke.
readonly LOOP_PLAN_PROMPT_PREFIX='Run the lfg workflow to completion on the plan named below, fully unattended. The task is already planned — execute that plan, do not re-plan. lfg implements, simplifies, reviews, applies fixes, commits, pushes, opens a pull request, watches CI, and autofixes to green, then outputs <promise>DONE</promise> as its final output. Do not stop to ask for confirmation. Plan to execute:'

# --- Defaults -----------------------------------------------------------------
TARGET=""
SEED=""
SEED_FILE=""
PLAN_FILE=""
PHASE=""
HANDOFF_FILE=""
PLUGIN_DIR="$REPO_ROOT"
MODEL="opus"
TIMEOUT_SECONDS=1800
KILL_GRACE=20
MAX_RETRIES=2
LOG_DIR="/tmp/super-looper/loop"
DRY_RUN=0
VERIFY_MODE="github"
VERIFY_CMD=()

usage() {
  cat >&2 <<'EOF'
Usage: loop.sh --target <dir> (--seed <text> | --seed-file <path> | --plan-file <path>) [options]

Required (pick ONE task source):
  --target <dir>            Target directory the loop runs in and edits.
  --seed <text>             Seed task (inline), OR
  --seed-file <path>        Seed task read from a file, OR
  --plan-file <path>        Plan doc IN THE TARGET to execute; skips planning and
                            runs lfg's plan-input branch. Commit the plan in the
                            target so a retry's reset does not delete it.

Options:
  --phase <units>           Execute ONLY these plan units this run, e.g. "U1,U2"
                            (valid only with --plan-file). One run, one PR, one
                            phase. Normally set by scripts/loop-phases.sh rather
                            than by hand.
  --handoff-file <path>     Handoff doc carried as orienting context for the run
                            (valid only with --plan-file).
  --plugin-dir <path>       Pinned Super Looper checkout (default: this repo root).
  --model <model>           Orchestrator model, e.g. opus or fable (default: opus).
  --timeout <seconds>       Per-attempt wall-clock cap (default: 1800).
  --kill-after <seconds>    SIGKILL grace after timeout SIGTERM (default: 20).
  --max-retries <N>         Re-launch attempts after a crash-without-DONE (default: 2).
  --log-dir <dir>           Run-log directory (default: /tmp/super-looper/loop).
  --dry-run                 Print the constructed command + verification; do not run.
  --verify-cmd <cmd...>     Local verification command (must be LAST; consumes the
                            rest of the args, run as an argv vector, never eval'd).
                            When omitted, verification uses the target's GitHub CI.
  -h, --help                Show this help.

Stop predicate (success): DONE reached AND target verification green
  - GitHub mode: an open PR for the target branch with green `gh pr checks`.
  - Command mode: the --verify-cmd exits 0.
EOF
}

# --- Argument parsing ---------------------------------------------------------
# Every value-taking flag confirms a value is present BEFORE `shift 2`, so a
# value-less flag (e.g. `loop.sh --target`) yields a consistent usage error
# rather than a `set -e` "shift count out of range" crash with exit 1.
require_val() {
  # require_val <flag> <remaining-arg-count>
  if [ "$2" -lt 2 ]; then echo "loop.sh: $1 requires a value" >&2; usage; exit "$EX_USAGE"; fi
}
while [ $# -gt 0 ]; do
  case "$1" in
    --target) require_val --target "$#"; TARGET="$2"; shift 2 ;;
    --seed) require_val --seed "$#"; SEED="$2"; shift 2 ;;
    --seed-file) require_val --seed-file "$#"; SEED_FILE="$2"; shift 2 ;;
    --plan-file) require_val --plan-file "$#"; PLAN_FILE="$2"; shift 2 ;;
    --phase) require_val --phase "$#"; PHASE="$2"; shift 2 ;;
    --handoff-file) require_val --handoff-file "$#"; HANDOFF_FILE="$2"; shift 2 ;;
    --plugin-dir) require_val --plugin-dir "$#"; PLUGIN_DIR="$2"; shift 2 ;;
    --model) require_val --model "$#"; MODEL="$2"; shift 2 ;;
    --timeout) require_val --timeout "$#"; TIMEOUT_SECONDS="$2"; shift 2 ;;
    --kill-after) require_val --kill-after "$#"; KILL_GRACE="$2"; shift 2 ;;
    --max-retries) require_val --max-retries "$#"; MAX_RETRIES="$2"; shift 2 ;;
    --log-dir) require_val --log-dir "$#"; LOG_DIR="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --verify-cmd) shift; VERIFY_MODE="command"; VERIFY_CMD=( "$@" ); break ;;
    -h|--help) usage; exit "$EX_OK" ;;
    *) echo "loop.sh: unknown argument: $1" >&2; usage; exit "$EX_USAGE" ;;
  esac
done

log() {
  # Diagnostics go to stderr (stdout stays parseable for the final report).
  echo "[loop] $*" >&2
  if [ -n "${LOG_FILE:-}" ] && [ -f "${LOG_FILE:-}" ]; then
    echo "[loop] $*" >>"$LOG_FILE"
  fi
}

fail() {
  # fail <exit-code> <message...>
  local code="$1"; shift
  echo "loop.sh: $*" >&2
  exit "$code"
}

# --- Required-input validation ------------------------------------------------
missing=""
if [ -z "$TARGET" ]; then missing="$missing --target"; fi
if [ -z "$SEED" ] && [ -z "$SEED_FILE" ] && [ -z "$PLAN_FILE" ]; then missing="$missing --seed|--seed-file|--plan-file"; fi
if [ -n "$missing" ]; then
  echo "loop.sh: missing required input:$missing" >&2
  usage
  exit "$EX_USAGE"
fi

# --seed and --seed-file are mutually exclusive; accepting both and silently
# preferring one would hide an operator mistake (running a different task).
if [ -n "$SEED" ] && [ -n "$SEED_FILE" ]; then
  fail "$EX_USAGE" "--seed and --seed-file are mutually exclusive; pass only one."
fi

# --plan-file selects plan-input mode and is a distinct task source from a seed:
# a run executes a supplied plan OR a seed task, never both.
if [ -n "$PLAN_FILE" ] && [ -n "$SEED" ]; then
  fail "$EX_USAGE" "--plan-file and --seed are mutually exclusive; pass only one task source."
fi
if [ -n "$PLAN_FILE" ] && [ -n "$SEED_FILE" ]; then
  fail "$EX_USAGE" "--plan-file and --seed-file are mutually exclusive; pass only one task source."
fi

# --handoff-file rides along with a plan; it is meaningless without one.
if [ -n "$PHASE" ] && [ -z "$PLAN_FILE" ]; then
  fail "$EX_USAGE" "--phase is only valid with --plan-file; a phase names units in a plan."
fi
if [ -n "$HANDOFF_FILE" ] && [ -z "$PLAN_FILE" ]; then
  fail "$EX_USAGE" "--handoff-file is only valid with --plan-file."
fi

# --- Numeric-cap validation ---------------------------------------------------
# An unattended, permission-bypassed driver must never loop unbounded. A
# non-numeric cap makes `[ "$attempt" -gt "$MAX_RETRIES" ]` error, and since
# `set -e` is exempt inside an `if` condition the error reads as false and the
# retry loop never terminates. Reject non-integers before the loop.
validate_int() {
  case "$2" in
    ''|*[!0-9]*) echo "loop.sh: $1 must be a non-negative integer (got: '$2')" >&2; usage; exit "$EX_USAGE" ;;
  esac
}
validate_int --max-retries "$MAX_RETRIES"
validate_int --timeout "$TIMEOUT_SECONDS"
validate_int --kill-after "$KILL_GRACE"

# --- Verify-command validation ------------------------------------------------
# `--verify-cmd` consumes the rest of the args. Require a command, and reject one
# starting with '-' so a misplaced loop.sh flag (e.g. `--verify-cmd --dry-run`)
# is not silently swallowed into the verify vector while a real run launches.
if [ "$VERIFY_MODE" = "command" ]; then
  if [ "${#VERIFY_CMD[@]}" -eq 0 ]; then
    echo "loop.sh: --verify-cmd requires a command (it must be the LAST flag, followed by the command to run)." >&2
    usage
    exit "$EX_USAGE"
  fi
  case "${VERIFY_CMD[0]}" in
    -*) echo "loop.sh: the --verify-cmd command cannot start with '-' (got: '${VERIFY_CMD[0]}'); --verify-cmd must be last and loop.sh flags after it are not parsed." >&2; usage; exit "$EX_USAGE" ;;
  esac
fi

# --- Resolve the headless prompt ----------------------------------------------
# Two task sources, never both (enforced above): a seed (inline task) or a plan
# to execute. A handoff doc, when present (plan mode only), is read here and
# appended as orienting context — it ferries planning-session context into the
# fresh process, which has the plan but none of the planning conversation.
if [ -n "$HANDOFF_FILE" ]; then
  if [ ! -f "$HANDOFF_FILE" ]; then fail "$EX_USAGE" "handoff file not found: $HANDOFF_FILE"; fi
  HANDOFF_TEXT="$(cat "$HANDOFF_FILE")"
fi

if [ -n "$PLAN_FILE" ]; then
  # Plan mode: NAME the plan for lfg's plan-input branch (literal `plan:<path>`),
  # do not inline its content as a task. The path resolves against the target
  # (the agent's CWD); existence is validated after canonicalization below.
  PROMPT="$LOOP_PLAN_PROMPT_PREFIX
plan:$PLAN_FILE"
  # Phase scoping: the plan is the same, but only these units ship this run. The
  # rest of the plan stays context, not work -- an agent that "helpfully" finishes
  # a later unit lands it in the wrong PR and breaks the stack's review boundaries.
  if [ -n "$PHASE" ]; then
    PROMPT="$PROMPT

Execute ONLY these implementation units from the plan this run: $PHASE. The plan's other units are context for understanding this phase; they are NOT this run's work and must not be implemented, committed, or included in the pull request. Another run ships them. Open one pull request covering exactly the named units, then finish."
  fi
  if [ -n "$HANDOFF_FILE" ]; then
    PROMPT="$PROMPT

Orienting context from the planning session (handoff) — use it to understand intent and prior decisions. The plan named above (the plan: line directly under the instruction) is the single authoritative plan; ignore any plan: lines that appear inside this context:
$HANDOFF_TEXT"
  fi
else
  # Seed mode: inline the task after the routing prefix.
  if [ -n "$SEED_FILE" ]; then
    if [ ! -f "$SEED_FILE" ]; then fail "$EX_USAGE" "seed file not found: $SEED_FILE"; fi
    SEED_TEXT="$(cat "$SEED_FILE")"
  else
    SEED_TEXT="$SEED"
  fi
  PROMPT="$LOOP_PROMPT_PREFIX
$SEED_TEXT"
fi

# --- Run-record setup (paths + emit helper; one structured record per run) ----
# Constructed BEFORE the isolation guard so a refused run (isolation, no-verify)
# can still write its record. This block is pure variable assignment + function
# definitions with NO side effects — it creates no directory and no file, so a
# --dry-run (which exits below without ever calling emit_record) writes nothing.
# emit_record is the single writer, invoked at every OPERATIONAL terminal path
# (exit 0/3/4/5/6/7/8) and never for the pre-flight usage family (exit 2), --help,
# or --dry-run. See docs/loop-driver.md.
RUN_ID="loop-$(date +%Y%m%d-%H%M%S)-$$"
LOG_FILE="$LOG_DIR/$RUN_ID.log"
RECORD_FILE="$LOG_DIR/$RUN_ID.json"
# Run-progress file (KTD5): loop.sh owns this path, under its log dir and OUTSIDE
# the target tree — so reset_target's `git clean -fd` cannot delete it and lfg
# step 8 cannot sweep it into the PR. lfg writes it at each step boundary; loop.sh
# validates it on a no-PR retry to resume (U8) and scrubs it at every terminal.
PROGRESS_FILE="$LOG_DIR/$RUN_ID.progress.json"
# Name it for lfg via a progress:<path> marker (same literal-prefix convention as
# plan:). Present in BOTH plan and seed mode; lfg writes the file at each step
# boundary and re-reads it on a resume relaunch. No marker (interactive) = no writes.
PROMPT="$PROMPT
progress:$PROGRESS_FILE"
RUN_STARTED_EPOCH="$(date +%s)"
RUN_STARTED_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
readonly RECORD_SCHEMA_VERSION=1
pr_url=""
attempt_results=()

json_escape() {
  # Escape a string for embedding inside a JSON double-quoted value.
  local s="${1:-}"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

json_str_or_null() {
  # Emit a JSON quoted string, or null when the value is empty.
  if [ -z "${1:-}" ]; then printf 'null'; else printf '"%s"' "$(json_escape "$1")"; fi
}

# jq -c of one run-progress-file field, collapsing every failure mode (jq error,
# unparseable file, absent/null field, empty output) to the literal string "null".
lift_progress_field() {
  local v
  v="$( "$JQ_BIN" -c ".$1 // null" "$PROGRESS_FILE" 2>/dev/null || printf 'null' )"
  [ -n "$v" ] && printf '%s' "$v" || printf 'null'
}

emit_record() {
  # emit_record <exit-code> — write the structured run-record to RECORD_FILE.
  # Invoked best-effort ("emit_record ... || true") at each terminal site, so a
  # write failure (e.g. an unwritable --log-dir) can never perturb the stable
  # exit-code contract — the record is observability; the exit code is the API.
  # Reads driver state from globals and stays safe to call from the pre-launch
  # refusal sites: every optional global is defaulted, and target_pr_url (defined
  # later in the script) is never called here — the PR pointer is read from the
  # pr_url global that the post-launch verification paths populate.
  local exit_code="$1"
  local outcome typed_failure verification_result
  case "$exit_code" in
    0) outcome="success"; typed_failure="";                  verification_result="green" ;;
    3) outcome="failure"; typed_failure="isolation-refusal"; verification_result="not-run" ;;
    4) outcome="failure"; typed_failure="no-verify";         verification_result="not-run" ;;
    5) outcome="failure"; typed_failure="cap-exhausted";     verification_result="not-run" ;;
    6) outcome="failure"; typed_failure="timeout";           verification_result="not-run" ;;
    7) outcome="failure"; typed_failure="done-but-red";      verification_result="red" ;;
    8) outcome="failure"; typed_failure="goal-drift";        verification_result="not-run" ;;
    *) outcome="failure"; typed_failure="unknown";           verification_result="not-run" ;;
  esac

  # Goal-drift detail (R2): on an exit-8 record, name the changed file and the
  # change kind (modified / deleted / created); null on every other path. The
  # guard sets goal_drift_file/goal_drift_kind before calling emit_record.
  local goal_drift_json="null"
  if [ -n "${goal_drift_file:-}" ]; then
    goal_drift_json="{ \"file\": $(json_str_or_null "${goal_drift_file:-}"), \"change\": $(json_str_or_null "${goal_drift_kind:-}") }"
  fi

  # Progress-file lifts: goal_fidelity (R6), learning_rejection (R9), and
  # refresh_due (R13) are copied VERBATIM from the run-progress file when it
  # exists and carries them; null otherwise — nothing is fabricated, so "no
  # data" stays honest. Read them HERE, before the scrub at the end of this
  # function (U8's `rm -f "$PROGRESS_FILE"`); a read after the scrub would
  # always see nothing. A missing jq, an absent file, or an absent/null field
  # each collapse to "null".
  local goal_fidelity_json="null"
  local learning_rejection_json="null"
  local refresh_due_json="null"
  if [ -f "$PROGRESS_FILE" ] && command -v "$JQ_BIN" >/dev/null 2>&1; then
    goal_fidelity_json="$(lift_progress_field goal_fidelity)"
    learning_rejection_json="$(lift_progress_field learning_rejection)"
    refresh_due_json="$(lift_progress_field refresh_due)"
  fi

  local route=""
  if [ "${done_reached:-0}" -eq 1 ]; then
    if [ "${routed_via_pr:-0}" -eq 1 ]; then route="open-PR (crash-reconciled)"; else route="DONE"; fi
  fi

  local done_b timed_b routed_b
  [ "${done_reached:-0}" -eq 1 ] && done_b=true || done_b=false
  [ "${timed_out:-0}" -eq 1 ] && timed_b=true || timed_b=false
  [ "${routed_via_pr:-0}" -eq 1 ] && routed_b=true || routed_b=false

  # Per-attempt outcomes accumulated by the run loop (empty for pre-launch exits).
  local results_json="[]" first=1 r
  if [ "${#attempt_results[@]}" -gt 0 ]; then
    results_json="["
    for r in "${attempt_results[@]}"; do
      if [ "$first" -eq 1 ]; then first=0; else results_json+=", "; fi
      results_json+="$(json_str_or_null "$r")"
    done
    results_json+="]"
  fi

  # Best-effort residual pointer: lfg's no-PR fallback commits a findings file in
  # the target, but the common open-PR path keeps residual in the PR body (so the
  # pointer collapses into pr_url). Often null; coverage_boundary documents this.
  local residual=""
  if [ -n "${CT:-}" ] && [ -d "$CT/docs/residual-review-findings" ]; then
    residual="$( ls -1t "$CT/docs/residual-review-findings/"*.md 2>/dev/null | head -n1 || true )"
  fi

  local ended_iso duration
  ended_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  duration=$(( $(date +%s) - RUN_STARTED_EPOCH ))

  mkdir -p "$LOG_DIR" 2>/dev/null || true
  chmod 700 "$LOG_DIR" 2>/dev/null || true
  # Ensure the transcript pointer resolves: create it empty when absent (the
  # pre-launch refusal paths never open it). >> never truncates an existing log.
  : >>"$LOG_FILE" 2>/dev/null || true
  cat >"$RECORD_FILE" <<EOF
{
  "schema_version": $RECORD_SCHEMA_VERSION,
  "run_id": "$(json_escape "$RUN_ID")",
  "outcome": "$outcome",
  "exit_code": $exit_code,
  "typed_failure": $(json_str_or_null "$typed_failure"),
  "goal_drift": $goal_drift_json,
  "goal_fidelity": $goal_fidelity_json,
  "learning_rejection": $learning_rejection_json,
  "refresh_due": $refresh_due_json,
  "route": $(json_str_or_null "$route"),
  "verification": { "mode": "$VERIFY_MODE", "result": "$verification_result" },
  "attempts": {
    "count": ${attempt:-0},
    "done_reached": $done_b,
    "timed_out": $timed_b,
    "routed_via_pr": $routed_b,
    "results": $results_json
  },
  "timing": {
    "started_at": "$RUN_STARTED_ISO",
    "ended_at": "$ended_iso",
    "duration_seconds": $duration
  },
  "pointers": {
    "transcript_log": $(json_str_or_null "$LOG_FILE"),
    "pr_url": $(json_str_or_null "${pr_url:-}"),
    "residual_findings": $(json_str_or_null "$residual")
  },
  "coverage_boundary": {
    "indexed_by_pointer": ["transcript_log", "pr_url", "residual_findings"],
    "not_contained": [
      "per-phase agent trace (reserved for the run_id join key)",
      "fine-grained failure classification (read from the pointed-to verify output)",
      "in-target file detail (git-clean'd on retry-reset)"
    ]
  }
}
EOF

  # Scrub the run-progress file at every terminal (R16). emit_record is the single
  # writer invoked at every operational exit (0/3/4/5/6/7/8), so this one site
  # covers success and every failure; cold restarts scrub separately (they are not
  # terminals). Stale state must never seed a later run. rm -f is a no-op when lfg
  # never wrote the file (pre-launch refusals, interactive runs).
  rm -f "$PROGRESS_FILE" 2>/dev/null || true
}

# --- Canonicalize + isolation guard (self-edit hazard) ------------------------
canon() { ( cd "$1" 2>/dev/null && pwd -P ); }

CT="$(canon "$TARGET" || true)"
CP="$(canon "$PLUGIN_DIR" || true)"
if [ -z "$CT" ]; then fail "$EX_USAGE" "target directory does not exist: $TARGET"; fi
if [ -z "$CP" ]; then fail "$EX_USAGE" "plugin directory does not exist: $PLUGIN_DIR"; fi

# Refuse if target == plugin-dir, or either is an ancestor of the other: an
# unattended permission-bypassed run must never edit the plugin running it.
if [ "$CT" = "$CP" ] || [ "${CT#"$CP"/}" != "$CT" ] || [ "${CP#"$CT"/}" != "$CP" ]; then
  echo "loop.sh: refusing to run — target and plugin-dir overlap (self-edit hazard)." >&2
  echo "         target=$CT" >&2
  echo "         plugin-dir=$CP" >&2
  emit_record "$EX_ISOLATION" || true
  exit "$EX_ISOLATION"
fi

# --- Plan-file must be a readable plan inside the target ----------------------
# Unlike a seed file (read above), the plan is NAMED for the agent, which reads
# it with the target as its CWD. Resolve a relative path against the target and
# confirm it is readable there, so validation matches what the agent will see.
if [ -n "$PLAN_FILE" ]; then
  case "$PLAN_FILE" in
    /*) plan_check="$PLAN_FILE" ;;
    *)  plan_check="$CT/$PLAN_FILE" ;;
  esac
  if [ ! -r "$plan_check" ]; then
    fail "$EX_USAGE" "plan file not found or unreadable in the target: $PLAN_FILE"
  fi
fi

# --- Goal-drift guard: resolve the guarded goal-file paths --------------------
# The goal guard refuses to report success when a run mutated its own goal.
# STRATEGY.md in the target is always guarded; the resolved plan file is guarded
# in plan mode (seed mode guards STRATEGY.md only — R3). An absent file hashes to
# a stable sentinel so absent-at-start / absent-at-end compares equal (R3). The
# harness checksum is authoritative (KTD1); a future hook is defense-in-depth.
readonly GUARD_ABSENT_SENTINEL="absent"
STRATEGY_PATH="$CT/STRATEGY.md"
GUARD_PLAN_PATH=""
if [ -n "$PLAN_FILE" ]; then GUARD_PLAN_PATH="$plan_check"; fi

# --- Verification mode --------------------------------------------------------
# command mode: a --verify-cmd was supplied. github mode (default): use the
# target's own GitHub CI. A run with neither a remote nor a --verify-cmd has no
# verification path and must fail fast — there is no unverified success.
TARGET_HAS_REMOTE=0
if [ -n "$(cd "$CT" && git remote 2>/dev/null || true)" ]; then
  TARGET_HAS_REMOTE=1
fi

# --- Resolve timeout binary + build run wrapper -------------------------------
resolve_timeout_bin() {
  # An explicitly-set LOOP_TIMEOUT_BIN (even empty) is authoritative: empty means
  # "no timeout binary available". Unset => autodetect timeout/gtimeout on PATH.
  if [ -n "${LOOP_TIMEOUT_BIN+x}" ]; then echo "${LOOP_TIMEOUT_BIN:-}"; return 0; fi
  if command -v timeout >/dev/null 2>&1; then echo "timeout"; return 0; fi
  if command -v gtimeout >/dev/null 2>&1; then echo "gtimeout"; return 0; fi
  echo ""
}
TIMEOUT_RESOLVED="$(resolve_timeout_bin)"

run_wrapper=()
if [ -n "$TIMEOUT_RESOLVED" ]; then
  run_wrapper=( "$TIMEOUT_RESOLVED" "--signal=TERM" "--kill-after=${KILL_GRACE}s" "${TIMEOUT_SECONDS}s" )
fi

# Environment allowlist: launch claude with ONLY the variables the run needs, so
# ambient operator secrets are not inherited by the unattended agent.
claude_env=( env -i "HOME=$HOME" "PATH=$PATH" )
if [ -n "${GH_TOKEN:-}" ]; then claude_env+=( "GH_TOKEN=$GH_TOKEN" ); fi
if [ -n "${GITHUB_TOKEN:-}" ]; then claude_env+=( "GITHUB_TOKEN=$GITHUB_TOKEN" ); fi
# Arm the plugin's goal-guard hook (defense-in-depth for the checksum guard
# above): forward the exact resolved goal-file paths so a mid-run Write/Edit to
# STRATEGY.md or the active plan is denied fast. NEWLINE-separated because a
# resolved path may contain a colon. Seed mode carries STRATEGY.md only (so
# sl-plan can still create the plan); plan mode adds the resolved plan file.
GOAL_GUARD_PATHS="$STRATEGY_PATH"
if [ -n "$GUARD_PLAN_PATH" ]; then
  GOAL_GUARD_PATHS="$GOAL_GUARD_PATHS
$GUARD_PLAN_PATH"
fi
claude_env+=( "LOOP_GOAL_GUARD_PATHS=$GOAL_GUARD_PATHS" )
# The marker carve-out is scoped to the PLAN alone, never STRATEGY.md. The plan's
# hash is marker-normalized (hash_plan); STRATEGY.md's is raw (hash_file), and it
# carries no markers anyway. Letting the hook wave a marker-shaped edit through on
# STRATEGY.md would put the two guards into disagreement -- the hook allows, the
# raw checksum kills it at done_reached, and the run throws away all its work.
claude_env+=( "LOOP_GOAL_GUARD_MARKER_PATH=$GUARD_PLAN_PATH" )

claude_cmd=( "$CLAUDE_BIN" -p "$PROMPT" --plugin-dir "$CP" --model "$MODEL" --dangerously-skip-permissions )

# --- Dry run ------------------------------------------------------------------
if [ "$DRY_RUN" -eq 1 ]; then
  # Redacted env for display (never print token values).
  print_env=( env -i "HOME=$HOME" "PATH=$PATH" )
  if [ -n "${GH_TOKEN:-}" ]; then print_env+=( "GH_TOKEN=REDACTED" ); fi
  if [ -n "${GITHUB_TOKEN:-}" ]; then print_env+=( "GITHUB_TOKEN=REDACTED" ); fi

  echo "[dry-run] target: $CT"
  echo "[dry-run] plugin-dir: $CP"
  echo "[dry-run] model: $MODEL"
  if [ -n "$PLAN_FILE" ]; then
    echo "[dry-run] mode: plan-input (skips planning)"
    echo "[dry-run] plan-file: $PLAN_FILE"
    if [ -n "$PHASE" ]; then echo "[dry-run] phase: $PHASE"; fi
    if [ -n "$HANDOFF_FILE" ]; then echo "[dry-run] handoff-file: $HANDOFF_FILE"; fi
  else
    echo "[dry-run] mode: seed"
  fi
  echo "[dry-run] verify-mode: $VERIFY_MODE"
  if [ "$VERIFY_MODE" = "github" ] && [ "$TARGET_HAS_REMOTE" -eq 0 ]; then
    echo "[dry-run] WARNING: github verify-mode but target has no git remote — a real run would fail fast (exit $EX_NO_VERIFY)."
  fi
  if [ -z "$TIMEOUT_RESOLVED" ]; then
    echo "[dry-run] WARNING: no 'timeout' binary found — a real run would not be wall-clock capped."
  fi
  echo "[dry-run] log: $LOG_FILE"

  printf '[dry-run] command: cd %q &&' "$CT"
  if [ "${#run_wrapper[@]}" -gt 0 ]; then
    for tok in "${run_wrapper[@]}"; do printf ' %q' "$tok"; done
  fi
  for tok in "${print_env[@]}"; do printf ' %q' "$tok"; done
  for tok in "${claude_cmd[@]}"; do printf ' %q' "$tok"; done
  echo

  if [ "$VERIFY_MODE" = "command" ]; then
    printf '[dry-run] verification:'
    if [ "${#VERIFY_CMD[@]}" -gt 0 ]; then
      for tok in "${VERIFY_CMD[@]}"; do printf ' %q' "$tok"; done
    fi
    echo
  else
    echo "[dry-run] verification: (cd target && gh pr view --json state,url) && (cd target && gh pr checks)"
  fi
  exit "$EX_OK"
fi

# --- Fail fast when there is no verification path -----------------------------
if [ "$VERIFY_MODE" = "github" ] && [ "$TARGET_HAS_REMOTE" -eq 0 ]; then
  emit_record "$EX_NO_VERIFY" || true
  fail "$EX_NO_VERIFY" "no verification mode available: target has no git remote and no --verify-cmd was supplied."
fi

# --- Fail fast when the wall-clock cap cannot be enforced ---------------------
# R3 requires a per-attempt wall-clock cap; without a timeout binary a hung
# claude would run unbounded, breaking the "never loops unbounded" guarantee.
# Refuse rather than silently degrade. (--dry-run exits above, so it is exempt.)
if [ -z "$TIMEOUT_RESOLVED" ]; then
  fail "$EX_USAGE" "no 'timeout' binary found — the wall-clock cap cannot be enforced. Install coreutils ('brew install coreutils' provides gtimeout) or put 'timeout' on PATH."
fi

# --- Target helpers (GitHub-scoped; never touch this repo's gates) ------------
target_open_pr() {
  local state
  state="$( ( cd "$CT" && "$GH_BIN" pr view --json state -q .state ) 2>/dev/null || true )"
  [ "$state" = "OPEN" ]
}
target_pr_url() {
  ( cd "$CT" && "$GH_BIN" pr view --json url -q .url ) 2>/dev/null || true
}
target_ci_green() {
  # `gh pr checks` alone exits 0 when a PR has ZERO checks — that is
  # "unverified", not green, and would defeat the no-unverified-success rule.
  # Require at least one check with every check in a passing bucket
  # (pass/skipping). Bound the call with timeout so a slow API can't hang the
  # unattended run. Buckets: pass | fail | pending | skipping | cancel.
  local buckets
  if [ -n "$TIMEOUT_RESOLVED" ]; then
    buckets="$( ( cd "$CT" && "$TIMEOUT_RESOLVED" --kill-after=10s 120s "$GH_BIN" pr checks --json bucket -q '.[].bucket' ) 2>>"$LOG_FILE" || true )"
  else
    buckets="$( ( cd "$CT" && "$GH_BIN" pr checks --json bucket -q '.[].bucket' ) 2>>"$LOG_FILE" || true )"
  fi
  [ -n "$buckets" ] || return 1
  ! printf '%s\n' "$buckets" | grep -qvE '^(pass|skipping)$'
}

# Reset the target to its clean base before a retry (clean-base-per-retry).
BASE_REF="$( ( cd "$CT" && git rev-parse HEAD ) 2>/dev/null || true )"
reset_target() {
  ( cd "$CT" && git checkout -- . ) >>"$LOG_FILE" 2>&1 || true
  ( cd "$CT" && git clean -fd ) >>"$LOG_FILE" 2>&1 || true
  if [ -n "$BASE_REF" ]; then
    ( cd "$CT" && git reset --hard "$BASE_REF" ) >>"$LOG_FILE" 2>&1 || true
  fi
}

# --- Resume validation (poisoned-file guard for a no-PR retry, R15) -----------
# Return 0 ONLY for a run-progress file that is shape-valid AND bound to THIS run;
# set `progress_branch` on success. A stale or forged file must never fake a
# resume point, so gate on what each signal PROVES (the quiescence-gate learning),
# not on mere file presence: jq -e for shape, then run_id / attempt / base_ref /
# branch-exists / head_sha-reachable bindings. ANY failure returns non-zero so the
# caller scrubs and cold-restarts — fail toward cold restart, never toward trust.
# Every fallible step is guarded with `|| return 1`, so the result is independent
# of `set -e` semantics inside the calling `if`.
validate_progress_file() {
  [ -f "$PROGRESS_FILE" ] || return 1
  command -v "$JQ_BIN" >/dev/null 2>&1 || return 1

  # Shape: valid JSON, a schema_version we understand, and every binding field
  # present as the right type. jq -e exits non-zero on a false/null result or on
  # invalid JSON, so a corrupt or truncated file fails here.
  "$JQ_BIN" -e '
    (.schema_version == 1)
    and (.run_id   | type == "string")
    and (.attempt  | type == "number")
    and (.branch   | type == "string" and (length > 0))
    and (.base_ref | type == "string" and (length > 0))
    and (.head_sha | type == "string" and (length > 0))
  ' "$PROGRESS_FILE" >/dev/null 2>&1 || return 1

  local p_run_id p_attempt p_branch p_base_ref p_head_sha p_step
  p_run_id="$( "$JQ_BIN" -r '.run_id'   "$PROGRESS_FILE" 2>/dev/null )"   || return 1
  p_attempt="$( "$JQ_BIN" -r '.attempt'  "$PROGRESS_FILE" 2>/dev/null )"  || return 1
  p_branch="$( "$JQ_BIN" -r '.branch'   "$PROGRESS_FILE" 2>/dev/null )"   || return 1
  p_base_ref="$( "$JQ_BIN" -r '.base_ref' "$PROGRESS_FILE" 2>/dev/null )" || return 1
  p_head_sha="$( "$JQ_BIN" -r '.head_sha' "$PROGRESS_FILE" 2>/dev/null )" || return 1
  # step is NOT a binding field (a resume is bound by run_id/base_ref/branch/head);
  # it is lifted only to detect a resumed attempt that made no progress (R18). An
  # absent step collapses to empty and never fails validation.
  p_step="$( "$JQ_BIN" -r '.step // empty' "$PROGRESS_FILE" 2>/dev/null )"  || return 1

  # run_id ties the file to THIS run: a file from any other run (or a same-path
  # collision) is rejected. RUN_ID embeds a timestamp and pid, so it is unguessable.
  [ "$p_run_id" = "$RUN_ID" ] || return 1
  # attempt: a non-negative integer at or below the just-finished attempt — the
  # file was written by an attempt that already ran in this run.
  case "$p_attempt" in ''|*[!0-9]*) return 1 ;; esac
  [ "$p_attempt" -le "$attempt" ] || return 1
  # base_ref must equal the run's clean base (the branch forked from OUR base).
  [ "$p_base_ref" = "$BASE_REF" ] || return 1
  # The recorded branch must exist in the target (refs/heads scope only — never a
  # bare sha or HEAD masquerading as a branch).
  ( cd "$CT" && git rev-parse --verify --quiet "refs/heads/$p_branch" ) >/dev/null 2>&1 || return 1
  # The recorded HEAD sha must be reachable as a commit in the target.
  ( cd "$CT" && git cat-file -e "${p_head_sha}^{commit}" ) >/dev/null 2>&1 || return 1

  progress_branch="$p_branch"
  progress_step="$p_step"
  progress_head_sha="$p_head_sha"
  return 0
}

# --- Goal-file hashing (goal-drift guard) -------------------------------------
# sha256 of a goal file; an ABSENT file hashes to a stable sentinel so an
# absent-at-start / absent-at-end file compares equal and passes (R3). shasum is
# the portable fallback where sha256sum is absent (macOS).
hash_file() {
  local f="$1"
  if [ ! -f "$f" ]; then printf '%s' "$GUARD_ABSENT_SENTINEL"; return 0; fi
  # Guard both pipelines: an unreadable-but-present file (e.g. chmod 000 mid-run)
  # makes sha256sum/shasum fail, which under `set -euo pipefail` would abort the
  # plain command-substitution assignment at the call sites with no emit_record —
  # outside the exit-code contract. Fall back to an "unreadable:<path>" sentinel so
  # the file surfaces as a hash mismatch → typed goal-drift exit (8) with a record.
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$f" 2>/dev/null | awk '{print $1}' || printf 'unreadable:%s' "$f"
  else
    shasum -a 256 "$f" 2>/dev/null | awk '{print $1}' || printf 'unreadable:%s' "$f"
  fi
}

# Hash a PLAN file's goal content rather than its raw bytes: status markers are
# rewritten to their canonical idle form before hashing, so a marker moving
# []->[wip]->[x] does not read as goal drift. Markers are progress state the run
# itself produces; requirements, units, and decisions are the goal. Only the plan
# is normalized -- STRATEGY.md keeps the raw hash_file above, because it carries
# no markers and is the file the guard most exists to protect.
#
# The patterns are anchored on the COMPLETE marker token (element or code-span
# delimiters included) and match only the literal values wip|x|f. So the only
# bytes this frees are those 1-3 characters inside a marker that already exists:
# adding a marker, deleting one, or putting anything else between the brackets
# all change surrounding bytes and still trip the guard. See
# docs/solutions/workflow/goal-guard-marker-region-carveout.md for the full
# invariant audit before touching this.
hash_plan() {
  local f="$1"
  if [ ! -f "$f" ]; then printf '%s' "$GUARD_ABSENT_SENTINEL"; return 0; fi
  # Pipe the normalized stream straight into the hasher. Capturing it in a
  # variable first would strip trailing newlines (command substitution does),
  # so an edit that only added or removed newlines at EOF would hash the same
  # and slip past the guard -- a carve-out wider than the marker values this
  # normalization is meant to free.
  # `set -o pipefail` (top of file) already fails the pipeline on ANY stage --
  # sed, the hasher, or awk -- so let its status stand rather than forcing the
  # subshell to exit with sed's alone, which would wave through a hasher that
  # failed but still printed something.
  local hasher out
  if command -v sha256sum >/dev/null 2>&1; then hasher=sha256sum; else hasher="shasum -a 256"; fi
  out="$(normalize_markers "$f" | $hasher 2>/dev/null | awk '{print $1}')" \
    || { printf 'unreadable:%s' "$f"; return 0; }
  if [ -z "$out" ]; then printf 'unreadable:%s' "$f"; return 0; fi
  printf '%s' "$out"
}

# Rewrite every status marker to `[]`. HTML: <code class="status">[x]</code>.
# Markdown: an inline code span holding exactly a marker, `[x]`. sed -E is the
# portable ERE form across GNU and BSD (macOS) sed.
normalize_markers() {
  sed -E \
    -e 's@<code class="status">\[(wip|x|f)\]</code>@<code class="status">[]</code>@g' \
    -e 's@`\[(wip|x|f)\]`@`[]`@g' \
    "$1" 2>/dev/null
}

# Classify a start/end hash mismatch as the change kind R2 distinguishes:
# created (absent -> present), deleted (present -> absent), or modified.
drift_kind_of() {
  local start="$1" end="$2"
  if [ "$start" = "$GUARD_ABSENT_SENTINEL" ]; then printf 'created'
  elif [ "$end" = "$GUARD_ABSENT_SENTINEL" ]; then printf 'deleted'
  else printf 'modified'; fi
}

# DONE is the routing signal. Match the LAST non-empty line only, so the literal
# sentinel echoed mid-transcript (it appears verbatim in lfg's own source) never
# counts as a finish on its own.
detect_done() {
  local last
  last="$(awk 'NF{l=$0} END{print l}' "$1")"
  case "$last" in
    *"<promise>DONE</promise>"*) return 0 ;;
    *) return 1 ;;
  esac
}

# --- Run --------------------------------------------------------------------
mkdir -p "$LOG_DIR"
chmod 700 "$LOG_DIR" 2>/dev/null || true
: >"$LOG_FILE"
log "run started: target=$CT model=$MODEL verify-mode=$VERIFY_MODE max-retries=$MAX_RETRIES"
if [ -z "$BASE_REF" ] && [ "$MAX_RETRIES" -gt 0 ]; then
  log "warning: target has no base commit — a retry cannot fully reset it to a clean base."
fi

attempt=0
done_reached=0
routed_via_pr=0
timed_out=0
# Resume state (U8): resume_active=1 relaunches lfg with a resume:<path> marker on
# the recorded branch (no reset); set at the loop tail when the progress file
# validates, consumed when building the next attempt's command.
resume_active=0
progress_branch=""
progress_step=""
progress_head_sha=""
# One-resume-per-recorded-state (R18): the step+head_sha the last resume was armed
# on. A resumed attempt that crashes again without advancing past this state gets a
# cold restart instead of an infinite re-resume (see the resume decision below).
resume_armed_state=""
# Goal-drift snapshots: sha256 of the guarded goal files at the winning attempt's
# start (re-hashed on the done_reached path below). Overwritten per attempt.
strategy_hash_start=""
plan_hash_start=""
attempt_log="$(mktemp "${TMPDIR:-/tmp}/loop-attempt.XXXXXX")"
trap 'rm -f "$attempt_log"' EXIT

while :; do
  attempt=$((attempt + 1))
  timed_out=0

  # Goal-drift snapshot: hash the guarded goal files at attempt start, AFTER any
  # reset_target (run at the end of the previous iteration) restored the clean
  # base (KTD3). Taken ONLY on a cold attempt: a resumed attempt inherits the prior
  # attempt's baseline instead of re-snapshotting the surviving (possibly mutated)
  # tree. Re-baselining on resume would launder a goal mutation made by the crashed
  # attempt into the resumed attempt's clean baseline, so exit 8 would never fire —
  # the baseline must span the whole surviving attempt lineage (KTD3/R1). The
  # winning attempt's snapshot is the one that persists past the break and is
  # compared on the done_reached path below.
  if [ "$resume_active" -ne 1 ]; then
    strategy_hash_start="$(hash_file "$STRATEGY_PATH")"
    if [ -n "$GUARD_PLAN_PATH" ]; then plan_hash_start="$(hash_plan "$GUARD_PLAN_PATH")"; fi
  fi

  # Build this attempt's command. A resuming relaunch (a validated no-PR retry)
  # appends a resume:<path> marker so lfg re-verifies steps 1..N-1 and continues
  # at the recorded step; a cold attempt uses the base prompt (the progress:<path>
  # marker is already in PROMPT for both). Rebuilt per attempt because only the
  # prompt differs — env, plugin-dir, model, flags, and wrapper are identical.
  attempt_prompt="$PROMPT"
  if [ "$resume_active" -eq 1 ]; then
    attempt_prompt="$PROMPT
resume:$PROGRESS_FILE"
  fi
  attempt_claude_cmd=( "$CLAUDE_BIN" -p "$attempt_prompt" --plugin-dir "$CP" --model "$MODEL" --dangerously-skip-permissions )
  full_cmd=()
  if [ "${#run_wrapper[@]}" -gt 0 ]; then full_cmd+=( "${run_wrapper[@]}" ); fi
  full_cmd+=( "${claude_env[@]}" "${attempt_claude_cmd[@]}" )

  log "attempt $attempt: launching headless claude"

  # Run the agent in its own process group (set -m) and forward INT/TERM to the
  # WHOLE group, so aborting the driver kills the permission-bypassed agent and
  # any children it spawned (e.g. a `gh pr checks --watch`) rather than orphaning
  # them. Fall back to the single PID if the group signal fails. set +m right
  # after launch keeps job-control completion notices off stderr.
  run_status=0
  set -m
  ( cd "$CT" && exec "${full_cmd[@]}" ) >"$attempt_log" 2>&1 &
  run_pid=$!
  set +m
  trap 'kill -TERM -"$run_pid" 2>/dev/null || kill -TERM "$run_pid" 2>/dev/null || true; exit 130' INT
  trap 'kill -TERM -"$run_pid" 2>/dev/null || kill -TERM "$run_pid" 2>/dev/null || true; exit 143' TERM
  wait "$run_pid" || run_status=$?
  trap - INT TERM
  tee -a "$LOG_FILE" <"$attempt_log" >/dev/null

  if detect_done "$attempt_log"; then
    log "attempt $attempt reached DONE"
    done_reached=1
    attempt_results+=("done")
    break
  fi

  # Only a real timeout wrapper firing means "timed out". An uncapped run that
  # happens to exit 124 is a crash, not a driver timeout. timed_out is reset
  # each attempt, so the final failure reflects the LAST attempt's outcome.
  if [ "${#run_wrapper[@]}" -gt 0 ] && [ "$run_status" -eq "$TIMEOUT_EXIT_STATUS" ]; then
    timed_out=1
    log "attempt $attempt timed out (no DONE)"
  else
    log "attempt $attempt crashed without DONE (status $run_status)"
  fi

  # Reconcile before retrying: an already-open PR for the target branch is
  # terminal — route to verification rather than re-run lfg on a half-finished
  # branch. This reconciliation keeps PRECEDENCE over resume: it breaks out here,
  # before the resume/reset decision below, so resume never fires once a PR exists
  # (resume is scoped to pre-PR steps 1-7, KTD6).
  if target_open_pr; then
    log "attempt $attempt: an open PR already exists for the target — routing to verification (no re-launch)"
    routed_via_pr=1
    done_reached=1
    attempt_results+=("open-PR-reconciled")
    break
  fi

  # This attempt neither reached DONE nor reconciled to an open PR.
  if [ "$timed_out" -eq 1 ]; then attempt_results+=("timeout"); else attempt_results+=("crash"); fi

  # Give-up floor FIRST (KTD6): the cap is checked before the resume/reset
  # decision, so resume never extends the retry budget — exit 5 stays the floor.
  if [ "$attempt" -gt "$MAX_RETRIES" ]; then
    break
  fi

  # No open PR reached here (the reconciliation above broke out first, keeping its
  # precedence — resume never fires once a PR exists). Choose resume vs cold restart
  # from the run-progress file (D2): a shape-valid file bound to THIS run lets the
  # next attempt resume at the recorded step on the recorded branch WITHOUT a reset,
  # inheriting the prior attempt's goal-drift baseline (the loop-top snapshot is
  # skipped on resume). ANY validation failure scrubs the file and resets to the
  # clean base. Fail toward cold restart, never toward trusting a stale/poisoned
  # file (R15/R16).
  if validate_progress_file; then
    # One-resume-per-recorded-state (R18): arm a resume ONCE per recorded state. If
    # the just-crashed attempt was itself a resume that made no progress (its file
    # still carries the step+head_sha armed last time), a re-resume would loop
    # forever — converge to an honest cold restart instead, matching lfg's "next
    # retry cold-restarts honestly" postcondition-mismatch promise. Real progress
    # (an advanced step or a new head_sha) re-arms the resume.
    armed_state="$progress_step:$progress_head_sha"
    if [ "$resume_active" -eq 1 ] && [ "$armed_state" = "$resume_armed_state" ]; then
      log "attempt $attempt: resumed attempt made no progress (state '$armed_state') — scrubbing and cold-restarting"
      rm -f "$PROGRESS_FILE" 2>/dev/null || true
      reset_target
      resume_active=0
    else
      log "attempt $attempt: valid progress file — resuming at the recorded step on branch '$progress_branch' (no reset)"
      ( cd "$CT" && git checkout "$progress_branch" ) >>"$LOG_FILE" 2>&1 || true
      resume_active=1
      resume_armed_state="$armed_state"
    fi
  else
    log "attempt $attempt: no valid progress file — scrubbing it and resetting to clean base before retrying"
    rm -f "$PROGRESS_FILE" 2>/dev/null || true
    reset_target
    resume_active=0
  fi
done

# --- Failure: never reached a finish ------------------------------------------
if [ "$done_reached" -ne 1 ]; then
  if [ "$timed_out" -eq 1 ]; then
    echo "loop.sh: FAILED (timeout) — last attempt timed out without DONE after $attempt attempt(s). Log: $LOG_FILE" >&2
    emit_record "$EX_TIMEOUT" || true
    exit "$EX_TIMEOUT"
  fi
  echo "loop.sh: FAILED (cap-exhausted) — crashed without DONE after $attempt attempt(s) and no open PR. Log: $LOG_FILE" >&2
  emit_record "$EX_CAP" || true
  exit "$EX_CAP"
fi

# --- Goal-drift guard (R1-R3, KTD3, D1) ---------------------------------------
# A finish was reached (DONE sentinel OR crash-reconciled open PR — both converge
# here). Before trusting it, re-hash the guarded goal files: if STRATEGY.md or the
# plan file changed during the run, the goal was mutated and success cannot be
# reported. Drift is TERMINAL, not retryable — a finish reached on a mutated goal
# is completed-but-untrustworthy, mirroring exit 7's semantics. Mirrors the
# isolation guard's shape: stderr explanation, emit_record || true, exit.
goal_drift_file=""
goal_drift_kind=""
strategy_hash_end="$(hash_file "$STRATEGY_PATH")"
if [ "$strategy_hash_start" != "$strategy_hash_end" ]; then
  goal_drift_file="$STRATEGY_PATH"
  goal_drift_kind="$(drift_kind_of "$strategy_hash_start" "$strategy_hash_end")"
elif [ -n "$GUARD_PLAN_PATH" ]; then
  # hash_plan, not hash_file: a status-marker update is progress state the run
  # produced, not a goal edit. Symmetric with the plan_hash_start snapshot (C3).
  plan_hash_end="$(hash_plan "$GUARD_PLAN_PATH")"
  if [ "$plan_hash_start" != "$plan_hash_end" ]; then
    goal_drift_file="$GUARD_PLAN_PATH"
    goal_drift_kind="$(drift_kind_of "$plan_hash_start" "$plan_hash_end")"
  fi
fi
if [ -n "$goal_drift_file" ]; then
  echo "loop.sh: FAILED (goal drift) — a goal file changed during the run; refusing to report success." >&2
  echo "         file: $goal_drift_file" >&2
  echo "         change: $goal_drift_kind" >&2
  echo "         Goal changes route through interactive sl-strategy or a human-approved plan revision, never an unattended run. Log: $LOG_FILE" >&2
  emit_record "$EX_GOAL_DRIFT" || true
  exit "$EX_GOAL_DRIFT"
fi

# --- Verification (TARGET-scoped, evaluated AFTER DONE) -----------------------
verify_green=0
if [ "$VERIFY_MODE" = "command" ]; then
  # Run in the target, not loop.sh's CWD — a proxy like `bun test` must verify
  # the target repo. VERIFY_CMD is guaranteed non-empty by the parse-time guard.
  if ( cd "$CT" && "${VERIFY_CMD[@]}" ) >>"$LOG_FILE" 2>&1; then verify_green=1; else verify_green=0; fi
else
  if target_open_pr && target_ci_green; then verify_green=1; else verify_green=0; fi
fi

# --- Report -------------------------------------------------------------------
# Populate the record's PR pointer for the post-launch verification paths: both
# success and DONE-but-red have an open PR in github mode; command mode has none.
if [ "$VERIFY_MODE" = "github" ]; then pr_url="$(target_pr_url)"; fi

if [ "$verify_green" -eq 1 ]; then
  route="DONE"
  if [ "$routed_via_pr" -eq 1 ]; then route="open-PR (crash-reconciled)"; fi
  if [ "$VERIFY_MODE" = "github" ]; then
    echo "loop.sh: SUCCESS — $route + target CI green. PR: $pr_url  Log: $LOG_FILE"
  else
    echo "loop.sh: SUCCESS — $route + --verify-cmd green. Log: $LOG_FILE"
  fi
  emit_record "$EX_OK" || true
  exit "$EX_OK"
fi

echo "loop.sh: FAILED (DONE-but-red) — finished but target verification is red. Log: $LOG_FILE" >&2
emit_record "$EX_DONE_RED" || true
exit "$EX_DONE_RED"
