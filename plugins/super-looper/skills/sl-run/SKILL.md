---
name: sl-run
description: "Execute or resume a canonical sl-plan artifact through a code-owned developer workflow that selects a chore, bug, feature, or hotfix profile, records isolation and bounded-team eligibility, runs direct deterministic checks, routes bounded repair, performs independent semantic verification, protects immutable goals, and stops review-ready. Use when the user says run, execute, continue, or resume a plan, provides plan:path or state:path, selects a workflow profile, or asks for the streamlined implementation workflow."
---

# Run a code-owned workflow

Act as the host adapter and user interface, not the workflow engine or implementation worker. The bundled kernel selects every transition. Perform only the `next_action` it emits, return the requested typed result, then ask the kernel what follows.

Before the first script call or dispatch, select `references/runtime-claude.md` on Claude Code or `references/runtime-codex.md` on Codex. Read `references/state-engine.md` and `references/workflow-profiles.json`. Read `references/router-contract.md`, `references/team-execution.md`, `references/agent-contract.md`, or `references/verifier-contract.md` only before the corresponding action.

## Invariants

- Treat the checked-in plan and `STRATEGY.md` as immutable goals. Never edit either file, including status markers.
- Make the kernel the only run-state writer and transition authority. Agents never edit plan, strategy, state, packets, or results.
- Send only the packet named by kernel output. Do not send the whole plan, strategy, session transcript, or accumulated agent narratives.
- Let code select the least expensive safe profile. A user override may raise cost or review depth but cannot lower the recorded safety floor.
- Report only isolation capabilities the host actually provides. Shared-checkout work always serializes. U7 records bounded parallel eligibility but the portable coordinator dispatches one unit per action.
- Run required formatter, linter, typecheck, test, and contract commands only through kernel `run-checks`. Agent-reported verification is not a gate.
- Resume the responsible agent only when the runtime supplied a stable handle and supports continuation. Otherwise dispatch a fresh repair agent with the repair packet and record the degraded continuity.
- Use a fresh independent verifier. An implementation or repair agent cannot certify its own phase.
- Stop honestly on goal drift, malformed state/result, unsafe command syntax, branch mismatch, unreachable head, exhausted repair budget, or failed verification.
- A hotfix cannot start implementation before the kernel records an explicit engineer proposal decision. Approval never grants delivery authority.
- Do not commit, push, create a pull request, watch CI, write learnings, update strategy, or approve the final review packet in U7.

## Resolve input

Recognize only literal prefixes:

- `plan:<repo-relative-path>` starts a new kernel run.
- `state:<absolute-run-state-path>` resumes a run.
- `state-path:<absolute-run-state-path>` selects initialization output and is valid only with `plan:`.
- `mode:interactive` or `mode:unattended` selects policy; direct use defaults to interactive.
- `run-id:<id>` and `base-ref:<ref>` are supervisor inputs.
- `profile:chore|bug|feature|hotfix` is an optional user route override.
- `max-workers:1|2|3` requests a bounded team size; one is the default.

Preserve other colon-bearing text. Require exactly one of `plan:` or `state:`. Resolve the repository root before initialization. Accept only canonical Markdown from `sl-plan`, never HTML.

## Start or resume

For `plan:`:

1. Surface unrelated existing changes in interactive mode. In unattended mode, fail closed when they overlap the first unit.
2. Determine actual host isolation capabilities through the runtime adapter. Invoke `init` with `--kernel`, target, plan, optional route override, requested worker count, each real isolation capability, run ID, base ref, and state path. Let the selected profile own the default repair cap.
3. Keep the returned absolute `state_path` as the sole resume handle.

For `state:`:

1. Invoke `resume` before inspecting or changing implementation files.
2. Never redispatch when it reports `reconcile-in-progress-agent` or `reconcile-in-progress-verifier`. The prior process may have changed the worktree without recording a result. Require an explicit reconciliation decision in interactive mode; unattended mode stops honestly.
3. Continue directly from `start-next`, `run-checks`, or `await-engineer-review` when the kernel reports that action. Completed nodes and phase gates do not repeat.

Exit `8` is terminal goal drift. Report the changed file and expected/actual hash; never reinitialize against the changed goal in the same run.

## Execute emitted actions

Repeat until the kernel reaches `review_ready`, `blocked`, or `failed`:

### `dispatch-router`

Use one fresh frontier reasoning agent with only the route packet and `references/router-contract.md`. Write its exact JSON return to `incoming-router-*.json`, then invoke `record-router`. Do not route in coordinator prose or inspect implementation files. A normal explicit plan must not pay this agent cost.

### `await-hotfix-proposal-approval`

Show the emitted proposal packet to the engineer. In interactive mode, invoke `record-proposal-decision` only after an explicit approve or reject answer and identify the approver. In unattended mode, stop; never infer approval. Rejection blocks the run. Approval permits `start-next` but leaves `delivery_authorized: false`.

### `start-next`

Invoke `start-next`. It writes one bounded phase packet and returns `dispatch-agent` with role `implementation`.

### `dispatch-agent`

Dispatch one general implementation or repair agent through the selected runtime adapter. Supply the target root, repository instructions for the owned scope, the exact packet path, and `references/agent-contract.md`. Write its exact JSON return to a uniquely named `incoming-agent-*.json` staging file in the run directory, then invoke `record-agent`. Never write the kernel-reserved `agent-result-*` files.

The agent may inspect adjacent code and run diagnostics while implementing, but its command claims do not advance state. Do not copy successful logs into its context.

### `resume-agent`

Resume the session handle named by kernel output and give it only the repair packet and referenced failure logs. Require a `role: repair` result. If continuation is unavailable despite a previously resumable handle, dispatch a fresh repair agent, set its returned session capability honestly, and record the fallback.

### `run-checks`

Invoke kernel `run-checks`; do not run the plan commands yourself. The kernel parses each command entry into an argument vector, rejects shell control flow, applies a timeout, stores stdout/stderr by pointer, and classifies pass/fail. Entries beginning with `Inspect ` remain semantic requirements and travel to the independent verifier instead of being executed as programs.

A failure returns `resume-agent` or `dispatch-agent` within the one-repair budget. Passing unit checks returns `start-next` or `dispatch-verifier`.

### `dispatch-verifier`

Dispatch one fresh agent with only the verifier packet and `references/verifier-contract.md`. It inspects the integrated phase and returns semantic gate evidence. Write the exact JSON return to a uniquely named `incoming-verifier-*.json` staging file in the run directory and invoke `record-verifier`. Never write the kernel-reserved `verifier-result-*` files.

A failed verifier may route one identified unit through the remaining repair budget. A passing final verifier produces `review_ready` and `review-packet.json`.

## Surface status

After each operation, report only this compact tuple plus a blocker when present:

```text
status=<status> phase=<current_phase|none> unit=<current_unit|none>
node=<current_node|none> profile=<profile|none> isolation=<mode|none> max_workers=<n|none>
completed_gates=<ids|none> next=<next_action>
state=<absolute state_path> terminal_reason=<reason|none>
```

Interactive mode asks only for safe recovery or new authority. Unattended mode never asks or widens scope.

## Stop at review-ready

`review_ready` means the selected profile's implementation, direct code checks, and independent semantic verification passed. It is not engineer approval or delivery. Report the route, actual isolation mode, state, and review-packet paths and perform no closeout action.

In unattended mode, emit `<promise>DONE</promise>` as the final non-empty line only after durable `review_ready` state. Never emit it for blocked, failed, or merely narrated completion.
