#!/usr/bin/env bash
# Discover Claude Code session files.
#
# Usage: discover-sessions.sh <repo-name> <days> [--platform claude]
#
# Outputs one file path per line. Safe in both bash and zsh (all globs guarded).
# Pass output to extract-metadata.py:
#   python3 extract-metadata.py --cwd-filter <repo-name> $(bash discover-sessions.sh <repo-name> 7)
#
# Arguments:
#   repo-name  Folder name of the repo (e.g., "my-repo"). Used for directory matching.
#   days       Scan window in days (e.g., 7). Files older than this are skipped.
#   --platform Restrict to a single platform. Only "claude" is supported.

set -euo pipefail

REPO_NAME="${1:?Usage: discover-sessions.sh <repo-name> <days> [--platform claude]}"
DAYS="${2:?Usage: discover-sessions.sh <repo-name> <days> [--platform claude]}"
PLATFORM="${4:-all}"

# Parse optional --platform flag
shift 2
while [ $# -gt 0 ]; do
    case "$1" in
        --platform) PLATFORM="$2"; shift 2 ;;
        *) shift ;;
    esac
done

# --- Claude Code ---
discover_claude() {
    local base="$HOME/.claude/projects"
    [ -d "$base" ] || return 0

    # Find all project dirs matching repo name
    for dir in "$base"/*"$REPO_NAME"*/; do
        [ -d "$dir" ] || continue
        find "$dir" -maxdepth 1 -name "*.jsonl" -mtime "-${DAYS}" 2>/dev/null
    done
}

# --- Dispatch ---
case "$PLATFORM" in
    claude)  discover_claude ;;
    all)     discover_claude ;;
    *)
        echo "Unknown platform: $PLATFORM" >&2
        exit 1
        ;;
esac
