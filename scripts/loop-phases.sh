#!/usr/bin/env bash
#
# loop-phases.sh — ship a plan as one run and one PR per phase.
#
# Invokes scripts/loop.sh once per phase, stacking each phase's branch on the
# previous one, and syncing the plan's progress state (commit SHAs + an
# Amendments entry) between runs.
#
# WHY A STACK, NOT A SERIAL MERGE. `main` requires the `pr-reviewed` check -- a
# non-author review on the exact head -- and the bypass actor was removed. An
# unattended run therefore CANNOT merge its own pull request. A serial driver
# (ship phase 1, merge it, start phase 2 from merged main) would open phase 1's
# PR, watch it go green, and then block forever waiting for a human. So phase N+1
# branches from phase N's BRANCH: the phases stack as a chain of PRs and a human
# merges the chain in order afterward. This is forced by the merge policy, not a
# preference -- "simplifying" it back to serial will hang.
#
# WHY THIS SITS ABOVE loop.sh. The between-phase sync appends an Amendments entry
# and commit SHAs to the plan, and those are NOT marker-normalized by the goal
# guard: written mid-run they read as goal drift and exit 8. Orchestrating from
# above makes the "guard-free gap" literally the space between loop.sh
# invocations -- no carve-out inside the guarded region, and loop.sh's exit codes,
# guard, retry, and reset semantics are untouched.
#
# See docs/solutions/workflow/per-phase-pr-execution.md for the full rationale and
# docs/solutions/workflow/goal-guard-marker-region-carveout.md for how the
# within-phase marker writes are permitted.
#
# Usage:
#   loop-phases.sh --target <dir> --plan-file <path> [--group U1,U2] [--group U3] [...]
#
#   --group is repeatable; each group is one phase, one run, one PR, in the order
#   given. With no --group, every unit in the plan is its own phase, in U-ID order.
#   All other flags are forwarded to loop.sh verbatim.
#
# Exit: 0 when every phase shipped. Otherwise the failing phase's loop.sh exit
# code -- a failing phase STOPS the chain (later phases would branch from a phase
# that does not exist). Phases that already landed keep their PRs; a partial run
# is reviewable work, not garbage.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
LOOP="${LOOP_DRIVER_BIN:-$SCRIPT_DIR/loop.sh}"
GIT_BIN="${LOOP_GIT_BIN:-git}"

readonly EX_USAGE=2

TARGET=""
PLAN_FILE=""
# NOT `GROUPS` -- that is a bash special builtin array holding the current user's
# numeric group IDs, and `GROUPS=()` does not clear it. Naming this array GROUPS
# makes the script silently iterate over the operator's unix groups instead of the
# plan's phases (observed: 16 "phases" named 20, 12, 61, ...). Do not rename back.
PHASE_GROUPS=()
PASSTHRU=()

die() { echo "loop-phases.sh: $*" >&2; exit "$EX_USAGE"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --target)
      [ $# -ge 2 ] || die "--target requires a value"
      TARGET="$2"; PASSTHRU+=( "$1" "$2" ); shift 2 ;;
    --plan-file)
      [ $# -ge 2 ] || die "--plan-file requires a value"
      PLAN_FILE="$2"; PASSTHRU+=( "$1" "$2" ); shift 2 ;;
    --group)
      [ $# -ge 2 ] || die "--group requires a value"
      PHASE_GROUPS+=( "$2" ); shift 2 ;;
    --phase)
      die "--phase is loop.sh's per-run flag; loop-phases.sh derives it from --group."
      ;;
    --verify-cmd)
      # Consumes the rest of the args by contract -- must stay last.
      PASSTHRU+=( "$@" ); break ;;
    *)
      PASSTHRU+=( "$1" ); shift ;;
  esac
done

[ -n "$TARGET" ]    || die "--target is required"
[ -n "$PLAN_FILE" ] || die "--plan-file is required (a phase names units in a plan)"

[ -d "$TARGET" ] || die "--target is not a directory: $TARGET"
target_abs="$( cd "$TARGET" && pwd -P )"

case "$PLAN_FILE" in
  /*) plan_path="$PLAN_FILE" ;;
  *)  plan_path="$TARGET/$PLAN_FILE" ;;
esac
[ -f "$plan_path" ] || die "plan file not found in the target: $PLAN_FILE"

# Normalize the plan to a TARGET-RELATIVE pathspec. The sync below runs
# `git diff/add -- "$PLAN_REL"` with cwd=$TARGET. Git accepts an absolute pathspec
# that resolves INSIDE the worktree (it resolves symlinks such as macOS
# `/tmp` -> `/private/tmp` itself), but it is fatal on one that does not:
# "fatal: ... is outside repository". A fatal there does not fail the phase, it
# corrupts the sync: `git diff --quiet` exits 0 for no-changes and nonzero for
# changes, so `! git diff --quiet` reads the fatal's 128 as "there are changes",
# enters the branch, and `git add` fails on the same bad pathspec -- degrading to
# the "plan sync commit failed -- continuing" path. The phase ships and its
# progress is never recorded. Resolve once, up front, and reject an out-of-target
# plan before any phase runs rather than discovering it mid-chain.
# Resolve the plan itself, not just its directory: `pwd -P` on the parent resolves
# symlinked DIRECTORIES, but a symlinked FILE would keep its in-target name and sail
# through the containment check below -- the script would then read external content
# and write the rewritten plan back through the link. Plain `readlink` (no -f) is the
# portable spelling across BSD and GNU.
resolve_file() {
  local p="$1" link hops=0
  while [ -L "$p" ] && [ "$hops" -lt 40 ]; do
    link="$( readlink "$p" )"
    case "$link" in
      /*) p="$link" ;;
      *)  p="$( cd "$( dirname "$p" )" && pwd -P )/$link" ;;
    esac
    hops=$(( hops + 1 ))
  done
  printf '%s' "$( cd "$( dirname "$p" )" && pwd -P )/$( basename "$p" )"
}

plan_abs="$( resolve_file "$plan_path" )"
case "$plan_abs" in
  "$target_abs"/*) PLAN_REL="${plan_abs#"$target_abs"/}" ;;
  *) die "--plan-file must live inside --target: $PLAN_FILE" ;;
esac
plan_path="$plan_abs"

# Derive the phase list. An explicit --group wins; otherwise every U-ID in the
# plan becomes its own phase, in ascending U-ID order -- the contract the docs and
# the plan's own dependency order state, and NOT the order the U-IDs happen to be
# first mentioned in the file (a plan that references U10 before it declares U2
# would otherwise ship the phases out of dependency order). Matches a U-ID at a
# heading/list position in markdown or as an `id="u3"` anchor in HTML.
if [ "${#PHASE_GROUPS[@]}" -eq 0 ]; then
  units="$(grep -oE '(^|[^A-Za-z])U[0-9]+\.|id="u[0-9]+"' "$plan_path" 2>/dev/null \
    | grep -oE 'U[0-9]+|u[0-9]+' \
    | tr '[:lower:]' '[:upper:]' \
    | awk '!seen[$0]++ { n = $0; sub(/^U/, "", n); printf "%d\t%s\n", n, $0 }' \
    | sort -n -k1,1 \
    | cut -f2 || true)"
  [ -n "$units" ] || die "no implementation units (U-IDs) found in $PLAN_FILE; pass --group explicitly"
  while IFS= read -r u; do [ -n "$u" ] && PHASE_GROUPS+=( "$u" ); done <<EOF
$units
EOF
fi

SYNC="${LOOP_SYNC_BIN:-$SCRIPT_DIR/sync-plan-progress.py}"
PYTHON="${LOOP_PYTHON_BIN:-python3}"

# Record a shipped phase in the plan: its commit SHAs onto the append-only
# `commits` metadata, plus one Amendments entry. Runs ONLY here, between runs --
# the goal guard normalizes status markers but not these, so a mid-run write would
# read as goal drift and exit 8.
#
# The sync commit is pushed onto the phase's own branch, so each phase's PR
# carries its own progress record. That re-triggers CI on a docs-only commit,
# which is the accepted cost of the PR being self-describing. A push failure is
# logged, never fatal: the phase's code already shipped and the sync commit
# survives locally for the operator.
sync_plan() {
  _group="$1"
  _branch="$2"
  _shas="$( cd "$TARGET" && "$GIT_BIN" log --format=%H "${base_sha}..HEAD" 2>/dev/null || true )"

  _args=()
  while IFS= read -r _sha; do
    [ -n "$_sha" ] && _args+=( --commit "$_sha" )
  done <<EOF
$_shas
EOF

  "$PYTHON" "$SYNC" "$plan_path" \
    --phase "$_group" \
    --branch "$_branch" \
    --date "$( date -u +%Y-%m-%d )" \
    "${_args[@]+"${_args[@]}"}" >/dev/null || {
      echo "[phases] plan sync failed for $_group — continuing; the phase itself shipped." >&2
      return 0
    }

  if ( cd "$TARGET" && ! "$GIT_BIN" diff --quiet -- "$PLAN_REL" ); then
    ( cd "$TARGET" \
        && "$GIT_BIN" add -- "$PLAN_REL" \
        && "$GIT_BIN" commit -q -m "docs(plan): record phase $_group shipped on $_branch" ) \
      || { echo "[phases] plan sync commit failed for $_group — continuing." >&2; return 0; }
    ( cd "$TARGET" && "$GIT_BIN" push -q origin "$_branch" ) \
      || echo "[phases] plan sync push failed for $_group — the commit is local; the phase shipped." >&2
  fi
}

echo "[phases] ${#PHASE_GROUPS[@]} phase(s): ${PHASE_GROUPS[*]}" >&2

# The branch each phase stacks on. Empty for the first phase, which starts from
# the target's current HEAD.
prev_branch=""
phase_index=0
landed=()

for group in "${PHASE_GROUPS[@]}"; do
  phase_index=$((phase_index + 1))

  # Stack: check out the previous phase's branch so loop.sh's BASE_REF -- and the
  # branch lfg cuts -- are the previous phase's tip, not the run's original base.
  # A retry inside this phase therefore resets to THIS phase's start and never
  # discards an earlier phase's committed work.
  if [ -n "$prev_branch" ]; then
    ( cd "$TARGET" && "$GIT_BIN" checkout -q "$prev_branch" ) \
      || die "could not check out the previous phase's branch: $prev_branch"
  fi
  # The phase's base as a COMMIT SHA -- the same thing loop.sh records as BASE_REF
  # (`git rev-parse HEAD`). A branch name (`rev-parse --abbrev-ref HEAD`) collapses
  # to the literal "HEAD" under a detached HEAD, and `HEAD..HEAD` is empty: the
  # phase's commits would never be recorded in the plan. A SHA is exact in both
  # states and is not invalidated by a branch moving mid-phase.
  base_sha="$( cd "$TARGET" && "$GIT_BIN" rev-parse HEAD )"

  echo "[phases] phase $phase_index/${#PHASE_GROUPS[@]}: $group (base: ${prev_branch:-$base_sha})" >&2

  set +e
  "$LOOP" "${PASSTHRU[@]}" --phase "$group"
  rc=$?
  set -e

  if [ "$rc" -ne 0 ]; then
    # Stop the chain. Later phases would branch from a phase that does not exist,
    # and a plan's phases are ordered because the later ones depend on the earlier.
    echo "[phases] phase $phase_index ($group) failed with exit $rc — stopping the chain." >&2
    if [ "${#landed[@]}" -gt 0 ]; then
      echo "[phases] phases that landed keep their PRs: ${landed[*]}" >&2
    fi
    exit "$rc"
  fi

  # The branch lfg cut for this phase becomes the next phase's base.
  phase_branch="$( cd "$TARGET" && "$GIT_BIN" rev-parse --abbrev-ref HEAD )"
  landed+=( "$group" )

  # --- Between-phase sync (the guard-free gap) --------------------------------
  # No guarded run is in flight here, so the plan may be written. This is the ONLY
  # place the Amendments entry and the commit SHAs can be recorded: the goal guard
  # normalizes status markers but NOT these, so a mid-run write would exit 8.
  sync_plan "$group" "$phase_branch"

  prev_branch="$phase_branch"
done

echo "[phases] all ${#PHASE_GROUPS[@]} phase(s) shipped. Stacked PRs merge in order: ${landed[*]}" >&2
