---
title: "Per-attempt invariant baselines must span the attempt lineage when a resume path skips the reset"
date: 2026-07-04
category: docs/solutions/skill-design/
module: loop-driver
problem_type: design_pattern
component: development_workflow
severity: high
applies_when:
  - "a per-attempt guard snapshots state at the start of every attempt and re-checks it at the end, assuming a reset step ran between attempts"
  - "a second feature introduces a path that deliberately skips that reset (resume, warm restart, cache reuse) when validated prior state exists"
  - "a crash or interruption could leave a mutation in place between the skipped reset and the next snapshot"
related_components:
  - tooling
confidence: verified
provenance: loop-run
evidence: "https://github.com/akornmeier/super-looper/pull/26"
tags:
  - "invariant-scoping"
  - "drift-guard"
  - "resume"
  - "baseline"
  - "cross-feature-interaction"
  - "loop-driver"
---

# Per-attempt invariant baselines must span the attempt lineage when a resume path skips the reset

## Context

One PR shipped two units that each had isolated test coverage and each looked correct alone:

- **Goal-drift guard**: at the top of the retry `while` loop, `loop.sh` snapshots the sha256 of `STRATEGY.md` and the plan file, then re-hashes at every done-reached path and exits 8 (`typed_failure: "goal-drift"`) on mismatch. The invariant as written: "the goal files must not change between attempt-start and finish" — sound while `reset_target` restores the clean base before every attempt.
- **Resume**: when a crashed attempt leaves a binding-valid run-progress file, the next attempt resumes at the recorded step on the recorded branch — deliberately skipping `reset_target`, since keeping the surviving tree is the whole point of resume.

Composed, the loop-top snapshot ran unconditionally on *every* attempt, including a resumed one. A crash-then-resume sequence: attempt 1 mutates `STRATEGY.md` (for example via a Bash `sed -i`, invisible to the PreToolUse hook) and crashes; attempt 2 resumes with no reset and re-hashes the *already-mutated* tree as its new baseline; at DONE, start equals end and the run exits 0. The drift was laundered into a "clean" baseline by the sibling feature's skip-reset path — two green isolated test suites, one silently defeated guarantee.

The defect never shipped: four independent review personas (correctness, security, reliability, adversarial) converged on the identical finding without coordinating, and a fresh-context validator confirmed it by tracing the variable flow.

## Guidance

1. **When adding any path that skips a state reset (resume, warm restart, cache reuse), re-audit every invariant scoped "per-\<reset-unit\>".** Grep for anything captured "at the start of the loop/attempt/request" and ask: is the reset it assumes still unconditional? If the new path makes the reset conditional, the invariant's scope must widen from "per-iteration" to "per-lineage" — spanning every iteration back to the last real reset.
2. **Couple a baseline's capture site to the reset site, not the iteration site.** The bug was a location mismatch: the hash was captured at the loop top (runs every iteration) while its precondition was "tree just reset" (true only on cold attempts). The fix makes the coupling explicit — snapshot only when the reset actually ran:

   ```bash
   # Before (unconditional — the bug): re-baselines a resumed, possibly-mutated tree
   strategy_hash_start="$(hash_file "$STRATEGY_PATH")"

   # After (cold-only): a resumed attempt inherits the prior cold baseline, so the
   # comparison spans the whole surviving attempt lineage
   if [ "$resume_active" -ne 1 ]; then
     strategy_hash_start="$(hash_file "$STRATEGY_PATH")"
   fi
   ```

3. **The moment two features share loop state, write the interaction test — two green isolated suites prove nothing about the composition.** The regression test that pins this (written red-first; failed `Expected 8, Received 0` before the fix): stub attempt 1 mutates a committed `STRATEGY.md`, writes a valid progress file, crashes; stub attempt 2 resumes and emits DONE; assert exit 8 with `typed_failure: "goal-drift"`. This test cannot live in either feature's own fixture — each necessarily holds the other feature at its no-op default.

## Why This Matters

This is the dangerous failure class: a security guarantee *silently narrowed*, not loudly broken. The guard still ran, still compared hashes, still exited 0 — no crash, no red test, nothing to page on. A loudly-broken guard is caught by any smoke test; a guard that still works for every scenario the isolated suites construct — but not for the composition — survives to production.

Unit-scoped tests are structurally blind here: the goal-drift tests never resumed, and the resume tests never checked drift. The bug lives exactly in the intersection neither fixture visits. The net that caught it was independent-reviewer convergence — four personas reasoning separately about the same diff, exactly the class of defect where one reviewer's blind spot is another's obvious catch.

## When to Apply

- Adding a resume, retry-with-state, warm-restart, or cache-reuse path to any loop or state machine that already carries a per-cycle guard, baseline, snapshot, rate limit, or budget.
- Any "snapshot at iteration start" pattern — treat the reset point, not the loop point, as the true capture point.
- Reviewing state-machine changes: ask "does this diff add a path that skips a reset? If so, list every invariant that assumed the reset always ran, and re-verify each under the skip path."
- When two units in one PR touch shared loop state: require a combined-scenario test before merge, even with both units individually green.

## Examples

The worked instance lives in `scripts/loop.sh` (cold-attempt-only snapshot in the retry loop; terminal goal-drift guard) and `tests/loop-driver.test.ts` (the resume-suite drift regression test), landed in the same change that introduced resume. The guard's authority claim ("catches every mutation path") is only true *because* the baseline now spans the attempt lineage — under the original per-attempt scoping, that documented claim was false for any crash-then-resume run.

## Related

- [Bounded escalation rung](bounded-escalation-rung.md) — sibling `loop.sh` retry-lattice pattern: an added layer must never weaken the honest terminal state beneath it.
- [Verify-loop async quiescence gate](verify-loop-async-quiescence-gate.md) — closest pattern-shape sibling: a bound's soundness depends on an upstream condition a bypass path can violate; gate on what the signal proves.
- [set -e wrapper skips downstream capture](../best-practices/set-e-wrapper-skips-downstream-capture-on-failure.md) — same family of shell control-flow silently bypassing an assumed invariant.
- CONCEPTS.md "Goal guard" — the concept this learning refines: the checksum baseline is per-lineage, not per-attempt.
