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
The chained progression of Skills that carries a piece of work from strategy and ideation through brainstorm, plan, execution, and review, and closes by capturing what was learned. Each stage hands a durable artifact to the next, and research is gathered at the stage that needs it rather than re-gathered downstream.

### Learning
A documented solution to a past problem — a bug fix, a convention, or a workflow pattern — stored as the unit of compounded knowledge so future work can find and reuse it. Also called a solution doc. Carries structured metadata (category, tags, problem type) for retrieval and is classified by its problem type onto a bug or knowledge Track; its creation date lives in the entry, not the filename.

### Track
The classification of a Learning as either bug or knowledge, decided by its problem type, that determines which frontmatter fields it must carry. A bug-track Learning documents a diagnosed defect and requires observable symptoms, a root cause, and a resolution type; a knowledge-track Learning documents a practice, pattern, convention, or workflow and requires none of those beyond the shared core fields.

### Pattern doc
Guidance generalized from several Learnings into a broader rule. Higher-leverage than any single incident-level Learning, and higher-risk when stale, because future work treats it as broadly applicable.

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
