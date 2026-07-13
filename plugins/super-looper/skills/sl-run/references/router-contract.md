# Workflow router result

Use this contract only when the kernel emits `dispatch-router`. The router is a fresh frontier reasoning agent. It classifies economics and risk; it does not inspect or edit implementation files, execute commands, or change the plan.

Read only the emitted route packet. Return exactly one JSON object:

```json
{
  "schema_version": 1,
  "run_id": "run-id",
  "role": "router",
  "profile": "chore",
  "rationale": "One sentence grounded in packet signals.",
  "signals_considered": ["signal from the packet"]
}
```

`profile` is exactly `chore`, `bug`, `feature`, or `hotfix`. Choose the least expensive profile that satisfies the quality and authority floor. Never use `chore` to bypass bug evidence, feature breadth, incident approval, or another recorded safety floor. Do not add keys or Markdown fences.
