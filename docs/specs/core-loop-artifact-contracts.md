# Core Loop Artifact Contracts

This specification defines the host-neutral artifacts that connect frontier planning, phased execution, worker teams, verification, resume, and closeout. TypeScript schemas in `src/core-loop/contracts.ts` are the mechanical source of truth; this document explains ownership and lifecycle.

## Ownership

| Artifact | Owner | Mutability | Purpose |
|---|---|---|---|
| Execution plan | Frontier planner | Immutable during a run | Desired goal, phases, work units, dependencies, acceptance, verification |
| Run state | Parent coordinator | Atomic replacement | Current status, completed work, verification, commits, usage, closeout observations |
| Phase packet | Parent coordinator | Immutable dispatch input | Smallest context one worker needs for one work unit |
| Worker result | Assigned worker | Immutable return | Changed files, evidence, checks, risks, unresolved work |
| Run record | Process supervisor | Written once at terminal | Outcome and pointers to state, transcript, PR, and residual evidence |

Workers never edit the active plan, strategy, or run state. They modify only their authorized implementation scope and return a validated worker result. The parent coordinator integrates results and is the sole run-state writer.

## Execution Plan

The machine contract is `executionPlanSchema`. A valid plan has:

- `schema_version: 1`
- one stable goal;
- optional requirements;
- one or more dependency-ordered phases;
- one or more work units per phase;
- explicit acceptance and verification for every unit;
- a completion gate for every phase; and
- unique lowercase hyphen-case identifiers with an acyclic dependency graph.

The current schema validates the structured plan contract. Parsing the canonical Markdown plan into that structure belongs to the lean-planner implementation; this first slice does not introduce a second checked-in plan artifact.

## Run State

The machine contract is `runStateSchema`. Run state binds execution to:

- exact plan and strategy hashes;
- branch, base reference, and reachable head SHA;
- one current phase at most;
- phase/unit progress and dependency state;
- independent verification evidence;
- commits and optional usage metrics;
- learning candidates and strategy observations; and
- an honest terminal reason.

Completed phases require every unit completed and verification passed. A completed run requires every phase completed. Terminal statuses require matching terminal details; non-terminal states cannot carry them.

Run state will live under `/tmp/super-looper/sl-run/<run-id>/run-state.json`. The coordinator writes it with temp-file-plus-rename atomic replacement. Resume must revalidate the schema, goal hashes, branch, commit reachability, and completed gates before continuing.

## Phase Packet

The machine contract is `phasePacketSchema`. It deliberately excludes the full session and full plan. It carries:

- run, plan, phase, and unit identity;
- phase goal and unit scope;
- acceptance criteria and owned scope;
- explicit non-goals;
- an optional strategy excerpt;
- relevant solution pointers;
- an optional evidence dossier pointer and gist; and
- verification commands.

Host-specific dispatch syntax is not part of the packet. Claude Code and Codex adapters deliver the same semantic packet through their native subagent mechanisms.

## Worker Result

The machine contract is `workerResultSchema`. It reports `completed`, `blocked`, or `failed` plus repository-relative changed files, evidence, verification, risks, and unresolved items. It cannot claim changes outside the repository.

A `completed` worker result is not a phase pass. The coordinator integrates the work and a separate verifier evaluates the phase completion gate.

## State Transitions

`src/core-loop/state-machine.ts` enforces legal transitions.

```text
unit/phase:
pending -> ready -> in_progress -> completed
   |         |            |
   +-------> blocked <-----+
   +-------> failed <------+
blocked -> ready | failed
failed -> ready

run:
initialized -> running -> completed
       |          |  +--> blocked -> running
       |          |  +--> failed
       |          |  +--> cancelled
       +----------+-----> failed | cancelled
```

Dependencies must be complete before a phase or unit becomes ready. Only one phase may be active. Phase completion requires completed units and passed verification. Terminal run states cannot resume.

## Validation

Validate JSON fixtures with:

```bash
bun run scripts/core-loop/validate-contract.ts plan <file.json>
bun run scripts/core-loop/validate-contract.ts run-state <file.json>
bun run scripts/core-loop/validate-contract.ts phase-packet <file.json>
bun run scripts/core-loop/validate-contract.ts worker-result <file.json>
```

Exit codes are `0` valid, `1` invalid contract, and `2` usage/read/JSON error.
