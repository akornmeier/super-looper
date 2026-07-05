# sl-code-review plan-requirements-completeness eval suite

## Purpose

Validate one narrow load-bearing assumption: **sl-code-review verifies plan-requirements completeness in Stage 6.** Given a plan (an explicit `plan:` argument or a discovered one), it reports per-requirement and per-unit met / not-addressed / partial, routes explicit-plan gaps to P1 `downstream-resolver` findings and inferred-plan gaps to P3 advisory, reflects unaddressed requirements in the verdict, and — with no plan — neither fabricates requirements nor blocks the review.

This is the input lfg distills into its `goal_fidelity` verdict (lfg step 5 derives `met` / `partial` / `drifted` from the `requirements_completeness` result). If the completeness check is wrong — an explicit gap under-routed, an inferred gap over-blocked, or requirements hallucinated when no plan exists — the goal-fidelity signal downstream is wrong too.

The suite is narrowly scoped. It does not evaluate reviewer selection, finding merge/dedup, the validation pass, apply behavior, or general review quality.

## Files

| File | Purpose |
|------|---------|
| `evals.json` | Scenario prompts, expected contract vocabulary by criticality tier, expected decisions, and ground-truth pointers into `sl-code-review/SKILL.md` |
| `grader.md` | Two-stage rubric — programmatic substring recall + LLM decision-correctness — with per-run + aggregate metrics and risk attribution |
| `README.md` | This file |

## Test cases at a glance

| # | Name | Risk tested | Ground truth (sl-code-review/SKILL.md) |
|---|------|-------------|-----------------------------------------|
| 1 | explicit-plan-completeness | Completeness miss | Stage 6 step 4 (explicit -> P1 downstream-resolver) + Verdict |
| 2 | inferred-plan-advisory | Over-blocking | Stage 6 step 4 (inferred -> P3 advisory, human) + Verdict |
| 3 | plan-discovery-and-extraction | Extraction gap | Stage 2b plan discovery (priority order, R-IDs + units, additive) |
| 4 | no-plan-no-fabrication | Fabricated requirements (negative) | Stage 2b additive rule + Stage 6 "include only when a plan was found" + JSON null |

## Design rationale

- **Evals 1 and 2 are the explicit-vs-inferred pair.** They pin the routing that distinguishes a binding requirement gap (P1, into the actionable queue, verdict Not ready) from a hint (P3 advisory, human-owned, non-blocking). Getting these backwards is the most consequential failure — it directly corrupts the goal-fidelity input.
- **Eval 3** checks the input side: priority-ordered discovery and extraction of R-IDs and Implementation Units, with the additive guarantee (no plan is not an error).
- **Eval 4** is the negative/discriminating case: the additive contract must hold — absence of a plan is neither an error nor an invitation to hallucinate requirements, and `requirements_completeness` is null. Graded by endorsement.

## How to run (framework-driven — NOT part of `bun test`)

**This suite is not executed by the automated test pipeline.** `bun test` checks only the suite's *shape* (`tests/skill-evals-shape.test.ts`). Executing the scenarios end-to-end runs through the **skill-creator workflow** and is a manual / follow-up step — the AGENTS.md-mandated path for behavioral validation, because plugin prose caches at session start and a fresh dispatch that injects the current `sl-code-review/SKILL.md` from disk is required.

To run it:

1. Invoke `/skill-creator` and use its eval workflow against this directory.
2. **Workspace location:** `/tmp/super-looper/sl-code-review/evals/iteration-<N>/`.
3. **One subagent dispatch per eval x per run** (12 dispatches at `runs_per_eval: 3` x 4 evals). Each writes `response.txt` under `<workspace>/iteration-<N>/eval-<ID>-<name>/run-<R>/`.
4. **Grading.** A grader subagent applies `grader.md`'s two-stage rubric, writing `grading.json` per run and `summary.json` per eval.
5. **Viewer (optional).** Run the skill-creator eval viewer against the workspace iteration directory.

Baseline (without-skill) runs are optional and weak signal — a plain agent lacking the Stage 6 routing rules will not reproduce the explicit-vs-inferred distinction; pass/fail comes from decision-correctness grading against pinned ground truth.

## Ground truth caveats

- Ground truth is pinned to `sl-code-review/SKILL.md` contract lines as of this suite's authoring. Re-pin `ground_truth.contract_lines` if Stage 2b or Stage 6 is revised.
- A miss on `should`/`may` terms alone (e.g., the exact string "downstream-resolver") is weaker signal than a `must`-tier or Stage-2 decision failure — the agent may make the right routing call while wording the owner differently.
