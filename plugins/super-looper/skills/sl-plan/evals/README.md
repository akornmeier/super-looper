# sl-plan HTML-artifact discipline eval suite

## Purpose

Validate one narrow load-bearing assumption: **sl-plan's HTML output path produces a stamped, stateful plan artifact.** It stamps the canonical template instead of composing free-form, authors image-slot prompts without ever writing image bytes, completes the plan when no API key is present, preserves the append-only / marker / image regions on resume, and still forces markdown in pipeline mode.

These are the properties everything downstream leans on. `sl-work`'s marker contract greps the template's section headings and `<code class="status">` markers. The goal guard depends on pipeline runs never producing an HTML plan whose markers an unattended executor might touch. And the living-artifact layer only works if a resume appends rather than regenerates.

The suite is narrowly scoped. It does not evaluate research phases, brainstorm routing, the approach-altitude gate, deepening sub-agent dispatch, the universal-planning carve-out, the confidence check, or markdown-mode composition quality.

## Files

| File | Purpose |
|------|---------|
| `evals.json` | Scenario prompts, expected contract vocabulary by criticality tier, expected decisions, and ground-truth pointers into `sl-plan/SKILL.md` and `references/html-plan-template.md` |
| `grader.md` | Two-stage rubric — programmatic substring recall + LLM decision-correctness — with per-eval discriminators, aggregate metrics, and risk attribution |
| `README.md` | This file |

## Test cases at a glance

| # | Name | Risk tested | Ground truth |
|---|------|-------------|--------------|
| 1 | html-mode-stamps-template | Free-form drift | SKILL.md Phase 0.0 (template load) + Phase 5.2 stamp block; template authoring rules + post-stamp checklist |
| 2 | slot-prompt-authoring-not-image-bytes | Model writes image bytes | SKILL.md Phase 5.2 "Image slot prompts"; template image-slot grammar + prompt rules |
| 3 | no-key-plan-still-completes | Image failure blocks the plan | SKILL.md Phase 5.2b gating + "Failures never block" |
| 4 | resume-preserves-stateful-regions | Resume rewrites the living artifact | SKILL.md Phase 0.1 "HTML plans are stateful tracked artifacts" + post-run sync; template metadata field rules |
| 5 | pipeline-mode-still-forces-markdown | HTML leaks into the unattended pipeline | SKILL.md Phase 0.0 pipeline override + Phase 5.2 / 5.2b restatements |

## Design rationale

- **Eval 1** is the core create-path behavior. A baseline agent without the template reference writes plausible HTML that no downstream grep anchor matches.
- **Eval 2** pressures the most expensive failure mode: an agent that helpfully tries to produce the image itself, routing hundreds of KB of base64 through model context.
- **Eval 3** tests graceful degradation. The tempting wrong answers are "error out" and "ask the user for a key" — both block a plan that is already complete.
- **Eval 4** covers the living-artifact invariant across all four preserved regions at once (metadata lists, markers, filled slots, Amendments). It deliberately hands the agent a `[wip]` marker to tidy and a filled image to re-stamp.
- **Eval 5** is the safety boundary. HTML in a pipeline run is the one path where sl-work's write-suppression gate and the goal guard's checksum become load-bearing. It pairs with `sl-work`'s `unattended-html-zero-write` eval.

## How to run (framework-driven — NOT part of `bun test`)

**This suite is not executed by the automated test pipeline.** `bun test` checks only the suite's *shape* (`tests/skill-evals-shape.test.ts`). Executing the scenarios end-to-end runs through the **skill-creator workflow** and is a manual / follow-up step — the AGENTS.md-mandated path for behavioral validation, because plugin prose caches at session start and a fresh dispatch that injects the current `sl-plan/SKILL.md` from disk is required.

To run it:

1. Invoke `/skill-creator` and use its eval workflow against this directory.
2. **Workspace location:** `/tmp/super-looper/sl-plan/evals/iteration-<N>/`.
3. **One subagent dispatch per eval x per run** (15 dispatches at `runs_per_eval: 3` x 5 evals). Each writes `response.txt` under `<workspace>/iteration-<N>/eval-<ID>-<name>/run-<R>/`.
4. **Injected context.** Each dispatch must carry `sl-plan/SKILL.md` **and** `references/html-plan-template.md` — evals 1, 2, and 4 depend on rules that live in the template reference, which SKILL.md only loads on the HTML path.
5. **Grading.** A grader subagent applies `grader.md`'s two-stage rubric, writing `grading.json` per run and `summary.json` per eval.
6. **Viewer (optional).** Run the skill-creator eval viewer against the workspace iteration directory.

Baseline (without-skill) runs are optional and weak signal here — a plain agent lacking the template contract will not reproduce the stamping discipline; pass/fail comes from decision-correctness grading against pinned ground truth.

## Ground truth caveats

- Ground truth is pinned to `sl-plan/SKILL.md` and `references/html-plan-template.md` line regions as of this suite's authoring. Re-pin `ground_truth.contract_lines` if that prose is revised.
- A miss on `should`/`may` terms alone (e.g., the exact phrase "composition-signal") is weaker signal than a `must`-tier or Stage-2 decision failure — the agent may make the right call without reciting every phrase.
- Evals 1 and 4 overlap on the template's structural vocabulary by design: eval 1 pins it at create time, eval 4 pins that a revision does not disturb it.
