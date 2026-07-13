# Claude Code runtime adapter

## State engine

Invoke each operation as one pinned command. Do not wrap it in an inline existence guard:

```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/run-state.py" <operation> <arguments>
```

If `${CLAUDE_SKILL_DIR}` is unresolved, the command fails loudly. Stop and report that the installed skill path is unavailable; never retry with a project-relative path.

## Worker

Dispatch one general-purpose worker through `Agent` or `Task`. Inject the phase packet, applicable repository instructions, target root, and worker-result contract. Wait for it to finish before any other dispatch. Do not use a typed specialist fleet.

## Questions

For a required interactive recovery/authority decision, use `AskUserQuestion` after `ToolSearch` when needed. Fall back to one concise chat question if unavailable.
