# `sl-plan`

`sl-plan` turns a request, requirements document, or existing plan into one durable, dependency-ordered execution plan. The parent frontier model plans directly; a normal run does not create an agent fleet.

## What changed

The streamlined planner replaces repeated routing, broad research dispatch, automatic deepening, mandatory document review, and the post-plan action menu with one sequence:

```text
ground once -> resolve consequential ambiguity -> decide -> phase -> validate
```

A single scout is allowed only when an important decision cannot be resolved from repository or user-provided evidence. A single independent critic is allowed only for material risk or genuinely low confidence. Both return compact evidence to the parent planner; neither writes the plan.

## Output

Markdown is canonical and follows a stable execution contract:

- one goal and traceable requirements;
- dependency-ordered phases with completion gates;
- bounded units with stable IDs and status markers;
- repo-relative files or areas;
- explicit dependencies and non-goals;
- observable acceptance and verification;
- named test files and concrete scenarios for feature-bearing work.

Plans are written under `docs/plans/` by default. `sl-run` will parse this Markdown into the host-neutral execution schema; no second checked-in machine artifact is required.

## Claude Code and Codex

The same semantic planner ships in both host packages. Small runtime adapters handle questions, optional scout/critic dispatch, and co-located script paths without leaking host syntax into the planning workflow.

Claude Code keeps its existing invocation metadata and explicit HTML surface. Codex uses native skill metadata in `agents/openai.yaml`.

## Optional HTML compatibility

Pass `output:html` or set an active `plan_output: html` repository preference to stamp the existing canonical HTML template. Output remains exclusive: Markdown or HTML, never both. Automated pipeline contexts always force Markdown.

HTML no longer implies paid image generation. Images require a separate `images:on` flag or an explicit fill/regenerate request. Reciprocal reference wiring is also explicit because it mutates an upstream plan.

## Examples

```text
/sl-plan add JSON output to the inspect command
/sl-plan docs/brainstorms/2026-07-01-auth-requirements.md
/sl-plan docs/plans/2026-06-20-auth-plan.md
/sl-plan output:html redesign the settings flow
```

If the request leaves a planning-blocking choice unresolved, the skill asks one concise question. In `mode:headless`, it records the safest reversible assumption instead.

## Handoff

The planner reports the artifact path, assumptions, and whether a scout or critic ran. It recommends:

```text
sl-run plan:<repo-relative-plan-path>
```

`sl-work <repo-relative-plan-path>` remains the Claude Code compatibility path during migration. Planning never starts execution or creates external state without an explicit follow-up request.
