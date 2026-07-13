# sl-run U5 eval suite

This suite validates the narrow U5 promise: one coordinator, one implementation worker at a time, durable phase progress, independent verification, honest resume, and immutable goals on both Claude Code and Codex.

Run it through the `skill-creator` fresh-source workflow. Create isolated temporary git fixtures under `/tmp/super-looper/sl-run/evals/<run-id>/`; do not use the plugin loader's session-cached copy. Inject the current `SKILL.md`, its selected runtime adapter, state-engine reference, worker contract, and bundled script into each dispatched evaluator.

The fixture plan should contain two dependent phases with one unit each and observable, local verification commands. Prepare separate bundles for clean start, phase-boundary resume, mid-unit interruption, goal drift, and failed independent verification. Run host variants separately because worker dispatch differs, while grading the shared state transitions identically.

These evals deliberately stop before U6 and U7 behavior. Parallel agent teams, risk-selected review, commits, pull requests, CI closeout, learnings, and strategy observations are out of scope and count as violations if they appear.
