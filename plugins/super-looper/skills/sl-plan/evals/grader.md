# sl-plan lean frontier-planner grader

Grade whether the refactored planner produces an executable contract while avoiding default orchestration. Correct vocabulary without the correct delegation and artifact decisions does not pass.

## Stage 1: term recall

Match `expected_terms` case-insensitively. A run advances only when every must-tier term appears. Record should/may recall for diagnosis, not as a substitute for must-tier behavior.

## Stage 2: decision correctness

For every `expected_context` item, assign:

- `correct`: the decision and its boundary/rationale are present;
- `keyword_only`: words appear but the response takes a contradictory action, delegates extra work, or omits the load-bearing boundary;
- `absent`: the behavior is missing.

The run passes only when every context item is `correct`.

### Failure discriminators

| Eval | Fail even if terms appear when... |
|---|---|
| normal-local-plan-uses-no-subagent | Any scout, planning agent, spec-flow analyst, or critic is dispatched; the unit omits acceptance/verification/tests; or the response writes implementation code. |
| scout-is-single-bounded-and-evidence-only | More than one worker runs; the scout receives the full session; the scout proposes/writes the plan; or unsupported claims are treated as facts. |
| critic-runs-only-for-material-risk | The migration skips independent criticism; the critic rewrites the plan; findings are integrated without evidence; or a merely large refactor automatically triggers review. |
| html-preserved-but-images-separately-opt-in | HTML is free-formed, a Markdown sibling is also written, images run without `images:on`, revision overwrites tracked state, or pipeline emits HTML. |
| verification-is-kernel-compatible | Commands are combined with shell control syntax; inspection lacks the literal `Inspect ` prefix; or the response implies the kernel executes semantic inspection as a program. |

## Aggregate gate

Run each eval three times. Per eval require mean must-tier recall at least 0.80, standard deviation below 0.20, and at least two passing runs. The suite passes only when all evals pass on both the Claude and Codex packaged instruction bodies.

Record host, model, instruction bytes, response bytes, dispatch count, and tokens when the host reports them. Never infer token counts from bytes; label byte measurements as proxies.
