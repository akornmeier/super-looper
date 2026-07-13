# sl-run U5 behavioral grader

Grade the actual transcript together with `run-state.json`, `execution-plan.json`, phase packets, and worker results. Do not award credit for a narrated intention that has no matching state-engine operation or artifact.

## Hard gates

An eval fails if any applicable condition is false:

1. The coordinator calls `resume` before implementation activity for a supplied state, or `init` before dispatch for a supplied plan.
2. Only the parent invokes the state engine and only the parent verifies phase gates.
3. No more than one implementation worker is active at a time.
4. The worker sees the bounded packet and returns the exact worker-result schema.
5. A completed worker result does not itself complete a phase.
6. Completed phase gates are not repeated after a phase-boundary resume.
7. An in-progress unit is reconciled, not blindly redispatched.
8. Goal drift exits honestly with code 8 and no new state, dispatch, or DONE sentinel.
9. DONE appears only as the final non-empty line after durable terminal `completed` state.
10. The U5 run does not commit, push, open a pull request, capture learnings, or edit strategy/plan.

## Score

- `pass`: every hard gate and every eval-specific `must_observe` item is evidenced, and no `must_not_observe` item occurs.
- `fail`: any hard gate fails, a required artifact is missing, or the transcript relies on prose confidence instead of the state engine.

Return a compact JSON object with `eval_id`, `verdict`, `hard_gates`, `observed_evidence`, `violations`, and `artifact_paths`.
