# Claude Code runtime adapter

## Kernel

Invoke each operation as one pinned command. Do not wrap it in an inline existence guard:

```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/run-state.py" <operation> <arguments>
```

If `${CLAUDE_SKILL_DIR}` is unresolved, stop and report that the installed skill path is unavailable. Never retry with a project-relative path.

## Implementation and repair agents

Dispatch one general-purpose worker through `Agent` or `Task`. Inject only the named packet, applicable repository instructions, target root, and result contract.

When Claude returns a stable agent/session identifier and the current tool supports continuation, return it with `resumable: true` and use that continuation mechanism for `resume-agent`. Otherwise return `session: null` or `resumable: false`; on repair, dispatch a fresh worker with the kernel's packet. Never invent a resumable handle.

## Verifier

Dispatch a fresh general-purpose worker through `Agent` or `Task` with the verifier packet. Do not resume or reuse an implementation session.

## Questions

For required interactive reconciliation, use `AskUserQuestion` after `ToolSearch` when needed. Fall back to one concise chat question if unavailable.
