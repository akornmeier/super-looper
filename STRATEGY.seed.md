# STRATEGY.md (seed — feed to /sl-strategy or commit directly)

## Target problem

Stock SL is an operator-driven compounding loop with a Rails-flavored learning schema. We want a goal-driven loop OS that runs `lfg` unattended to a verifiable stop, with a TypeScript single-source-of-truth schema retargeted to a TS / React / Vue / accessibility stack.

## Approach

Reuse `lfg` as the loop engine and `sl-code-review mode:agent` as the verifier. Add only (1) a TS schema + real validator, (2) a thin driver. SL builds SL under tool/target isolation. Human keeps the merge.

## Tracks

- **schema** — replace the `docs/solutions/` schema with `schema.ts`; real enum validation; model-facing docs generated from one source.
- **driver** — thin `loop.sh` / `/goal` around `lfg`; verifiable stop = `bun test` + `plugin:validate` + `validate-frontmatter` + CI green.

## Persona

Senior engineer maintaining a pinned fork; reviewer and merge gate, not a babysitter.

## Success metric

Seed one task → unattended run → CI-green → PR opened, and any learning written validates against `schema.ts`.

## Non-goals

New orchestrator, codegen framework, vector/RAG memory, auto-merge, multi-tool portability. (See `sl-loop-fork-workplan.md` §2.)
