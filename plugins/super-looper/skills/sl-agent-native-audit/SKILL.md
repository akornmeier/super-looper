---
name: sl-agent-native-audit
description: Run comprehensive agent-native architecture review with scored principles
argument-hint: "[optional: specific principle to audit]"
disable-model-invocation: true
---

# Agent-Native Architecture Audit

Conduct a comprehensive review of the codebase against agent-native architecture principles, launching parallel sub-agents for each principle and producing a scored report.

## Core Principles to Audit

1. **Action Parity** - "Whatever the user can do, the agent can do"
2. **Tools as Primitives** - "Tools provide capability, not behavior"
3. **Context Injection** - "System prompt includes dynamic context about app state"
4. **Shared Workspace** - "Agent and user work in the same data space"
5. **CRUD Completeness** - "Every entity has full CRUD (Create, Read, Update, Delete)"
6. **UI Integration** - "Agent actions immediately reflected in UI"
7. **Capability Discovery** - "Users can discover what the agent can do"
8. **Prompt-Native Features** - "Features are prompts defining outcomes, not code"

## Workflow

### Step 1: Load the Agent-Native Skill

First, invoke the agent-native-architecture skill to understand all principles:

```
/sl-agent-native-architecture
```

Select option 7 (action parity) to load the full reference material.

### Step 2: Launch Parallel Sub-Agents

Launch 8 parallel sub-agents using `Agent` with `subagent_type: Explore`, one for each principle. Read `references/audit-agent-prompts.md` and send each of its eight prompts verbatim — each fixes the enumeration tasks, the compliance check, the exact scoring format (`X out of Y (percentage%)`), and the output table shape. Skipping the reference and improvising prompts yields inconsistent, non-comparable scores across principles, defeating the scorecard in Step 3.

### Step 3: Compile Summary Report

After all agents complete, read `references/summary-scorecard.md` and compile the report to that template: the score summary table, the status legend (Excellent/Partial/Needs Work thresholds), the impact-ranked Top 10 recommendations, and the strengths list. Without the template the report loses the comparable per-principle score column and the status thresholds that make it scannable.

## Success Criteria

- [ ] All 8 sub-agents complete their audits
- [ ] Each principle has a specific numeric score (X/Y format)
- [ ] Summary table shows all scores and status indicators
- [ ] Top 10 recommendations are prioritized by impact
- [ ] Report identifies both strengths and gaps

## Optional: Single Principle Audit

If $ARGUMENTS specifies a single principle (e.g., "action parity"), only dispatch that one prompt from `references/audit-agent-prompts.md` and provide detailed findings for that principle alone.

Valid arguments:
- `action parity` or `1`
- `tools` or `primitives` or `2`
- `context` or `injection` or `3`
- `shared` or `workspace` or `4`
- `crud` or `5`
- `ui` or `integration` or `6`
- `discovery` or `7`
- `prompt` or `features` or `8`
