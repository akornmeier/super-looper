# `sl-handoff`

> Compact the current session into a clean handoff document a fresh agent can pick up — referencing existing artifacts by path instead of copying them. Produced at the plan→work seam, then carried into an unattended run.

`sl-handoff` is the **context-carry** skill. A plan records *what* to build and the decisions reached; it does not record the dialogue that produced them. When the next step is a fresh process — a `loop.sh` run launching `claude -p` with no prior session — that process has the plan but none of the conversation. `sl-handoff` writes a `handoff.md` that carries only the delta: the rationale, rejected alternatives, resolved questions, and gotchas the plan alone omits, with every durable artifact named by path rather than duplicated.

It's most often produced at the end of `/sl-plan` when you choose to start the work loop (`lfg`), which surfaces a ready-to-run `loop.sh --handoff-file <path>` command. It can also be invoked directly whenever you want to hand the current session's context to a clean run.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Writes a `handoff.md` carrying the session-only context (decisions, rejected alternatives, resolved questions, gotchas) a fresh agent needs, referencing the plan and other artifacts by path |
| When to use it | At the planning→implementation seam — after a plan is written, before launching an unattended `loop.sh` / headless run |
| What it produces | A `handoff.md` in a per-run OS temp directory; the skill outputs its absolute path |
| Distinguishing | Delta-only (never restates the plan); artifacts by reference; thin by design when the plan is self-sufficient; consumed once then discarded |

---

## The Problem

A plan is a decision artifact, not a conversation transcript. When work moves from an interactive planning session into a fresh process, context is lost in predictable ways:

- **The "why" evaporates** — the plan says *what* was decided but not which alternatives were weighed and rejected, so a fresh agent may reopen settled questions
- **Resolved ambiguities re-open** — questions hammered out in dialogue aren't in the plan, so the next agent re-derives them (often differently)
- **Gotchas hit cold** — discoveries from the session ("the migration must run before the backfill", "this API rate-limits at 100/min") aren't decisions and don't land in the plan
- **Context gets copied instead of referenced** — naive handoffs paste the plan body, producing a bloated, drift-prone duplicate that goes stale the moment the plan is edited

## The Solution

`sl-handoff` writes a tight handoff scoped to exactly what the durable artifacts don't carry:

- **Delta only** — it captures the session context the plan omits, never restates the plan; if the plan is fully self-sufficient, the handoff is legitimately thin
- **Artifacts by reference** — the plan, brainstorm/requirements doc, relevant ADRs, branch, and any open PR or commits are each named by path or URL, not duplicated
- **Per-run temp location** — the handoff is written to a throwaway OS temp directory (`mktemp -d -t handoff-XXXXXX`), consumed once by the next run, then discarded — it never pollutes the repo
- **Path surfaced for handoff** — the skill outputs the absolute path so the caller can pass it onward (e.g., `loop.sh --handoff-file <path>`); it does not start the next session itself

---

## What Makes It Novel

### 1. Carries the delta, not the plan

The handoff records only what the durable artifacts don't: decisions and their reasoning, alternatives considered and why they were rejected, questions resolved in dialogue, and gotchas the next agent would otherwise hit cold. It deliberately excludes anything already captured in the plan, brainstorm, ADR, issue, commit, or diff. This keeps the handoff small and prevents the duplicate-then-drift failure mode of copy-paste handoffs.

### 2. References artifacts by path

The plan, requirements doc, ADRs, branch, and PR/commits are named by path or URL — never reproduced inline. The fresh agent reads what it needs from the source of truth, so the handoff can't go stale against an edited plan.

### 3. Thin by design when the plan is self-sufficient

There is no padding mandate. If the plan already carries the full picture, the handoff is short and says little beyond a one-line state and the artifact references. Restating the plan to make the handoff "look complete" is explicitly discouraged.

### 4. Built for the unattended seam

The handoff exists for the specific moment where an interactive session hands off to a clean, unattended process. It names `lfg` as the recommended next skill and explains how the plan path drives `lfg`'s plan-input branch — orienting the fresh agent toward execution without re-planning.

---

## Quick Example

You finish planning a feature in an interactive session. The plan is written to `docs/plans/2026-06-18-001-feat-notification-mute-plan.md`, and along the way you settled several things in conversation: mute state lives on the subscription (not the user), the email digest path was deferred to a follow-up, and the backfill must run after the migration.

You want to run the work unattended, so you invoke `/sl-handoff`. The skill creates a per-run temp directory, then writes `handoff.md`:

- **One-line state** — "Plan is ready; next session executes it via `lfg`."
- **Artifacts by reference** — the plan path, the originating brainstorm doc, the branch, no open PR yet.
- **Session-only context** — mute-on-subscription decision and the rejected user-level alternative; digest path deferred; backfill-after-migration ordering gotcha.
- **Recommended next skill** — `lfg`, consuming the plan path on its plan-input branch.

The skill outputs the absolute path: `/var/folders/.../handoff-a1b2c3/handoff.md`. You hand it onward:

```bash
loop.sh --plan-file docs/plans/2026-06-18-001-feat-notification-mute-plan.md \
        --handoff-file /var/folders/.../handoff-a1b2c3/handoff.md
```

The fresh `claude -p` run reads both, has the decisions and gotchas it would otherwise have lost, and starts building.

---

## When to Reach For It

Reach for `sl-handoff` when:

- A plan is written and you're about to run the work in a fresh, unattended process (`loop.sh`, a headless `claude -p` run)
- The planning session produced decisions, rejected alternatives, or gotchas that the plan doc alone doesn't carry
- You're handing work to another agent (or to yourself later) and want the "why" to survive the process boundary

Skip `sl-handoff` when:

- You're continuing in the same interactive session — there's no process boundary to carry context across
- The plan is fully self-sufficient and nothing was resolved in dialogue that it omits (a handoff would be empty)
- You only need the plan itself handed onward — `loop.sh --plan-file` alone covers that

---

## Use as Part of the Workflow

`sl-handoff` sits at the seam between planning and implementation:

- **`/sl-plan` end-of-plan menu** — when you choose to start the work loop (`lfg`), the plan flow produces the handoff and surfaces a ready-to-run `loop.sh --handoff-file` command for an unattended run
- **`lfg`** — consumes the plan (via `--plan-file`) and the handoff (via `--handoff-file`) on its plan-input branch, so the fresh run starts with both the decisions and the context behind them

The skill itself stops at producing the handoff and naming its path — it does not launch the next session.

---

## Use Standalone

Direct invocation:

- `/sl-handoff` — infers the next step from the session (commonly: execute the plan) and writes the handoff
- `/sl-handoff "<what the next session will focus on>"` — tailors the handoff to a specific first task for the next agent

In both cases the skill writes `handoff.md` to OS temp and outputs its absolute path for you to pass onward.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Infers the next step from the session and writes the handoff |
| `<focus>` | Treats the argument as what the next session does first; tailors the handoff to it |

The handoff is written to a per-run OS temp directory (`mktemp -d -t handoff-XXXXXX`) and the absolute path to `handoff.md` is output for the caller to hand onward (e.g., `loop.sh --handoff-file <path>`).

---

## FAQ

**Why not just pass the plan to the next session?**
The plan records *what* was decided, not the dialogue that produced it. A fresh process has the plan but none of the conversation — so the rationale, rejected alternatives, resolved questions, and gotchas are lost unless something carries them. That's the handoff's whole job.

**Why reference artifacts by path instead of including them?**
Copying the plan into the handoff produces a duplicate that drifts the moment the plan is edited, and bloats the context the fresh run has to read. Referencing by path keeps the source of truth singular and the handoff small.

**What if there's nothing session-specific to carry?**
Then the handoff is legitimately thin — a one-line state plus artifact references. The skill does not pad it by restating the plan. A short handoff is the correct output when the plan is self-sufficient.

**Where does `handoff.md` live?**
In a per-run OS temp directory (`/var/folders/...` on macOS, `/tmp/...` on Linux). It's consumed once by the next run and discarded — it never lands in the repo.

**Does it start the next session?**
No. It writes the handoff and outputs the path. Launching the unattended run (e.g., `loop.sh --handoff-file <path>`) is a separate step the caller takes.

---

## See Also

- [`/sl-plan`](./sl-plan.md) — produces the plan the handoff references; its end-of-plan menu offers the work loop that generates the handoff
- [`/sl-work`](./sl-work.md) — the implementation step the handoff orients the fresh agent toward
