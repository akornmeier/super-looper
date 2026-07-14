# Claude Code runtime adapter

1. Use `AskUserQuestion` for the payload question. If its schema is not loaded, call `ToolSearch` with `select:AskUserQuestion` first. If the tool is genuinely unavailable or errors, present the two numbered options in chat and wait for the reply.
2. Execute the bundled script with the selected choice:

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/smoke.sh" claude <alpha-or-beta>
```

3. Dispatch exactly one general-purpose worker through the `Agent` or `Task` tool. Pass only the host, choice, and `reference_marker`. Ask for exactly this JSON shape and no tool use:

```json
{"worker_marker":"worker:<host>:<choice>:<reference_marker>"}
```

4. Treat a missing question response, non-zero script, malformed marker, unavailable worker tool, or malformed worker result as a failed diagnostic.
