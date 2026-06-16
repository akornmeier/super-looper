---
name: sl-slack-research
description: "Search Slack for interpreted organizational context -- decisions, constraints, and discussion arcs -- and produce a synthesized research digest with cross-cutting analysis. Use when the user says 'search slack for', 'what did we discuss about', 'slack context for', or 'what does the team think about'. Differs from slack:find-discussions, which returns raw message results without synthesis."
---

# /sl-slack-research

Search Slack for organizational context and receive an interpreted research digest.

## Usage

```
/sl-slack-research [topic or question]
/sl-slack-research
```

## Examples

```
/sl-slack-research free trial
/sl-slack-research What did we say about free trial recently?
/sl-slack-research free trial in #proj-reverse-trial
/sl-slack-research onboarding flow after:2026-03-01
```

The input can be a keyword, a natural language question, or include Slack search modifiers like channel hints (`in:#channel`) and date filters (`after:YYYY-MM-DD`). The agent extracts the topic and formulates searches from whatever form the input takes.

## Execution

If no argument is provided, ask what topic to research. Use `AskUserQuestion` (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded). Fall back to asking in plain text only if it is unavailable or the call errors. Never silently skip the question.

Dispatch `sl-slack-researcher` with the user's topic as the task prompt. Omit the `mode` parameter so the user's configured permission settings apply.

The agent handles everything from here -- Slack MCP discovery, search execution, thread reads, and synthesis. It returns a digest with:

- **Workspace identifier** so the user can verify the correct Slack instance was searched
- **Research-value assessment** (high / moderate / low / none) with justification
- **Findings organized by topic** with source channels and dates
- **Cross-cutting analysis** surfacing patterns across findings

If the agent reports that Slack is unavailable (MCP not connected or auth expired), relay the message to the user. Do not attempt alternative research methods.
