---
title: "Agent color is an unvalidated 8-value palette; scope distinctness per fleet"
date: 2026-06-26
category: docs/solutions/skill-design/
module: plugins/super-looper/agents
problem_type: convention
component: development_workflow
severity: medium
applies_when:
  - adding a new agent and choosing its color frontmatter value
  - reviewing or changing agent colors and judging whether a co-dispatched panel stays legible
  - an agent renders with no color or an unexpected color in the task-list panel
related_components:
  - documentation
  - tooling
tags:
  - agent-colors
  - frontmatter
  - palette
  - fleet
  - skill-design
  - plugin-agents
  - validation-gap
---

# Agent color is an unvalidated 8-value palette; scope distinctness per fleet

## Context

The agent `color` frontmatter field is a display hint Claude Code uses to tint each agent's chip in the parallel task-list panel. Two facts about it are easy to miss and bit this repo at once:

1. **`color` accepts only eight named values** — `red, blue, green, yellow, purple, orange, pink, cyan`. No hex, no other names. An off-palette value (the repo had `violet` on one agent) is silently treated as unset, so the agent renders colorless.
2. **Nothing in this repo validates it.** `bun run release:validate` does not inspect `color`, and no test asserts on it. So an invalid value, a typo, or a missing field reaches `main` with every gate green — which is exactly how the repo accumulated `blue x13`, one invalid `violet`, and 25 agents with no `color` at all.

With 43 agents and only 8 colors, "give every agent a unique color" is impossible — and aiming for it misreads the goal. Color only has to disambiguate agents the user actually sees at the same time.

## Guidance

**Assign `color` by role, and verify distinctness per co-dispatched fleet — not globally.** A fleet is the set of agents a Skill dispatches together in one fan-out (a review persona panel, an ideation grounding wave, a research wave). The agent name always renders beside the chip, so color groups and the name identifies.

- **Stay on-palette.** Only the eight named values are valid. Treat the absence of a validation gate as a reason to grep before shipping, not a license to skip the check.
- **Distinct within a fleet that fits the palette.** When a fleet has 8 or fewer co-dispatched agents (e.g. the 7 doc-review personas), give each a distinct color.
- **Tier when a fleet overflows the palette.** When a fleet exceeds 8 (code-review can dispatch well over a dozen), sub-split it into a few attention tiers (high-stakes / structural / routine), and let same-tier agents share a color. The panel still shows several colors; the name disambiguates within a tier.
- **One color per agent, distinct in every fleet it joins.** An agent that appears in multiple fleets keeps a single color chosen to stay distinct in each — its color follows the fleet it dispatches in, not its topic.
- **Reuse across fleets that never co-run is intended.** Two agents that never appear in the same panel may share a color freely.

Verify against the *actual* co-dispatch map (read the dispatching Skills), not an imagined one. A persona *catalog* a skill lists for selection is not a parallel panel and imposes no all-vs-all constraint.

## Why This Matters

Color is supposed to let a user tell parallel agents apart at a glance. The failure mode is silent: an off-palette or unset value doesn't error, it just renders as a default, so color stops carrying signal exactly where parallelism is densest. Before this scheme, the code-review panel — the busiest one — was nearly monochrome blue, so the color channel was dead precisely when it was needed most. Because no gate checks `color`, this kind of drift is invisible until someone looks at a live panel; the convention has to be held by authoring discipline (and, eventually, a validation test) rather than CI.

## When to Apply

- Adding a new agent: pick an on-palette color by role, then check every fleet that dispatches it for a collision.
- Changing existing colors or reshuffling fleets: re-verify within-fleet distinctness for each affected panel.
- Debugging an agent that shows the wrong color or none: first suspect an off-palette or missing `color` value.

## Examples

Invalid — looks plausible, renders colorless, passes every gate:

```yaml
# frontmatter
color: violet   # not one of the 8 named values -> treated as unset
```

Valid, role-based, fleet-aware:

```yaml
color: red      # high-stakes code-review tier (correctness/security/adversarial)
color: orange   # structural code-review tier
color: blue     # routine code-review tier
```

Quick pre-ship checks (until a validation test exists):

```bash
# every agent on-palette, none unset
for f in plugins/super-looper/agents/*.md; do
  grep -q '^color:' "$f" || echo "UNSET: $f"
done
grep -rhE '^color:' plugins/super-looper/agents/*.md \
  | grep -vE '^color: (red|blue|green|yellow|purple|orange|pink|cyan)$'

# within a fleet, confirm the dispatched agents' colors are distinct
# (read the dispatching Skill for the real co-dispatch list first)
```

## Related

- `CONCEPTS.md` — the **Fleet** entry defines the unit that scopes this distinctness.
- `docs/plans/2026-06-26-001-fix-agent-color-scheme-plan.html` and `docs/brainstorms/2026-06-26-agent-color-scheme-requirements.md` — the scheme, the role families, and the per-fleet distinctness map.
- `tests/skill-agent-sl-prefix.test.ts` — the frontmatter-convention enforcement pattern to clone for the deferred on-palette + coverage validation test.
