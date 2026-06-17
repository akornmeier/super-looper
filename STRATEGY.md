---
name: Super Looper
last_updated: 2026-06-16
---

# Super Looper Strategy

## Target problem

During the work phase of an AI-driven dev loop, the plan's goal goes hazy and learnings only get captured if done manually — so the same issues get repeated, progress slows, and the product ships overcomplicated and sloppy instead of the feature that was intended.

## Our approach

Win by enforcing the full ideate → plan → work → review → learn → ship loop so the goal and the learnings can't be dropped — instead of handing users individual skills and hoping they run them in the right order.

## Who it's for

**Primary:** Fred, a senior developer building complex features on solo side projects — he's hiring Super Looper for team-scale development capability through a structured, agent-and-skill-driven loop, without a team.

## Key metrics

- **Goal fidelity** — across a complex multi-phase plan, completed work still serves the original plan goal (the goal didn't drift phase-to-phase). Measured via plan-vs-outcome comparison; manual/semi-automated (to define).
- **Learning reuse** — how often a captured `docs/solutions/` learning gets applied to prevent a repeat. Measured from `docs/solutions/` references (to define).
- **Unattended completion rate** — share of loops that hit the verifiable stop condition and open a PR without human intervention. Measured from loop logs / PR metadata.
- **Code-review rework** — review rounds / diff churn before merge. Measured from git/PR data.

## Tracks

### Loop autonomy

The unattended runner and the verifiable stop conditions that let a seeded task run to a reviewable PR without a babysitter.

_Why it serves the approach:_ The loop can only be "enforced end-to-end" if it can run the steps itself and know when it's genuinely done.

### Learning system

The TypeScript-validated `docs/solutions/` schema plus automatic capture and reuse of learnings.

_Why it serves the approach:_ Learnings that can't be dropped are what stop the same issues from repeating across runs.

### Plan integrity

Keeping the plan's goal sharp and intact through complex, multi-phase work.

_Why it serves the approach:_ A clear, undrifting goal is the precondition for the loop shipping the feature that was actually intended.
