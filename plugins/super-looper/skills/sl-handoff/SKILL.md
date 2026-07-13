---
name: sl-handoff
description: "Create a compact cross-session handoff for research, debugging, design, or other non-run work whose important context is not already durable. Do not use for sl-run work: its state path and review packet are the handoff."
argument-hint: "[what the next non-run session will focus on]"
---

# Non-run session handoff

Use this compatibility skill only when a fresh session needs context that no durable workflow artifact already carries.

## First gate: an active run needs no handoff

If the work has an `sl-run` state path, review packet, or closeout packet, do not create `handoff.md`. Surface the absolute state path, current compact status, and next action instead. A fresh session resumes with `/sl-run state:<absolute-path>`; copying run context into another document creates competing state.

Likewise, a canonical plan does not need a planning-to-run handoff. Start or resume `/sl-run` with the plan or state path. Use this skill only for non-run transitions such as research -> implementation planning, debugging -> repair planning, design exploration -> planning, or an interrupted manual session with essential conversation-only decisions.

## Write the handoff

1. Resolve the next session's focus from the argument or current non-run work.
2. Create one throwaway directory with `mktemp -d -t handoff-XXXXXX`; write `handoff.md` there. Never place it in the repository.
3. Keep the document to the delta over durable artifacts:
   - one-line current state and first next action;
   - artifact paths, branch, commits, issue, or PR by reference rather than copied content;
   - conversation-only decisions, rejected alternatives, resolved questions, and gotchas;
   - the direct next command, normally `/sl-plan` for code work that is not planned yet, or the relevant standalone debug, design, review, testing, or Git utility.
4. Output the absolute path. Do not start another session or workflow from this skill.

Never duplicate a plan, strategy, ADR, issue, diff, run packet, or existing handoff. This document is descriptive context, not a new plan or mutable run state.
