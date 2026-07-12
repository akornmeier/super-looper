#!/usr/bin/env bash
#
# goal-guard.sh -- PreToolUse defense-in-depth for the goal-drift guard.
#
# AUTHORITY (KTD1): the sha256 checksum guard in scripts/loop.sh is
# AUTHORITATIVE. It re-hashes STRATEGY.md and the active plan on every
# done_reached path and exits 8 (typed_failure: "goal-drift") on any change --
# catching EVERY mutation path, including Bash writes (sed -i, redirection) and
# subagent worktree merges that bypass tool interception. This hook is only
# DEFENSE-IN-DEPTH: a PreToolUse deny on Write|Edit cannot see those paths, so
# it can never be the sole guard. Its value is failing fast and teaching the
# agent the boundary mid-run, before a wasted goal edit propagates.
#
# ACTIVATION (KTD2): a no-op unless LOOP_GOAL_GUARD_PATHS is set, which only
# loop.sh does (via its `env -i` allowlist). Interactive sessions and
# sl-strategy -- whose whole job is writing STRATEGY.md -- are never affected,
# because the variable is unset there.
#
# CONTRACT: LOOP_GOAL_GUARD_PATHS carries exact, already-resolved goal-file
# paths, NEWLINE-separated. Newline (not colon) is the separator because a
# resolved filesystem path may legitimately contain a colon, whereas a newline
# never appears in this repo's goal-file paths and iterates cleanly with `read`.
# When a Write/Edit target canonicalizes to one of the listed paths -- including
# relative-path and symlinked variants -- the hook denies with exit 2 and a
# protocol message on stderr.
#
# MARKER CARVE-OUT: a status-marker update ([] -> [wip] -> [x]) is progress state
# the run produced, not a goal edit, so an Edit whose old_string and new_string
# normalize identically is allowed through. It is scoped to LOOP_GOAL_GUARD_MARKER_PATH
# (the plan) alone -- never STRATEGY.md, which loop.sh hashes raw. The normalization
# here MUST stay byte-identical to loop.sh's normalize_markers: if the two disagree,
# this hook allows a write the authoritative checksum then kills at done_reached, and
# the run throws away all its work. A Write (whole-file content) never qualifies.
# Full invariant audit: docs/solutions/workflow/goal-guard-marker-region-carveout.md
#
# INPUT: PreToolUse hooks receive the tool call as JSON on stdin. Fields used:
#   .tool_input.file_path  -- the Write/Edit target path
#   .tool_input.old_string -- Edit only; pre-edit text (marker carve-out)
#   .tool_input.new_string -- Edit only; post-edit text (marker carve-out)
#   .cwd                   -- the session working directory (relative-path base)
#
# FAIL-OPEN: because loop.sh is authoritative, any inability to evaluate (jq
# absent, unparseable payload, no file_path) exits 0 rather than blocking, so a
# hook bug can never wedge a legitimate edit.
set -euo pipefail

# Not an unattended loop.sh run -> guard is dormant. Allow everything.
if [ -z "${LOOP_GOAL_GUARD_PATHS:-}" ]; then
  exit 0
fi

# jq parses the stdin payload. If it is unavailable, fail open (loop.sh's
# checksum guard still catches the mutation authoritatively).
command -v jq >/dev/null 2>&1 || exit 0

payload="$(cat)"
target="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty' 2>/dev/null)" || target=""
# No file path on the tool call -> nothing to guard.
if [ -z "$target" ]; then
  exit 0
fi
cwd="$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)" || cwd=""

# Rewrite every status marker to `[]`, matching loop.sh's normalize_markers
# byte for byte. The two MUST agree: if the hook allows an edit the checksum
# then kills at done_reached, the run does all its work and throws it away.
normalize_markers() {
  printf '%s' "$1" | sed -E \
    -e 's@<code class="status">\[(wip|x|f)\]</code>@<code class="status">[]</code>@g' \
    -e 's@`\[(wip|x|f)\]`@`[]`@g'
}

# A status-marker update is progress state the run produced, not a goal edit, so
# it is allowed through even on a guarded plan. An Edit qualifies only when both
# sides normalize to the same string -- i.e. nothing but marker values changed.
# A Write (whole-file content) never qualifies: sl-work writes markers with Edit,
# and a wholesale plan rewrite mid-run is not a marker update whatever it claims.
# See docs/solutions/workflow/goal-guard-marker-region-carveout.md.
is_marker_only_edit() {
  _old="$(printf '%s' "$payload" | jq -r '.tool_input.old_string // empty' 2>/dev/null)" || return 1
  _new="$(printf '%s' "$payload" | jq -r '.tool_input.new_string // empty' 2>/dev/null)" || return 1
  # No old/new pair -> not an Edit (a Write, or an unparseable payload). Deny.
  [ -n "$_old" ] || return 1
  # An edit that changes nothing is not a marker update; fall through to deny
  # rather than quietly blessing a no-op shaped like one.
  [ "$_old" != "$_new" ] || return 1
  [ "$(normalize_markers "$_old")" = "$(normalize_markers "$_new")" ]
}

# Canonicalize a possibly-nonexistent file path: absolutize against a base dir,
# resolve symlinks in the directory chain via `cd ... && pwd -P`, then re-attach
# the basename and follow a symlinked final component if one exists. This makes
# relative-path and symlinked variants of a guarded path compare equal.
canon_path() {
  _p="$1"
  _base="$2"
  case "$_p" in
    /*) ;;
    *)  _p="$_base/$_p" ;;
  esac
  _n=0
  while [ "$_n" -lt 40 ]; do
    _d="$(cd "$(dirname "$_p")" 2>/dev/null && pwd -P)" || { printf '%s' "$_p"; return 0; }
    _b="$(basename "$_p")"
    _p="$_d/$_b"
    if [ -L "$_p" ]; then
      _link="$(readlink "$_p" 2>/dev/null)" || break
      case "$_link" in
        /*) _p="$_link" ;;
        *)  _p="$_d/$_link" ;;
      esac
      _n=$((_n + 1))
    else
      break
    fi
  done
  printf '%s' "$_p"
}

base="${cwd:-$PWD}"
canon_target="$(canon_path "$target" "$base")"

deny() {
  {
    echo "super-looper goal-guard: BLOCKED writing a protected goal file."
    echo "  target: $1"
    echo
    echo "  This unattended run may not edit STRATEGY.md or its active plan document."
    echo "  Goal changes route through interactive sl-strategy (for STRATEGY.md) or a"
    echo "  human-approved plan revision before a new run -- never mid-run by autopilot."
    echo "  loop.sh's checksum guard (exit 8, goal-drift) enforces this authoritatively;"
    echo "  this deny only stops you early. Leave the goal file unchanged and continue"
    echo "  the task as planned."
  } >&2
  exit 2
}

# Compare the canonicalized target against each guarded path (each also
# canonicalized, so a symlinked or relative variant on either side lines up).
# The heredoc runs the loop in the current shell so `exit 2` in deny() exits the
# hook (a pipe would run it in a subshell and only exit that subshell).
# The marker carve-out is scoped to the plan alone. STRATEGY.md is hashed raw by
# loop.sh, so allowing a marker-shaped edit there would let the hook bless a write
# the authoritative checksum then kills at done_reached.
canon_marker_path=""
if [ -n "${LOOP_GOAL_GUARD_MARKER_PATH:-}" ]; then
  canon_marker_path="$(canon_path "$LOOP_GOAL_GUARD_MARKER_PATH" "$base")"
fi

while IFS= read -r guard || [ -n "$guard" ]; do
  [ -z "$guard" ] && continue
  canon_guard="$(canon_path "$guard" "$base")"
  if [ "$canon_target" = "$canon_guard" ]; then
    if [ -n "$canon_marker_path" ] && [ "$canon_target" = "$canon_marker_path" ] && is_marker_only_edit; then
      exit 0
    fi
    deny "$target"
  fi
done <<EOF
$LOOP_GOAL_GUARD_PATHS
EOF

exit 0
