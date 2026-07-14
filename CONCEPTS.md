# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as sl-compound and sl-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## The plugin and its parts

### Plugin
A distributable bundle of Skills, Agents, Commands, and Hooks (optionally MCP servers) described by a single manifest and installed into Claude Code as one unit — the artifact the Marketplace distributes.

### Skill
A slash-invoked capability defined in its own directory, and the primary entry point a user reaches for. A Skill orchestrates: it can progressively pull in its own reference files as needed and dispatch Agents to do scoped work. Distinct from an Agent in that a Skill is user-invoked and coordinates, whereas an Agent is dispatched by a Skill.

### Agent
A specialized, single-purpose worker a Skill dispatches to run in its own isolated context and return a result, rather than to converse with the user. Also called a subagent. Agents are not invoked directly by users; a Skill decides when and how many to run.

### Marketplace
The catalog metadata listing installable plugins and their versions for distribution through Claude Code, kept consistent with each Plugin's manifest by release validation.

## Super looper

### Super looper
The methodology this project embodies: structure engineering work so each unit makes the next one easier, capturing reusable knowledge as you go so the toolset gets smarter with every use.

### Pipeline
The chained progression of Skills that carries a piece of work from strategy and ideation through brainstorm, plan, execution, and review, and closes by capturing what was learned. Each stage hands a durable artifact to the next, and research is gathered at the stage that needs it rather than re-gathered downstream. The legacy stacked-skill path runs through `/lfg` (or `loop.sh --legacy-lfg-plan`); the current [core workflow](#core-loop) is `/sl-strategy` → `/sl-plan` → `/sl-run`, where `sl-run` owns routing, worker dispatch, [verification](#review-ready-boundary), engineer review, approved delivery, and [closeout](#closeout-packet).

### Learning
A documented solution to a past problem — a bug fix, a convention, or a workflow pattern — stored as the unit of compounded knowledge so future work can find and reuse it. Also called a solution doc. Carries structured metadata (category, tags, problem type) for retrieval and is classified by its problem type onto a bug or knowledge Track; its creation date lives in the entry, not the filename.

### Track
The classification of a Learning as either bug or knowledge, decided by its problem type, that determines which frontmatter fields it must carry. A bug-track Learning documents a diagnosed defect and requires observable symptoms, a root cause, and a resolution type; a knowledge-track Learning documents a practice, pattern, convention, or workflow and requires none of those beyond the shared core fields.

### Pattern doc
Guidance generalized from several Learnings into a broader rule. Higher-leverage than any single incident-level Learning, and higher-risk when stale, because future work treats it as broadly applicable.

## Loop driver

### Loop driver
The unattended runner that launches the autopilot Pipeline headlessly against a target repo, bounded by a wall-clock-and-retry cap and stopped by a target-scoped success predicate. It treats the pipeline's DONE as a routing signal, not a success signal, and requires an independent green verification before declaring success. It emits one Run-record per terminal run.

### Run-record
The structured, index-not-copy record the Loop driver writes on every operational terminal path — success or any honest failure. It names the run's outcome, verification result, timing, and pointers (transcript, pull request, residual findings) without inlining seed text or identifiers, so it indexes a run rather than copying its content.

### Run-record ledger
The committed, append-only corpus — one Run-record per line — that accumulates Run-records across runs so a downstream reader can aggregate them over a window. It survives a clean checkout and travels to a fresh or cloud checkout, unlike machine-local config; its absence is a valid "no runs yet" state, not an error.

### Goal guard
The paired mechanism that refuses to let an unattended run change its own goal and still report success. The authoritative half is a checksum in the Loop driver (`loop.sh`): it snapshots the sha256 of `STRATEGY.md` and the active plan at the start of each cold attempt and re-hashes on every done-reached path before verification, exiting 8 with `typed_failure: "goal-drift"` on any mismatch — catching every mutation path, including Bash writes and subagent worktree merges that bypass tool interception. The baseline is scoped to the [Attempt lineage](#attempt-lineage), not the single attempt: a resumed attempt inherits the prior cold baseline rather than re-snapshotting the surviving tree, so a mutation made by a crashed attempt cannot be laundered into a clean baseline. The defense-in-depth half is the plugin's PreToolUse hook, which denies a Write/Edit to the exact goal-file paths only inside an unattended session (armed via `LOOP_GOAL_GUARD_PATHS`); it fails fast and teaches the boundary mid-run but is never the sole guard. Shares the honesty principle of the [Give-up floor](#give-up-floor): a run that drifted from its goal must abort rather than ship the drift as success.

### Attempt lineage
The chain of attempts within one run that shares surviving working-tree state — a cold attempt plus every resumed attempt that skipped the reset because a validated progress record carried the state forward. Invariants captured "per attempt" are actually scoped per lineage: any baseline, snapshot, or budget that assumes a reset ran must be captured where the reset happens (the cold attempt) and inherited across resumes, or a skip-reset path silently narrows what the invariant measures.

## Core loop

### Workflow profile
The risk-sized profile — chore, bug, feature, or hotfix — that `sl-run` selects deterministically from the plan and repository evidence. Each profile owns verification lenses, repair budgets, worker count eligibility, and required evidence gates: chore requires configured checks and completion; bug requires reproduction or causal evidence plus regression coverage; feature requires acceptance, scope, testing, and independent verification; hotfix requires incident impact, surgical scope, rollback evidence, and an explicit engineer proposal approval before implementation starts. The selection cannot be lowered from the deterministic floor — a user override may raise cost or review depth, but the recorded safety floor stands.

### Run state
The code-owned state file under `/tmp/super-looper/sl-run/<run-id>/run-state.json` written by the [state engine](#state-engine) (run-state.py script). It holds the canonical current status, completed work, independent verification evidence, commits, usage, and closeout observations — the durable resume and audit handle for a run. Resuming requires revalidating the schema, goal hashes, branch identity, and completed gates before continuing; terminal runs cannot resume.

### Review-ready boundary
The durable state marking implementation, direct checks, and independent verification passed. It is the default unattended stop for a run — never approval or delivery authority. `review_ready` gates the review packet showing intent, scope, diff, checks, findings, and risks; engineer review is a separate authority gate. `completed` additionally means an engineer-approved delivery plus evidence closeout were durably recorded — the terminal state indicating both approval and delivery happened.

### Closeout packet
The durable evidence artifact `sl-run` builds when a run reaches terminal state. It holds indexed solution corpus checks, learning candidates, strategy observations, and closure metadata. Learning is derived from the closeout packet (not the hot transcript), and `no-learning` is a normal successful outcome. Strategy deltas are written only to the run bundle as proposals; they never authorize a strategy edit without a later explicit `sl-strategy` reconciliation.

### Host adapter
The runtime reference seam (runtime-claude.md / runtime-codex.md) that allows the same skill to run on both Claude Code and Codex hosts. The adapter mediates questions, worker dispatch, model selection, worktree isolation, script execution, plugin updates, and hook payload handling between the shared semantic SKILL.md and each host's native capabilities — making the skill portable across both platforms.

### Host smoke
The explicit diagnostic (`sl-host-smoke`) that validates plugin loading, reference file resolution, bundled script execution, and worker dispatch on the installed host without modifying the target repository. Its two packaged copies (Claude Code and Codex) are drift-checked byte-for-byte; it is the first executable proof the host-adapter seam works.

### State engine
The bundled `scripts/run-state.py` kernel that is the sole state writer and transition authority for a run. It owns plan parsing, profile selection, phase management, unit routing, boundary gates, and terminal decisions. It emits one JSON summary on stdout and returns typed errors on stderr; the host adapter performs only the `next_action` it emits and routes results back through kernel record operations. Exit codes carry semantics: 0 = success or typed check failure, 2 = CLI usage error, 3 = invalid plan/state/packet, 4 = resume safety failure, 5 = illegal state transition, 8 = plan or strategy goal drift.

## Skill orchestration

### Model tier
A semantic cost class for a dispatched sub-agent — extraction (cheapest capable, for retrieval and quoting), generation (mid-tier, for evidence-driven work and mechanical verification), or ceiling (the orchestrator's own model, inherited by omitting any model selection) — declared once per Skill and referenced by tier name so model names never hardcode into skill content.

When a platform cannot select models per agent, every role runs on the inherited model and cost control falls back to structure: read budgets and output caps.

### Evidence dossier
A bulk evidence artifact — verbatim quotes with source pointers, gathered by a cheap scout agent — written to scratch storage instead of returned inline, so the orchestrator carries only a short gist and downstream agents read the full dossier themselves.

### Load stub
The inline remnant left in a Skill when load-bearing content moves to a reference file: a load instruction that names what the reference contains and the failure mode of skipping it, while keeping no detail an agent could improvise from — making the load structurally necessary rather than advisory.

## Review and workflow vocabulary

### Reviewer persona
A single-lens reviewer Agent that evaluates work from one specific perspective — security, correctness, scope, design, and so on. Review Skills dispatch a panel of personas and merge their findings.

### Fleet
The set of agents a Skill dispatches together in one parallel fan-out — the reviewer-persona panel is one example, but ideation and research fleets exist too. Fleet is the unit that scopes agent-color distinctness. Where a fleet is small enough to fit the 8-value `color` palette, every agent in it takes a distinct color so a user can tell co-running agents apart at a glance. Where a fleet exceeds the palette (e.g. code-review), it sub-splits into attention tiers and agents sharing a tier may share a color, disambiguated by the agent name rendered beside the chip. Colors may be reused across fleets that never co-dispatch.

### Confidence anchor
A discrete, self-scored confidence value on a fixed small scale, each level tied to a behavioral criterion the model can honestly apply, used to gate and rank review findings instead of a continuous score that invites false precision. Each review Skill sets its own actionable threshold; corroboration across personas promotes a finding by one level.

### Autofix class
The classification of a review finding by how safely its proposed fix can be applied: applied silently, applied only after user confirmation, left for a human to resolve, or recorded as advisory with no action.

### Headless mode
An explicit opt-in mode that runs a Skill unattended, with no user prompts — it produces a written report as its deliverable and conservatively defers genuinely ambiguous decisions rather than guessing.

### Beta skill
A parallel copy of a stable Skill, suffixed `-beta`, used to trial a new version alongside the stable one without disrupting users. Invoked manually (model auto-invocation is disabled); promoting it to stable is an orchestration change, not just a rename — every caller must move in the same change so none silently inherits stale defaults.

### Give-up floor
The honest terminal state an autopilot loop falls back to when it cannot resolve a failure: a recorded "unresolved" account plus a completed-but-failing exit. The floor is preserved, never replaced, by any deeper retry layered on top — a layer may add a chance to succeed, but the loop must still be able to stop and report the failure truthfully.

### Escalation rung
A bounded, one-shot deeper step inserted before a loop's give-up floor. It fires only on genuine exhaustion (reading a disposition the loop already recorded, not re-judging at the gate), runs the deeper tool once, re-checks the success signal exactly once, and has only two exits: it converges with the normal success path or it falls through to the floor. It never loops and never manufactures a false pass — because a re-check certifies only the existing checks, the no-weaken discipline, not the re-check, is what guards against a masked failure shipping as success.

### Quiescence gate
A wait inserted before a fix-then-verify loop re-reads state, blocking until the asynchronous actors that respond to the just-pushed change have responded to *that* change — keyed on a per-action signal rather than on elapsed time — so the loop does not conclude on a premature "nothing pending right now" reading.

It waits only on the actors that produce the async signal (the automated reviewers active on the work), never on those handled synchronously in the round they appear. The wait is bounded by a per-wait timeout that proceeds rather than hangs, and on timeout it labels the conclusion provisional — surfacing that a late round may still arrive — rather than implying a quiescence it never observed. Shares the honesty principle of the [Escalation rung](#escalation-rung) and [Give-up floor](#give-up-floor): a conclusion drawn from a premature or partial signal must be marked as such, never reported as certain.
