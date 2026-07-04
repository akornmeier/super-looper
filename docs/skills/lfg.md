# `lfg`

> Run the full autonomous engineering pipeline end-to-end — plan, work, simplify, review, test, commit, push, open PR, watch CI, fix failures until green, capture learnings — without stopping to ask.

`lfg` is the **autopilot** skill: the single entry point that chains the whole super-looper loop into one hands-off run. Given a feature description (or a pre-written plan), it produces a verified plan, implements against it, simplifies and reviews the diff, runs browser tests, opens a PR, and babysits CI to green — narrating progress but never blocking for input. It is the skill `loop.sh` drives for unattended runs.

`lfg` is one of the three legacy unprefixed skills (with `file-todos` and `every-style-editor`); it predates the `sl-` naming rule and is pinned as an allowed exception.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Executes the entire engineering pipeline (plan → work → simplify → review → residual handoff → browser test → commit/push/PR → CI autofix → learn) in one autonomous pass |
| When to use it | When you explicitly want hands-off execution of a software task and can supply a feature description or a plan path |
| What it produces | An open PR on a green CI, plus any captured learning committed into it |
| Skip when | You want to stay in the loop step-by-step, or the task isn't a software change |

---

## The Problem

The super-looper loop is a sequence of skills — `sl-plan`, `sl-work`, `sl-code-review`, `sl-commit-push-pr`, and more — each strong on its own but requiring a human to carry state between them: run one, read its output, decide the next, invoke it, repeat. For an unattended run (a `loop.sh` process launching `claude -p` with no one watching), there is no human to do that carrying, and no human to answer the clarifying prompts each skill would normally raise.

## The Solution

`lfg` encodes the ordered pipeline as a single skill with **hard gates between steps** and an **autopilot contract**: it never pauses to ask. Each step verifies its own precondition (a plan exists, code actually changed, review findings were applied) before the next begins, and interactive prompts in the child skills are suppressed via mode tokens (`mode:unattended`, `mode:agent`, `mode:pipeline`, `mode:headless`).

---

## What Makes It Novel

### 1. Two entry modes — description or plan-input

`$ARGUMENTS` is either a bare feature description (description mode → run `sl-plan` first) or a `plan:<path>` marker (plan-input mode → skip planning, execute the supplied plan). Plan-input mode applies a **hard gate**: the path must resolve to an actual plan document (plan frontmatter or an "Implementation Units" heading, in `.md` or `.html`) or the run stops with a clear error — there is no silent fallback to planning.

### 2. Ordered steps with STOP gates

Every step verifies the prior one produced real output before proceeding: a written plan must exist before work; files must have changed before review; eligible review fixes must be committed before the residual handoff. Violating the order is what produces bad autonomous output, so the gates are mechanical, not advisory.

### 3. Report-only review, LFG-applied fixes

Review runs as `mode:agent` — report-only by design. `lfg` then applies the eligible findings itself in the next step. This "review found X → applied X" split is the intended contract, not a gap; framing it as "review didn't auto-fix" misreads the design.

### 4. Autonomous residual handoff

Actionable findings that can't be safely auto-applied become durable without a prompt: filed to the issue tracker when one exists, otherwise recorded in the PR body or a pushed fallback file under `docs/residual-review-findings/`. DONE is never emitted while a residual lives only in the working tree.

### 5. CI watch-and-autofix loop

After the PR opens, `lfg` watches CI and, for up to three iterations, pulls failing logs, fixes, and re-pushes until checks pass — the same babysitting a human would otherwise do.

### 6. Learn at the close

Once CI is green and before DONE, `lfg` invokes the `sl-learn` seam so an unattended run captures what it learned into the run's PR instead of dropping it.

---

## Quick Example

`/lfg add a rate limiter to the public API`. `lfg` runs `sl-plan` to write and verify a plan, `sl-work` to implement it, `sl-simplify-code` on the diff, `sl-code-review` in agent mode, applies the safe findings, files the rest, runs `sl-test-browser`, opens a PR via `sl-commit-push-pr`, watches CI, fixes the one failing lint job, re-confirms green, captures a learning through `sl-learn`, and reports DONE.

---

## When to Reach For It

Reach for `lfg` when:

- You want a software task taken from description to green PR without supervising each step
- You're driving an unattended `loop.sh` run and need the full pipeline in one invocation

Skip it when:

- You want to review and steer between steps — invoke the individual skills (`/sl-plan`, `/sl-work`, …) directly
- The task isn't a software change — `lfg` gates to software tasks and stops otherwise

---

## Use as Part of the Workflow

`lfg` is the orchestrator that composes the rest of the catalog. It is surfaced at the end of `/sl-plan` (which offers a ready-to-run `loop.sh` command) and consumes `sl-handoff` output to carry planning context into a fresh process.

---

## See Also

- [`/sl-plan`](./sl-plan.md) — produces the plan `lfg` executes, and offers the loop command
- [`/sl-work`](./sl-work.md) — the implementation step inside the pipeline
- [`/sl-code-review`](./sl-code-review.md) — the `mode:agent` review step
- [`/sl-commit-push-pr`](./sl-commit-push-pr.md) — the commit/push/PR step
- [`/sl-handoff`](./sl-handoff.md) — carries planning-dialogue context into an unattended run
- [`/sl-learn`](./sl-learn.md) — the ship-time learning seam `lfg` fires before DONE
