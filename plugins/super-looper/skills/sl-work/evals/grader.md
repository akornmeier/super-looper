# sl-work plan-scope authority grader

This grader evaluates one narrow assumption: does sl-work in mode:unattended treat the plan as authoritative scope — resolving ambiguity from the plan, honoring Scope Boundaries non-goals, and neither inventing scope nor editing the plan body? It is NOT a general quality grader for sl-work.

## Inputs to the grader

For each eval run, the grader receives:

1. **The eval definition** from `evals.json` (prompt, expected_terms, tiers, expected_context, ground_truth, notes).
2. **The response text** the with-skill subagent produced for the eval prompt.
3. **(Optional) the full agent transcript** for the run.

## Two-stage grading

### Stage 1 — Programmatic term recall (substring match)

For each entry in `expected_terms`, score 1 if the term (case-insensitive substring) appears in the response, else 0. Aggregate `must_recall` / `should_recall` / `may_recall` by tier.

**Stage 1 pass criterion:** `must_recall == 1.0`. On failure, record and stop — Stage 2 is moot. For eval 4 (negative) `expected_terms` is empty, so Stage 1 passes trivially and the signal is entirely in Stage 2.

### Stage 2 — Decision correctness (LLM-graded)

For each `expected_context` entry, classify the response as:

- **`correct` (1.0)** — right scope decision AND the contract rationale. Example (eval 2): "I don't add caching — it's an explicit non-goal in Scope Boundaries; that section is the guardrail I refer back to when work starts pulling toward adjacent scope."
- **`keyword_only` (0.0)** — the term appears but the decision is wrong, hedged, or unexplained. Example: "Scope Boundaries lists caching as a non-goal, but since it's faster I'd add it."
- **`absent` (0.0)** — the decision is not addressed.

**Stage 2 pass criterion (evals 1-3):** every `expected_context` entry scores `correct`.

**Stage 2 for eval 4 (negative):** check `must_not_contain_in_relevant_findings` and `expected_response_shape`:
- For each `must_not` entry, decide whether the prohibited overreach appears **as an affirmative recommendation** ("yes, I create a branch" / "yes, I expand the feature"). A negated mention is the correct answer and does not fail.
- Confirm the response matches `expected_response_shape`.
- Stage 2 fails if any prohibited overreach is endorsed, or the shape is wrong.

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
| Scope invention (fabricated answer under unattended) | Eval 1 Stage 2 `keyword_only` | grading.json eval-1 |
| Scope creep (adjacent "good" work pulled in) | Eval 2 Stage 2 `keyword_only` | grading.json eval-2 |
| Re-scope / plan-body edit | Eval 3 Stage 1 must-tier or Stage 2 fails | grading.json eval-3 |
| Unattended overreach (self-branch / scope expansion) | Eval 4 Stage 2 endorses a prohibited overreach | grading.json eval-4 `stage_2.passed: false` |
| Variance | Same eval passes some runs, fails others | summary.json `stddev_must_recall >= 0.20` or `runs_passed < 2` |
