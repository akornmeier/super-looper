# Codex runtime adapter

## Kernel

Resolve the skill directory from the absolute loaded `SKILL.md` source path. Invoke Python with the absolute script path; never assume the target repository contains it:

```bash
python3 "<absolute-skill-directory>/scripts/run-state.py" <operation> <arguments>
```

## Implementation and repair agents

Dispatch one worker with the Codex subagent collaboration tool. Inject only the named packet, applicable repository instructions, target root, and result contract.

## Router

When the kernel emits `dispatch-router`, dispatch one fresh strongest-available reasoning agent through the collaboration/subagent mechanism. Give it only the route packet and router contract. Do not create a router for a deterministically selected profile.

## Isolation capabilities

Declare `sandbox` only when the current Codex runtime actually gives each worker a dedicated sandbox/computer with an integration path. Declare `worktree` only after creating or selecting a dedicated worktree. Always declare `shared` as the fallback. Collaboration support alone is not proof of filesystem isolation and does not authorize parallel dispatch.

Use the returned agent identifier as an opaque handle only when the collaboration runtime can send a follow-up task to that same agent. Then return `resumable: true` and use a follow-up task for `resume-agent`. Otherwise return `session: null` or `resumable: false` and dispatch a fresh repair worker. Never report parallel success merely because U7 state records an eligible group.

## Verifier

Dispatch a fresh Codex subagent with the verifier packet. Do not send verifier work to the implementation or repair agent.

## Closeout

Dispatch a fresh Codex subagent with only the closeout packet and contract. It may inspect named evidence and write one gated solution document, but it must not edit strategy or run state.

## Questions

Use the available structured user-input tool for required interactive reconciliation. If no blocking structured-input tool exists, ask one concise chat question and wait.
