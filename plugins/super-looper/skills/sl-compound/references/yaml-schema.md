# YAML Frontmatter Schema

<!-- GENERATED FILE — do not edit by hand. Run `bun run solutions:emit` to regenerate. -->
<!-- Source of truth: src/solutions/schema.ts (enums) + src/solutions/doc-model.ts. -->

`schema.yaml` in this directory is the canonical contract for `docs/solutions/` frontmatter written by `sl-compound`.

Use this file as the quick reference for:
- required fields
- enum values
- validation expectations
- category mapping
- track classification (bug vs knowledge)

## Tracks

The `problem_type` determines which **track** applies. Each track has different required and optional fields.

| Track | problem_types | Description |
|-------|--------------|-------------|
| **Bug** | `build_error`, `test_failure`, `runtime_error`, `performance_issue`, `database_issue`, `security_issue`, `ui_bug`, `integration_issue`, `logic_error` | Defects, failures, and errors that were diagnosed and fixed |
| **Knowledge** | `best_practice`, `documentation_gap`, `workflow_issue`, `developer_experience`, `architecture_pattern`, `design_pattern`, `tooling_decision`, `convention` | Practices, patterns, conventions, decisions, workflow improvements, and documentation |

## Required Fields (both tracks)

- **module**: Module or area affected
- **date**: Date documented (YYYY-MM-DD)
- **problem_type**: Primary category — determines track (bug vs knowledge). Prefer the narrowest applicable value; best_practice is the fallback when no narrower knowledge-track value fits.
- **component**: One of `react_component`, `vue_component`, `design_system`, `accessibility_rule`, `browser_extension`, `mcp_server`, `backend_function`, `api_client`, `state_management`, `routing`, `styling`, `types`, `database`, `authentication`, `build_tooling`, `e2e_test`, `storybook`, `testing_framework`, `development_workflow`, `documentation`, `tooling`
- **severity**: One of `critical`, `high`, `medium`, `low`

## Bug Track Fields

Required:
- **symptoms**: Observable symptoms such as errors or broken behavior (1-5 items)
- **root_cause**: One of `wrong_api`, `type_error`, `logic_error`, `stale_closure`, `missing_dependency`, `reactivity_bug`, `hydration_mismatch`, `race_condition`, `async_timing`, `missing_aria`, `focus_management`, `memory_leak`, `config_error`, `bundler_config`, `dependency_conflict`, `missing_validation`, `missing_permission`, `test_isolation`, `missing_workflow_step`, `inadequate_documentation`, `missing_tooling`, `incomplete_setup`
- **resolution_type**: One of `code_fix`, `migration`, `config_change`, `test_fix`, `dependency_update`, `environment_setup`, `workflow_improvement`, `documentation_update`, `tooling_addition`, `seed_data_update`

## Knowledge Track Fields

No additional required fields beyond the shared ones. All fields below are optional:

- **applies_when**: Conditions or situations where this guidance applies
- **symptoms**: Observable gaps or friction that prompted this guidance (optional for knowledge track)
- **root_cause**: Underlying cause, if there is a specific one (optional for knowledge track)
- **resolution_type**: Type of change, if applicable (optional for knowledge track)

## Optional Fields (both tracks)

- **related_components**: Other components involved
- **tags**: Search keywords, lowercase and hyphen-separated (max 8)

## Optional Fields (bug track only)

- **framework_version**: Framework and version, e.g. react@19.0.0 or vue@3.5.13. Only relevant for bug-track docs.

## Backward Compatibility

Docs created before the track system may have `symptoms`/`root_cause`/`resolution_type` on knowledge-type problem_types. These are valid legacy docs:

- Bug-track fields present on a knowledge-track doc are harmless. Do not strip them during refresh unless the doc is being rewritten for other reasons.
- When creating **new** docs, follow the track rules above.

## Category Mapping

> Generated from the schema's `problem_type` enum. Not authoritative for on-disk
> layout until the taxonomy is reconciled — some directories below do not exist yet.

- `build_error` -> `docs/solutions/build-errors/`
- `test_failure` -> `docs/solutions/test-failures/`
- `runtime_error` -> `docs/solutions/runtime-errors/`
- `performance_issue` -> `docs/solutions/performance-issues/`
- `database_issue` -> `docs/solutions/database-issues/`
- `security_issue` -> `docs/solutions/security-issues/`
- `ui_bug` -> `docs/solutions/ui-bugs/`
- `integration_issue` -> `docs/solutions/integration-issues/`
- `logic_error` -> `docs/solutions/logic-errors/`
- `best_practice` -> `docs/solutions/best-practices/`
- `documentation_gap` -> `docs/solutions/documentation-gaps/`
- `workflow_issue` -> `docs/solutions/workflow-issues/`
- `developer_experience` -> `docs/solutions/developer-experience/`
- `architecture_pattern` -> `docs/solutions/architecture-patterns/`
- `design_pattern` -> `docs/solutions/design-patterns/`
- `tooling_decision` -> `docs/solutions/tooling-decisions/`
- `convention` -> `docs/solutions/conventions/`

## Validation Rules

1. Determine the track from `problem_type` using the Tracks table.
2. All shared required fields must be present.
3. Bug-track required fields (`symptoms`, `root_cause`, `resolution_type`) must be present on bug-track docs.
4. Knowledge-track docs have no additional required fields beyond the shared ones.
5. Bug-track fields on existing knowledge-track docs are harmless (see Backward Compatibility).
6. Enum fields must match the allowed values exactly.
7. Array fields must respect min/max item counts.
8. `date` must match `YYYY-MM-DD`.
9. `framework_version`, if present, only applies to bug-track docs.

## YAML Safety Rules

Strict YAML 1.2 parsers (`yq`, `js-yaml` strict, PyYAML) reject array items
that start with a reserved indicator character as unquoted scalars. When
writing items for any array-of-strings field (`symptoms`, `applies_when`,
`tags`, `related_components`, or any future array field), wrap the value in
double quotes if it starts with any of:

`` ` ``, `[`, `*`, `&`, `!`, `|`, `>`, `%`, `@`, `?`

Also quote if the value contains the substring `": "` — that punctuation
confuses flow-style parsers.

Example — before (breaks strict YAML):

    symptoms:
      - `sudo dscacheutil -flushcache` does not restore in-container mDNS

Example — after (parses cleanly):

    symptoms:
      - "`sudo dscacheutil -flushcache` does not restore in-container mDNS"

This rule applies to all array-of-strings frontmatter fields. Scalar string
fields like `description:` have their own quoting rules (see plugin
`AGENTS.md` under "YAML Frontmatter").
