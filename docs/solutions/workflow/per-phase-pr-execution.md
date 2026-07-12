---
title: "Per-phase PR execution: why the stack is forced, and why the orchestrator sits above loop.sh"
date: 2026-07-11
category: docs/solutions/workflow/
module: loop
problem_type: architecture_pattern
component: build_tooling
severity: medium
applies_when:
  - "an unattended run should ship one PR per plan phase instead of one PR for the whole plan"
  - "a change proposes making loop.sh merge its own pull request"
  - "a change proposes a between-attempt sync inside loop.sh's guarded region"
related_components:
  - development_workflow
  - tooling
root_cause: missing_workflow_step
resolution_type: tooling_addition
tags:
  - loop-driver
  - per-phase
  - stacked-prs
  - goal-guard
  - merge-policy
---

# Per-phase PR execution

## The problem

`loop.sh` ships a plan as **one run, one PR**. A ten-unit plan lands as a single diff:
hard to review, all-or-nothing to revert, and a CI failure in the last unit blocks the
nine that were fine. The wanted shape is one run and one PR per plan *phase*, with the
plan's own progress state synced between phases.

## The finding that decides the design

The obvious model is **serial**: ship phase 1's PR, merge it, start phase 2 from the
merged base. It cannot work here, and the reason is in the ruleset, not in the loop.

`main` requires the `pr-reviewed` check: **a non-author review on this exact head, with
none requesting changes.** The bypass actor was removed — the maintainer cannot merge past
a red gate either (see `main-ruleset-contract.md`). So an unattended run **cannot merge its
own pull request.** A serial loop would open phase 1's PR, watch it go green, and then
block forever waiting for a human reviewer — which is not unattended.

**Therefore the stack is forced, not preferred.** Phase N+1 branches from phase N's
*branch*, not from merged `main`. The phases stack as a chain of PRs, each based on the one
before it, and a human merges the chain in order afterward. This is a consequence of the
merge policy; it is not a design taste, and a future change that "simplifies" it back to
serial will hang.

## The second finding: put the orchestrator above loop.sh

The plan called for the between-phase sync (markers, commits, amendment) to run "in the
guard-free gap between attempts." Carving such a gap *inside* `loop.sh` is awkward — the
goal guard deliberately spans the entire run, and the whole point of the guard is that
nothing inside the run gets to rewrite the goal.

So per-phase orchestration lives **above** `loop.sh`: `scripts/loop-phases.sh` invokes
`loop.sh` once per phase. Then:

- **The guard-free gap is literally the space between invocations.** No carve-out, no new
  window inside the guarded region. The sync runs when no guarded run is in flight.
- **`loop.sh`'s contract is untouched** — same exit codes, same goal guard, same retry and
  reset semantics, same success predicate. It gains exactly one additive flag (`--phase`)
  that scopes the prompt.
- **Blast radius is one flag plus one new script.** A restructure of the 900-line
  safety-critical driver into an outer phase loop would have been neither.

The sync itself is the part that *must* be outside a run: it appends an Amendments entry
and commit SHAs to the plan, and those are **not** marker-normalized by the goal guard.
Written mid-run they would read as goal drift and exit 8. Written between runs, they are
just a commit.

### How this composes with the marker carve-out

The marker normalization (`goal-guard-marker-region-carveout.md`) is what makes the
*within*-phase half work: `sl-work` flips a unit's marker to `[x]` during a run without
tripping drift. The between-phase sync handles what normalization deliberately does not
cover — the Amendments entry and the commit SHAs. Two mechanisms, split exactly along the
line of "is this progress state, or is it a change to the document?"

## What a phase is

A phase is **a group of Implementation Units that ships together**. Units already carry
stable U-IDs, so no plan-format change is needed:

- `--group U1,U2 --group U3` — explicit grouping, one PR per group.
- Default with no `--group`: one phase per unit, in U-ID order.

## Retry semantics inside a phase

`loop.sh` resets the target to `BASE_REF` (its HEAD at start) before a retry. Under
per-phase, `BASE_REF` is naturally the *phase's* base, because the orchestrator checks out
the previous phase's branch before invoking `loop.sh`. A retry therefore resets to the
start of the failing phase and **never discards an earlier phase's committed work.** This
falls out of the existing code; it is not new logic, but it is the property to re-verify if
`reset_target` or `BASE_REF` is ever changed.

## Failure policy

A phase that exhausts its retries **stops the chain.** Later phases are not attempted: they
would branch from a phase that does not exist, and a plan's phases are ordered because the
later ones depend on the earlier ones. The phases that did land keep their PRs — they are
independently reviewable and mergeable, so a partial run is still useful work, not garbage
to throw away.

## What this does NOT do

- **It does not merge anything.** It cannot (see above), and it should not: the review gate
  is the point.
- **It does not re-plan.** Phases come from the plan's existing U-IDs.
- **It does not touch `loop.sh`'s guard, exit codes, or success predicate.**
