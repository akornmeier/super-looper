# Skill Documentation

End-user-facing documentation for super-looper plugin skills. Each page covers the skill's high-level purpose, novel mechanics, use cases, and chain position relative to other skills.

For runtime behavior and contributor reference, the `SKILL.md` in each skill's source folder under `plugins/super-looper/skills/` is authoritative.

---

## The super-looper core loop

```text
   [/sl-ideate]       (optional) "What's worth exploring?"
        │
        ▼
┌─→ /sl-brainstorm    "What does this need to be?"
│       │
│       ▼
│   /sl-plan          "What's needed to accomplish this?"
│       │
│       ▼
│   /sl-work          "Build it."
│       │
│       ▼
└── /sl-compound      "Capture what we learned."
```

`/sl-compound` is the closer that makes the loop *compound*: it writes learnings into `docs/solutions/`, which the next iteration's `/sl-brainstorm` and `/sl-plan` read as grounding — that return arrow is the whole point. `/sl-ideate` is an optional prelude for when you don't yet know what to work on. Everything else in this catalog is either an anchor around the loop or an on-demand tool used when a specific need arises — not a step you walk through every time.

---

## The Core Loop

The steps of every engineering iteration. `/sl-ideate` runs only when you need to find a direction first; the other four run in order per piece of work.

| Skill | Description |
|-------|-------------|
| [`/sl-ideate`](./sl-ideate.md) | *Optional first step* — discover strong, qualified directions worth exploring with six conceptual frames, warrant requirement, adversarial filtering |
| [`/sl-brainstorm`](./sl-brainstorm.md) | Define what something should become — collaborative dialogue, named gap lenses, right-sized requirements doc |
| [`/sl-plan`](./sl-plan.md) | Bound execution with guardrails — U-IDs, test scenarios, automatic confidence check; WHAT decisions, not HOW code |
| [`/sl-work`](./sl-work.md) | Execute against the plan's guardrails — figure out the HOW with code in front of you, ship through quality gates |
| [`/sl-compound`](./sl-compound.md) | Close the loop by capturing what you learned into `docs/solutions/` so the next iteration starts smarter — bug track + knowledge track |

---

## Around the Loop

Skills that anchor, feed, or maintain the loop without being steps inside it.

| Skill | Description |
|-------|-------------|
| [`/sl-strategy`](./sl-strategy.md) | Create or maintain `STRATEGY.md` — the upstream anchor read by `sl-ideate`, `sl-brainstorm`, and `sl-plan` as grounding |
| [`/sl-product-pulse`](./sl-product-pulse.md) | Outer feedback loop — single-page time-windowed report on usage, performance, errors, followups; saved to `docs/pulse-reports/` as a timeline |
| [`/sl-compound-refresh`](./sl-compound-refresh.md) | Maintain `docs/solutions/` over time — five outcomes (Keep / Update / Consolidate / Replace / Delete), Interactive + Autofix modes |

---

## On-Demand

Invoked when a specific need arises — not part of any chain.

| Skill | Description |
|-------|-------------|
| [`/sl-debug`](./sl-debug.md) | Find root causes systematically — causal chain gate, predictions for uncertain links, smart escalation |
| [`/sl-code-review`](./sl-code-review.md) | Structured code review with tiered persona agents, confidence-gated findings, four modes |
| [`/sl-doc-review`](./sl-doc-review.md) | Review requirements or plan documents using parallel persona agents — coherence, feasibility, product-lens, design-lens, security-lens, scope-guardian, adversarial |
| [`/sl-simplify-code`](./sl-simplify-code.md) | Refine recently changed code — three parallel reviewer agents (reuse, quality, efficiency); behavior preservation verified |
| [`/sl-optimize`](./sl-optimize.md) | Metric-driven iterative optimization loops — three-tier evaluation, parallel experiments, persistence discipline |

---

## Research & Context

| Skill | Description |
|-------|-------------|
| [`/sl-sessions`](./sl-sessions.md) | Search Claude Code session history for context relevant to a question |
| [`/sl-slack-research`](./sl-slack-research.md) | Search Slack for interpreted organizational context — workspace identity, research-value assessment, cross-cutting analysis |
| [`/sl-riffrec-feedback-analysis`](./sl-riffrec-feedback-analysis.md) | Turn raw [Riffrec](https://github.com/kieranklaassen/riffrec) recordings into structured feedback — quick bug or extensive analysis with `sl-brainstorm` handoff |

---

## Git Workflow

| Skill | Description |
|-------|-------------|
| [`/sl-commit`](./sl-commit.md) | Create a single, well-crafted git commit — convention-aware, sensitive-file-safe, file-level logical splitting |
| [`/sl-commit-push-pr`](./sl-commit-push-pr.md) | Go from working changes to an open PR with adaptive descriptions — three modes (full workflow / description update / description-only generation) |
| [`/sl-clean-gone-branches`](./sl-clean-gone-branches.md) | Delete local branches whose remote tracking branch is gone, including any associated worktrees |
| [`/sl-worktree`](./sl-worktree.md) | Ensure work happens in an isolated git worktree — detect existing isolation, prefer the harness's native worktree tool, fall back to plain git |

---

## Frontend Design

| Skill | Description |
|-------|-------------|
| [`/sl-frontend-design`](./sl-frontend-design.md) | Build web interfaces with genuine design quality — context detection, visual-thesis pre-build, opinionated defaults, visual verification |
| [`/sl-polish`](./sl-polish.md) | Conversational UX polish — start dev server, open browser, iterate together; auto-detects 8 frameworks (manual invocation only) |

---

## Collaboration

| Skill | Description |
|-------|-------------|
| [`/sl-proof`](./sl-proof.md) | Create, share, and run human-in-the-loop review loops over markdown via [Proof](https://www.proofeditor.ai), Every's collaborative editor — Web API and Local Bridge surfaces |

---

## Workflow Utilities

| Skill | Description |
|-------|-------------|
| [`/sl-demo-reel`](./sl-demo-reel.md) | Capture visual evidence (GIF, terminal recording, screenshots) for PR descriptions — strict separation from test output |
| [`/sl-handoff`](./sl-handoff.md) | Compact the current session into a clean handoff doc a fresh agent can pick up — delta-only, artifacts by reference; produced at the plan→work seam for unattended `loop.sh` runs |
| [`/sl-promote`](./sl-promote.md) | Draft user-facing announcement copy for a shipped feature (X, changelog, LinkedIn, email) — voice-matched via the optional Spiral CLI, a lite layer of editorial & social expertise without it, drafts only |
| [`/sl-resolve-pr-feedback`](./sl-resolve-pr-feedback.md) | Evaluate, fix, and reply to PR review feedback in parallel — including nitpicks |
| [`/sl-test-browser`](./sl-test-browser.md) | End-to-end browser tests on PR / branch-affected pages using `agent-browser` exclusively |
| [`/sl-test-xcode`](./sl-test-xcode.md) | Build and test iOS apps on simulator using XcodeBuildMCP — screenshots, logs, human verification |
| [`/sl-setup`](./sl-setup.md) | Diagnose environment, install missing tools, bootstrap project-local config — interactive onboarding in one flow |
| [`/sl-update`](./sl-update.md) | Check the installed super-looper plugin version against `main` and recommend the update command (Claude Code only) |
| [`/sl-release-notes`](./sl-release-notes.md) | Look up what shipped in recent super-looper plugin releases — summary or specific question with version citation |
| [`/sl-report-bug`](./sl-report-bug.md) | Report a bug in the super-looper plugin — structured intake, automatic env gathering, GitHub issue creation |

---

## See also

For the complete catalog of skills (including those without dedicated docs here), see [`plugins/super-looper/README.md`](../../plugins/super-looper/README.md). Each skill's authoritative runtime spec is in `plugins/super-looper/skills/<skill>/SKILL.md`.
