---
name: sl-run
description: "Execute or resume a canonical sl-plan Markdown artifact through dependency-ordered phases with one worker at a time, durable atomic run state, independent phase verification, goal-drift protection, and honest terminal status. Use when the user says run, execute, continue, or resume a plan, provides plan:path or state:path, or asks for the streamlined implementation loop."
---

# Run a phased plan

Coordinate execution; do not become the implementation worker. Use one worker at a time in U5. Parallel or multi-worker phase teams belong to `sl-run`'s later team-execution capability and are not available in this version.

Select `references/runtime-claude.md` on Claude Code or `references/runtime-codex.md` on Codex before the first script call or worker dispatch. Read `references/state-engine.md` for state operations and `references/worker-contract.md` before dispatching work.

## Invariants

- Treat the checked-in plan and `STRATEGY.md` as immutable goals for the whole run. Never edit either file, including status markers.
- Make the parent coordinator the only run-state writer. Workers never call the state engine or edit plan, strategy, state, packets, or results.
- Deliver only the current unit's phase packet. Do not send the full plan, strategy, session transcript, or accumulated worker narratives.
- Dispatch at most one implementation worker at a time. Do not begin another unit until its result is recorded.
- A worker's completed result is not a phase pass. Independently run the phase's verification commands and completion gate from the coordinator.
- Never infer completion from prose. Advance only through successful state-engine operations.
- Stop honestly on goal drift, malformed state/result, branch mismatch, unreachable recorded commit, worker failure, or failed independent verification.
- Do not commit, push, create a pull request, watch CI, write learnings, or update strategy in U5. Later closeout phases own those actions.

## Resolve input

Recognize only literal prefixes:

- `plan:<repo-relative-path>` starts a new run.
- `state:<absolute-run-state-path>` resumes a run.
- `state-path:<absolute-run-state-path>` selects the initialization destination and is valid only with `plan:`.
- `mode:interactive` or `mode:unattended` selects policy; direct use defaults to interactive.
- `run-id:<id>` and `base-ref:<ref>` are supervisor inputs for deterministic unattended runs.

Preserve other colon-bearing text. Require exactly one of `plan:` or `state:`; `state-path:` is not a resume input. Resolve the repository root before initialization. A plan must use the canonical Markdown contract produced by `sl-plan`; HTML is a review artifact and cannot initialize `sl-run`.

## Start or resume

For `plan:`:

1. Confirm the target worktree and plan path. In interactive mode, surface unrelated pre-existing changes before dispatch; do not discard them. In unattended mode, fail closed if they overlap the first unit's owned scope.
2. Invoke state-engine `init`, passing the target, plan, optional `run-id`, `base-ref`, and supervisor-provided state path.
3. Keep the returned absolute `state_path`. It is the sole resume handle.

For `state:`:

1. Invoke state-engine `resume` before reading or changing implementation files.
2. If `next_action` is `reconcile-in-progress-unit`, do not redispatch it. The prior worker may have changed the worktree without returning a result. Report the packet path and state path, inspect the worktree only when the user authorizes recovery, and require an explicit reconciliation decision.
3. At a phase boundary, continue from `start-next`; completed gates must not run again.

Any state-engine exit `8` is terminal goal drift. Report the named file and expected/actual hash; do not reinitialize against the changed goal in the same run.

## Execution loop

Repeat until the state is terminal:

### 1. Start one ready unit

Invoke `start-next`. Read the emitted phase-packet JSON. If the engine says the phase is ready for verification, skip to step 4. If no dependency-ready work exists, stop with the engine's typed failure.

### 2. Dispatch one worker

Use the selected runtime adapter to dispatch one general implementation worker. Give it:

- the target repository root;
- the complete phase packet, and nothing broader;
- repository instructions that apply to its owned scope;
- the exact worker-result schema from `references/worker-contract.md`.

Authorize edits only inside `owned_scope`. The worker may inspect adjacent code needed to follow established patterns and may run unit verification commands. It must return one JSON object and no completion claim beyond its unit.

### 3. Record the result

Write the returned JSON to a temporary file inside the run-state directory, then invoke `record-worker`. The engine validates identity, paths, status, branch/head safety, and stores the immutable result.

- `completed`: continue. Start the next dependency-ready unit in the same phase, if any.
- `blocked`: stop. Interactive mode asks for the smallest decision or authority needed; unattended mode returns a blocked terminal report without guessing.
- `failed`: stop at the recorded failed terminal. U5 has no automatic repair pass.

Never hand-edit a malformed result into apparent validity. Ask the same worker once to return schema-correct JSON only; if it still fails, record/report failure.

### 4. Verify the phase independently

After every unit in the current phase is recorded completed:

1. Read the structured plan copy in the run-state directory for the phase completion gate.
2. Run the phase's verification commands from the coordinator, not through the implementation worker.
3. Inspect observable completion-gate evidence. A command's exit zero is evidence only for what that command covers.
4. Invoke `verify-phase --status passed` with concrete evidence only when every gate passes. Otherwise invoke `verify-phase --status failed` with the failed command or missing evidence.

The engine completes the run automatically only after every phase has passed independent verification.

### 5. Surface status

After every state transition, report this compact tuple from engine output:

```text
status=<status> phase=<current_phase|none> unit=<current_unit|none>
completed_gates=<ids|none> next=<next_action>
state=<absolute state_path> terminal_reason=<reason|none>
```

Do not replace it with a narrative progress estimate.

## Interaction policy

Interactive and unattended modes execute the same states and gates.

- **Interactive:** ask only for a decision that changes safe execution, recovery from a mid-unit interruption, or new authority. Continue routine ready units without ceremony.
- **Unattended:** never ask questions or widen scope. Fail closed on ambiguity, blocked work, unsafe dirty-worktree overlap, or missing verification. When the engine reports completed, output `<promise>DONE</promise>` as the final non-empty line for the process supervisor. Never emit that sentinel for blocked or failed state.

## Completion

A successful U5 run means implementation and independent phase gates completed. It does not mean the work was committed, reviewed, pushed, or delivered. Report the durable state path and leave closeout to a later explicit workflow.
