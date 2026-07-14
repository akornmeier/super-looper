#!/usr/bin/env bash
set -euo pipefail

host="${1:-}"
choice="${2:-}"

if [[ "$host" != "claude" && "$host" != "codex" ]]; then
  echo "host must be claude or codex" >&2
  exit 2
fi

if [[ "$choice" != "alpha" && "$choice" != "beta" ]]; then
  echo "choice must be alpha or beta" >&2
  exit 2
fi

printf '{"script_marker":"script:%s:%s"}\n' "$host" "$choice"
