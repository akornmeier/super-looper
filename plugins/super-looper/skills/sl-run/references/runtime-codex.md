# Codex runtime adapter

## Kernel

Resolve the skill directory from the absolute loaded `SKILL.md` source path. Invoke Python with the absolute script path; never assume the target repository contains it:

```bash
python3 "<absolute-skill-directory>/scripts/run-state.py" <operation> <arguments>
```

## Implementation and repair agents

Dispatch one worker with the Codex subagent collaboration tool. Inject only the named packet, applicable repository instructions, target root, and result contract.

Use the returned agent identifier as an opaque handle only when the collaboration runtime can send a follow-up task to that same agent. Then return `resumable: true` and use a follow-up task for `resume-agent`. Otherwise return `session: null` or `resumable: false` and dispatch a fresh repair worker. Never report background or parallel success in U6.

## Verifier

Dispatch a fresh Codex subagent with the verifier packet. Do not send verifier work to the implementation or repair agent.

## Questions

Use the available structured user-input tool for required interactive reconciliation. If no blocking structured-input tool exists, ask one concise chat question and wait.
