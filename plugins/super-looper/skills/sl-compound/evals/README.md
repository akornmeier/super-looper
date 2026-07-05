# sl-compound track-routing & schema-valid-frontmatter eval suite

## Purpose

Validate one narrow load-bearing assumption: **sl-compound classifies the correct track (bug vs knowledge) and writes track-appropriate, schema-valid frontmatter.** Specifically, it derives the track from `problem_type`, applies bug-track required fields (`symptoms`, `root_cause`, `resolution_type`) vs knowledge-track optional fields, routes to the correct `docs/solutions/` category directory, and refuses to force cross-track fields or invent enum values / categories from memory.

This matters because two consumers depend on it: the schema validator (`src/solutions/validate`) rejects malformed frontmatter, and `sl-learnings-researcher` retrieves by frontmatter fields. A mis-tracked or field-forced doc either fails validation or is retrieved with the wrong shape.

The suite is narrowly scoped. It does not evaluate overlap detection, CONCEPTS.md vocabulary capture (Phase 2.4), subagent orchestration, the Discoverability Check, or the interactive What's-next menu.

## Files

| File | Purpose |
|------|---------|
| `evals.json` | Scenario prompts, expected contract vocabulary by criticality tier, expected decisions, and ground-truth pointers into `sl-compound/SKILL.md` and `references/schema.yaml` |
| `grader.md` | Two-stage rubric — programmatic substring recall + LLM decision-correctness — with per-run + aggregate metrics and risk attribution |
| `README.md` | This file |

## Test cases at a glance

| # | Name | Risk tested | Ground truth |
|---|------|-------------|--------------|
| 1 | bug-track-routing | Mis-track | SKILL.md bug-track fields + schema.yaml tracks.bug + test-failures/ |
| 2 | knowledge-track-routing | Mis-track | SKILL.md knowledge-track fields + schema.yaml tracks.knowledge + conventions/ |
| 3 | schema-valid-frontmatter | Invalid frontmatter | schema.yaml required_fields + validation_rules (enum + YAML-safety) |
| 4 | no-cross-track-field-forcing | Field forcing (negative) | SKILL.md classify step — no forced fields, no invented enums |

## Design rationale

- **Evals 1 and 2 are mirror cases** across the track boundary. Eval 1's discriminator is the bug-track required trio; eval 2's is the must-tier "optional" — a mis-track calls knowledge-track symptoms/root_cause required.
- **Eval 3** checks the schema contract is recalled, not improvised: the five shared-required fields, exact-enum discipline, and the YAML-safety array-quoting rule that strict parsers depend on.
- **Eval 4** is the negative/discriminating case, targeting the two anti-patterns the classify step explicitly forbids (forcing bug fields onto knowledge docs; inventing enum values or categories). Graded by endorsement.

## How to run (framework-driven — NOT part of `bun test`)

**This suite is not executed by the automated test pipeline.** `bun test` checks only the suite's *shape* (`tests/skill-evals-shape.test.ts`). Executing the scenarios end-to-end runs through the **skill-creator workflow** and is a manual / follow-up step — the AGENTS.md-mandated path for behavioral validation, because plugin prose caches at session start and a fresh dispatch that injects the current `sl-compound/SKILL.md` (and `references/schema.yaml`) from disk is required.

To run it:

1. Invoke `/skill-creator` and use its eval workflow against this directory.
2. **Workspace location:** `/tmp/super-looper/sl-compound/evals/iteration-<N>/`.
3. **One subagent dispatch per eval x per run** (12 dispatches at `runs_per_eval: 3` x 4 evals). Because these scenarios reference `references/schema.yaml`, pass the schema file contents into the dispatch prompt alongside the SKILL.md content so the subagent can classify without a cross-skill path. Each writes `response.txt` under `<workspace>/iteration-<N>/eval-<ID>-<name>/run-<R>/`.
4. **Grading.** A grader subagent applies `grader.md`'s two-stage rubric, writing `grading.json` per run and `summary.json` per eval.
5. **Viewer (optional).** Run the skill-creator eval viewer against the workspace iteration directory.

Baseline (without-skill) runs are optional: a plain agent lacking the schema will not reproduce exact enum/track routing; pass/fail comes from decision-correctness grading against the pinned schema ground truth.

## Ground truth caveats

- Ground truth is pinned to `sl-compound/SKILL.md` and `references/schema.yaml` as of this suite's authoring. `references/schema.yaml` is a GENERATED file (source of truth: `src/solutions/schema.ts`); if the enums or track rules change there, re-pin `ground_truth.contract_lines` before trusting a run.
- A miss on `should`/`may` terms alone (e.g., the exact directory string "test-failures/") is weaker signal than a `must`-tier or Stage-2 decision failure.
