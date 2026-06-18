---
title: "fix: sl-work unattended mode (skip interactive prompts under automation)"
type: fix
date: 2026-06-18
---

# fix: sl-work unattended mode (skip interactive prompts under automation)

## Summary

Give `sl-work` a pipeline / `disable-model-invocation` carve-out so it skips its clarifying-question and branch-choice prompts when invoked under automation (LFG, headless `loop.sh` runs). Today those prompts fire unconditionally, so any unattended `lfg` run stalls at `sl-work`. This mirrors the `**Pipeline mode:**` blocks `sl-plan` and `sl-brainstorm` already carry.

---

## Problem Frame

`sl-work` asks "if anything is unclear, ask clarifying questions now" (`plugins/super-looper/skills/sl-work/SKILL.md:58`) and "Continue working on `[branch]`, or create a new branch?" (`:87`) unconditionally. `lfg` invokes `sl-work` bare (`plugins/super-looper/skills/lfg/SKILL.md:15`), and `sl-work` has no automated-context carve-out, so an unattended run (a headless `loop.sh` launch, or any LFG pipeline) reaches these prompts and stalls or guesses with no human present. This is a pre-existing gap on the description-mode `lfg` path; it was surfaced as a blocking dependency while planning the plan-input handoff feature (`docs/plans/2026-06-18-001-feat-lfg-plan-input-handoff-plan.md`), whose fully-unattended `loop.sh --plan-file` path cannot work until this is fixed.

---

## Key Technical Decisions

- KTD1. **Mirror the existing `Pipeline mode` pattern, don't invent a new mechanism.** `sl-plan` and `sl-brainstorm` already skip interactive questions "when invoked from LFG or any `disable-model-invocation` context." `sl-work` adopts the same contextual recognition so behavior is consistent across the pipeline and there is one mental model.
- KTD2. **Unattended branch-choice defaults to continuing on the current branch.** In an unattended run the loop owns branch/PR creation downstream (`sl-commit-push-pr` at `lfg` step 8); `sl-work` continuing on the current branch is the safe, non-interactive default rather than auto-creating a branch.
- KTD3. **Activate on automated context OR an explicit signal.** The mode fires when `sl-work` recognizes an automated/LFG/`disable-model-invocation` context (like `sl-plan`), and also honors an explicit `mode:unattended` argument token passed by a caller (e.g., `lfg`'s plan-input branch in the companion plan, where plan-001 names the identical token where `lfg` passes it into `sl-work`). This follows the repo's established `mode:<x>` argument-token convention (`mode:agent`, `mode:headless`, `mode:pipeline`). Either path suppresses prompts; neither changes interactive behavior.

---

## Requirements

- R1. Under an automated/unattended context, `sl-work` does not emit the clarifying-question step (`:58`).
- R2. Under an automated/unattended context, `sl-work` does not emit the branch-choice prompt (`:87`); it continues on the current branch by default.
- R3. With no automated context, `sl-work`'s interactive behavior is unchanged.

---

## Implementation Units

### U1. `sl-work` unattended-mode carve-out

- **Goal:** `sl-work` skips its two interactive prompts under automation, preserving interactive behavior otherwise.
- **Requirements:** R1, R2, R3.
- **Dependencies:** none.
- **Files:** `plugins/super-looper/skills/sl-work/SKILL.md`.
- **Approach:** Add a `**Pipeline mode:**` block (and inline guards at the two prompt sites) mirroring `sl-plan`'s wording: when invoked from LFG or any `disable-model-invocation` context — or when a caller passes the explicit `mode:unattended` argument token — skip the clarifying-question step (`:58`) and auto-resolve the branch-choice (`:87`) by continuing on the current branch, without prompting. Leave both prompts intact for interactive runs.
- **Patterns to follow:** the `**Pipeline mode:**` blocks in `plugins/super-looper/skills/sl-plan/SKILL.md` (Phase 0.0 step 4, Phase 5.x) and `plugins/super-looper/skills/sl-brainstorm/SKILL.md`.
- **Test scenarios:** `Test expectation: none -- behavioral skill prose.` Validate via the `skill-creator` eval workflow: (a) under an automated/unattended context, `sl-work` emits neither the clarifying nor the branch-choice question and proceeds on the current branch; (b) in a normal interactive context, both prompts still fire unchanged.
- **Verification:** skill-creator eval confirms suppression under automation and unchanged interactive behavior; `bun run release:validate` still passes (no count/table changes expected — this edits existing skill prose).

---

## Risks & Dependencies

- **Plugin caching.** `sl-work` is behavioral skill prose that caches at session start — validate via the `skill-creator` eval workflow, not by re-invoking `sl-work` in the same session (`AGENTS.md` "Validating Agent and Skill Changes").
- **Unblocks the companion plan.** The plan-input handoff feature's fully-unattended `loop.sh --plan-file` path depends on this fix; sequence this before relying on hands-off `loop.sh` runs.
- **Default-branch safety.** Confirm the continue-on-current-branch default does not cause an unattended run to commit onto a protected branch; `lfg`'s commit/PR step is expected to own branch creation, but verify the interaction during implementation.

---

## Sources / Research

- `sl-work` interactive prompts: `plugins/super-looper/skills/sl-work/SKILL.md:58` (clarifying), `:87` (branch-choice).
- `lfg` invokes `sl-work` bare: `plugins/super-looper/skills/lfg/SKILL.md:15`.
- Existing `Pipeline mode` precedent: `plugins/super-looper/skills/sl-plan/SKILL.md` (Phase 0.0 step 4), `plugins/super-looper/skills/sl-brainstorm/SKILL.md`.
- Discovery context: blocking dependency in `docs/plans/2026-06-18-001-feat-lfg-plan-input-handoff-plan.md` (KTD5 / Scope Boundaries).
