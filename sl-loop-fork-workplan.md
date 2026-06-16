# Work Plan: SL Loop-Engineering Setup with a TypeScript Schema

_Scope discipline is the point. The loop engine already exists (`lfg`); verification already exists (`sl-code-review mode:agent`). We add exactly two things — a TS schema and a thin driver — and reuse everything else. If a step starts to grow a framework, stop._

---

## 1. Goal

A forked SL that (a) defines its `docs/solutions/` learning schema in **one TypeScript file** with real validation, and (b) runs `lfg` **unattended on a seeded task until a verifiable condition is met**, opening a PR for human review.

**Definition of done (MVP):** I seed one task, walk away, and the loop plans → works → reviews → fixes → reaches CI-green → opens a PR. New learnings written during the run validate against the TS schema and are retrievable on the next run.

## 2. Non-goals (the paralysis guard — do NOT build these)

- ❌ A new orchestrator. We do not re-implement the loop; `lfg` is the loop.
- ❌ A codegen framework or schema DSL. One `schema.ts` + one validator + one optional emit script. That's the ceiling.
- ❌ A second agent runtime (no Hermes, no daemon). Triggering uses Claude Code's own primitives / cron / Actions.
- ❌ Vector DB / RAG memory. Retrieval stays grep-over-frontmatter (deterministic, already works).
- ❌ Auto-merge. The PR is the human gate. Keep it.
- ❌ Touching SL's generic enums (problem_type, severity, resolution_type) or its 39 skills beyond what's listed in §8.
- ❌ Target Claude Code plugin for the loop work.

## 3. Principles

1. **Reuse over rebuild.** Every gap maps to an existing SL primitive or a Claude Code built-in before we write anything new.
2. **One source of truth.** Enums live in `schema.ts`. Model-facing docs are generated, never hand-synced.
3. **Soft → hard validation, cheaply.** Upstream only checks YAML parser-safety; we add real enum validation because it's ~30 lines and directly improves retrieval recall.
4. **Smallest shippable slice first.** Seeded-task MVP before any discovery/heartbeat work.
5. **Human keeps the merge.** Autonomy ends at the PR.
6. **SL builds SL.** The fork's own changes are made by running SL's loop _on the fork_. We are strategist, seed, and merge gate; SL plans, edits, reviews, and compounds.
7. **Tool/target isolation.** Never run the loop with the same plugin code you're editing (see §6) — a half-written edit to `sl-compound`/`sl-plan`/the validator must not break the loop running it.

## 4. Architecture (one paragraph)

`schema.ts` (zod) is the single source of truth for learning frontmatter → a tiny `validate-frontmatter.ts` replaces the parser-safety-only Python validator with real enum validation → an optional `emit-docs.ts` regenerates the model-facing `yaml-schema.md` from `schema.ts` (kills the 4-file drift). The loop is unchanged SL `lfg`, invoked by a **thin driver** (`loop.sh` or Claude Code `/goal`) that supplies a verifiable stop predicate and an iteration cap. `lfg` already watches CI and fixes to green, so the driver is a _cap + scheduler_, not a second loop. Output is a PR; review stays human.

## 5. Repo layout (additions only)

```
plugins/super-looper/skills/sl-compound/
  references/schema.ts          # NEW — source of truth
  references/validate-frontmatter.ts   # NEW — replaces .py enforcement
  references/yaml-schema.md      # GENERATED from schema.ts (model reads this)
  references/schema.yaml         # GENERATED or kept as a thin re-export of schema.ts
scripts/
  emit-docs.ts                   # OPTIONAL — schema.ts -> yaml-schema.md
loop.sh                          # NEW — thin run-until-green driver
```

(`sl-compound-refresh` references point at the same generated files — no second copy.)

## 6. Execution model & phases — SL builds SL

**How the work gets done.** We drive the fork's own changes through SL's loop. A **stable** SL (installed marketplace version, pinned) is the _tool_; the **fork working copy** is the _target_. We write the strategy, hand SL each goal, and review the PR. SL does the planning, editing, reviewing, and compounding.

**Tool/target isolation — the one rule that makes self-hosting safe.** Never run the loop with the same plugin code you're editing. Edits land on a branch/worktree driven by the _stable_ plugin; only after a change passes the gate do you **promote** it (re-point `--plugin-dir` at the new commit, e.g. the `cce` alias) and dogfood the new behavior on a throwaway task. This stops a half-written `sl-compound`/`sl-plan`/validator edit from breaking the loop mid-run.

**The verification gate (your stop predicate — these are SL's own scripts):**
`bun test` && `bun run plugin:validate` (`claude plugin validate`) && `bun validate-frontmatter.ts <changed docs>` && CI green.
_(Note: `sl-dogfood-beta` exists but is a browser test-matrix for apps — not applicable to a CLI plugin. Our gate is the scripts above.)_

**Phase 0 — Onboard & anchor (interactive, once).**

- Install pinned stable SL into Claude Code; clone the fork separately.
- `/sl-setup` in the fork — auto-detects the TS/Bun stack and configures reviewers.
- `/sl-strategy` → write `STRATEGY.md` (none exists yet): target problem = "sl-as-loop-OS with a TS schema"; the two tracks = {schema, driver}; success metric = "seeded task → green → PR, learnings validate."
- Confirm `AGENTS.md` (the substantive instruction file; `CLAUDE.md` is just an `@AGENTS.md` shim) and `CONCEPTS.md`; let the Discoverability Check keep them pointing at `docs/solutions/`.
  _DoD:_ `STRATEGY.md` committed; stock `lfg` runs green once on a throwaway task.

**Phase 1 — TS schema, via SL.**

- `/sl-brainstorm "replace the Rails-flavored docs/solutions schema with a TS single source of truth + real enum validation"` → requirements doc.
- `/sl-plan <doc>` → plan in `docs/plans/`.
- `/sl-work` → implements on a worktree: `schema.ts`, `validate-frontmatter.ts`, swap the bash validate call, (optional) `emit-docs.ts`.
- `/sl-code-review mode:agent` → review; apply fixes. Gate: `bun test` + `plugin:validate` + a sample doc through the new validator.
- `/sl-compound mode:headless` → record the learning. **Promote** the new commit, then re-run a sample to confirm the new validator is live.
  _DoD:_ off-stack `component` rejected; valid passes; model-facing docs derive from `schema.ts`.

**Phase 2 — Loop driver, via SL (the MVP).**

- Hand it to `lfg "<driver spec>"`, or run plan→work→review explicitly. Deliverable: thin `loop.sh` (cap + stop predicate) or `/goal`. `lfg` already loops to green, so this stays a cap+scheduler.
  _DoD:_ seed one task → unattended → CI-green → PR opened.

**Phase 3 — Discovery heartbeat (DEFERRED; only after the MVP earns it).**
A small scheduled step (cron / Action) reading CI failures + open issues (lean on `sl-issue-intelligensl-analyst`, `sl-product-pulse`) that emits a ranked task into the driver. Build this _only_ once Phase 2 is trustworthy.

_Bootstrap-learnings note:_ learnings SL writes while building the fork are about SL's own TS/Bun plugin, so they land under generic components (`tooling`, `development_workflow`, `testing_framework`). The React/Vue/a11y values only matter once the loop runs on your app repos — don't add a second taxonomy for the bootstrap.

## 7. The TypeScript schema (provided as `schema.ts`)

`schema.ts` exports the enums as `as const` arrays (source of truth), derives the union types for free, and exposes `bugSchema` / `knowledgeSchema` plus `schemaFor(problem_type)`. The validator is the whole enforcement layer:

```ts
// validate-frontmatter.ts  — run: bun validate-frontmatter.ts <doc.md>
import matter from "gray-matter";
import { readFileSync } from "node:fs";
import { schemaFor } from "./schema";

const path = process.argv[2];
if (!path) {
  console.error("usage: validate-frontmatter <doc.md>");
  process.exit(2);
}

let data: Record<string, unknown>;
try {
  ({ data } = matter(readFileSync(path, "utf8")) as {
    data: Record<string, unknown>;
  });
} catch (e) {
  console.error(`✗ ${path}: unparseable frontmatter — ${(e as Error).message}`);
  process.exit(1);
}

const schema = schemaFor(data.problem_type);
if (!schema) {
  console.error(
    `✗ ${path}: unknown problem_type "${String(data.problem_type)}"`,
  );
  process.exit(1);
}

const res = schema.safeParse(data);
if (!res.success) {
  console.error(`✗ ${path}`);
  for (const i of res.error.issues)
    console.error(`  ${i.path.join(".") || "(root)"}: ${i.message}`);
  process.exit(1);
}
console.log(`OK: ${path}`);
```

Optional one-source-of-truth nicety (kills the 4-file sync entirely):

```ts
// emit-docs.ts — schema.ts -> a human/model-readable enum reference
import { COMPONENTS, ROOT_CAUSES } from "./schema";
const list = (xs: readonly string[]) => xs.map((x) => `- \`${x}\``).join("\n");
console.log(
  `# Frontmatter enums (generated — do not edit)\n\n## component\n${list(COMPONENTS)}\n\n## root_cause\n${list(ROOT_CAUSES)}\n`,
);
// pipe into yaml-schema.md: `bun emit-docs.ts > references/yaml-schema.md`
```

_Dependency refinement:_ the repo already depends on **`js-yaml`** (not `gray-matter`), so parse the frontmatter block with `js-yaml` to avoid a new dep. That leaves `zod` as the only addition — and it's optional: for a list this small you can hand-roll enum checks against the `as const` arrays and stay zero-dep. Pick zod for ergonomics or zero-dep for minimalism; either is fine.

## 8. SL integration points (the only files we touch)

1. `sl-compound/SKILL.md` (+ `sl-compound-refresh`): change the validation invocation from Python to `bun .../validate-frontmatter.ts`.
2. `references/schema.yaml` → replace with the adapted enums (or make it a generated artifact).
3. `references/yaml-schema.md` → generate from `schema.ts` (or hand-edit once to match).
4. New files from §5. **Nothing else.**

## 9. Risks & mitigations

| Risk                                                                          | Mitigation                                                                                                                               |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Fork drift** (SL ships ~weekly, no external PRs merged)                     | Pin a version; keep changes to §8's small surface; rebase deliberately, not continuously                                                 |
| **Soft enforcement** (validator steers, doesn't block the model mid-write)    | Run `validate-frontmatter.ts` as a post-write check in `sl-compound` and in CI; a failed doc fails the gate                              |
| **Headless writes get less review** (`sl-compound` skips Phase 3 in headless) | Keep the human PR gate; spot-check `docs/solutions/` periodically                                                                        |
| **Lexical-recall misses** (grep, not semantic)                                | Disciplined enums (now stack-matched) + `CONCEPTS.md` vocabulary; this is _why_ the TS schema matters                                    |
| **Self-modification breaks the running loop**                                 | Tool/target isolation (§6): drive edits with the _pinned stable_ plugin; promote a change only after `bun test` + `plugin:validate` pass |
| **Scope creep**                                                               | §2 non-goals are binding; if a step needs a framework, ship the manual version first                                                     |

## 10. What we are explicitly deferring

Discovery/triage heartbeat (Phase 3), multi-tool portability, cross-repo memory bridging to `agent-substrate`, and any semantic-retrieval upgrade. Each is a real future option; none belongs in the MVP. Revisit only when the seeded-task loop is boring and trustworthy.
