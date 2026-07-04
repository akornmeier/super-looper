# `sl-agent-native-architecture`

> Build applications where agents are first-class citizens — features are outcomes an agent achieves with tools in a loop, not functions written in code.

`sl-agent-native-architecture` is the **design-guidance** skill for agent-native systems. It teaches the architecture that powers Claude Code and generalizes it to apps far beyond coding: parity between what a user and an agent can do, atomic tools composed by prompts, and behavior that improves through accumulated context rather than shipped code. It routes your specific question to the right in-depth reference rather than dumping the whole body of patterns at once.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Guides the design of agent-native applications across 14 topic areas, from tool design to self-modification |
| When to use it | Designing autonomous agents, MCP tools, self-modifying systems, or any app where features are agent-achieved outcomes |
| What it produces | Applied architectural guidance drawn from the matching reference, tailored to your context |
| Skip when | You want a scored review of an existing codebase — use `sl-agent-native-audit` |

---

## The Five Core Principles

1. **Parity** — whatever the user can do through the UI, the agent can achieve through tools.
2. **Granularity** — tools are atomic primitives; features are prompt-defined outcomes. To change behavior, edit prose, not code.
3. **Composability** — new features are new prompts, not new code.
4. **Emergent Capability** — the agent accomplishes things you didn't explicitly design for, revealing latent demand.
5. **Improvement Over Time** — apps get better through accumulated context (e.g. a `context.md`) and prompt refinement, without shipping code.

---

## What Makes It Novel

### 1. Intake-and-route, not a monolith

The skill opens with a 14-option intake — design, files & workspace, tool design, domain tools, execution patterns, system prompts, context injection, action parity, self-modification, product design, mobile patterns, testing, refactoring, review — and reads only the reference matching your need. The full pattern library stays out of the load footprint until you ask for a slice of it.

### 2. Features as prompts, tools as primitives

The through-line of every reference: capability lives in tools, behavior lives in prompts. This is what makes composability and emergent capability possible, and it's the lens the skill applies back to your specific system.

### 3. Improvement without deploys

Guidance repeatedly returns to accumulated-context and prompt-refinement patterns — the idea that an agent-native app gets better between deploys because its behavior is prose the agent reads, not code you re-ship.

---

## Quick Example

You're designing a note-taking app where an agent can reorganize, summarize, and cross-link notes. You invoke the skill, pick "action parity," and it loads `references/action-parity-discipline.md`. You come away with a capability map — every UI action paired with the tool that gives the agent the same reach — and a plan to close the gaps where the UI can do something the agent can't.

---

## When to Reach For It

Reach for it when:

- You're planning a new agent-native system and want the architecture right from the start
- You're deciding whether to add a domain tool or stay with primitives, how to inject runtime context, or how to let an agent safely modify itself

Skip it when:

- You want to *audit* an existing codebase against these principles with numeric scores — use `sl-agent-native-audit`

---

## See Also

- [`/sl-agent-native-audit`](./sl-agent-native-audit.md) — scores an existing codebase against the agent-native principles this skill teaches
