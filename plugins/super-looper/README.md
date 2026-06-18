# Super Looper Plugin

AI-powered development tools that get smarter with every use. Make each unit of engineering work easier than the last.

## Getting Started

After installing, run `/sl-setup` in any project. It diagnoses your environment, installs missing tools, and bootstraps project config in one interactive flow.

## Components

| Component | Count |
|-----------|-------|
| Agents | 50+ |
| Skills | 39+ |

## Skills

The primary entry points for engineering work, invoked as slash commands. Detailed user-facing documentation for many skills lives in [`docs/skills/`](../../docs/skills/) — each linked skill name below points to its page (purpose, novel mechanics, use cases, chain position). Skills without dedicated docs are still listed; their `SKILL.md` in the source tree is authoritative.

### Core Workflow

`sl-strategy` anchors the loop upstream; `sl-product-pulse` closes it with a read on user outcomes.

| Skill | Description |
|-------|-------------|
| [`/sl-strategy`](../../docs/skills/sl-strategy.md) | Create or maintain `STRATEGY.md` — the product's target problem, approach, persona, key metrics, and tracks. Re-runnable to update. Read as grounding by `/sl-ideate`, `/sl-brainstorm`, and `/sl-plan` when present |
| [`/sl-ideate`](../../docs/skills/sl-ideate.md) | Optional big-picture ideation: generate and critically evaluate grounded ideas, then route the strongest one into brainstorming. Writes the ranked ideation artifact as a single self-contained HTML file by default (human-facing); pass `output:md` for markdown (exclusive — html OR md, never both) |
| [`/sl-brainstorm`](../../docs/skills/sl-brainstorm.md) | Interactive Q&A to think through a feature or problem and write a right-sized requirements doc before planning. Pass `output:html` to write the doc as a single self-contained HTML file instead of markdown (exclusive — md OR html, never both) |
| [`/sl-plan`](../../docs/skills/sl-plan.md) | Create structured plans for any multi-step task -- software features, research workflows, events, study plans -- with automatic confidence checking. Pass `output:html` to write the plan as a single self-contained HTML file instead of markdown (exclusive — md OR html, never both) |
| [`/sl-code-review`](../../docs/skills/sl-code-review.md) | Structured code review with tiered persona agents, confidence gating, and dedup pipeline |
| [`/sl-work`](../../docs/skills/sl-work.md) | Execute work items systematically |
| [`/sl-debug`](../../docs/skills/sl-debug.md) | Systematically find root causes and fix bugs -- traces causal chains, forms testable hypotheses, and implements test-first fixes |
| [`/sl-compound`](../../docs/skills/sl-compound.md) | Document solved problems to compound team knowledge |
| [`/sl-compound-refresh`](../../docs/skills/sl-compound-refresh.md) | Refresh stale or drifting learnings and decide whether to keep, update, replace, or archive them |
| [`/sl-optimize`](../../docs/skills/sl-optimize.md) | Run iterative optimization loops with parallel experiments, measurement gates, and LLM-as-judge quality scoring |
| [`/sl-product-pulse`](../../docs/skills/sl-product-pulse.md) | Generate a single-page, time-windowed report on usage, performance, errors, and followups. Saves reports to `docs/pulse-reports/` as a browseable timeline of what users experienced |

### Research & Context

| Skill | Description |
|-------|-------------|
| [`/sl-sessions`](../../docs/skills/sl-sessions.md) | Ask questions about session history across Claude Code sessions |
| [`/sl-slack-research`](../../docs/skills/sl-slack-research.md) | Search Slack for interpreted organizational context -- decisions, constraints, and discussion arcs |
| [`sl-riffrec-feedback-analysis`](../../docs/skills/sl-riffrec-feedback-analysis.md) | Convert [Riffrec](https://github.com/kieranklaassen/riffrec) recordings, videos, audio, or notes into structured feedback. Routes between setup, quick bug report, and extensive analysis that hands off to `sl-brainstorm` |

### Git Workflow

| Skill | Description |
|-------|-------------|
| [`sl-clean-gone-branches`](../../docs/skills/sl-clean-gone-branches.md) | Clean up local branches whose remote tracking branch is gone |
| [`sl-commit`](../../docs/skills/sl-commit.md) | Create a git commit with a value-communicating message |
| [`sl-commit-push-pr`](../../docs/skills/sl-commit-push-pr.md) | Commit, push, and open a PR with an adaptive description; also update an existing PR description, or generate a description on its own without committing |
| [`sl-worktree`](../../docs/skills/sl-worktree.md) | Ensure work happens in an isolated git worktree — detect existing isolation, prefer native worktree tooling, else create one |

### Workflow Utilities

| Skill | Description |
|-------|-------------|
| [`/sl-demo-reel`](../../docs/skills/sl-demo-reel.md) | Capture a visual demo reel (GIF demos, terminal recordings, screenshots) for PRs with project-type-aware tier selection |
| `sl-handoff` | Compact the current session into a clean handoff doc a fresh agent can pick up — references artifacts by path, used at the plan→work seam to carry planning context into a clean run (e.g. `loop.sh --handoff-file`) |
| `sl-learn` | Capture a ship-time learning at the close of an autopilot run — invoke `sl-compound` headless against the hot session context, commit the resulting `docs/solutions/` learning into the run's PR, and re-confirm CI green. Triggered by `lfg` after CI green and before `DONE`; skips when no open PR exists or CI is unresolved |
| [`/sl-promote`](../../docs/skills/sl-promote.md) | Draft user-facing announcement copy for a shipped feature (X post, changelog blurb, LinkedIn, email); voice-matched via the Spiral CLI when installed, a lite layer of editorial & social expertise without it |
| [`/sl-report-bug`](../../docs/skills/sl-report-bug.md) | Report a bug in the super-looper plugin |
| [`/sl-resolve-pr-feedback`](../../docs/skills/sl-resolve-pr-feedback.md) | Resolve PR review feedback in parallel |
| [`/sl-test-browser`](../../docs/skills/sl-test-browser.md) | Run browser tests on PR-affected pages |
| [`/sl-test-xcode`](../../docs/skills/sl-test-xcode.md) | Build and test iOS apps on simulator using XcodeBuildMCP |
| [`/sl-setup`](../../docs/skills/sl-setup.md) | Diagnose environment, install missing tools, and bootstrap project config |
| [`/sl-update`](../../docs/skills/sl-update.md) | Check super-looper plugin version and fix stale cache (Claude Code only) |
| [`/sl-release-notes`](../../docs/skills/sl-release-notes.md) | Summarize recent super-looper plugin releases, or answer a question about a past release with a version citation |

### Development Frameworks

| Skill | Description |
|-------|-------------|
| `sl-agent-native-architecture` | Build AI agents using prompt-native architecture |
| `sl-dhh-rails-style` | Write Ruby/Rails code in DHH's 37signals style |
| [`sl-frontend-design`](../../docs/skills/sl-frontend-design.md) | Create production-grade frontend interfaces |
| [`sl-polish`](../../docs/skills/sl-polish.md) | Conversational UX polish — start a dev server, open the feature in a browser, and iterate together; auto-detects 8 frameworks. Manual invocation only |

### Review & Quality

| Skill | Description |
|-------|-------------|
| [`sl-doc-review`](../../docs/skills/sl-doc-review.md) | Review documents using parallel persona agents for role-specific feedback |
| [`/sl-simplify-code`](../../docs/skills/sl-simplify-code.md) | Simplify recent code changes for reuse, quality, and efficiency — parallel reviewers find issues, fixes applied, behavior verified by tests |

### Content & Collaboration

| Skill | Description |
|-------|-------------|
| [`sl-proof`](../../docs/skills/sl-proof.md) | Create, edit, and share documents via Proof collaborative editor |

### Beta / Experimental

| Skill | Description |
|-------|-------------|
| `sl-dogfood-beta` | Diff-scoped browser QA of the active branch: builds an exhaustive test matrix of every change, drives the app with agent-browser, then auto-fixes issues, adds regression tests, and commits each fix until green |
| `/lfg` | Full autonomous engineering workflow |

## Agents

Agents are specialized subagents invoked by skills — you typically don't call these directly.

### Review

| Agent | Description |
|-------|-------------|
| `sl-agent-native-reviewer` | Verify features are agent-native (action + context parity) |
| `sl-api-contract-reviewer` | Detect breaking API contract changes |
| `sl-architecture-strategist` | Analyze architectural decisions and compliance |
| `sl-code-simplicity-reviewer` | Final pass for simplicity and minimalism |
| `sl-correctness-reviewer` | Logic errors, edge cases, state bugs |
| `sl-data-integrity-guardian` | Database migrations and data integrity |
| `sl-data-migration-reviewer` | Schema drift, migration safety, mapping verification, deploy-window checks |
| `sl-deployment-verification-agent` | Create Go/No-Go deployment checklists for risky data changes |
| `sl-julik-frontend-races-reviewer` | Review JavaScript/Stimulus code for race conditions |
| `sl-maintainability-reviewer` | Coupling, complexity, naming, dead code |
| `sl-pattern-recognition-specialist` | Analyze code for patterns and anti-patterns |
| `sl-performance-oracle` | Performance analysis and optimization |
| `sl-performance-reviewer` | Runtime performance with confidence calibration |
| `sl-reliability-reviewer` | Production reliability and failure modes |
| `sl-security-reviewer` | Exploitable vulnerabilities with confidence calibration |
| `sl-security-sentinel` | Security audits and vulnerability assessments |
| `sl-swift-ios-reviewer` | Swift and iOS code review -- SwiftUI state, retain cycles, concurrency, Core Data threading, accessibility |
| `sl-testing-reviewer` | Test coverage gaps, weak assertions |
| `sl-project-standards-reviewer` | CLAUDE.md and AGENTS.md compliance |
| `sl-adversarial-reviewer` | Construct failure scenarios to break implementations across component boundaries |

### Document Review

| Agent | Description |
|-------|-------------|
| `sl-coherence-reviewer` | Review documents for internal consistency, contradictions, and terminology drift |
| `sl-design-lens-reviewer` | Review plans for missing design decisions, interaction states, and AI slop risk |
| `sl-feasibility-reviewer` | Evaluate whether proposed technical approaches will survive contact with reality |
| `sl-product-lens-reviewer` | Challenge problem framing, evaluate scope decisions, surface goal misalignment |
| `sl-scope-guardian-reviewer` | Challenge unjustified complexity, scope creep, and premature abstractions |
| `sl-security-lens-reviewer` | Evaluate plans for security gaps at the plan level (auth, data, APIs) |
| `sl-adversarial-document-reviewer` | Challenge premises, surface unstated assumptions, and stress-test decisions |

### Research

| Agent | Description |
|-------|-------------|
| `sl-best-practices-researcher` | Gather external best practices and examples |
| `sl-framework-docs-researcher` | Research framework documentation and best practices |
| `sl-git-history-analyzer` | Analyze git history and code evolution |
| `sl-issue-intelligence-analyst` | Analyze GitHub issues to surface recurring themes and pain patterns |
| `sl-learnings-researcher` | Search institutional learnings for relevant past solutions |
| `sl-repo-research-analyst` | Research repository structure and conventions |
| `sl-session-historian` | Search prior Claude Code sessions for related investigation context |
| `sl-slack-researcher` | Search Slack for organizational context relevant to the current task |
| `sl-web-researcher` | Perform iterative web research and return structured external grounding (prior art, adjacent solutions, market signals, cross-domain analogies) |

### Design

| Agent | Description |
|-------|-------------|
| `sl-design-implementation-reviewer` | Verify UI implementations match Figma designs |
| `sl-design-iterator` | Iteratively refine UI through systematic design iterations |
| `sl-figma-design-sync` | Synchronize web implementations with Figma designs |

### Workflow

| Agent | Description |
|-------|-------------|
| `sl-pr-comment-resolver` | Address PR comments and implement fixes |
| `sl-spec-flow-analyzer` | Analyze user flows and identify gaps in specifications |

### Docs

| Agent | Description |
|-------|-------------|
| `sl-ankane-readme-writer` | Create READMEs following Ankane-style template for Ruby gems |

## Installation

See the repo root [Install section](../../README.md#install) for current installation instructions for Claude Code.

Then run `/sl-setup` to check your environment and install recommended tools.

## Version History

See the repo root [CHANGELOG.md](../../CHANGELOG.md) for canonical release history.

## License

MIT
