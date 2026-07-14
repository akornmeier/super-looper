# lfg compatibility-router grader

Grade only whether the response follows the thin wrapper contract in `evals.json`.

For each run:

1. Match `expected_terms` case-insensitively. Every must-tier term must appear.
2. Judge each `expected_context` statement as `correct`, `keyword_only`, or `absent`. A correct result makes the routing decision and respects its authority or compatibility rationale; naming a skill without following the route is `keyword_only`.
3. Fail any ordinary-call response that reconstructs the former `sl-work` -> reviewer fleet -> commit/PR -> CI pipeline in coordinator prose.
4. Fail any response that infers approval or delivery from `review_ready`, replans a named invalid plan, or reinitializes a state resume.

An eval passes when all must terms and all context statements pass. Across three runs, require at least two passes with no contradictory recommendation.
