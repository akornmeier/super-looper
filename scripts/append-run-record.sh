#!/usr/bin/env bash
#
# append-run-record.sh — operator-side promotion of the newest loop.sh
# run-record into the committed JSONL ledger.
#
# loop.sh emits one structured run-record per terminal run into LOG_DIR as
# loop-<RUN_ID>.json. RUN_ID embeds loop.sh's PID and a runtime timestamp and is
# not exported, so this wrapper cannot reconstruct the filename a priori — it
# selects the NEWEST loop-*.json by mtime and appends it as one JSONL line to
# docs/run-records/ledger.jsonl.
#
# Runs in the operator's normal shell AFTER the real run — never under loop.sh's
# `env -i` launch — so the self-edit isolation guard (which scopes only the
# claude child) never fires. loop.sh stays the sole writer of records; this step
# only copies the newest one verbatim and adds no fields (preserves the record's
# index-not-copy / no-PII property).
#
# Safe to run unconditionally: an empty or missing LOG_DIR is a no-op (exit 0).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"

# Defaults mirror loop.sh: LOG_DIR is loop.sh's default run-log dir; the ledger
# is this repo's committed home. Pass --log-dir to match a custom loop.sh run.
LOG_DIR="/tmp/super-looper/loop"
LEDGER="$REPO_ROOT/docs/run-records/ledger.jsonl"

usage() {
  cat >&2 <<'EOF'
Usage: append-run-record.sh [--log-dir <dir>] [--ledger <path>]

  --log-dir <dir>   Run-log dir to read the newest record from
                    (default: /tmp/super-looper/loop; pass the same value you
                    gave loop.sh --log-dir).
  --ledger <path>   JSONL ledger to append to
                    (default: <repo>/docs/run-records/ledger.jsonl).
  -h, --help        Show this help.

Appends the newest loop-*.json in LOG_DIR as one compact JSONL line. A no-op
(exit 0) when LOG_DIR is missing or holds no records.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --log-dir) [ $# -ge 2 ] || { echo "append-run-record.sh: --log-dir requires a value" >&2; exit 2; }; LOG_DIR="$2"; shift 2 ;;
    --ledger)  [ $# -ge 2 ] || { echo "append-run-record.sh: --ledger requires a value" >&2; exit 2; }; LEDGER="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "append-run-record.sh: unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

# Newest record by mtime. ls -t sorts newest-first; run-record names are
# loop-<ts>-<pid>.json (no spaces), so line-parsing ls is safe here. A missing
# dir or no match yields empty (ls error swallowed) — the unconditional-no-op
# guard the wrapper relies on.
newest="$(ls -1t "$LOG_DIR"/loop-*.json 2>/dev/null | head -n1 || true)"
if [ -z "$newest" ]; then
  echo "[append-run-record] no run-records in $LOG_DIR; nothing to append" >&2
  exit 0
fi

mkdir -p "$(dirname "$LEDGER")"

# Compact to a single line by stripping literal newlines. Safe because loop.sh's
# json_escape escapes embedded \n/\r inside string values, so the only newlines
# in the file are structural formatting — never content. Insignificant inter-token
# whitespace that remains is valid JSON. No fields are added (R4).
# ponytail: tr-strip relies on loop.sh escaping embedded newlines; if records
# ever inline a literal newline in a value, switch to `jq -c .`.
{ tr -d '\r\n' < "$newest"; printf '\n'; } >>"$LEDGER"

echo "[append-run-record] appended $(basename "$newest") -> $LEDGER" >&2
