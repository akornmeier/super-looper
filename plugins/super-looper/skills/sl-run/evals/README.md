# sl-run U6 eval suite

This suite validates the U6 promise: a serial code-owned workflow kernel, bounded implementation agents, deterministic checks outside agent nodes, honest session repair, independent semantic verification, review-ready output, durable resume, and immutable goals on Claude Code and Codex.

Run it through the `skill-creator` fresh-source workflow. Create isolated git fixtures under `/tmp/super-looper/sl-run/evals/<run-id>/`; never use the plugin loader's session-cached copy. Inject the current `SKILL.md`, selected runtime adapter, kernel reference, agent/verifier contracts, and bundled script into each evaluator.

Use simple argv-compatible verification commands. Include fixtures for direct success, a failed check repaired through a resumable session, a non-resumable fallback, rejected shell control flow, phase-boundary resume, interrupted agent reconciliation, and goal drift. Run host variants separately because dispatch and session continuation differ; grade the shared state transitions identically.

Parallel teams, workflow profiles, delivery, CI, learnings, and strategy changes remain outside U6 and count as violations.
