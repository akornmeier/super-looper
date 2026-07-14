# Codex runtime adapter

Use these mechanics only when the shared workflow crosses a host boundary.

## Question

Use the available structured user-input tool. If the current mode has no blocking structured-input tool, ask one concise question in chat and wait.

## Scout or critic

Dispatch one worker with the Codex subagent collaboration tool. Inject the bounded role and compact input described by the shared workflow, wait for completion, and do not give the worker authority to edit the plan.

## Bundled renderer scripts

Resolve the skill directory from the absolute `SKILL.md` source path provided when the skill loaded. Run the scripts through Bash, passing the interpreter an absolute path built from that directory — as shown below. Do not hand a `.py` file to a direct file-execution tool, rely on its executable bit, or assume the project CWD contains it:

```bash
python3 "<absolute-skill-directory>/scripts/generate-plan-images.py" <plan-path> [--max-images <n>]
python3 "<absolute-skill-directory>/scripts/wire-plan-references.py" <plan-path>
```

The image command is permitted only after an explicit `images:on` request. Reciprocal reference wiring is permitted only after an explicit request and never during an unattended run.
