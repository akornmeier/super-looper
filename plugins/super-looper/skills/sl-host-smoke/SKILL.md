---
name: sl-host-smoke
description: "Run an explicit, non-mutating compatibility diagnostic for the super-looper plugin. Use only when validating a Claude Code or Codex installation, runtime adapter, bundled reference and script resolution, interactive question support, and one-worker subagent dispatch."
---

# Host Compatibility Smoke Test

Run the same bounded diagnostic on Claude Code and Codex. Do not edit the user's repository or plugin installation.

1. Read `references/smoke-payload.md` and retain its `reference_marker`.
2. Identify the current host from runtime metadata and the available tool surface. Select exactly one adapter:
   - Claude Code: read `references/runtime-claude.md`.
   - Codex: read `references/runtime-codex.md`.
   - Unknown or ambiguous: return a failed result instead of guessing.
3. Follow the selected adapter to ask the payload's question, execute the bundled script, and dispatch exactly one worker.
4. Verify that the reference, script, question response, and worker result agree on the host and selected choice.
5. Return one JSON object with this shape:

```json
{
  "skill": "sl-host-smoke",
  "host": "claude|codex|unknown",
  "status": "passed|failed",
  "choice": "alpha|beta|null",
  "reference_marker": "shared-reference-v1|null",
  "script_marker": "script:<host>:<choice>|null",
  "worker_marker": "worker:<host>:<choice>:shared-reference-v1|null",
  "error": "null|concise failure reason"
}
```

Report `passed` only when all four diagnostic surfaces completed. Never fabricate an unavailable tool result or silently substitute coordinator work for the worker.
