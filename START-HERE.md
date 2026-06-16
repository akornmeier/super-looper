# START HERE — SL → Loop-Engineering Fork

You (Claude Code) are running in the source of the **Super Looper plugin**. The goal is to create a goal-driven loop OS with a TypeScript learning schema — using SL's _own_ loop to do the work. Read `sl-loop-fork-workplan.md` in full before acting. The essentials:

## Prime directive — SL builds SL, safely

- A **pinned stable** SL drives the edits; **this working copy is the target.**
- **Never run the loop with the plugin code you're editing.** Make changes on a branch/worktree driven by the stable plugin; validate; then _promote_ (re-point `--plugin-dir` at the new commit) before dogfooding the new behavior.
- The human keeps the merge. Autonomy ends at the PR.

## The gate (stop predicate for every change)

```
bun test  &&  bun run plugin:validate  &&  bun validate-frontmatter.ts <changed docs>  &&  CI green
```

## Order of work

- **Phase 0 — Onboard & anchor:** `/sl-setup`; then `/sl-strategy` → write `STRATEGY.md` (draft in `STRATEGY.seed.md`). Run stock `lfg` once on a throwaway task to confirm baseline. Do **not** edit skills until `STRATEGY.md` exists and `lfg` has run green once.
- **Phase 1 — TS schema:** install `schema.ts` + `validate-frontmatter.ts` (provided); swap `sl-compound`'s bash validate call to the bun validator; optional `emit-docs.ts` so model-facing docs derive from `schema.ts`.
- **Phase 2 — Loop driver (MVP):** a thin `loop.sh` or `/goal` around `lfg` (it already loops to green, so this is a cap + scheduler). Seed task → green → PR.
- **Phase 3 — DEFERRED:** discovery heartbeat. Build only after Phase 2 is trustworthy.

## Files in this bundle

- `sl-loop-fork-workplan.md` — the full plan (non-goals are binding).
- `schema.ts` — single source of truth for `docs/solutions/` frontmatter (TS/React/Vue/a11y enums).
- `validate-frontmatter.ts` — real enum validation (`js-yaml` + `zod`).
- `STRATEGY.seed.md` — draft to feed `/sl-strategy` or commit as `STRATEGY.md`.

Begin with Phase 0.
