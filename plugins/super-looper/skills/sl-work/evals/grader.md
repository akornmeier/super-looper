# sl-work compatibility-router grader

Grade only whether the response follows the thin wrapper contract in `evals.json`.

For each run:

1. Match `expected_terms` case-insensitively. Every must-tier term must appear.
2. Judge each `expected_context` statement as `correct`, `keyword_only`, or `absent`. Correct means the response makes the specified routing decision and honors its authority or format boundary.
3. Fail any normal Markdown-code response that reconstructs implementation, fixed reviewer dispatch, shipping, or PR behavior inside `sl-work`.
4. Fail a state response that plans or initializes again, an older unattended response that becomes interactive, or an HTML response that is sent to `sl-run` as canonical Markdown.

An eval passes when all must terms and all context statements pass. Across three runs, require at least two passes with no contradictory recommendation.
