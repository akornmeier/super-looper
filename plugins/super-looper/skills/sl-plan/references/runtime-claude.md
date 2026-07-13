# Claude Code runtime adapter

Use these mechanics only when the shared workflow crosses a host boundary.

## Question

Use `AskUserQuestion`; call `ToolSearch` with `select:AskUserQuestion` first when its schema is not loaded. If unavailable or errored, ask one concise question in chat and wait.

## Scout or critic

Dispatch one general-purpose worker through `Agent` or `Task`. Inject the bounded role and compact input described by the shared workflow. Do not use a typed planning fleet or give the worker authority to edit the plan.

## Bundled renderer scripts

Execute a selected co-located script as one pinned command. Do not wrap it in an inline existence guard:

```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/generate-plan-images.py" <plan-path> [--max-images <n>]
python3 "${CLAUDE_SKILL_DIR}/scripts/wire-plan-references.py" <plan-path>
```

The image command is permitted only after an explicit `images:on` request. Reciprocal reference wiring is permitted only after an explicit request and never during an unattended run.

If `${CLAUDE_SKILL_DIR}` is unresolved, the pinned command fails loudly. Report the renderer action as skipped and preserve the already-complete plan; never retry with a project-relative path.
