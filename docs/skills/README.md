# Skill Documentation

<!-- GENERATED FILE — do not edit by hand. Run `bun run docs:emit-index` to regenerate. -->
<!-- Source of truth: each skill's SKILL.md frontmatter under plugins/super-looper/skills/. -->

End-user-facing index of super-looper plugin skills. Every row links to a hand-written page covering that skill's purpose, novel mechanics, and chain position. This index is generated from each skill's `SKILL.md` frontmatter, so the one-line summaries below never drift from the source; the linked pages are curated by hand.

For runtime behavior and contributor reference, the `SKILL.md` in each skill's source folder under `plugins/super-looper/skills/` is authoritative.

| Skill | What it does |
|-------|--------------|
| [`lfg`](./lfg.md) | Run the full autonomous engineering pipeline end-to-end (plan, work, code review, test, commit, push, open PR, watch CI, fix CI failures until green, capture learnings) |
| [`sl-agent-native-architecture`](./sl-agent-native-architecture.md) | Build applications where agents are first-class citizens |
| [`sl-agent-native-audit`](./sl-agent-native-audit.md) | Run comprehensive agent-native architecture review with scored principles |
| [`sl-brainstorm`](./sl-brainstorm.md) | Explore requirements and approaches through collaborative dialogue, then write a right-sized requirements document |
| [`sl-clean-gone-branches`](./sl-clean-gone-branches.md) | Clean up local branches whose remote tracking branch is gone |
| [`sl-code-review`](./sl-code-review.md) | Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline |
| [`sl-commit`](./sl-commit.md) | Create a git commit with a clear, value-communicating message |
| [`sl-commit-push-pr`](./sl-commit-push-pr.md) | Commit, push, and open a PR with an adaptive, value-first description that scales in depth with the change |
| [`sl-compound`](./sl-compound.md) | Document a recently solved problem to compound your team's knowledge or CONCEPTS.md, the project's shared domain vocabulary |
| [`sl-compound-refresh`](./sl-compound-refresh.md) | Refresh stale learning and pattern docs under docs/solutions/ by reviewing them against the current codebase, then updating, consolidating, or deleting drifted ones |
| [`sl-debug`](./sl-debug.md) | Systematically find root causes and fix bugs |
| [`sl-demo-reel`](./sl-demo-reel.md) | Capture a visual demo reel (GIF, terminal recording, screenshots) for PR descriptions |
| [`sl-dhh-rails-style`](./sl-dhh-rails-style.md) | This skill should be used when writing Ruby and Rails code in DHH's distinctive 37signals style |
| [`sl-doc-review`](./sl-doc-review.md) | Review requirements or plan documents using parallel persona agents that surface role-specific issues |
| [`sl-dogfood-beta`](./sl-dogfood-beta.md) | [BETA] Dogfood the active branch end-to-end as a QA engineer |
| [`sl-frontend-design`](./sl-frontend-design.md) | Build web interfaces with genuine design quality, not AI slop |
| [`sl-handoff`](./sl-handoff.md) | Compact the current session into a clean handoff document a fresh agent can pick up, referencing existing artifacts (plan, brainstorm, ADRs) by path instead of duplicating them |
| [`sl-host-smoke`](./sl-host-smoke.md) | Run an explicit, non-mutating compatibility diagnostic for the super-looper plugin |
| [`sl-ideate`](./sl-ideate.md) | Generate and critically evaluate grounded ideas about a topic |
| [`sl-learn`](./sl-learn.md) | Compatibility learning seam for the legacy lfg pipeline: invoke sl-compound headless, evaluate the result, commit an accepted docs/solutions learning into the open PR, and re-confirm CI |
| [`sl-optimize`](./sl-optimize.md) | Run metric-driven iterative optimization loops -- define a measurable goal, run parallel experiments, measure each against hard gates or LLM-as-judge scores, keep improvements, and converge on the best solution |
| [`sl-plan`](./sl-plan.md) | Create an executable phased plan for a multi-step task |
| [`sl-polish`](./sl-polish.md) | Start the dev server, open the feature in a browser, and iterate on improvements together |
| [`sl-product-pulse`](./sl-product-pulse.md) | Generate a time-windowed pulse report on what users experienced and how the product performed - usage, quality, errors, signals worth investigating |
| [`sl-promote`](./sl-promote.md) | Draft user-facing announcement and marketing copy for a feature that just shipped — an X post or thread, a changelog blurb, a LinkedIn post, an email, a blog intro, or a short demo script |
| [`sl-proof`](./sl-proof.md) | Run human-in-the-loop review loops over markdown via Proof (proofeditor.ai) — share, view, comment on, edit, and sync collaborative docs |
| [`sl-release-notes`](./sl-release-notes.md) | Summarize recent super-looper plugin releases, or answer a specific question about a past release with a version citation |
| [`sl-report-bug`](./sl-report-bug.md) | Report a bug in the super-looper plugin |
| [`sl-resolve-pr-feedback`](./sl-resolve-pr-feedback.md) | Resolve PR review feedback by evaluating validity and fixing issues in parallel |
| [`sl-riffrec-feedback-analysis`](./sl-riffrec-feedback-analysis.md) | Riffrec product-feedback workflow |
| [`sl-run`](./sl-run.md) | Execute or resume a canonical sl-plan artifact through a code-owned developer workflow that selects a risk-sized profile, runs deterministic checks and bounded repair, performs independent verification, assembles engineer review, controls approved commit/PR delivery and CI repair, and closes with evidence-based learning and strategy observations |
| [`sl-sessions`](./sl-sessions.md) | Search and ask questions about Claude Code session history |
| [`sl-setup`](./sl-setup.md) | Diagnose and configure super-looper environment |
| [`sl-simplify-code`](./sl-simplify-code.md) | Simplify and refine recently changed code for clarity, reuse, quality, and efficiency while preserving behavior |
| [`sl-slack-research`](./sl-slack-research.md) | Search Slack for interpreted organizational context -- decisions, constraints, and discussion arcs -- and produce a synthesized research digest with cross-cutting analysis |
| [`sl-strategy`](./sl-strategy.md) | Create or maintain STRATEGY.md - the product's target problem, approach, users, key metrics, and tracks of work - or interactively reconcile an evidence-backed sl-run strategy proposal |
| [`sl-test-browser`](./sl-test-browser.md) | Run browser tests on pages affected by current PR or branch |
| [`sl-test-xcode`](./sl-test-xcode.md) | Build and test iOS apps on simulator using XcodeBuildMCP |
| [`sl-update`](./sl-update.md) | Check if the super-looper plugin is up to date and recommend the update command if not |
| [`sl-work`](./sl-work.md) | Execute work efficiently while maintaining quality and finishing features |
| [`sl-worktree`](./sl-worktree.md) | Ensure work happens in an isolated git worktree without disturbing the current checkout |

---

For the complete catalog grouped by category (core loop, git workflow, research, and more), see [`plugins/super-looper/README.md`](../../plugins/super-looper/README.md).
