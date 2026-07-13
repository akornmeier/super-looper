# Loop driver — MVP acceptance

Proves the definition of done for the unattended loop driver (`scripts/loop.sh`):
**seed one task, walk away, and the loop plans → works → reviews → fixes → opens
a PR → reaches green, unattended.**

## What this proves — and its ceiling

This acceptance exercises the *mechanism* on a deliberately trivial throwaway
target (`examples/loop-seed.md`). It demonstrates that an unattended,
permission-bypassed headless run reaches a reviewable green PR. It does **not**
prove completion on a representative complex feature — read it as
"the loop mechanism works end to end," not "the loop autonomously ships real
features." Measuring the *Unattended completion rate* metric across many runs is
separate follow-up work (see the plan's Deferred section).

## Isolation invariant (must hold for every run)

- The run happens **in the throwaway target**, never in this plugin checkout.
  `loop.sh`'s isolation guard refuses a target that equals, contains, or is
  contained by `--plugin-dir`.
- **None of this repo's gate scripts** (`solutions:validate`, `plugin:validate`,
  `release:validate`) run against the target. They validate *this* repo's
  structure and would fail spuriously on a throwaway. Verification uses the
  target's own signals only (`gh pr checks`, or `--verify-cmd`).

## Sign-off bar: faithful GitHub-CI run

The bar for declaring the MVP done is the faithful "reach CI-green" path against
a real GitHub repo with Actions.

### Setup (reproducible)

1. Create an empty **throwaway** GitHub repo (e.g. `loop-throwaway`), cloned
   locally **outside** this plugin checkout.
2. Copy `examples/throwaway-ci.yml` into it as `.github/workflows/ci.yml`, add a
   `package.json` (or leave Bun's zero-config default), commit, and push `main`.
3. Use a **fine-grained `gh` token scoped to that repo only** (so a hallucinated
   or compromised seed cannot reach other repos), exported as `GH_TOKEN`.

### Run

```bash
TARGET=/abs/path/to/loop-throwaway \
SEED_FILE="$PWD/examples/loop-seed.md" \
  bash scripts/loop.example.env
```

(`loop.example.env` prints the constructed command via `--dry-run` first, then
executes the real run. With a remote present and no `--verify-cmd`, `loop.sh`
uses GitHub-CI verification automatically.)

### Expected outcome

- An **open PR** on the throwaway implementing `isPalindrome` + tests.
- `gh pr checks` **green** (the `bun test` workflow passes).
- The run log (`/tmp/super-looper/loop/loop-*.log`) ends with
  `<promise>DONE</promise>`.
- `loop.sh` exits `0` and prints `SUCCESS … PR: <url>`.

## Committed local-verify smoke (no Actions needed)

For a reproducible check that does not stand up Actions, run the same seed with
the local proxy — this proves the mechanism without a remote CI:

```bash
bash scripts/loop.sh \
  --target /abs/path/to/loop-throwaway \
  --seed-file "$PWD/examples/loop-seed.md" \
  --verify-cmd bun test
```

Success here means `DONE` + `bun test` exit 0. The committed smoke proves the
**local-verify** predicate; the faithful run above proves the **CI-green**
predicate. Sign-off uses the faithful run.

## `sl-run` plan-input routing smoke

`--plan-file` puts the driver into **plan-input mode**: instead of inlining a seed
task, it names a canonical plan via `plan:<path>`, selects a durable
`state-path:`, and launches `sl-run` in unattended mode. The committed tests pin
the prompt route, reject `DONE` without durable review-ready state, and exercise a
crash -> validated `state:` resume -> green verification sequence.

### Setup (reproducible)

1. In the **throwaway** target, write a small plan at
   `docs/plans/<date>-<slug>-plan.md` using the canonical `sl-plan` Markdown
   contract. Use at least two dependent phases to observe a boundary resume.
2. Commit the goal files so the test starts from a reproducible branch and HEAD.

### Run

```bash
# Local-verify proxy (no Actions needed):
bash scripts/loop.sh \
  --target /abs/path/to/throwaway \
  --plan-file docs/plans/<date>-<slug>-plan.md \
  --verify-cmd bun test

```

Preview with `--dry-run` first: it prints `mode: plan-input (skips planning)`, the
`workflow: sl-run`, `plan-file:`, the durable state path, and a constructed
prompt that names `plan:<path>` without inlining the plan body.

### Expected outcome

- The run log shows **no planning phase** and dispatches no more than one implementation, repair, or verifier agent
  at a time.
- Required command entries run through kernel `run-checks`; a fresh verifier evaluates each phase afterward.
- An interrupted phase boundary resumes from `state:<path>` without re-running
  the completed phase.
- The state remains at `/tmp/super-looper/sl-run/<run-id>/run-state.json`, and the
  terminal run record surfaces its completed gates, review-ready state, and review packet.
- `<promise>DONE</promise>` is accepted only with matching durable `review_ready` state
  and green `--verify-cmd` output.
- A missing or unreadable `--plan-file` exits `2` in `loop.sh` **before**
  launching the agent. A malformed plan is rejected by `sl-run`; either way
  there is no silent fallback to planning.

The previous plan-to-PR acceptance remains available with
`--legacy-lfg-plan`; `loop-phases.sh` selects it explicitly until U7 delivery is
part of `sl-run`.

## Origin DoD — second clause (learning validity + retrievability)

The ship-time learn seam (`sl-learn`, triggered by `lfg` step 10) is what makes
an unattended run *produce* a learning: after CI reaches green, it invokes
`sl-compound` headless against the still-hot run context and commits the
resulting `docs/solutions/` learning into the run's PR. This clause confirms the
unattended path produces a valid, retrievable learning — not new machinery.

The `isPalindrome` seed solves nothing noteworthy, so its run captures nothing
(the expected stage-1 skip). Exercise this clause with a **learning-producing**
run instead.

### Learning-producing exercise

Use the **faithful GitHub-CI setup** (above): capture commits *into* the PR, so
an open PR must exist. (Whether a PR exists turns on the target having a GitHub
remote, not on the verification mode — a `--verify-cmd` run against a
remote-having target still pushes and opens a PR, so the seam still fires. The
no-PR skip is reached only by a target with **no GitHub remote**; see the
disposition table below.) Drive work that involves a non-trivial problem so the
seam has something to capture. The
`--plan-file` route avoids shipping a new fixture (a dedicated `examples/`
learning seed is deferred — see the plan's Scope Boundaries): commit a one-unit
plan in the throwaway whose task requires diagnosing a non-obvious failure — e.g.
a first implementation that fails the committed test, so `lfg` step 9's autofix
loop repairs it and writes a `fix(ci):` commit (the seam's stage-1 signal).

```bash
# Explicit legacy route: GitHub-CI verification and lfg opens a PR.
bash scripts/loop.sh \
  --target /abs/path/to/loop-throwaway \
  --plan-file docs/plans/<date>-<slug>-plan.md \
  --legacy-lfg-plan
```

### Expected outcome

- The open PR carries a `docs/solutions/` learning **as its own commit**
  (`docs(<scope>): …`) alongside the feature work. Covers AE1, R4.
- `loop.sh` exits `0` with green verification: the learn commit re-triggered CI,
  and the seam's re-confirm-green wait kept the post-`DONE` `target_ci_green`
  check satisfiable rather than leaving the PR pending on the learn commit.
  Covers R8, AE4.
- The committed learning is **retrievable by a later run** — a subsequent
  `sl-learnings-researcher` grep-over-frontmatter finds it. Covers the
  retrievability criterion.
- **Schema validity:** the throwaway has no `docs/solutions/` schema validator
  (the isolation invariant keeps this repo's gate scripts off the target), so the
  seam's step-4 validation falls back to `sl-compound`'s parser-safety self-check
  there. Confirm schema-validity by running a validator against the produced file
  by hand, or exercise the gating end-to-end against a **validator-adopting
  target** (this repo or a fork — the AE7 dogfood case), where the target's own
  CI enforces the schema and the seam repairs an invalid learning before commit.

### Capture disposition (end-states to confirm)

The seam must leave the loop's verifiable-green stop honest across every
end-state. Confirm each routes as expected:

| Run end-state | Expected seam behavior |
| --- | --- |
| Non-trivial solved, PR open, CI green | Captures: learning committed into the PR; re-confirms green before `DONE` |
| `sl-compound` self-gates (no solved problem) | Reads `Documentation skipped`; commits nothing; PR unchanged |
| Plain feature ship, no qualifying signal | Stage-1 skip before invoking `sl-compound`; PR unchanged (the `isPalindrome` seed's outcome) |
| No open PR (target has no GitHub remote, so no PR is opened) | Skips capture entirely; existing verification path unchanged. Covers AE5 |
| Step 9 ended red (`## CI Failures Unresolved` in PR body) | Does not fire; run exits on red as before. Covers AE6 |
| Learn commit re-triggers CI | Re-confirms green before `DONE`, so `loop.sh`'s post-`DONE` `target_ci_green` sees green (not pending on the learn commit). Covers R8, AE4 |

## Run record

> Status: **PENDING** — to be completed by the operator's live run (the live,
> permission-bypassed headless run is operator-driven, not produced during the
> build of this driver). Fill in the fields below after running.

| Field | Value |
| --- | --- |
| Date | _TBD_ |
| Predicate proven | _CI-green (faithful) / local-verify (smoke)_ |
| Invocation | _command used_ |
| Model | _opus / fable_ |
| Target repo | _throwaway URL_ |
| Resulting PR | _PR URL_ |
| `gh pr checks` / verify result | _green / red_ |
| Run-log excerpt (last lines incl. DONE) | _paste_ |
| Learning committed into PR? validates + retrievable? | _n/a for isPalindrome seed; expected for the learning-producing run_ |
| Capture disposition observed | _captured / self-gated skip / stage-1 skip / no-PR skip / step-9-red skip_ |
| Confirmed no gate script ran against target | _yes / no_ |
