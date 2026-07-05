# sl-code-review plan-requirements-completeness grader

This grader evaluates one narrow assumption: does sl-code-review verify plan-requirements completeness correctly in Stage 6 — reporting met/not-addressed/partial, routing explicit gaps to P1 and inferred gaps to P3, reflecting gaps in the verdict, and never fabricating requirements or blocking when no plan exists? It is NOT a general quality grader for sl-code-review. This is the input lfg distills into its goal_fidelity verdict.

## Inputs to the grader

For each eval run, the grader receives:

1. **The eval definition** from `evals.json` (prompt, expected_terms, tiers, expected_context, ground_truth, notes).
2. **The response text** the with-skill subagent produced for the eval prompt.
3. **(Optional) the full agent transcript** for the run.

## Two-stage grading

### Stage 1 — Programmatic term recall (substring match)

For each entry in `expected_terms`, score 1 if the term (case-insensitive substring) appears in the response, else 0. Aggregate `must_recall` / `should_recall` / `may_recall` by tier.

**Stage 1 pass criterion:** `must_recall == 1.0`. On failure, record and stop. For eval 4 (negative) `expected_terms` is empty, so Stage 1 passes trivially and the signal is entirely in Stage 2.

### Stage 2 — Decision correctness (LLM-graded)

For each `expected_context` entry, classify the response as:

- **`correct` (1.0)** — right completeness/routing/verdict decision AND the rationale. Example (eval 1): "R4 is not addressed; because the plan is explicit I flag it P1, owner downstream-resolver, into the actionable queue; the verdict is Not ready since the PR is code-clean but missing a planned requirement."
- **`keyword_only` (0.0)** — the term appears but the decision is wrong (e.g., routes an explicit gap as advisory, or an inferred gap as a blocking P1).
- **`absent` (0.0)** — the decision is not addressed.

**Stage 2 pass criterion (evals 1-3):** every `expected_context` entry scores `correct`.

**Stage 2 for eval 4 (negative):** check `must_not_contain_in_relevant_findings` and `expected_response_shape`:
- For each `must_not` entry, decide whether the prohibited action (inventing a requirements list, blocking/failing the review for lack of a plan) appears **as an affirmative recommendation**. A negated mention is the correct answer and does not fail.
- Confirm the response matches `expected_response_shape` (no fabrication; no block; `requirements_completeness` null).
- Stage 2 fails if any prohibited action is endorsed, or the shape is wrong.

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
| Completeness miss (explicit gap not P1 / verdict wrong) | Eval 1 Stage 1 must-tier or Stage 2 fails | grading.json eval-1 |
| Over-blocking (inferred gap treated as hard contract) | Eval 2 Stage 2 `keyword_only` | grading.json eval-2 |
| Extraction gap (wrong discovery order / missed R-IDs+units) | Eval 3 Stage 1 must-tier or Stage 2 fails | grading.json eval-3 |
| Fabricated requirements / block on no plan | Eval 4 Stage 2 endorses a prohibited action | grading.json eval-4 `stage_2.passed: false` |
| Variance | Same eval passes some runs, fails others | summary.json `stddev_must_recall >= 0.20` or `runs_passed < 2` |
