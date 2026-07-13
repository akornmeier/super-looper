# sl-plan lean frontier-planner eval suite

This suite protects the U4 boundary: a frontier parent plans directly, normal local planning uses no subagent, escalation is bounded, every plan is executable by contract, and Claude-compatible HTML stays optional and cost-safe.

| Eval | Primary risk |
|---|---|
| normal-local-plan-uses-no-subagent | The old default research/deepening fleet survives in practice |
| scout-is-single-bounded-and-evidence-only | Research delegation becomes multi-agent planning |
| critic-runs-only-for-material-risk | Every large plan pays a review tax or a critic takes synthesis authority |
| html-preserved-but-images-separately-opt-in | Claude compatibility regresses or HTML silently triggers paid images |

## Fresh-source protocol

These behavioral evals do not run under `bun test`; that suite checks their shape. Run them with the skill-creator workflow because Claude Code and Codex cache installed skill content.

1. Use `/tmp/super-looper/sl-plan/evals/<host>-iteration-<N>/` for run artifacts.
2. For each case and run, inject the current packaged `SKILL.md`, `references/plan-contract.md`, `references/optional-renderer.md`, and the selected host adapter. Include `references/html-plan-template.md` only for the HTML case.
3. Do not name the expected answer in the dispatch prompt beyond the eval's own scenario. Ask the fresh worker to answer as the loaded skill.
4. Apply `grader.md` and write response/grading files in the temp workspace. Run three times per eval for a release-quality result; a one-run-per-host smoke is acceptable during prompt iteration but is not the final variance gate.
5. Capture model/host, instruction bytes, response bytes, dispatch count, and real tokens only when reported by the host.

Claude and Codex runs must produce equivalent semantic decisions. Host-specific question/dispatch/script syntax is not graded as semantic drift.
