---
name: sl-handoff
description: "Compact the current session into a clean handoff document a fresh agent can pick up, referencing existing artifacts (plan, brainstorm, ADRs) by path instead of duplicating them. Use at a planning-to-implementation seam — after a plan is written, before starting an unattended work loop — to carry the planning-dialogue context (rationale, rejected alternatives, resolved questions, gotchas) that the plan doc alone omits across a fresh process."
argument-hint: "[what the next session will focus on]"
---

# Session Handoff

Write a handoff document that lets a fresh agent continue this work without inheriting the current conversation. The handoff is produced at the seam between planning and implementation, then carried into a clean run (for example, `loop.sh --handoff-file`).

## What the handoff is for

A plan is a decision artifact: it records *what* to build and the decisions reached, not the dialogue that produced them. A fresh process — a `loop.sh` run launches `claude -p` with no prior session — has the plan but none of the conversation. The handoff carries only what the plan omits and the next agent would otherwise have to re-derive.

If the plan is fully self-sufficient, the handoff is legitimately thin. Do not pad it by restating the plan — keep it to the delta.

## Steps

1. **Resolve the focus.** If an argument was passed, treat it as what the next session will do first and tailor the handoff to it. Otherwise infer the next step from the session (commonly: execute the plan).

2. **Create a per-run temp location.** Run a single command to make a throwaway directory, then write `handoff.md` inside it with the Write tool:

   ```bash
   mktemp -d -t handoff-XXXXXX
   ```

   Use the per-run-throwaway form (OS temp, opaque path) — the handoff is consumed once by the next run and discarded. Do not write it into the repo.

3. **Write `handoff.md`.** Keep it to the delta over the durable artifacts:
   - **One-line state** — where the work stands and what the next session should do first (shaped by the focus).
   - **Artifacts by reference, not copy** — the plan, brainstorm/requirements doc, relevant ADRs, branch, and any open PR or commits, each named by path or URL. Do not duplicate their content.
   - **Session-only context** — the things said in this conversation that are *not* in those artifacts: decisions and the reasoning behind them, alternatives considered and why they were rejected, open questions resolved during dialogue, and gotchas or discoveries the next agent would otherwise hit cold.
   - **Recommended next skill** — name `lfg` and how it consumes the plan (the plan path drives `lfg`'s plan-input branch). Suggest other skills only if the next step is not implementation.

4. **Surface the path.** Output the absolute path to `handoff.md` so the caller can hand it onward (e.g., as `loop.sh --handoff-file <path>`). Do not start the next session from here — producing the handoff and naming the path is the whole job.

## Constraints

- Reference artifacts by path; never duplicate content already captured in a plan, brainstorm, ADR, issue, commit, or diff.
- The handoff is descriptive, not a re-plan. It orients a fresh agent; it does not re-decide what the plan settled.
