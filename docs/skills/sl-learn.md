# `sl-learn`

> Capture a ship-time learning at the close of an autopilot run — invoke `sl-compound` headless against the still-hot session context, commit its learning into the run's open PR, and re-confirm CI green before the loop reports done.

`sl-learn` is the **learning-capture seam** for unattended runs. The autopilot *consumes* learnings — `sl-plan` and `sl-code-review` read `docs/solutions/` — but on its own produces none: when a headless `loop.sh` run solves a real problem and exits at DONE, no human is present to run `/sl-compound`, so the learning evaporates. `sl-learn` closes that gap. It runs **in the same process** as the solving session so `sl-compound` sees the hot context, not just the final diff.

It writes and commits — the one way it diverges from `sl-handoff`'s read-only shape. It is fired by `lfg` after CI reaches green and before DONE; it is not a skill you invoke by hand.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Runs `sl-compound` headless in-session, commits the learning (plus any `CONCEPTS.md` / instruction-file edits) into the run's PR, and re-confirms CI green |
| When to use it | Automatically, by `lfg`, at the close of an autopilot run — not a manual invocation |
| What it produces | A `docs(<scope>):` commit on the PR branch, on a verified-green PR — or a clean skip |
| Skip when | No open PR exists, or the run ended with CI unresolved (the seam self-skips) |

---

## The Problem

Compounding knowledge requires someone to notice a problem was solved and write it down. In an interactive session that someone is the user, invoking `/sl-compound`. In an unattended run there is no such moment — the process solves a gnarly bug, goes green, and exits, and the reasoning that made it hard is gone. A fresh `claude -p` fired after the fact would see only the diff, not the investigation, so it can't reconstruct the learning.

## The Solution

`sl-learn` is a thin, gated wrapper that fires `sl-compound` **while the solving context is still live**. It contributes a permissive signal that a qualifying problem plausibly occurred; `sl-compound`'s own preconditions make the authoritative keep/skip call. The seam then disposes of `sl-compound`'s output: skip cleanly, or stage exactly the files it named and commit them onto the PR.

---

## What Makes It Novel

### 1. Same-process invocation — hot context is the input

`sl-compound` is invoked via the in-session Skill tool, never a fresh `claude -p`. The hot solving context — what was tried, what failed, why the fix works — is precisely what it needs; a new process would only see the diff.

### 2. Two-stage gate — permissive signal, authoritative backstop

Stage 1 (this seam) errs toward proceeding whenever a non-trivial problem *plausibly* occurred, reading in-session signals like a `fix(ci):` commit or review-fix commits. Stage 2 (`sl-compound`'s preconditions) is the real keep/skip authority. A plain feature ship with nothing solved skips without even invoking `sl-compound`.

### 3. Stage exactly the named paths — never `git add -A`

The commit stages only the paths `sl-compound`'s report names: the learning file always, `CONCEPTS.md` only when it was created or updated, the instruction file only when an edit was applied. A blanket `git add -A` would sweep unrelated working-tree residue from earlier `lfg` steps into a misleading learning commit.

### 4. Schema validation before commit

`sl-compound`'s self-check covers parser-safety, not schema. When the target repo gates `docs/solutions/` frontmatter against a validator, `sl-learn` runs it on the new learning and repairs failures first — otherwise a schema-invalid learning would turn the PR red on the learn commit itself.

### 5. Re-confirm green with the immediate-exit-0 caveat

The learn commit re-triggers CI, and `loop.sh` checks `target_ci_green` only once after DONE. So the seam re-watches to green before returning — and explicitly does not trust an immediate exit-0, because right after a push `--watch` can return against the *prior* commit's already-complete checks. It confirms the PR head shows at least one check, all passing, before handing back to `lfg`.

---

## Quick Example

An unattended run fixes a flaky CI job (a `fix(ci):` commit lands, CI goes red→green). At the close, `lfg` fires `sl-learn`. It detects the open PR, sees the `fix(ci):` signal, invokes `sl-compound headless`, which decides the flake root-cause is worth keeping and writes a `docs/solutions/` learning. `sl-learn` validates the frontmatter, stages just that file, commits `docs(ci): capture flaky-job root cause`, pushes, watches the new commit's checks to green, and returns — then `lfg` emits DONE on a verified-green PR.

---

## When to Reach For It

You don't — `lfg` fires it. It exists as a distinct skill so the seam's gates and constraints are versioned and testable independently of the pipeline that calls it.

Reach for `/sl-compound` directly when you're in an interactive session and want to capture a learning yourself.

---

## Use as Part of the Workflow

`sl-learn` is the last step of the `lfg` pipeline, after the CI watch-and-autofix loop reaches green and before DONE. It skips cleanly when there is no PR to commit into or the run ended red, so it never blocks the loop's stop.

---

## See Also

- [`/sl-compound`](./sl-compound.md) — the learning-capture skill this seam invokes headless
- [`lfg`](./lfg.md) — the autopilot that fires this seam at the close of a run
- [`/sl-handoff`](./sl-handoff.md) — the read-only session-carry skill this seam mirrors, minus the commit
