---
date: 2026-06-18
topic: whats-next-reflect-route
kind: brainstorm-seed
---

# Seed: "What's next" — a cycle-boundary reflect / refresh / route workflow

This is a **handoff seed**, not a finished requirements doc. It captures an idea split off from the autopilot-learning-capture brainstorm so it can run through its own `/sl-brainstorm` session. To start: feed this file to `/sl-brainstorm` (or paste its substance as the feature description).

## The idea

A cycle-boundary workflow that runs **between** loop runs — before the next `ideate` / `brainstorm` / `plan` — and does three things:

1. **Reflect / consume** — read the learnings accumulated in `docs/solutions/` (and recent run outcomes) and surface what they imply for what to do next.
2. **Refresh** — detect and refresh stale or superseded docs (`sl-compound-refresh`), so the knowledge store stays trustworthy as the codebase evolves.
3. **Route** — feed that synthesis into the next cycle's `ideate` / `brainstorm` / `plan`, so prior learnings actively shape the next piece of work instead of only being looked up reactively during review.

Think of it as the loop's true closure-into-reopening: `… → ship → [what's next] → ideate → …`.

## Why it's separate from learning capture

It came up as a devil's-advocate reframe during the autopilot-learning-capture brainstorm ("what if compounding happens *before* ideate, not inside the lfg loop?"). The resolution was that these are **two different operations at opposite ends of the loop**, not competitors:

- **Capture** (write a learning) is **context-bound**: a learning from a run only exists after that run solved something, and for unattended `loop.sh` runs there is no next cycle and no human — so capture must happen at ship time, in-session, or it is dropped. That is the scope of `docs/brainstorms/2026-06-18-autopilot-learning-capture-requirements.md`.
- **Reflect / refresh / route** (this seed) is a **cycle-boundary** operation that *consumes* learnings and decides what's next. It naturally runs at the start of a cycle, with a human or a chained meta-loop present, and sits near `sl-strategy` / `sl-ideate` — not on `lfg`.

The reframe's genuine wins belong here: decoupling reflection from the ship loop, batching across several runs for higher-quality synthesis, and mirroring how real retrospectives work at cycle boundaries.

## Open questions for its brainstorm

- **Where it sits in the pipeline.** A new workflow before `ideate`, an extension of `sl-strategy` / `sl-ideate`, or its own loop? How does it relate to `sl-strategy`'s tracks?
- **Attended vs unattended.** It's most natural with a human at a cycle boundary. Does it have an unattended form at all, and if so, does that require a chain-of-runs meta-loop (explicitly out of scope for the capture feature)?
- **What triggers it.** Manual ("what should I work on next?"), a cadence, or a signal that enough new learnings have accumulated to be worth a reflect pass?
- **Refresh scope.** How aggressively should it run `sl-compound-refresh` — every cycle, or only when learnings suggest specific stale docs?
- **Routing output.** Does it produce a ranked "next work" shortlist (like `sl-ideate`), hand directly to `sl-brainstorm` / `sl-plan`, or just a digest the user acts on?
- **Overlap with existing skills.** `sl-ideate` already does "what should I improve"; `sl-strategy` owns tracks; `sl-compound-refresh` owns staleness. Is this a new skill or an orchestration of those?

## Related artifacts

- Sibling (the capture half, already specified): `docs/brainstorms/2026-06-18-autopilot-learning-capture-requirements.md`
- `STRATEGY.md` — the `… → learn → ship` loop and the "Learning reuse" metric this would serve on the consume side.
- `plugins/super-looper/skills/sl-compound-refresh/SKILL.md`, `plugins/super-looper/skills/sl-ideate/SKILL.md`, `plugins/super-looper/skills/sl-strategy/SKILL.md` — the adjacent skills to reconcile against.

## Disposition (2026-06-18): parked, not pursued now

Ran through `/sl-brainstorm`. Decision: **do not build the reflect/refresh/route workflow yet.** Getting clear on the existing infrastructure partly answered the seed's own open questions, and the answer is "premature":

1. **Consume side is already thick.** `sl-learnings-researcher` runs at three stages — `sl-ideate`, `sl-plan` (always), and `sl-code-review` (always). The net-new value isn't "read learnings"; it narrows to two gaps: cadence-based staleness refresh, and routing/priming continuity into the next cycle. Smaller prize than the seed implied.
2. **No corpus to reflect on yet.** The producer (autopilot learning capture, `docs/plans/2026-06-18-003-feat-autopilot-learning-capture-plan.md`) isn't shipped. Building a synthesizer before learnings accumulate is consumer-before-producer. Ship capture, let `docs/solutions/` grow under real runs, then reassess.
3. **No observed pain surfaced.** The premise question — what the absence of proactive reflection actually costs — went unanswered, consistent with the cost being low while the corpus is small and reactive lookup is wired at three stages.

The two real gaps are **enhancement-sized, not a new skill**:

- *Staleness refresh on a cadence* → a `/loop` schedule of `/sl-compound-refresh`, or a nudge — not new infrastructure.
- *Cross-corpus synthesis + routing* → teach `sl-ideate` to optionally read the **whole** `docs/solutions/` corpus for cross-cutting patterns, not only topic-relevant ones.

Neither needs the three-part workflow this seed sketched.

**Revisit trigger.** After capture ships and ~15–20 learnings have accumulated, if you catch yourself repeating work across cycles or stalling at "what now" between loops, that's the signal to pick this back up — likely as the two enhancements above rather than a new workflow.
