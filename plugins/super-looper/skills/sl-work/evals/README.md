# sl-work plan-scope authority eval suite

## Purpose

Validate one narrow load-bearing assumption: **sl-work in mode:unattended treats the plan as authoritative scope.** It resolves ambiguity from the plan's stated scope (not by asking a human who isn't there, and not by inventing an answer), honors the plan's `Scope Boundaries` non-goals, does not invent scope, and respects the plan-write contract's format split.

This is exactly the property lfg relies on when it hands sl-work a plan with `mode:unattended`. If sl-work fabricates scope to fill a plan gap, or drifts into "obviously good" adjacent work, the unattended pipeline silently ships something the plan never authorized.

**The format split.** Markdown plans are decision artifacts and are never mutated. HTML plans are stateful tracked artifacts whose unit tasks carry advisory status markers (`[]` / `[wip]` / `[x]` / `[f]`) — but sl-work writes those markers *only* when the plan is `.html` **and** the session is interactive **and** execution is single-writer. Every other mode writes zero bytes to the plan file. Evals 3 and 5 pin the two halves of that rule; the suite's original blanket "does not edit the plan body" expectation was revised into eval 3 when HTML plans gained the marker layer.

The suite is narrowly scoped. It does not evaluate subagent-dispatch strategy, the parallel-safety check, test discovery, commit heuristics, or general execution quality.

## Files

| File | Purpose |
|------|---------|
| `evals.json` | Scenario prompts, expected contract vocabulary by criticality tier, expected decisions, and ground-truth pointers into `sl-work/SKILL.md` |
| `grader.md` | Two-stage rubric — programmatic substring recall + LLM decision-correctness — with per-run + aggregate metrics and risk attribution |
| `README.md` | This file |

## Test cases at a glance

| # | Name | Risk tested | Ground truth (sl-work/SKILL.md) |
|---|------|-------------|----------------------------------|
| 1 | unattended-resolves-from-plan-not-clarify | Scope invention | Phase 1 Pipeline mode block + step 1 clarify carve-out |
| 2 | scope-boundaries-non-goal | Scope creep | Phase 1 step 1 — Scope Boundaries are explicit non-goals |
| 3 | plan-is-scope-not-rescope | Re-scope / plan-body edit / format split | Step 1 markdown immutability + HTML advisory markers + Common Pitfalls (human-time re-scoping) |
| 4 | no-fabricated-branch-or-scope | Unattended overreach (negative) | Pipeline mode block — do not create a branch; resolve from stated scope |
| 5 | unattended-html-zero-write | Goal-guard abort (unattended plan write) + orphaned subagents | Phase 2 write-suppression gate; post-subagent `TaskStop` release hook |

## Design rationale

- **Eval 1** is the core unattended behavior: resolve from the plan, don't stall and don't fabricate. A baseline agent without the pipeline-mode block either waits for a human or guesses.
- **Eval 2** pressures the agent with a beneficial-but-excluded change (caching). A pass shows Scope Boundaries is read as binding, not advisory.
- **Eval 3** covers three ways plan authority erodes: editing a markdown plan's body, re-scoping units into human-time phases, and misreading the HTML marker layer as blanket permission to edit. Its third question is the discriminator — an unqualified "yes, HTML plans are editable" fails, because the interactive + single-writer conditions are the load-bearing half of the split.
- **Eval 4** is the negative/discriminating case: "fewer prompts under unattended" must not be misread as "more autonomy to branch and expand scope." Graded by endorsement.
- **Eval 5** is **load-bearing**, not a nicety. In seed mode — a bare `mode:unattended` invocation with no loop driver in front of it — sl-work's own Phase 2 gate is the *only* guard against a plan write. Under `loop.sh` the goal guard's sha256 check does catch a mutation, but only by aborting the run (exit 8, `typed_failure: "goal-drift"`), which is a failure and not a save. This eval is what makes the HTML plan format safe to hand to lfg. It pairs with `sl-plan`'s `pipeline-mode-still-forces-markdown` eval, which keeps HTML plans out of the pipeline in the first place.

  Its trailing question walks the gate's *other* suppressed arm — a parallel subagent batch fails condition 3 (single-writer) on its own, independent of `mode:unattended` — and picks up the post-subagent `TaskStop` release rule while it is there. That rule is graded should-tier: an accepted, committed subagent left unreleased idles indefinitely and shows as incomplete in the UI. It rides along on eval 5 rather than earning its own scenario, since the suite otherwise does not test subagent dispatch.

## How to run (framework-driven — NOT part of `bun test`)

**This suite is not executed by the automated test pipeline.** `bun test` checks only the suite's *shape* (`tests/skill-evals-shape.test.ts`). Executing the scenarios end-to-end runs through the **skill-creator workflow** and is a manual / follow-up step — the AGENTS.md-mandated path for behavioral validation, because plugin prose caches at session start and a fresh dispatch that injects the current `sl-work/SKILL.md` from disk is required.

To run it:

1. Invoke `/skill-creator` and use its eval workflow against this directory.
2. **Workspace location:** `/tmp/super-looper/sl-work/evals/iteration-<N>/`.
3. **One subagent dispatch per eval x per run** (15 dispatches at `runs_per_eval: 3` x 5 evals). Each writes `response.txt` under `<workspace>/iteration-<N>/eval-<ID>-<name>/run-<R>/`.
4. **Grading.** A grader subagent applies `grader.md`'s two-stage rubric, writing `grading.json` per run and `summary.json` per eval.
5. **Viewer (optional).** Run the skill-creator eval viewer against the workspace iteration directory.

Baseline (without-skill) runs are optional and weak signal here — a plain agent lacking the sl-work contract will not reproduce the unattended scope discipline; pass/fail comes from decision-correctness grading against pinned ground truth.

## Ground truth caveats

- Ground truth is pinned to `sl-work/SKILL.md` contract lines as of this suite's authoring. Re-pin `ground_truth.contract_lines` if that prose is revised.
- A miss on `should`/`may` terms alone (e.g., the exact phrase "decision artifact") is weaker signal than a `must`-tier or Stage-2 decision failure — the agent may make the right call without reciting every phrase.
