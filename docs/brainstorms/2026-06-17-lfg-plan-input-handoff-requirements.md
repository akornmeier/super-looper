---
date: 2026-06-17
topic: lfg-plan-input-handoff
---

# feat: Clean plan-to-work handoff for the implementation autopilot

## Summary

When planning finishes, super-looper should hand a reviewed plan to the implementation autopilot cleanly. `sl-plan` offers to start the work loop; a new `sl-handoff` skill compacts the planning session into a clean description; and the autopilot (`lfg` / the `loop.sh` driver) is initiated with the plan-file argument plus that description — so the work phase runs from a clean context, not the accumulated planning dialogue. Explicit triggers (`loop.sh --plan-file`, `/lfg plan:<path>`) name the plan and planning is skipped. This splits super-looper into an interactive planning phase and an unattended implementation phase joined by a deliberate handoff.

---

## Problem Frame

Super-looper is used in two distinct phases: interactive plan development (ideate/brainstorm → plan), then implementation (work → review → commit → PR → CI-to-green). The autopilot is meant to own the second phase, but it has no plan-shaped entry point. `lfg` only takes a feature description and always runs `sl-plan` first; `loop.sh` wraps `lfg` with a seed task. Handing an existing plan path to the autopilot routes into `sl-plan`'s interactive deepen flow, which stops to ask the user how to integrate findings — directly at odds with hands-off execution.

There is a second cost. The planning phase accumulates heavy context: ideation, brainstorm dialogue, plan deepening, and research. When implementation runs in the same session, it inherits all of that. The work phase should be driven by the plan, not diluted by the conversation that produced it.

---

## Key Decisions

- **Explicit trigger over auto-detect.** The plan is named explicitly (`loop.sh --plan-file`, `/lfg plan:<path>`) rather than inferred from whether an argument resolves to a file. In an unattended run, silent misclassification is the expensive failure.
- **Skip planning entirely.** When a plan is supplied, the autopilot does not re-validate or deepen it. The human already reviewed it; re-planning would risk drifting from what was approved.
- **Handoff at the seam, not inside `lfg`.** `lfg` runs every step in one conversation context and has no mid-run context-clearing primitive. The clean handoff is therefore produced *before* the autopilot starts, rather than `lfg` shedding its own context. `loop.sh`'s fresh process is clean by construction; the handoff description carries the necessary context forward.
- **`sl-handoff` is a self-contained super-looper skill.** The handoff generator ships with the plugin rather than depending on a personal/global `handoff` skill, so the feature works in any install.
- **Fail fast on bad input.** A missing or invalid plan path stops the autopilot with a clear error; it never silently falls back to planning a description.

---

## Requirements

### Plan-input trigger

- R1. `loop.sh` accepts a `--plan-file <path>` option naming a reviewed plan doc to execute, mutually exclusive with `--seed` / `--seed-file`.
- R2. `/lfg` accepts an explicit plan marker (`plan:<path>`) naming a reviewed plan doc to execute.
- R3. When a plan is supplied via either trigger, the autopilot skips planning and executes that plan.

### Implementation pipeline (behavior preserved)

- R4. After the plan is supplied, the autopilot runs the existing pipeline unchanged — work, review, commit, push, open PR, watch CI, autofix to green.
- R5. The supplied plan is used for the code-review requirements-completeness check, the same as a freshly authored plan.

### Handoff (sl-handoff + seam)

- R6. A new `sl-handoff` skill compacts the current planning session into a clean handoff description: the context needed to implement, referencing the plan and other artifacts by path rather than duplicating them, and naming the next skill.
- R7. The handoff is produced at the planning→work seam, before the autopilot starts; the autopilot is initiated with the plan-file argument plus the handoff description, so the work phase runs from a clean context rather than the planning dialogue.
- R8. `sl-plan`'s end-of-plan handoff menu offers to start the work loop; choosing it runs `sl-handoff` and initiates the autopilot with the plan.
- R9. `loop.sh --plan-file` runs in a fresh process (clean by construction) and carries the handoff description alongside the plan. In-session `/lfg plan:<path>` inherits the current session; it is documented as best-effort, with `loop.sh` or a fresh session as the guaranteed-clean path.

### Error handling

- R10. A missing, unreadable, or non-plan plan path stops the autopilot immediately with a clear error; it must not silently fall back to planning a description.

---

## Acceptance Examples

- AE1. Covers R1, R3, R9.
  - **Given:** a reviewed plan at `docs/plans/<plan>.md` in the target repo.
  - **When:** `loop.sh --target . --plan-file docs/plans/<plan>.md` runs.
  - **Then:** the autopilot executes that plan unattended in a fresh context, carrying the handoff description, with no planning step, through to a green PR.
- AE2. Covers R6, R7, R8.
  - **Given:** an interactive session that just finished planning a feature.
  - **When:** the user chooses "start the work loop" from `sl-plan`'s end-of-plan menu.
  - **Then:** `sl-handoff` produces a clean description, and the autopilot is initiated with the plan; the work phase is driven by the plan plus the handoff, not the planning dialogue.
- AE3. Covers R2, R3.
  - **Given:** a reviewed plan path.
  - **When:** the user runs `/lfg plan:docs/plans/<plan>.md`.
  - **Then:** the autopilot executes the named plan, skipping planning.
- AE4. Covers R10.
  - **Given:** a `--plan-file` or `plan:` path that does not exist or is not a plan doc.
  - **When:** the autopilot starts.
  - **Then:** it stops immediately with a clear error and does not fall back to planning a description.

---

## Scope Boundaries

### Deferred for later

- Resuming an unfinished or crashed loop from its existing plan.
- Reusing one plan across multiple targets or repeated runs.

### Outside this feature

- Auto-detection of plan paths — explicitly rejected in favor of the explicit trigger.
- Any change to `sl-plan`'s interactive deepen flow — it stays as-is for human-driven plan refinement.
- Accepting a requirements or brainstorm doc as autopilot input — only plan docs.
- Truly clearing `lfg`'s own in-session context mid-run — no primitive exists; the seam handoff replaces the need for it.

---

## Outstanding Questions

### Deferred to Planning

- How the seam-offer "initiates" the autopilot for a clean run: surface the ready-to-run `loop.sh` command, spawn `loop.sh` directly, or invoke in-session `/lfg` (with the cleanliness trade-off).
- How `loop.sh --plan-file` conveys the plan + handoff to `lfg` so it routes to plan-input mode rather than inlining the input as task text (distinct prompt variant vs. a structured marker).
- Whether the supplied plan must already be committed in the target, or working-tree presence is sufficient.

---

## Sources / Research

Verified against the repo during this brainstorm:

- `lfg` runs every step via the Skill tool in one conversation context; no step forks, and no `/clear` primitive exists — `plugins/super-looper/skills/lfg/SKILL.md` (steps 1–10). This is why the handoff must happen at the seam, not inside `lfg`.
- `sl-work` already accepts a plan-doc path as its argument — `plugins/super-looper/skills/sl-work/SKILL.md:4` (`argument-hint`). This is the execution engine the trigger routes to.
- `sl-plan`'s existing-plan path is interactive deepen, short-circuiting to Phase 5.3 in interactive mode — `plugins/super-looper/skills/sl-plan/SKILL.md` Phase 0.1. This is why the deepen path cannot serve hands-off execution.
- `loop.sh` inlines `--seed-file` content as task text and already enforces `--seed`/`--seed-file` mutual exclusion — `scripts/loop.sh:186`, `:148-152`. This is the integration pattern a `--plan-file` flag extends.
- The personal `/handoff` skill (`~/.agents/skills/handoff/`) is not part of super-looper — so `sl-handoff` must be built for the feature to ship.
- `loop.sh` exit codes are mirrored in `docs/loop-driver.md` and `scripts/loop.example.env`, which must stay in sync with any new flag.
- `STRATEGY.md` "Loop autonomy" and "Plan integrity" tracks — this feature serves both.
