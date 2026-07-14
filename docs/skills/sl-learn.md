# `sl-learn`

> Compatibility learning seam for the legacy `lfg` pipeline — invoke `sl-compound` headless against the still-hot session context, evaluate the result, and commit accepted learnings to the run's PR. Use only when legacy `lfg` fires ship-time learning; new `sl-run` workflows use their typed evidence closeout instead.

`sl-learn` is **compatibility-only for the legacy `lfg` pipeline**. It does not run on new `sl-run` workflows, which build a durable closeout packet, treat `no-learning` as a normal outcome, and record evidence through their own kernel without depending on hot transcript context.

When legacy `lfg` invokes learning at ship-time, `sl-learn` captures what was learned by running `sl-compound` headless in the same process — so the hot solving context is available — evaluates the result independently, and commits accepted learnings into the run's PR. It writes and commits — the one way it diverges from `sl-handoff`'s read-only shape. It is fired by `lfg` (mode:legacy-pipeline) after CI reaches green and before DONE; it is not a skill you invoke by hand.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Runs `sl-compound` headless in-session, commits the learning (plus any `CONCEPTS.md` / instruction-file edits) into the run's PR, and re-confirms CI green |
| When to use it | Automatically, by legacy `lfg` only (`mode:legacy-pipeline` / `loop.sh --legacy-lfg-plan`), at the close of an autopilot run — not invoked from new `sl-run` workflows or manual invocation |
| What it produces | A `docs(<scope>):` commit on the PR branch, on a verified-green PR — or a clean skip |
| Skip when | No open PR exists, or the run ended with CI unresolved (the seam self-skips). New `sl-run` workflows never fire it — they handle their own closeout |

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

### 3. Independent evaluator gate — generator ≠ evaluator

The learning is drafted by the same hot context that did the work, and a generator reliably over-praises its own output. So before committing, `sl-learn` dispatches a fresh-context evaluator (`sl-learning-evaluator`) with an evidence packet — branch diff, commit log, CI timeline, and the transcript excerpts backing each claim — and asks it to weigh that evidence *as claims, not truth*. It returns a three-state verdict: **`verified`** (evidence confirms the causal claims → commit `confidence: verified`), **`candidate`** (unconfirmed but uncontradicted → commit `confidence: candidate`), or **`rejected`** (evidence affirmatively refutes a claim → don't commit, revert any `CONCEPTS.md` / instruction-file edits, record the rejection). Only an affirmative refutation blocks the commit — refute-by-default would systematically kill work-phase learnings that have no CI trace — and an evaluator crash or timeout fails toward `candidate`, never silently `verified` and never dropped.

### 4. Stage exactly the named paths — never `git add -A`

The commit stages only the paths `sl-compound`'s report names: the learning file always, `CONCEPTS.md` only when it was created or updated, the instruction file only when an edit was applied. A blanket `git add -A` would sweep unrelated working-tree residue from earlier `lfg` steps into a misleading learning commit.

### 5. Schema validation before commit

`sl-compound`'s self-check covers parser-safety, not schema. When the target repo gates `docs/solutions/` frontmatter against a validator, `sl-learn` runs it on the new learning and repairs failures first — otherwise a schema-invalid learning would turn the PR red on the learn commit itself.

### 6. Re-confirm green with the immediate-exit-0 caveat

The learn commit re-triggers CI, and `loop.sh` checks `target_ci_green` only once after DONE. So the seam re-watches to green before returning — and explicitly does not trust an immediate exit-0, because right after a push `--watch` can return against the *prior* commit's already-complete checks. It confirms the PR head shows at least one check, all passing, before handing back to `lfg`.

---

## Quick Example

An unattended run fixes a flaky CI job (a `fix(ci):` commit lands, CI goes red→green). At the close, `lfg` fires `sl-learn`. It detects the open PR, sees the `fix(ci):` signal, invokes `sl-compound headless`, which decides the flake root-cause is worth keeping and writes a `docs/solutions/` learning. `sl-learn` validates the frontmatter, stages just that file, commits `docs(ci): capture flaky-job root cause`, pushes, watches the new commit's checks to green, and returns — then `lfg` emits DONE on a verified-green PR.

---

## When to Reach For It

You don't — legacy `lfg` fires it only. It exists as a distinct skill so the seam's gates and constraints are versioned and testable independently of the pipeline that calls it. New `sl-run` workflows do not invoke it; they perform their own evidence-gated closeout and record learning through their typed kernel.

Reach for `/sl-compound` directly when you're in an interactive session and want to capture a learning yourself.

---

## Use as Part of the Workflow

`sl-learn` is the last step of the legacy `lfg` pipeline only (when invoked with `mode:legacy-pipeline` / `loop.sh --legacy-lfg-plan`), after the CI watch-and-autofix loop reaches green and before DONE. It skips cleanly when there is no PR to commit into or the run ended red, so it never blocks the loop's stop. New `sl-run` workflows do not use this seam — they handle their own closeout and learning record within their workflow kernel.

---

## See Also

- [`/sl-compound`](./sl-compound.md) — the learning-capture skill this seam invokes headless
- [`lfg`](./lfg.md) — the autopilot that fires this seam at the close of a run
- [`/sl-handoff`](./sl-handoff.md) — the read-only session-carry skill this seam mirrors, minus the commit
