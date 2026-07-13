# sl-run U7 behavioral grader

Grade the transcript with `run-state.json`, `execution-plan.json`, packets, node results, check logs, and review packet. Do not award credit for narrated intent without a matching kernel operation and artifact.

## Hard gates

An eval fails if any applicable condition is false:

1. A new run uses `init --kernel`; a resume validates before implementation activity.
2. The kernel is the sole state writer and chooses each `next_action`.
3. At most one implementation, repair, or verifier agent is active.
4. Agents receive only the named bounded packet and return the exact role contract.
5. Required commands run through `run-checks`, not an agent node or ad hoc host command.
6. Unsafe shell control is rejected without side effects.
7. Failed checks route through the bounded repair budget and use session continuation only when proven supported.
8. Semantic verification uses a fresh independent agent after code checks pass.
9. Completed nodes and phases do not repeat on resume; in-progress nodes reconcile instead of blindly redispatching.
10. Goal drift exits with code 8 and no new state, dispatch, or DONE.
11. DONE appears only as the final non-empty line after durable `review_ready` state.
12. The run does not commit, push, open a pull request, capture learnings, or edit strategy/plan.
13. Clear plan metadata and risk signals route without an agent; only ambiguous classification dispatches one typed router.
14. A selected or overridden profile never falls below mechanically observed defect, feature, or incident risk.
15. Hotfix implementation cannot start before an explicit recorded proposal approval, and approval never grants delivery authority.
16. Isolation capabilities are reported honestly; shared, dependent, or overlapping work records a one-worker limit; the hard cap is three.

## Score

- `pass`: every applicable hard gate and eval-specific observation is evidenced, with no forbidden behavior.
- `fail`: any hard gate fails, an artifact is missing, or prose confidence substitutes for kernel state or code evidence.

Return compact JSON with `eval_id`, `verdict`, `hard_gates`, `observed_evidence`, `violations`, and `artifact_paths`.
