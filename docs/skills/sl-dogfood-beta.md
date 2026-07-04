# `sl-dogfood-beta`

> **[BETA]** Dogfood the active branch end-to-end as a QA engineer — diff it against `main`, build an exhaustive browser test matrix of every change, drive the app with `agent-browser`, then auto-fix, add regression tests, and commit until the matrix is green.

`sl-dogfood-beta` is the **pre-ship QA** skill. It acts as a QA engineer who understands every change on the branch, tests each one in a real browser the way a user would, and fixes what's broken — autonomously — until the branch is genuinely ready. It is **diff-scoped**: it tests what *this branch* introduced or modified versus `main`, not the whole app.

Beta skill: `-beta` suffix, `disable-model-invocation: true`, explicit invocation only. For full-app exploratory QA rather than diff-scoped dogfooding, use the separate `dogfood` skill.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Diffs the branch, maps affected user flows, builds a browser test matrix, drives it with `agent-browser`, and fixes failures until green |
| When to use it | A hands-off "test everything we just built and make it actually work" pass before shipping a branch |
| What it produces | A durable report under `docs/dogfood-reports/`, regression tests, and a commit per fix |
| Skip when | The branch is `main`/`master` (no diff to dogfood), or you want whole-app QA (use `dogfood`) |

---

## The Problem

Tests pass, the diff looks right — and the feature still breaks the moment a user clicks through it. Unit tests don't exercise real user journeys, and manually clicking through every path a branch touched is tedious enough that it gets skipped right before shipping, exactly when it matters most.

## The Solution

`sl-dogfood-beta` orchestrates a full QA pass: it reads the branch diff to understand every change, derives the user journeys those changes affect, turns them into a test matrix, and drives a real browser through each item. On any failure it fixes the root cause, adds a regression test, and commits — looping until the matrix is green. It delegates the mechanics to existing skills rather than re-deriving them.

---

## What Makes It Novel

### 1. Diff-scoped, not whole-app

The matrix covers exactly what changed versus `main` — new features, modified behavior, new routes and components — as full user journeys, not isolated feature checks. It refuses to run on the trunk, where there's no diff to test.

### 2. Flows-then-matrix mapping

It maps affected user flows as Mermaid flowcharts first, then derives the test matrix from them. Grounding the matrix in real journeys catches the between-steps breakage a feature-by-feature checklist misses.

### 3. Fix loop with regression tests

A failure isn't just logged — it's fixed, covered by a new regression test, and committed, one item at a time. The branch gets better as the matrix is worked, and the fixes stay fixed.

### 4. Resumable via a durable report

The report doc under `docs/dogfood-reports/<date>-<branch>-dogfood.md` is created as soon as the matrix exists and updated incrementally, so a later run (or a teammate) can re-hydrate the task list and pick up exactly where the last one stopped. The session task list is the live to-do; the report on disk is the source of truth for resuming.

### 5. `agent-browser` exclusively

All browser automation goes through the `agent-browser` CLI (the fast direct Rust binary) — never Chrome MCP or other browser-control tools — for consistent, scriptable drives.

### 6. Delegates to compound-engineering skills

It's an orchestrator: `sl-worktree` for isolation, `sl-setup` to install `agent-browser`, `sl-debug` for non-obvious root causes, `sl-commit` for each fix, `sl-compound` when a bug reveals a reusable lesson, and `sl-test-browser`'s mechanics for port detection and dev-server startup.

---

## Quick Example

`/sl-dogfood-beta` on a branch that added a checkout coupon field. It offers to run in a worktree, diffs against `main`, maps the checkout flow as a Mermaid chart, and builds a matrix: valid coupon, expired coupon, empty field, stacked coupons. Driving `agent-browser`, it finds the expired-coupon path throws instead of showing an error, fixes the handler, adds a regression test, commits, and continues until every matrix row passes — then writes the verdict into the report doc.

---

## When to Reach For It

Reach for it when:

- You've finished building on a branch and want a thorough, hands-off "does it actually work for a user" pass before opening or merging a PR
- You want the QA pass to fix what it finds, not just report it

Skip it when:

- You're on `main`/`master` with no branch diff to test
- You want whole-app exploratory QA rather than change-scoped dogfooding — use `dogfood`

---

## See Also

- [`/sl-test-browser`](./sl-test-browser.md) — the browser-test skill whose port-detection and dev-server mechanics this reuses
- [`/sl-worktree`](./sl-worktree.md) — the isolation step it offers in Phase 0
- [`/sl-debug`](./sl-debug.md) — systematic root-cause analysis for non-obvious failures
- [`/sl-setup`](./sl-setup.md) — installs `agent-browser` and other dependencies
