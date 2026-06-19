---
title: "Bounded escalation rung: one deeper retry that preserves an honest give-up floor"
date: 2026-06-19
category: docs/solutions/skill-design/
module: lfg
problem_type: design_pattern
component: development_workflow
severity: medium
applies_when:
  - adding an autonomous escalation or deeper-retry step to a pipeline that already has a give-up state
  - an unattended loop can reach a terminal failure with live state (logs, failing test, diff) still in hand
  - a re-check after an automated fix could be mistaken for a real pass
related_components:
  - tooling
  - documentation
tags:
  - skill-design
  - escalation
  - ci-loop
  - false-green
  - unattended-mode
  - give-up-floor
---

# Bounded escalation rung: one deeper retry that preserves an honest give-up floor

## Context

An autopilot loop (here `lfg`'s in-run CI-fix loop) exhausts its bounded fix attempts on red CI, then composes a give-up floor — a recorded "unresolved" account plus a DONE-but-red exit. It gives up at the moment it has the most to work with: the live failing logs, the failing test, and the diff that caused them are all still in hand, yet the loop's attempts were surface-level repairs and a dedicated debugging skill sits one step away. The opportunity is to add one deeper, systematic pass before giving up — without weakening the honest floor, looping forever, or shipping a false green.

## Guidance

Insert a **bounded escalation rung** between the give-up gate and the floor. Five properties make it safe:

1. **Fire only on genuine exhaustion.** Branch on a disposition the loop *already records* (e.g. a "flaky-no-fix-path" flag set during the iterations), not a fresh heuristic re-judged at the gate. The rung escalates only for failures the loop attempted to fix and could not; failures already classified as unfixable route straight to the floor.
2. **One bounded pass, not a loop.** Invoke the deeper tool once on the live state, re-check the success signal exactly once, and provide no return-to-iteration edge — no attempt counter, no loop-back.
3. **Two exits only.** The green exit *converges with the normal success path* (so the floor marker is never written and any downstream success seam still fires), and the floor exit is *preserved and enriched* with the pass's findings — the rung adds a rung, it does not remove the floor.
4. **Never manufacture a false green.** Restate the no-weaken discipline (do not weaken, skip, or mock an assertion to make a check pass) *at the rung itself*. A re-check certifies only the existing check set: it catches a fix that breaks a *different* check but cannot detect one that masks the *same* failure by gaming its assertion. A masked failure shipped as green is strictly worse than the honest floor, so the no-weaken rule — not the re-check — is the load-bearing guard.
5. **Keep the terminal state honest.** On a failed pass, revert the escalation's change before composing the floor so the terminal state reflects the pre-escalation reality rather than an unproven fix.

**Division of labor.** The deeper tool fixes in the working tree and returns *without committing*; the orchestrator owns commit/push and the single re-check, reading "did the working tree change?" as its only signal. This makes the tool's no-fix paths load-bearing: every no-fix outcome must leave the tree untouched, or a stray artifact (a reproduction test written test-first, a debug log) fakes a "fix applied" signal to the caller.

## Why This Matters

The floor is the safety net; an escalation that replaces it trades a known-honest failure for a possibly-false success. Partial or local green hiding real gaps is a documented hazard in this repo (see Related) — a check that passes while covering only a subset of invariants is more dangerous than no check. The re-check confirms green over the *existing* checks; it does not prove the original failure was genuinely repaired. That gap is why the no-weaken discipline and the revert-on-failure step are non-negotiable parts of the pattern, not optional polish.

## When to Apply

- A pipeline has a terminal give-up state and a deeper, more expensive tool that could plausibly resolve the failure with one more pass.
- The deeper tool can run unattended (suppressing interactive gates) and return a machine-detectable signal — here, "the working tree changed."
- The success signal is re-checkable but cannot, by itself, distinguish a real fix from a masked one.

## Examples

**The lfg rung.** At step 9's give-up gate, genuine-exhausted red CI escalates to one `sl-debug mode:unattended` pass on the live failing logs. The rung commits/pushes any fix, re-checks CI once, then: green -> break to the normal success path (no floor marker, learn seam fires); red -> revert the escalation commit and compose the `## CI Failures Unresolved` floor enriched with the pass's findings. A recorded flaky-no-fix-path disposition bypasses the rung entirely.

**A concrete false-signal trap caught in review.** The enabling `sl-debug mode:unattended` runs test-first — it writes a *failing reproduction test before* attempting the fix. Its return contract promises "tree untouched on every no-fix path." Those two collide: if the pass writes a repro test and then concludes "no safe fix," the leftover test dirties the tree, and the caller's `git status --porcelain` signal misreads it as a fix — manufacturing a false `fix(ci)` commit. The fix was to make every no-fix path *revert its own investigation edits* so the tree is genuinely untouched. The lesson generalizes: when a caller infers success from a side effect (tree change, exit code, a written file), every non-success path of the callee must scrub that side effect.

## Related

- `docs/solutions/workflow/release-please-version-drift-recovery.md` — partial-green hazard: a check passing over a subset of invariants is worse than none.
- `docs/solutions/developer-experience/git-untracked-empty-dirs-break-ci.md` — local green hides real gaps; surface what was skipped one-layer-direct.
- **Follow-up (gate fragility, surfaced by this change, not yet fixed):** `lfg` step 10 and `sl-learn` step 1 detect "CI was left red" by a bare substring match of `## CI Failures Unresolved` in the PR body. That false-positives for any PR whose *description* mentions the marker (e.g. a PR that is about the floor feature itself). A robust gate should key on actual CI state or a line-anchored heading, not a body substring.
