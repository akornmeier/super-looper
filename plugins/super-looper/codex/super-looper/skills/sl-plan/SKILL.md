---
name: sl-plan
description: "Create an executable phased plan for a multi-step task. Uses the parent frontier model for planning, grounds once in repository strategy and evidence, and delegates only when an important uncertainty cannot be resolved locally. Produces canonical Markdown by default and preserves explicit HTML output for Claude Code compatibility."
argument-hint: "[task, requirements path, or existing plan path] [output:md|output:html] [mode:interactive|mode:headless]"
allowed-tools: Bash(python3 *generate-plan-images.py*), Bash(python3 *wire-plan-references.py*)
---

# Frontier planner

Turn the request into one durable, dependency-ordered execution plan. The parent model is the planner. Do not implement the work, run a planning fleet, or delegate synthesis.

**Runtime adapter:** this Claude Code package uses `references/runtime-claude.md`. Read it only when a question, scout, critic, or optional renderer needs host mechanics.

## Invariants

- Plan every direct invocation. If the task is unclear, resolve only the decisions that materially change the plan.
- Read repository instructions and user-named sources before planning. Treat `STRATEGY.md`, when present, as product grounding, not permission to change the user's goal.
- Load strategy, requirements, relevant code, and matched `docs/solutions/` learnings once. Reuse notes instead of repeatedly rediscovering the repository.
- Use repo-relative paths in the artifact. Never write author-machine absolute paths into a plan.
- Capture decisions and execution guardrails, not implementation code or shell choreography.
- The plan is immutable once an `sl-run` execution starts. During planning, an existing plan may be revised only with the user's approval; preserve its unit IDs and status markers.
- Workers never edit the active plan or strategy. A scout or critic returns evidence to the parent planner, which alone writes the plan.
- A normal planning run uses zero subagents. At most one scoped scout and one independent critic may run, each behind its gate below.

## Input

Treat arguments that begin with the literal prefixes `output:` and `mode:` as flags. Preserve every other token verbatim, including `feat:`, `fix:`, and `chore:`.

If no task, source document, or existing plan is identifiable, ask: "What would you like planned?" Then wait. Otherwise proceed without an intake ceremony.

## Workflow

### 0. Resolve mode and output

Set `INTERACTION_MODE` to `interactive` unless `mode:headless`, LFG, or another unattended caller is explicit.

#### 0.0 Output Mode

Output is exclusive: Markdown or HTML, never both.

1. An explicit `output:md` or `output:html` wins.
2. Otherwise read the active, non-commented `plan_output: md|html` key from `.super-looper/config.local.yaml` when present. Ignore commented examples such as `# plan_output: html`.
3. Otherwise use `OUTPUT_FORMAT=md`.
4. Pipeline or `disable-model-invocation` context always forces `OUTPUT_FORMAT=md`, even over an explicit HTML request or config.

An empty or unknown `output:` value is ignored. After final resolution, report the actual selected mode; do not hardcode an `md` fallback in the note.

Markdown is the canonical core-loop artifact. Read `references/plan-contract.md` before composing it. HTML is a compatibility renderer: when explicitly resolved, read `references/optional-renderer.md` and the references it selects. The renderer changes presentation, not plan semantics.

### 1. Ground once

Build one compact evidence dossier in the parent context:

1. Read the request and every user-named local artifact.
2. Read repo instructions and `STRATEGY.md` if present.
3. Inspect only the code, tests, configuration, and documentation needed to locate affected boundaries and established patterns.
4. Search `docs/solutions/` by relevant module, tags, and problem type; read only matched documents.
5. Record facts, decisions already made, constraints, reusable patterns, and unresolved assumptions. Cite local paths or authoritative URLs in the plan when they materially support a decision.

Do not reread sources in later phases unless a contradiction or newly discovered dependency makes it necessary.

### 2. Resolve consequential ambiguity

Separate unknowns into:

- **Planning blockers:** different answers would materially change scope, architecture, sequencing, data safety, or acceptance. Ask one concise question at a time through the runtime adapter. In headless mode, choose the safest reversible assumption and record it under Open Questions or Assumptions.
- **Execution discoveries:** an implementer can resolve them safely while working inside a unit. Put the boundary or decision rule in the unit; do not interrupt planning.

Do not ask for preferences that repository evidence already answers.

### 3. Evidence gate

The parent model performs normal repository research. Dispatch one scoped scout only when all are true:

1. an important decision remains unresolved;
2. local evidence and user-provided sources are insufficient;
3. a bounded research task can return evidence without making the plan;
4. the expected value exceeds the added latency and context.

Give the scout one question, a strict source boundary, and a compact return shape: `finding`, `evidence`, `implication`, `uncertainty`. Do not send the full conversation. Do not dispatch parallel specialists. If the scout fails, record the uncertainty rather than inventing certainty.

Use current authoritative external sources when the user asks for research, the decision is time-sensitive, or a named external API/framework contract is load-bearing. Otherwise prefer repository evidence.

### 4. Decide before decomposing

Write the smallest decision set that makes execution coherent:

- goal and success condition;
- in-scope and non-goals;
- requirements traceability;
- approach and rationale, including a rejected alternative only when it prevents likely re-litigation;
- boundaries, dependencies, rollout/data-safety constraints, and material risks.

Then derive dependency-ordered phases. Each phase must end in an independently checkable completion gate. Split work into units that one worker can own without overlapping another unit's write scope.

### 5. Draft the execution contract

Follow `references/plan-contract.md`. Every unit must include:

- stable lowercase hyphen-case ID and an untouched `[]` status marker;
- bounded scope and repo-relative files or area;
- explicit dependencies and non-goals;
- observable acceptance criteria;
- one argv-compatible verification command per list item, without shell operators, or semantic evidence prefixed with `Inspect `.

For feature-bearing units, name concrete test files and scenarios covering relevant happy, boundary, failure, permission, and integration paths. Blank or missing test scenarios make the plan incomplete. When no automated test is justified, write `Test expectation: none -- <reason>` and provide another verification method.

Right-size the artifact. Small work may have one phase and one unit; complexity earns structure, not prose.

### 6. Critic gate

The parent planner checks the draft against the quality gate below. Use one independent critic only if at least one condition holds:

- security, privacy, payments, destructive data change, migration, compliance, or irreversible rollout is material;
- cross-interface parity or an external dependency makes a missed boundary costly;
- the parent cannot reach high confidence on sequencing, acceptance, or verification after the evidence pass.

Pass the critic only the request, compact evidence dossier, and draft plan. Ask for omissions and contradictions, not a replacement plan. Integrate only findings supported by evidence. Normal and merely large plans do not automatically qualify.

### 7. Write and validate

Write new Markdown plans under `docs/plans/YYYY-MM-DD-NNN-<type>-<name>-plan.md` unless the user chooses another durable repo path. For an existing plan, confirm update-in-place versus new revision when it is not obvious.

Before reporting completion, verify:

- one stable goal; no unresolved planning blocker is hidden;
- every requirement maps to at least one unit or explicit non-goal;
- phase and unit IDs are unique; dependencies exist and are acyclic;
- every unit has files/area, acceptance, verification, dependencies, and non-goals;
- feature-bearing units have named tests and concrete scenarios or an explicit justified exception;
- every phase has a completion gate and material risks are owned;
- paths are repo-relative and the plan contains no implementation-time progress claims;
- existing unit IDs and `[]`, `[wip]`, `[x]`, or `[f]` markers were preserved exactly.

For `OUTPUT_FORMAT=html`, perform the additional renderer checks in `references/optional-renderer.md`. HTML document review remains optional because `sl-doc-review` mutation is Markdown-only.

Report the plan path, whether a scout or critic ran, recorded assumptions, and the recommended next action. Prefer `sl-run plan:<repo-relative-path>` when that skill is available. During the compatibility window, if `sl-run` is not installed, offer `sl-work <repo-relative-path>`. Do not launch execution, create issues, generate images, or open external review tools unless the user explicitly asks.

In headless or pipeline mode, return control immediately after the file and validation summary are written.

## Quality floor

A plan passes only when a capable worker can start the first ready unit without reopening product scope, can tell exactly what evidence proves completion, and can stop honestly when a dependency or acceptance gate fails.
