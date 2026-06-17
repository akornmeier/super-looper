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
# coreutils timeout(1) exits 124 when it terminates a timed-out command.
readonly TIMEOUT_EXIT_STATUS=124

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"

# Injectable binaries (default to PATH lookups). The claude invocation runs under
# an `env -i` allowlist, so these are passed as argv paths, not environment.
CLAUDE_BIN="${LOOP_CLAUDE_BIN:-claude}"
GH_BIN="${LOOP_GH_BIN:-gh}"
TIMEOUT_BIN="${LOOP_TIMEOUT_BIN:-}"

# --- Headless invocation form -------------------------------------------------
# SINGLE SOURCE of the prompt that routes the headless session into lfg. The
# exact trigger form (this inline instruction vs. a `/lfg` slash command) is the
# execution-time unknown the U2 smoke pins; keep it here and mirrored in
# scripts/loop.example.env so the acceptance and the driver never diverge.
readonly LOOP_PROMPT_PREFIX='Run the lfg workflow to completion on the task below, fully unattended. lfg plans, implements, simplifies, reviews, applies fixes, commits, pushes, opens a pull request, watches CI, and autofixes to green, then outputs <promise>DONE</promise> as its final output. Do not stop to ask for confirmation. Task:'

# --- Defaults -----------------------------------------------------------------
TARGET=""
SEED=""
SEED_FILE=""
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
Usage: loop.sh --target <dir> (--seed <text> | --seed-file <path>) [options]

Required:
  --target <dir>            Target directory the loop runs in and edits.
  --seed <text>             Seed task (inline), OR
  --seed-file <path>        Seed task read from a file.

Options:
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
while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 ;;
    --seed) SEED="${2:-}"; shift 2 ;;
    --seed-file) SEED_FILE="${2:-}"; shift 2 ;;
    --plugin-dir) PLUGIN_DIR="${2:-}"; shift 2 ;;
    --model) MODEL="${2:-}"; shift 2 ;;
    --timeout) TIMEOUT_SECONDS="${2:-}"; shift 2 ;;
    --kill-after) KILL_GRACE="${2:-}"; shift 2 ;;
    --max-retries) MAX_RETRIES="${2:-}"; shift 2 ;;
    --log-dir) LOG_DIR="${2:-}"; shift 2 ;;
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
if [ -z "$SEED" ] && [ -z "$SEED_FILE" ]; then missing="$missing --seed|--seed-file"; fi
if [ -n "$missing" ]; then
  echo "loop.sh: missing required input:$missing" >&2
  usage
  exit "$EX_USAGE"
fi

# --- Resolve seed text --------------------------------------------------------
if [ -n "$SEED_FILE" ]; then
  if [ ! -f "$SEED_FILE" ]; then fail "$EX_USAGE" "seed file not found: $SEED_FILE"; fi
  SEED_TEXT="$(cat "$SEED_FILE")"
else
  SEED_TEXT="$SEED"
fi
PROMPT="$LOOP_PROMPT_PREFIX
$SEED_TEXT"

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
  exit "$EX_ISOLATION"
fi

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
  if [ -n "$TIMEOUT_BIN" ]; then echo "$TIMEOUT_BIN"; return 0; fi
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

claude_cmd=( "$CLAUDE_BIN" -p "$PROMPT" --plugin-dir "$CP" --model "$MODEL" --dangerously-skip-permissions )

LOG_FILE="$LOG_DIR/loop-$(date +%Y%m%d-%H%M%S)-$$.log"

# --- Dry run ------------------------------------------------------------------
if [ "$DRY_RUN" -eq 1 ]; then
  # Redacted env for display (never print token values).
  print_env=( env -i "HOME=$HOME" "PATH=$PATH" )
  if [ -n "${GH_TOKEN:-}" ]; then print_env+=( "GH_TOKEN=REDACTED" ); fi
  if [ -n "${GITHUB_TOKEN:-}" ]; then print_env+=( "GITHUB_TOKEN=REDACTED" ); fi

  echo "[dry-run] target: $CT"
  echo "[dry-run] plugin-dir: $CP"
  echo "[dry-run] model: $MODEL"
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
  fail "$EX_NO_VERIFY" "no verification mode available: target has no git remote and no --verify-cmd was supplied."
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
  ( cd "$CT" && "$GH_BIN" pr checks ) >>"$LOG_FILE" 2>&1
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
: >"$LOG_FILE"
log "run started: target=$CT model=$MODEL verify-mode=$VERIFY_MODE max-retries=$MAX_RETRIES"

full_cmd=()
if [ "${#run_wrapper[@]}" -gt 0 ]; then full_cmd+=( "${run_wrapper[@]}" ); fi
full_cmd+=( "${claude_env[@]}" "${claude_cmd[@]}" )

attempt=0
done_reached=0
routed_via_pr=0
timed_out=0
attempt_log="$(mktemp "${TMPDIR:-/tmp}/loop-attempt.XXXXXX")"
trap 'rm -f "$attempt_log"' EXIT

while :; do
  attempt=$((attempt + 1))
  log "attempt $attempt: launching headless claude"

  run_status=0
  ( cd "$CT" && "${full_cmd[@]}" ) >"$attempt_log" 2>&1 || run_status=$?
  tee -a "$LOG_FILE" <"$attempt_log" >/dev/null

  if detect_done "$attempt_log"; then
    log "attempt $attempt reached DONE"
    done_reached=1
    break
  fi

  if [ "$run_status" -eq "$TIMEOUT_EXIT_STATUS" ]; then
    timed_out=1
    log "attempt $attempt timed out (no DONE)"
  else
    log "attempt $attempt crashed without DONE (status $run_status)"
  fi

  # Reconcile before retrying: an already-open PR for the target branch is
  # terminal — route to verification rather than re-run lfg on a half-finished
  # branch (lfg has no resume entry point).
  if target_open_pr; then
    log "attempt $attempt: an open PR already exists for the target — routing to verification (no re-launch)"
    routed_via_pr=1
    done_reached=1
    break
  fi

  if [ "$attempt" -gt "$MAX_RETRIES" ]; then
    break
  fi

  log "attempt $attempt: resetting target to clean base and retrying"
  reset_target
done

# --- Failure: never reached a finish ------------------------------------------
if [ "$done_reached" -ne 1 ]; then
  if [ "$timed_out" -eq 1 ]; then
    echo "loop.sh: FAILED (timeout) — last attempt timed out without DONE after $attempt attempt(s). Log: $LOG_FILE" >&2
    exit "$EX_TIMEOUT"
  fi
  echo "loop.sh: FAILED (cap-exhausted) — crashed without DONE after $attempt attempt(s) and no open PR. Log: $LOG_FILE" >&2
  exit "$EX_CAP"
fi

# --- Verification (TARGET-scoped, evaluated AFTER DONE) -----------------------
verify_green=0
if [ "$VERIFY_MODE" = "command" ]; then
  if [ "${#VERIFY_CMD[@]}" -gt 0 ]; then
    if "${VERIFY_CMD[@]}" >>"$LOG_FILE" 2>&1; then verify_green=1; else verify_green=0; fi
  else
    verify_green=0
  fi
else
  if target_open_pr && target_ci_green; then verify_green=1; else verify_green=0; fi
fi

# --- Report -------------------------------------------------------------------
if [ "$verify_green" -eq 1 ]; then
  route="DONE"
  if [ "$routed_via_pr" -eq 1 ]; then route="open-PR (crash-reconciled)"; fi
  if [ "$VERIFY_MODE" = "github" ]; then
    url="$(target_pr_url)"
    echo "loop.sh: SUCCESS — $route + target CI green. PR: $url  Log: $LOG_FILE"
  else
    echo "loop.sh: SUCCESS — $route + --verify-cmd green. Log: $LOG_FILE"
  fi
  exit "$EX_OK"
fi

echo "loop.sh: FAILED (DONE-but-red) — finished but target verification is red. Log: $LOG_FILE" >&2
exit "$EX_DONE_RED"
