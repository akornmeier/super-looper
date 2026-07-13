# Plan Sections

This reference describes what makes a great implementation plan. It does NOT
prescribe how the plan looks on the page — rendering is handled by the
format-specific references (`markdown-rendering.md`, `html-rendering.md`).

## The outcome

A great plan enables three audiences to act:

- **The implementing agent** (`sl-work` or a human) starts from an informed
  baseline — load-bearing decisions are named, research breadcrumbs orient
  their own investigation, unit boundaries are clear. The plan gives the
  implementer a starting point, not a substitute for their own investigation.
- **The reviewer** identifies the load-bearing decisions and the boundaries
  of what's being changed in one pass.
- **The future reader** (anyone returning months later) traces why the work
  was done, what shaped it, and where the artifacts live.

Sections earn their place by serving one of these audiences. Omit padding.

## Decide whether a plan doc is warranted at all

Not every invocation of `sl-plan` should produce a plan document. For
genuinely atomic work, the doc is ceremony — the implementer (whether
`sl-work` or a human) can act directly without IDed units, KTDs, or
Requirements as a checklist.

**Bias toward producing a plan.** The risk asymmetry favors writing one:
a thin plan doc for small work is mild ceremony, but skipping a plan when
one was warranted costs the implementer real time (reinvented decisions,
lost unit boundaries, no IDed requirements to verify against). When unsure,
write the plan.

**Skip plan creation only when ALL of these hold:**

- The work is **atomic** — fits in one commit, no meaningful unit boundaries
  to break out independently.
- There are **no design choices that constrain implementation** — no
  Key Technical Decisions worth recording. If the work needs the implementer
  to make a choice between two approaches, those approaches are KTDs and
  a plan is warranted.
- There are **no scope boundaries worth pinning** in writing — the work
  scope is self-evident from the user's request.
- **No upstream artifact** (a brainstorm with R-IDs, an incident report,
  a deferred-follow-up item from a prior plan) needs traceability through
  this plan.

**Stress test the "looks atomic" case.** Many requests look atomic at first
glance but hide design decisions:

- *"Add caching to this endpoint"* — sounds atomic, but TTL, invalidation,
  cache key shape, and backend selection are all KTDs. Write the plan.
- *"Migrate from package A to package B"* — sounds mechanical, but
  semantic differences between the packages create migration KTDs. Write
  the plan.
- *"Add rate limiting"* — sounds small, but algorithm, scope, and
  configurability are all KTDs. Write the plan.

vs. genuine skip cases:

- *"Fix typo in README line 47"* — atomic, no KTDs, skip the plan.
- *"Rename `oldFn` to `newFn` across the repo"* — mechanical, no design
  choices, skip the plan.
- *"Bump dependency X to v2.3.1"* — mechanical, skip the plan (unless the
  bump introduces breaking changes that warrant unit-by-unit migration).

When skipping the plan doc, the work proceeds directly to `sl-work` or to
implementation, and any decisions made along the way land in the commit
message or `docs/solutions/` if they're worth carrying forward.

## Hard floor

When a plan doc is warranted, these sections are present. They carry the
contracts downstream consumers depend on.

- **Summary** — what the plan proposes, in 1-3 lines. Forward-looking; orients
  the reader before they invest in detail.
- **Problem Frame** — why the work is being done. Backward-looking /
  situational. May merge with Summary for compact plans where the motivation
  is a single sentence.
- **Requirements** (with stable R-IDs) — what must be true after the work
  ships. Reviewer's checklist; downstream code review verifies against these.
- **Key Technical Decisions** (KTDs) — the load-bearing choices that constrain
  implementation. Each entry is `<decision>: <rationale>`. Without these, the
  implementer can't tell which design choices are open and which are pinned.
- **Implementation Units** (with stable U-IDs) — the discrete units of work,
  sized so each is independently landable. `sl-work` consumes these to
  execute. For trivial single-step plans the work may collapse into Summary
  prose and U-IDs may be omitted; this is rare.

## Include when material

These sections are present when they carry information that isn't covered
elsewhere. The test is not "is this a substantial plan?" — it is
*"does this specific plan have content this section would surface?"* Filling
a section with placeholder prose is worse than omitting it.

- **High-Level Technical Design** — include when the technical approach has
  shape that prose alone doesn't carry well: architecture across components,
  sequencing across processes, state machines, branching gates.
  Visualizations (component topology, sequence, swim lane, flowchart,
  data-flow) typically live here. Skip when the approach is a one-paragraph
  pattern application that the prose itself conveys.

- **Scope Boundaries** — include when scope is contested, when there are
  tempting non-goals worth naming explicitly, or when "deferred for later"
  needs distinguishing from "outside the product's identity." Skip when scope
  is obvious from Requirements alone.

- **Open Questions** — include when there are genuinely unresolved items that
  block planning or implementation. Skip when the plan is complete; an empty
  "Open Questions: none" section signals false uncertainty.

- **System-Wide Impact** — include when the change affects cross-cutting
  concerns (data lifecycles, auth boundaries, performance posture, cardinal
  rules, shared infrastructure). Skip for changes localized to one component
  where the impact is self-evident.

- **Risks & Dependencies** — include when there are real risks worth flagging
  (external service changes, version pins under churn, behavioral assumptions
  worth highlighting) or material upstream dependencies. Skip for low-risk
  localized work.

- **Acceptance Examples** — include when any requirement has a state-dependent
  or conditional shape ("When X, Y") where the prose alone leaves ambiguity
  about edge cases. Skip when all requirements are unconditional and
  unambiguous.

- **Documentation / Operational Notes** — include when documentation,
  monitoring, runbooks, or rollout steps need explicit notes. Skip when the
  work is purely internal and uses existing operational scaffolding without
  modification.

- **Sources / Research** — surface the research that orients the implementer
  or justifies load-bearing choices. The test: *"if I were the implementer
  reading this cold, would this breadcrumb help me make better choices?"*
  Yes → surface (code locations like `services/convex/reports.ts:174-176`,
  external docs, RFCs, constraints, prior plans — the category is inclusive,
  not enumerated). Process exhaust (reading the user's prompt, glancing at
  obvious entry points, restating prose) → omit. Surface inline next to the
  KTD or unit it justifies, or as a dedicated section — both shapes work.

## Agent agency

The catalog is a floor, not a ceiling. When the plan's content doesn't fit
any catalog section, introduce a new one — don't force the content into a
section it doesn't belong in. Content drives section choices, not vice
versa.

The agent also picks per artifact:

- Whether Problem Frame merges into Summary
- Sub-groupings (Requirements by capability, KTDs by component, Units phased
  into milestones)
- How much detail each section carries
- Whether HTD has one diagram, several, or none — and whether visualizations
  live in HTD or embedded in other sections

## Prose economy

"Include when material" sizes *which* sections appear; this sizes *how the kept
prose reads*. A section can be material and still be written loosely — the
failure mode is a material section padded into a wall of text where
contradictions hide and the implementing agent loses the thread. A deep plan
earns length through coverage (more units, more traced requirements, real
risks), never through wordiness around that coverage.

Hold every kept section to these:

- **One idea per sentence.** A Summary is a handful of sentences, not one
  sentence with five semicolons and four parentheticals. A KTD's rationale is
  the load-bearing reason, not every reason.
- **A requirement or unit is one sentence of intent plus at most one
  qualifier.** When it would specify two outcomes ("either A or B, the
  implementer decides"), state the intent and send the fork to Open Questions —
  don't write both arms in full inside the item.
- **Cut hedges and intensifiers.** "Critically", "deliberately", "explicitly",
  "genuinely", "actually", "simply" carry nothing the implementer acts on.
- **Prefer the verb to the nominalization.** "Demote the grid", not "the
  demotion of the grid is the deliberate change in this plan".

Precision is not padding: keep file paths, IDs, conditionals, and exact
thresholds verbatim. Economy targets the connective tissue around them, never
the precision itself.

**Resolve in place; don't stratify.** When deepening, a doc-review pass, or a
later decision supersedes earlier text, rewrite or remove the original — don't
leave it standing as strikethrough or stack a separate "resolutions" layer on
top of it. Version control holds the history. Stacked strata double the reading
surface and hide which text is live.

**Named test, run before the plan is declared written:** could the implementer
find a contradiction in each section in one pass? A sentence carrying more than
one parenthetical, or an item specifying two outcomes, fails the test — split it
or defer it.

## Plan metadata fields

Every plan carries a small set of stable metadata fields that downstream
tooling depends on. The contract is format-independent: in markdown these
fields appear as YAML frontmatter at the top of the file; in HTML they
appear as visible header text (typically a `<dl>` of `<dt>`/`<dd>` pairs or
a stats strip). Field names and semantics are the same across both formats
so consumers can locate them without knowing which format produced the
plan.

### Required

- **`title`** — verbatim plan title. Matches the H1 (markdown) or document
  `<h1>` (HTML) so file metadata and visible heading don't drift.
- **`type`** — conventional-commit-prefix-aligned classification (`feat`,
  `fix`, `refactor`, `chore`, `docs`, `perf`, `test`, etc.). Carries the
  intent the eventual commit message should reflect.
- **`date`** — creation date in ISO 8601 (`YYYY-MM-DD`), ASCII digits only.

Plans carry **no `status` field**, in either format: there is no
`active → completed` document lifecycle. Whether a plan shipped is derived
from git, not stored in the doc.

Plans in **both formats** are stateful tracked artifacts at the unit level.
Implementation-unit tasks carry advisory status markers — `[]` idle, `[wip]`
in progress, `[x]` complete, `[f]` failed — which `sl-work` updates during
single-writer execution (never under parallel writers). See the ID and
content rules below for how each format renders the marker. Git remains
authoritative; the markers are a projection of it. When marker and git
disagree, git wins and the marker is corrected. A marker is per-task state,
not a document state — which is why it does not imply a `status` field.

### Optional but well-known

These fields are not required, but when set they have fixed names and
semantics so downstream tooling can rely on them:

- **`origin`** — repo-relative path to an upstream brainstorm requirements
  doc (e.g., `docs/brainstorms/2026-05-12-pagination-requirements.md`).
  Set when planning from an upstream brainstorm; carried for traceability
  and re-resolved when `sl-plan` re-deepens. The HITL Proof flow uses
  `origin` to trace back to the source brainstorm.
- **`deepened`** — ISO 8601 date marking the first time the confidence
  check substantively strengthened the plan. Presence affects Phase 0.1
  resume fast-path logic (see `references/deepening-workflow.md`).
- **`execution`** — execution domain for downstream routing: `code`
  (the default when absent) or `knowledge-work`. `sl-work`'s input triage
  reads this: a plan marked `execution: knowledge-work` routes to the
  non-code carve-out (read sources, synthesize, produce a deliverable —
  skipping the branch/test/commit/CI lifecycle); absent or `code` routes
  to the normal code path. Written by `sl-plan`'s approach-altitude flow
  (`references/approach-altitude.md`) when a non-code deliverable is
  persisted for execution.

The next six fields are **HTML plans only** and **append-only**: entries are
only ever appended, never overwritten or removed. Each holds a list.

- **`modified`** — ISO 8601 timestamps, one appended per ship-time write.
  `date` remains the creation date and never changes.
- **`commits`** — commit SHAs that landed this plan's units.
- **`agent`** — the agents that authored or executed the plan.
- **`session`** — session ids that worked the plan.
- **`back refs`** — repo-relative paths to upstream artifacts this plan
  descends from.
- **`forward refs`** — repo-relative paths to downstream artifacts this plan
  produced.

Ownership is scoped by flow — no two writers touch the same field at the same
moment. At ship time, `sl-work` appends `modified`, `commits`, `agent`, and
`session`, idempotently — an entry already present is never duplicated.
`sl-plan` seeds `agent` and `session` at create time, and its resume flow may
backfill `commits` and `modified` for a run that could not write them (the
post-run sync after an unattended run). `sl-plan`'s revision flows own
`back refs` and `forward refs`, and Amendments is theirs alone.

Field names are stable across plan revisions — never rename a field or
repurpose its semantics. Agents composing new plans MUST use these exact
names; adding new fields is fine, but renaming `origin` to `source` or
`date` to `created` breaks the downstream consumers above.

## ID and content rules

These apply regardless of rendering format.

- **Stable IDs.** R-IDs (Requirements), U-IDs (Implementation Units), A-IDs
  (if Actors fire), F-IDs (if Flows fire), AE-IDs (if Acceptance Examples
  fire). IDs are stable across plan revisions — never renumber to "clean
  up gaps."
- **Plain prefix.** `R1.`, `U1.` as bullet prefixes. Do not bold; the prefix
  is visually distinctive on its own.
- **Status markers on every unit and every Validation Commands item.**
  Four states: `[]` idle, `[wip]` in progress, `[x]` complete, `[f]` failed.
  Stamp every one as `[]` at create time — the executing agent owns them from
  there. HTML plans carry the marker inside `<code class="status">`; markdown
  plans carry it as a trailing inline code span on the unit heading:

  ```markdown
  ### U1. Cloak detection in preflight contract `[]`
  ```

  The same four-state vocabulary in both formats, deliberately. A GFM checkbox
  (`- [ ]`) has two states and cannot express `[wip]` or `[f]` — the two that
  carry the most information to someone reading a half-finished run. One
  vocabulary also means the goal guard needs one normalization rule rather than
  two, and the guard is exactly where a second, subtly different rule becomes a
  hole. The guard normalizes markers before hashing, so an unattended run can
  record progress without tripping goal drift; a bare GFM checkbox is not a
  marker and is not normalized.
- **Repo-relative paths.** Always. Never absolute paths in plan content;
  they break portability across machines, worktrees, teammates.
- **No process exhaust.** No "captured at Phase X" notes, no `## Next Steps`
  pointing to the next skill, no italic provenance lines. Engineering process
  metadata belongs in commit messages and tool output, not the artifact.
- **Group Requirements by concern when they span distinct logical areas.**
  The trigger is distinct concerns, not item count — even four requirements
  benefit from grouping if they cover three different topics. Skip grouping
  only when all requirements are genuinely about the same thing; a long flat
  list is a smell that subgroups were missed. Group by capability (e.g.,
  "Packaging", "Migration and compatibility", "Contributor workflow"), not by
  the order requirements were discussed. R-IDs stay continuous across groups
  (R1, R2 in the first group; R3, R4 in the second; never restart at R1 per
  group).

## Amendments

HTML plans carry an **Amendments** section: an append-only record of changes
made to the plan after execution began. Entries are appended in order; earlier
entries are never rewritten or removed. `sl-plan`'s revision flows own it —
never `sl-work`, and never at plan-creation time, since a plan with no
execution behind it has nothing to amend.

Amendments is exempt from **resolve in place; don't stratify**. That rule
governs live plan prose — Summary, Requirements, KTDs, Units — and continues
to govern every one of those sections: superseded text there is rewritten or
removed, not stacked. Amendments is not live prose. It is the history of a
shipped artifact, and its value is the chronology. An amendment records that a
live section changed; it does not stand in for changing it.

## Rendering

The format-specific references describe how to render these sections in each
output format:

- **Markdown rendering:** `references/markdown-rendering.md`
- **HTML rendering:** `references/html-rendering.md`

This reference (`plan-sections.md`) is about WHAT the plan contains;
rendering references are about HOW each format presents it. The plan is
written in one format — markdown OR HTML, never both — based on the
resolved output mode. The section catalog is the same regardless of
format.
