# Canonical execution-plan contract

Markdown is the canonical artifact. Its labels are intentionally stable so `sl-run` can parse it into the host-neutral `executionPlanSchema` without a second checked-in plan file.

## Frontmatter

```yaml
---
title: <short plan title>
type: plan
date: YYYY-MM-DD
schema_version: 1
goal: <one stable outcome>
workflow_profile: chore | bug | feature | hotfix
strategy: <repo-relative STRATEGY.md path or none>
origin: <repo-relative source path or none>
---
```

Do not add a plan-level `status` field. Run state owns execution status.

`workflow_profile` is required for newly generated plans. Use `chore` for bounded maintenance, `bug` for defect/reproduction work, `feature` for product, refactor, or cross-cutting work, and `hotfix` for an active production incident. The workflow kernel may reject a profile below mechanically observed risk. Legacy plans without this field route conservatively or invoke the bounded router only when their signals are genuinely ambiguous.

## Body shape

Use this structure. Omit optional narrative sections when they add no decision value, but never omit Requirements, Phases, units, or phase completion gates.

```markdown
# <Title>

## Summary
<approach and success condition>

## Problem Frame
**In scope:** ...
**Non-goals:** ...
**Assumptions:** ...

## Requirements
- R1. <observable requirement>

## Decisions
### D1. <decision>
**Rationale:** ...
**Evidence:** <repo-relative path, authoritative URL, or user decision>

## Phases

## P1. <phase name> `phase-id`
**Goal:** ...
**Depends on:** none | `phase-id`, ...
**Risks:** none | ...

### U1. <unit name> `unit-id` `[]`
**Scope:** ...
**Files or area:**
- `repo/relative/path`
**Depends on:** none | `unit-id`, ...
**Non-goals:**
- ...
**Acceptance:**
- ...
**Verification:**
- `<command>`
- Inspect <observable evidence>
**Test scenarios:**
- <input/state> -> <action> -> <expected result>

**Phase completion gate:**
- <independent observable evidence>

## Open Questions
- <execution-time question, owner, and decision rule>

## Sources
- `<repo-relative path>` - <why it matters>
```

Each executable `Verification` item must be one argument-vector-compatible command. Put commands in separate list items; do not use pipes, redirects, `&&`, `;`, command substitution, environment-assignment prefixes, or shell `-c`. Prefix non-command evidence with `Inspect ` so `sl-run` routes it to the independent verifier instead of trying to execute it.

## Mapping to the machine schema

| Markdown field | Structured field |
|---|---|
| frontmatter `schema_version`, `goal`, `type`, `workflow_profile` | plan `schema_version`, `goal`, `plan_type`, `workflow_profile` |
| Requirements list | plan `requirements[]` |
| phase code ID, Goal, Depends on, Risks, completion gate | phase `id`, `goal`, `depends_on`, `risks`, `completion_gate` |
| unit code ID, Scope, Files or area, Acceptance, Verification, Depends on, Non-goals | unit fields of the same names |

IDs use lowercase hyphen-case. Phase dependencies name phases; unit dependencies name units in the same phase. Status markers are intentionally excluded from the machine schema: the plan shows a compatibility marker, while run state is authoritative.

## Revision rules

- Preserve existing U-IDs and status markers. Reordering never renumbers. A split keeps the original ID on the original concept; a new concept takes the next unused display number and a new semantic code ID.
- Resolve superseded prose in place instead of stacking contradictory amendments.
- Never update an active plan during an execution run. Route goal or plan changes through an approved planning revision, then start a new run.
