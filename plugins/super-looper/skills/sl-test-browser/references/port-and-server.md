# Port Detection and Dev Server Startup

Loaded at workflow step 5. Governs how the dev server port is resolved and whether a server is auto-started. The pipeline-vs-manual split is load-bearing: in pipeline mode multiple agents may share a machine, so the port must be verified free and a server auto-started; in manual mode the user owns their server and the preferred port is used as-is.

Set `PIPELINE_MODE=1` in your shell when the argument `mode:pipeline` is present.

## Detect and Claim a Free Port

**Pipeline mode only (`mode:pipeline`):** When invoked from LFG or another automated pipeline, always find a port that is actually free — never assume 3000 is available, as multiple agents may be running in parallel on the same machine.

**Manual mode (no `mode:pipeline`):** Use the preferred port as-is. Do not scan for alternatives — the user controls their own server.

Determine the preferred port using this priority:

1. **Explicit argument** — if the user passed `--port 5000`, use that directly (skip free-port scan)
2. **Project instructions** — check `AGENTS.md`, `CLAUDE.md`, or other instruction files for port references
3. **package.json** — check dev/start scripts for `--port` flags
4. **Environment files** — check `.env`, `.env.local`, `.env.development` for `PORT=`
5. **Default** — fall back to `3000`

**In pipeline mode**, verify the preferred port is free and scan upward if not. **In manual mode**, use the preferred port directly.

```bash
# Step 1: Determine preferred port
PORT="${EXPLICIT_PORT:-}"
if [ -z "$PORT" ]; then
  PORT=$(grep -Eio '(port\s*[:=]\s*|localhost:)([0-9]{4,5})' AGENTS.md 2>/dev/null | grep -Eo '[0-9]{4,5}' | head -1)
fi
if [ -z "$PORT" ]; then
  PORT=$(grep -Eio '(port\s*[:=]\s*|localhost:)([0-9]{4,5})' CLAUDE.md 2>/dev/null | grep -Eo '[0-9]{4,5}' | head -1)
fi
if [ -z "$PORT" ]; then
  PORT=$(grep -Eo '\-\-port[= ]+[0-9]{4,5}' package.json 2>/dev/null | grep -Eo '[0-9]{4,5}' | head -1)
fi
if [ -z "$PORT" ]; then
  PORT=$(grep -h '^PORT=' .env .env.local .env.development 2>/dev/null | tail -1 | cut -d= -f2)
fi
PORT="${PORT:-3000}"

# Step 2 (pipeline mode only): scan for a free port
if [ "${PIPELINE_MODE}" = "1" ]; then
  find_free_port() {
    local p=$1
    while lsof -i ":$p" -sTCP:LISTEN -t >/dev/null 2>&1; do
      p=$((p + 1))
    done
    echo $p
  }
  PORT=$(find_free_port "$PORT")
fi
echo "Using dev server port: $PORT"
```

## Start Dev Server if Not Running, Then Verify

**Pipeline mode only:** If no server is already listening on `$PORT`, start one automatically in the background. In manual mode, inform the user and stop.

```bash
if lsof -i ":${PORT}" -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "Server already running on port ${PORT}"
else
  if [ "${PIPELINE_MODE}" = "1" ]; then
    # Auto-start in pipeline — pick the right command for this project
    echo "Starting dev server on port ${PORT}..."
    if [ -f "bin/dev" ]; then
      PORT=${PORT} bin/dev > /tmp/dev-server-${PORT}.log 2>&1 &
    elif [ -f "bin/rails" ]; then
      bin/rails server -p ${PORT} > /tmp/dev-server-${PORT}.log 2>&1 &
    elif [ -f "package.json" ]; then
      PORT=${PORT} npm run dev > /tmp/dev-server-${PORT}.log 2>&1 &
    fi
    # Wait up to 30 seconds for server to become ready
    for i in $(seq 1 30); do
      lsof -i ":${PORT}" -sTCP:LISTEN -t >/dev/null 2>&1 && break
      sleep 1
    done
    if ! lsof -i ":${PORT}" -sTCP:LISTEN -t >/dev/null 2>&1; then
      echo "Server did not start in 30s. Last output:"
      tail -20 /tmp/dev-server-${PORT}.log 2>/dev/null
      exit 1
    fi
  else
    # Manual mode — ask the user to start the server
    echo "Server not running on port ${PORT}"
    echo ""
    echo "Please start your development server:"
    echo "  Rails: bin/dev  or  rails server -p ${PORT}"
    echo "  Node/Next.js: npm run dev"
    echo "  Custom port: run this skill again with --port <your-port>"
    exit 0
  fi
fi

agent-browser open http://localhost:${PORT}
agent-browser snapshot -i
```
