# sl-doc-review HTML-mutation discipline grader

This grader evaluates one narrow assumption: when the document under review is HTML, does sl-doc-review **mutate it safely** — routing to the HTML mechanics, refusing whole-file rewrites, never anchoring across a data-URI line, leaving other agents' fields alone, and preserving id stability while escaping interpolated text? It is NOT a general quality grader for sl-doc-review, and it says nothing about persona selection, synthesis, or routing.

## Inputs to the grader

For each eval run, the grader receives:

1. **The eval definition** from `evals.json` (prompt, expected_terms, tiers, expected_context, ground_truth).
2. **The response text** the with-skill subagent produced for the eval prompt.
3. **(Optional) the full agent transcript** for the run.

## Two-stage grading

### Stage 1 — Programmatic term recall (substring match)

For each entry in `expected_terms`, score 1 if the term (case-insensitive substring) appears in the response, else 0. Aggregate `must_recall` / `should_recall` / `may_recall` by tier.

**Stage 1 pass criterion:** `must_recall == 1.0`. On failure, record and stop — Stage 2 is moot.

### Stage 2 — Decision correctness (LLM-graded)

For each `expected_context` entry, classify the response as:

- **`correct` (1.0)** — right mutation decision AND the contract rationale. Example (eval 2): "No. A filled image slot's `<img>` is a single line of hundreds of KB — reading the file whole to rewrite it floods context and risks truncating the data URI. I locate each target with Grep, read a scoped offset range around it, and apply five targeted Edits anchored on the surrounding markup."
- **`keyword_only` (0.0)** — the term appears but the decision is wrong, hedged, or unexplained. Example: "Data URIs are large, so be careful — but reading and rewriting the file in one pass is fine as long as you preserve the image lines."
- **`absent` (0.0)** — the decision is not addressed.

**Stage 2 pass criterion (all evals):** every `expected_context` entry scores `correct`.

### Stage 2 discriminators

These failures pass Stage 1 on vocabulary alone. The wrong answer in every one of them is the *helpful-sounding* answer — check each explicitly:

| Eval | Fails Stage 2 despite term recall when… |
|------|------------------------------------------|
| 1 | The response applies `open-questions-defer.md`'s markdown mechanics to the HTML doc — a `## Deferred / Open Questions` heading, a `### From …` subsection, or a `- **title**` bullet written into a rendered page. Mentioning `html-mutation.md` and then emitting markdown is `keyword_only`, not `correct`. |
| 2 | The response permits the whole-file read-and-rewrite under any condition ("as long as you're careful", "if you preserve the image lines", "with a large enough context"). The correct answer is an unconditional refusal. |
| 3 | The response updates ANY of the three fields — flips the `[]` marker, appends an Amendments entry, or touches `modified`. Updating one while declining the others is a partial failure: score `keyword_only`. Offering to update them "if the user confirms" is also `keyword_only` — the contract is that review does not own these fields at all. |
| 4 | The response renumbers R4 to R3 (or proposes it as a fix the user might accept), OR writes the finding title without escaping `<` and `&`. Either half failing fails the eval. |

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
| Markdown mechanics applied to a rendered HTML page | Eval 1 Stage 2 `keyword_only` | grading.json eval-1 |
| Whole-file rewrite destroys embedded images / floods context | Eval 2 Stage 2 permits the rewrite | grading.json eval-2 |
| Review writes fields it does not own (marker, Amendments, metadata) | Eval 3 Stage 2 updates any of the three | grading.json eval-3 |
| Id renumber silently invalidates external U-ID references | Eval 4 Stage 2 endorses the renumber | grading.json eval-4 |
| Unescaped interpolation swallows the rest of the element | Eval 4 Stage 2 omits escaping | grading.json eval-4 |
| Variance | Same eval passes some runs, fails others | summary.json `stddev_must_recall >= 0.20` or `runs_passed < 2` |
