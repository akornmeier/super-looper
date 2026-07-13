# `sl-run`

`sl-run` is the streamlined entry into a code-owned developer workflow for canonical Markdown plans from `sl-plan`. Deterministic code controls state, commands, conditions, repair budgets, and transitions. Bounded agents implement or make semantic judgments. The workflow stops with evidence ready for engineer review.

## Use it

Start an interactive run:

```text
sl-run plan:docs/plans/<plan>.md
```

Resume from the absolute state path reported after every transition:

```text
sl-run state:/tmp/super-looper/sl-run/<run-id>/run-state.json
```

For unattended Claude Code supervision, use `scripts/loop.sh --plan-file <path> --verify-cmd <command...>`. Claude Code and Codex share the kernel, state and result contracts; thin adapters handle their different script paths, agent dispatch, and session-continuation capabilities.

## Serial workflow

U6 deliberately stays serial:

```text
kernel -> implementation agent -> code checks
                         ^          |
                         | failure  |
                         +----------+
code checks pass -> independent verifier -> review_ready
```

The kernel emits one typed `next_action`. The host adapter performs only that action and returns its result. Agents never decide whether a required command passed, mutate run state, or certify their own phase.

Required verification commands run directly through the kernel as argument vectors. Shell control flow and shell `-c` are rejected. Each command receives a timeout; stdout and stderr stay in files and failures travel by pointer into repair context.

When the host exposes a real resumable agent handle, failed checks return to the responsible session. Otherwise the kernel explicitly requests a fresh repair agent. One repair is allowed by default.

After code checks pass, a fresh agent evaluates the integrated phase goal and completion gate. Passing the last phase writes `review-packet.json` and changes durable state to `review_ready`.

## Durable execution contract

Initialization parses the plan into `execution-plan.json`, hashes the exact plan and `STRATEGY.md`, records branch and reachable HEAD, and atomically creates `run-state.json`. The kernel is the only writer.

The state journal distinguishes `code`, `agent`, and `human` nodes, stores actual session capabilities, indexes command logs and node results, and records the next action. Boundary resumes do not repeat completed nodes. A process interrupted while an agent is recorded active reports reconciliation instead of blindly redispatching it.

## Safety boundaries

- Plan or strategy mutation is terminal goal drift (exit 8).
- Branch mismatch, unreachable HEAD, malformed results, concurrent writers, and unsafe command syntax fail closed.
- Changed-file claims must stay inside the unit's owned scope.
- Unattended mode emits `<promise>DONE</promise>` only after durable `review_ready` state.
- `review_ready` is not approval or delivery. U6 does not commit, push, open a pull request, watch CI, capture learnings, update strategy, or run parallel teams.

The older `sl-work` and `lfg` entry points remain available during migration. The stacked-PR `loop-phases.sh` path explicitly selects legacy `lfg` until delivery is folded into the new workflows.
