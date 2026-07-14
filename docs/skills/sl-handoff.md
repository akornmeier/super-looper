# `sl-handoff`

> Compact conversation-only context for a genuinely non-run session transition.

`sl-handoff` remains for research, debugging, design exploration, or interrupted manual work when a fresh session needs context that no durable artifact carries. It writes one delta-only `handoff.md` under OS temp and outputs its absolute path.

## Do not use it for `sl-run`

An active run already has a durable state path, bounded packets, compact status, and next action. Creating another handoff document duplicates context and creates competing state. Resume directly:

```text
/sl-run state:/tmp/super-looper/sl-run/<run-id>/run-state.json
```

A canonical plan also needs no planning-to-run handoff; start `/sl-run plan:<path>` or use `scripts/loop.sh --plan-file <path>`.

## What a non-run handoff contains

- One-line current state and first next action
- Existing artifacts, branch, commits, issue, or PR by path or URL
- Conversation-only decisions, rejected alternatives, resolved questions, and gotchas
- A direct next command, usually `/sl-plan` or a standalone debug, design, review, testing, or Git utility

It never copies plans, strategy, ADRs, issues, diffs, or run packets. The document is descriptive context, not a plan or mutable run state.

## See also

- [`sl-run`](./sl-run.md) — durable run state and review handoff
- [`sl-plan`](./sl-plan.md) — next step for unplanned code work
