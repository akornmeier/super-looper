# `sl-run`

`sl-run` is the streamlined entry into a code-owned developer workflow for canonical Markdown plans from `sl-plan`. Deterministic code selects a chore, bug, feature, or hotfix profile and controls state, checks, review authority, delivery, CI repair, and closeout. Bounded agents implement or make semantic judgments; engineers approve consequential delivery.

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

Optional controls are `profile:chore|bug|feature|hotfix` and `max-workers:1|2|3`. A profile override cannot lower the kernel's observed safety floor.

## Routed workflow

The kernel chooses the least expensive safe profile before execution:

```text
explicit metadata/risk signals -> profile
ambiguous only -> one frontier router -> profile
hotfix -> engineer proposal approval

profile -> implementation agent -> code checks
                         ^          |
                         | failure  |
                         +----------+
code checks pass -> independent verifier -> review_ready
review_ready -> engineer approve/reject/repair
approve -> code-owned commit/PR -> CI pass or bounded repair
CI pass -> evidence closeout -> completed
```

The kernel emits one typed `next_action`. The host adapter performs only that action and returns its result. Agents never decide whether a required command passed, mutate run state, or certify their own phase. A chore does not pay for the router or feature verifier lenses. Bug, feature, and hotfix packets carry their own evidence requirements.

Isolation selection prefers a real dedicated sandbox, then an existing dedicated worktree, then the shared checkout. Shared, dependent, or overlapping work is always limited to one worker. With an explicit worker request, isolated DAG-independent units with non-overlapping owned scopes may be recorded as eligible, capped at three. U7's portable coordinator still dispatches one unit per action; eligibility is not a claim that parallel integration occurred.

Required verification commands run directly through the kernel as argument vectors. Shell control flow and shell `-c` are rejected. Each command receives a timeout; stdout and stderr stay in files and failures travel by pointer into repair context.

When the host exposes a real resumable agent handle, failed checks return to the responsible session. Otherwise the kernel explicitly requests a fresh repair agent. Repair budgets come from the selected profile and remain bounded.

After code checks pass, a fresh agent evaluates the integrated phase goal and completion gate. Passing the last phase writes a packet with intent, scope, diff/check evidence, failed attempts, unresolved risk, authority, and the exact proposed delivery action. Unattended mode stops at `review_ready`.

Interactive review records one explicit approval, rejection, or named repair request. Approval creates an immutable delivery packet. The kernel rejects unrelated dirty files, stages only agent-reported paths, creates the approved commit and PR, observes registered CI checks, and routes a typed failure through the existing repair budget. Repaired work must pass checks, verification, and engineer review again.

After CI passes, one fresh closeout agent works from durable evidence pointers and the indexed solution corpus. It writes a solution only when the lesson is reusable, evidence-backed, novel, and behavior-changing; otherwise `no-learning` is normal success. A written solution is committed and CI-checked again by the kernel. Material strategy observations become a separate proposal artifact that requires later explicit `sl-strategy` reconciliation.

## Durable execution contract

Initialization parses the plan into `execution-plan.json`, hashes the exact plan and `STRATEGY.md`, records branch and reachable HEAD, and atomically creates `run-state.json`. The kernel is the only writer.

The state journal distinguishes `code`, `agent`, and `human` nodes, stores actual session capabilities, indexes command logs and node results, and records the next action. Boundary resumes do not repeat completed nodes. A process interrupted while an agent is recorded active reports reconciliation instead of blindly redispatching it.

## Safety boundaries

- Plan or strategy mutation is terminal goal drift (exit 8).
- Branch mismatch, unreachable HEAD, malformed results, concurrent writers, and unsafe command syntax fail closed.
- Changed-file claims must stay inside the unit's owned scope.
- A hotfix cannot start until an engineer explicitly approves its proposal; unattended mode stops at that boundary.
- Proposal approval does not authorize delivery.
- Unattended mode emits `<promise>DONE</promise>` only after durable `review_ready` or `completed` state.
- `review_ready` is not approval or delivery. Every delivery requires an explicit final engineer decision.
- CI failure invalidates stale delivery authority and returns through bounded repair and review.
- Closeout may propose strategy reconciliation but never edits `STRATEGY.md`.

The older `sl-work` and `lfg` entry points remain available during migration. The stacked-PR `loop-phases.sh` path still explicitly selects legacy `lfg` until caller migration in U9.
