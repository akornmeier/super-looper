# `sl-run`

`sl-run` is the streamlined execution coordinator for canonical Markdown plans produced by `sl-plan`. It runs one bounded work unit at a time, stores progress outside the target repository, and independently verifies each phase before advancing.

## Use it

Start an interactive run with:

```text
sl-run plan:docs/plans/<plan>.md
```

Resume from the absolute state path reported after every transition:

```text
sl-run state:/tmp/super-looper/sl-run/<run-id>/run-state.json
```

For unattended Claude Code supervision, use `scripts/loop.sh --plan-file <path> --verify-cmd <command...>`. Codex and Claude Code share the same coordinator, state engine, packet contract, and worker-result contract; only their worker-dispatch and bundled-script adapters differ.

## Durable execution contract

Initialization parses the plan into `execution-plan.json`, hashes the exact plan and `STRATEGY.md`, records the branch and reachable HEAD, and atomically creates `run-state.json`. The parent coordinator is the only state writer.

Each worker receives one phase packet containing its phase goal, owned scope, acceptance checks, non-goals, and verification commands. It does not receive the full plan or accumulated transcripts. A worker result can complete a unit, but only the coordinator can run and record the independent phase gate.

At every transition, `sl-run` reports the current phase and unit, completed gates, next action, absolute state path, and terminal reason. A phase-boundary resume starts the next phase without repeating completed work. A mid-unit interruption reports `reconcile-in-progress-unit` and refuses blind redispatch.

## Safety boundaries

- Plan or strategy mutation is terminal goal drift (exit 8).
- Branch mismatch, unreachable recorded HEAD, malformed results, and concurrent writers fail closed.
- Changed-file claims must stay within the unit's owned scope.
- Unattended mode emits `<promise>DONE</promise>` only after durable completed state.
- U5 is implementation and phase verification only. It does not run parallel teams, commit, push, open a pull request, watch CI, capture learnings, or update strategy; those capabilities arrive in later phases.

The older `sl-work` and `lfg` entry points remain available during migration. The stacked-PR `loop-phases.sh` path explicitly selects the legacy `lfg` plan workflow until delivery is folded into `sl-run`.
