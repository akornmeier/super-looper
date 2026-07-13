# Codex runtime adapter

## State engine

Resolve the skill directory from the absolute loaded `SKILL.md` source path. Invoke Python through Bash with the absolute script path; never assume the target repository contains it:

```bash
python3 "<absolute-skill-directory>/scripts/run-state.py" <operation> <arguments>
```

## Worker

Dispatch one worker with the Codex subagent collaboration tool. Inject the phase packet, applicable repository instructions, target root, and worker-result contract. Wait for it to finish before any other dispatch. Do not report background/parallel success in U5.

## Questions

Use the available structured user-input tool for a required interactive recovery/authority decision. If the current mode has no blocking structured-input tool, ask one concise chat question and wait.
