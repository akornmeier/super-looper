# sl-doc-review HTML-mutation discipline eval suite

## Purpose

Validate one narrow load-bearing assumption: **sl-doc-review mutates an HTML document safely.**

Review itself is format-agnostic — persona selection, synthesis, confidence anchors, and routing are identical whether the document is markdown or HTML. **Mutation is not.** An HTML plan carries embedded image bytes on single lines that can run to hundreds of kilobytes, id-anchored cross-references, and fields that other agents own. The same edit that would produce a visibly wrong line in markdown silently destroys an image, breaks a link, or claims work that never shipped.

The suite pins the five behaviors that make an HTML mutation as safe as a markdown one: routing to the HTML mechanics on the `.html` extension, refusing whole-file rewrites, never anchoring across a data-URI line, leaving other agents' fields alone (status markers, append-only metadata, Amendments), and preserving id stability while escaping interpolated text.

It does not evaluate persona selection, confidence anchoring, dedup, cross-persona promotion, routing tiers, the walk-through menu, or headless-envelope formatting — all unchanged by HTML support.

## Files

| File | Purpose |
|------|---------|
| `evals.json` | Scenario prompts, expected contract vocabulary by criticality tier, expected decisions, and ground-truth pointers into `sl-doc-review/SKILL.md` and `references/html-mutation.md` |
| `grader.md` | Two-stage rubric — programmatic substring recall + LLM decision-correctness — with per-eval discriminators and risk attribution |
| `README.md` | This file |

## Test cases at a glance

| # | Name | Risk tested | Ground truth |
|---|------|-------------|--------------|
| 1 | html-doc-routes-to-html-mutation | Markdown mechanics applied to an HTML page | SKILL.md Phase 1 "Document format"; `html-mutation.md` Defer flow; `open-questions-defer.md` markdown-only gate |
| 2 | refuses-to-rewrite-file-wholesale | A whole-file rewrite destroys embedded images | `html-mutation.md` "Never edit across a data-URI line" |
| 3 | does-not-touch-other-agents-fields | Review writes fields it does not own | `html-mutation.md` "What review may never touch" |
| 4 | preserves-ids-and-escapes-text | Id renumber breaks anchors; unescaped `<` breaks the page | `html-mutation.md` "Preserve ids" + "Escape interpolated text" |

## Design rationale

- **Eval 1** is the routing behavior everything else depends on. The tempting wrong answer is to reach for `open-questions-defer.md` — the file that has always handled Defer — and emit `##` headings and `- **bold**` bullets into a rendered page, where they show up as literal punctuation.
- **Eval 2** pressures the most expensive failure mode, and does so with an argument *for* the wrong answer ("to make the edits efficiently"). Five fixes across five sections is exactly when a whole-file rewrite feels like the tidy choice; the 4 MB of base64 is why it is not.
- **Eval 3** hands the agent three genuinely tempting writes — a stale marker, a missing Amendments entry, a stale `modified` list — each of which *looks* like leaving the document better than it found it. All three belong to other flows. Helpfulness is the failure mode here.
- **Eval 4** pairs the two quiet corrupters. A renumber looks like a cleanup and breaks every external U-ID reference; an unescaped `<` in a finding title looks like nothing at all until the page renders and the rest of the element vanishes. The prompt's title (`Guard <script> & iframe embeds`) carries both hazards deliberately.

## How to run (framework-driven — NOT part of `bun test`)

**This suite is not executed by the automated test pipeline.** `bun test` checks only the suite's *shape* (`tests/skill-evals-shape.test.ts`). Executing the scenarios end-to-end runs through the **skill-creator workflow** — the AGENTS.md-mandated path for behavioral validation, because plugin prose caches at session start and a fresh dispatch that injects the current source from disk is required.

To run it:

1. Invoke `/skill-creator` and use its eval workflow against this directory.
2. **Workspace location:** `/tmp/super-looper/sl-doc-review/evals/iteration-<N>/`.
3. **One subagent dispatch per eval × per run** (12 dispatches at `runs_per_eval: 3` × 4 evals). Each writes `response.txt` under `<workspace>/iteration-<N>/eval-<ID>-<name>/run-<R>/`.
4. **Injected context.** Each dispatch must carry `sl-doc-review/SKILL.md` **and** `references/html-mutation.md`. Eval 1 additionally depends on `references/open-questions-defer.md` — its whole point is that the agent picks the right one of the two.
5. **Grading.** A grader subagent applies `grader.md`'s two-stage rubric, writing `grading.json` per run and `summary.json` per eval.

Baseline (without-skill) runs are weak signal here: a plain agent lacking the mutation contract will cheerfully rewrite the file wholesale. Pass/fail comes from decision-correctness grading against pinned ground truth.

## Ground truth caveats

- Ground truth is pinned to `sl-doc-review/SKILL.md` and `references/html-mutation.md` as of this suite's authoring. Re-pin `ground_truth.contract_lines` if that prose is revised.
- A miss on `should`/`may` terms alone is weaker signal than a `must`-tier or Stage-2 decision failure — the agent may make the right call without reciting every phrase.
- Evals 2 and 4 both fail "safely" in a way that is invisible without rendering the document. Stage-2 grading, not substring recall, is the real signal for both.
