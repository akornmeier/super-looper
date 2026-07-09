# sl-plan HTML-artifact discipline grader

This grader evaluates one narrow assumption: does sl-plan's HTML output path produce a **stamped, stateful plan artifact** — template stamped rather than free-formed, image slots carrying prompts but never bytes, a missing API key degrading to a complete plan, a resume preserving the living-artifact regions, and pipeline mode still forcing markdown? It is NOT a general quality grader for sl-plan.

## Inputs to the grader

For each eval run, the grader receives:

1. **The eval definition** from `evals.json` (prompt, expected_terms, tiers, expected_context, ground_truth, notes).
2. **The response text** the with-skill subagent produced for the eval prompt.
3. **(Optional) the full agent transcript** for the run.

## Two-stage grading

### Stage 1 — Programmatic term recall (substring match)

For each entry in `expected_terms`, score 1 if the term (case-insensitive substring) appears in the response, else 0. Aggregate `must_recall` / `should_recall` / `may_recall` by tier.

**Stage 1 pass criterion:** `must_recall == 1.0`. On failure, record and stop — Stage 2 is moot.

### Stage 2 — Decision correctness (LLM-graded)

For each `expected_context` entry, classify the response as:

- **`correct` (1.0)** — right artifact decision AND the contract rationale. Example (eval 3): "The plan is already written and complete — the slots stay as placeholder comments. I print one line saying `OPENAI_API_KEY` is unset and that exporting it and re-running fills them, then continue to 5.3."
- **`keyword_only` (0.0)** — the term appears but the decision is wrong, hedged, or unexplained. Example: "The slots stay as placeholders, but I'd ask the user for an API key before continuing."
- **`absent` (0.0)** — the decision is not addressed.

**Stage 2 pass criterion (all evals):** every `expected_context` entry scores `correct`.

### Stage 2 discriminators

Some failures pass Stage 1 on vocabulary alone. Check these explicitly:

| Eval | Fails Stage 2 despite term recall when… |
|------|------------------------------------------|
| 1 | The response describes composing HTML "guided by" the template rather than copying and stamping it, or omits the post-stamp checklist / metadata seeding. |
| 2 | The response offers to generate, fetch, inline, or hand-author the image itself (any affirmative claim of writing `<img>`, base64, or a data URI). |
| 3 | The response blocks, retries, errors, prompts the user for a key, or silently skips without a visible one-line note. |
| 4 | The response rewrites the plan wholesale, "tidies" the `[wip]` marker, re-stamps a filled image slot, or edits the existing Amendments entry. |
| 5 | The response produces HTML because the repo config says so, or claims the image-fill step runs in a pipeline run. |

## Aggregating across runs (variance)

Run each eval N times (default 3). Per run capture recall by tier and stage pass flags. Per eval compute `mean_must_recall`, `stddev_must_recall`, `runs_passed`.

**Eval-level pass criteria:**
- `mean_must_recall >= 0.80`
- `stddev_must_recall < 0.20`
- `runs_passed >= 2 of 3`

## Outputs

Write per-run `grading.json` and per-eval `summary.json` under `<workspace>/iteration-N/eval-<ID>/`, using the same JSON shape as `plugins/super-looper/skills/sl-sessions/evals/grader.md`.

## Risk attribution

| Risk | Signal | Where it surfaces |
|------|--------|-------------------|
| Free-form drift (plan shape varies run to run) | Eval 1 Stage 1 must-tier or Stage 2 `keyword_only` | grading.json eval-1 |
| Model writes image bytes (token blowup) | Eval 2 Stage 2 endorses emitting `<img>` / base64 | grading.json eval-2 |
| Image failure blocks the plan | Eval 3 Stage 2 `keyword_only` | grading.json eval-3 |
| Resume rewrites the living artifact | Eval 4 Stage 2 `keyword_only` on any preserved region | grading.json eval-4 |
| HTML leaks into the unattended pipeline | Eval 5 Stage 1 must-tier or Stage 2 fails | grading.json eval-5 |
| Variance | Same eval passes some runs, fails others | summary.json `stddev_must_recall >= 0.20` or `runs_passed < 2` |
