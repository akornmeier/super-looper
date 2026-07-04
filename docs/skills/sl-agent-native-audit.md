# `sl-agent-native-audit`

> Run a comprehensive agent-native architecture review — launch a parallel sub-agent per principle and compile a scored, impact-ranked report.

`sl-agent-native-audit` is the **scorecard** counterpart to `sl-agent-native-architecture`. Where that skill helps you *design* an agent-native system, this one *measures* an existing codebase against eight principles, dispatching one sub-agent per principle and compiling their findings into a single comparable report with numeric scores and ranked recommendations.

Explicit-invocation only (`disable-model-invocation: true`).

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Audits a codebase against 8 agent-native principles with parallel sub-agents and a scored summary report |
| When to use it | You want to know how agent-native an existing app is, with per-principle scores and a prioritized fix list |
| What it produces | A scorecard table, status legend, top-10 impact-ranked recommendations, and a strengths list |
| Skip when | You're designing a new system rather than reviewing one — use `sl-agent-native-architecture` |

---

## The Eight Principles Audited

Action Parity · Tools as Primitives · Context Injection · Shared Workspace · CRUD Completeness · UI Integration · Capability Discovery · Prompt-Native Features.

---

## What Makes It Novel

### 1. One parallel sub-agent per principle

The audit launches eight `Explore` sub-agents at once, each scoring a single principle. Parallelism keeps a full-codebase review fast, and the per-principle split keeps each agent's task narrow enough to score rigorously.

### 2. Fixed prompts for comparable scores

Each sub-agent is sent a **verbatim** prompt from `references/audit-agent-prompts.md`, which pins the enumeration tasks, the compliance check, the exact `X out of Y (percentage%)` scoring format, and the output-table shape. Improvising the prompts yields inconsistent, non-comparable scores across principles — which would defeat the scorecard.

### 3. Templated scorecard

The final report follows `references/summary-scorecard.md`: the score summary table, an Excellent/Partial/Needs-Work status legend with thresholds, impact-ranked top-10 recommendations, and strengths. The template is what makes the report scannable and the scores meaningful side by side.

### 4. Single-principle mode

Pass a principle (e.g. `action parity`) and the audit dispatches only that one prompt and returns detailed findings for it alone — useful when you already know which dimension you're weak on.

---

## Quick Example

`/sl-agent-native-audit` on a task-manager app. Eight sub-agents fan out; the CRUD-completeness agent finds tasks can be created and read by the agent but only archived (not deleted) through tools, scoring 3/4. The compiled report surfaces "add a delete-task tool" near the top of the impact-ranked recommendations, and the scorecard shows CRUD as the lowest-scoring principle at a glance.

---

## When to Reach For It

Reach for it when:

- You've built an app with agentic features and want an honest, scored read on how agent-native it really is
- You want a prioritized list of the highest-impact gaps to close

Skip it when:

- You're still designing — reach for `sl-agent-native-architecture` first

---

## See Also

- [`/sl-agent-native-architecture`](./sl-agent-native-architecture.md) — the design-guidance skill whose principles this audit scores against
