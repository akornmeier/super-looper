---
name: sl-run
description: "Execute or resume a canonical sl-plan artifact through a code-owned developer workflow that selects a risk-sized profile, runs deterministic checks and bounded repair, performs independent verification, assembles engineer review, controls approved commit/PR delivery and CI repair, and closes with evidence-based learning and strategy observations. Use when the user says run, execute, continue, resume, review, or deliver a plan; provides plan:path or state:path; or asks for the streamlined implementation workflow."
---

# Run a code-owned workflow

Act as the host adapter and user interface, not the workflow engine or implementation worker. The bundled kernel selects every transition. Perform only the `next_action` it emits, return the requested typed result, then ask the kernel what follows.

Before the first script call or dispatch, select `references/runtime-claude.md` on Claude Code or `references/runtime-codex.md` on Codex. Read `references/state-engine.md` and `references/workflow-profiles.json`. Read the action-specific agent, verifier, review, delivery, or closeout reference only immediately before that action.

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
- Treat final engineer review as a separate authority gate. No profile, including hotfix, may deliver from verification alone.
- Perform commit, push, pull-request, and CI operations only through kernel-emitted delivery actions. Stage only agent-reported files.
- Build learning from the durable closeout packet, not the hot transcript. `no-learning` is a normal successful outcome.
- Never edit `STRATEGY.md` during a run. Closeout may record a proposal artifact; only a later explicit `sl-strategy` reconciliation may apply it.

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
3. Continue directly from the emitted action, including review, delivery, CI, or closeout. Completed nodes and phase gates do not repeat.

Exit `8` is terminal goal drift. Report the changed file and expected/actual hash; never reinitialize against the changed goal in the same run.

## Execute emitted actions

Repeat until the kernel reaches `review_ready`, `completed`, `cancelled`, `blocked`, or `failed`:

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

### `await-engineer-review`

Read `references/review-packet.md` and show the exact packet. In unattended mode, stop at durable `review_ready`; never infer a decision. In interactive mode, record only the engineer's explicit `approved`, `rejected`, or `repair-requested` decision with identity and rationale. A repair request must name one unit. Rejection cancels honestly; repair consumes the bounded repair budget; approval authorizes only the exact delivery packet.

### `deliver`

Read `references/delivery.md`, then invoke kernel `deliver`. Do not stage, commit, push, or call `gh` yourself. The kernel refuses unreported dirty paths, stages the reported set, creates the approved commit, and opens or reuses the PR only when the approved action says `commit-push-pr`.

### `observe-ci`

Invoke kernel `observe-ci`. A pending disposition remains resumable. A typed failure returns the responsible unit to its existing repair budget and requires checks, verification, and engineer review again. A passing disposition emits the closeout packet.

### `dispatch-closeout`

Read `references/closeout.md`. Dispatch one fresh agent with only the closeout packet and that contract. It must check the indexed solution corpus before writing, may write under `docs/solutions/` only after every learning gate passes, and otherwise returns `no-learning`. Write its exact JSON to `incoming-closeout-*.json`, then invoke `record-closeout`. Strategy observations may produce `strategy-proposal.json`; they never authorize a strategy edit.

## Surface status

After each operation, report only this compact tuple plus a blocker when present:

```text
status=<status> phase=<current_phase|none> unit=<current_unit|none>
node=<current_node|none> profile=<profile|none> isolation=<mode|none> max_workers=<n|none>
completed_gates=<ids|none> next=<next_action>
state=<absolute state_path> terminal_reason=<reason|none>
```

Interactive mode asks only for safe recovery or new authority. Unattended mode never asks or widens scope.

## Stop and completion semantics

`review_ready` means implementation, direct checks, and independent verification passed. It is the default unattended stop, not approval or delivery. `completed` additionally means an engineer-approved delivery and evidence closeout were durably recorded.

In unattended mode, emit `<promise>DONE</promise>` as the final non-empty line only after durable `review_ready` or `completed` state. Never emit it for cancelled, blocked, failed, or merely narrated completion.
