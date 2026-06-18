---
name: sl-learn
description: "Capture a ship-time learning at the close of an autopilot run: invoke sl-compound headless against the still-hot session context, then commit its docs/solutions learning (plus any CONCEPTS.md and instruction-file edits it produced) into the run's open PR and re-confirm CI green before the loop reports done. Triggered by lfg after CI reaches green and before DONE so an unattended loop.sh run captures what it learned instead of dropping it. Skips cleanly when no open PR exists or the run ended with CI unresolved."
argument-hint: "[brief context hint about what the run solved]"
---

# Learn Seam

Capture what an autopilot run learned, into the run's PR, while the solving context is still hot — then leave the loop's verifiable-green stop intact.

## What this seam is for

The autopilot consumes learnings (planning and review read `docs/solutions/`) but otherwise produces none: when an unattended `loop.sh` run solves a non-trivial problem and exits at `DONE`, no human is present to run `/sl-compound`, so the learning evaporates. This seam closes that gap. It runs **in the same process** as the solving session — never a fresh `claude -p` — because the hot context is exactly what `sl-compound` needs; a fresh process would see only the diff.

`sl-compound` makes the authoritative keep/skip decision (its own preconditions). This seam supplies a permissive signal that a qualifying problem plausibly occurred, invokes `sl-compound`, and disposes of its output.

## Steps

1. **Gate.** Decide whether to proceed at all, in this order:

   - **No open PR → skip the whole seam and return.** Capture is defined as a commit into the run's PR; with no PR there is no sink (a fallback is out of scope). Detect with:

     ```bash
     gh pr view --json number,state,body
     ```

     If this errors or reports no open PR, return without doing anything.
   - **Step 9 ended red → do not fire.** If the PR body contains a `## CI Failures Unresolved` section, the run's problem was not solved (`sl-compound`'s `solution_verified` precondition is unmet by definition), so firing would only commit a no-op onto a known-red PR. Return.
   - **Otherwise, judge whether a non-trivial problem plausibly occurred** from in-session signals: a `fix(ci):` commit on the branch since its base (CI went red→green in step 9), review-fix commits from step 5, or the agent's own read of a debugging detour solved during the work phase (the only signal when CI never failed). **Err toward proceeding when unsure** — stage 1 is deliberately permissive; `sl-compound`'s precondition gate is the authoritative backstop. Only when nothing noteworthy was solved (a plain feature ship), skip without invoking `sl-compound`.

2. **Invoke `sl-compound` headless.** Load the `sl-compound` skill via the Skill tool, in this same process, with the `mode:headless` token and a brief one-line context hint about what the run solved. The token makes it run non-interactively; its preconditions are the keep/skip authority (stage 2).

3. **Read the terminal report.** `sl-compound` ends with one of two sentinels:

   - `Documentation skipped` → return without committing. The PR stays exactly as it was.
   - `Documentation complete` → build the staging set from the report's named lines:
     - the `File:` path (the learning — always present),
     - `CONCEPTS.md` **only** when the `CONCEPTS.md:` line says `created …` or `updated …` (not `scanned, no qualifying terms`),
     - the instruction file **only** when `Instruction-file edit: applied to <path>` (not `none needed` / `gap noted, not applied`).

4. **Validate (only when the target adopts a schema validator).** `sl-compound`'s self-check covers parser-safety, not schema (enum values, required fields) — so in a repo whose CI gates `docs/solutions/` frontmatter against a schema, a schema-invalid learning passes self-check and then turns the PR red on the learn commit. When the target repo carries such a validator, run it on the new learning from the target repo root and repair any failure before committing. In **this** repo, run it with Bun from the repo root (the path resolves against the target repo, not this skill):

   ```bash
   bun run ./scripts/solutions/validate-frontmatter.ts <learning-path>
   ```

   Exit 1 = invalid: repair the frontmatter and re-run until it passes. A `loop.sh` throwaway target — or a fork that wires its validator differently — has no such file; fall back to `sl-compound`'s parser-safety self-check and do not invent a validator.

5. **Commit and push.** Stage **exactly** the named paths from step 3 — never `git add -A` (see Constraints), then commit and push to the PR branch:

   ```bash
   git add <learning-path> [CONCEPTS.md] [instruction-file]
   git commit -m "docs(<scope>): capture <one-line learning summary>"
   git push
   ```

   The intent is documentation, so the prefix is `docs(<scope>):` with the narrowest useful scope (repo Commit Conventions).

6. **Re-confirm green.** The learn commit re-triggers the target's CI, and nothing else watches it before `loop.sh` evaluates `target_ci_green` once after `DONE`. Re-confirm green before returning so the loop reports success on a verified-green PR:

   ```bash
   gh pr checks --watch
   ```

   Mirror step 9's watch-to-green and cap the wait against the target's typical CI latency. **Do not trust an immediate exit-0:** right after a push the new commit's checks may not be registered yet, so `--watch` can return against the *prior* (green) commit's already-complete checks — and `loop.sh`'s post-`DONE` `target_ci_green` would then see the learn commit's freshly-queued checks as pending and report `DONE`-but-red. Before returning, confirm the PR head shows **at least one check, all in a passing bucket** (`pass`/`skipping`) — the exact condition `target_ci_green` enforces — re-watching until that holds or the bound elapses. Then return — `lfg` emits `DONE` next.

## Constraints

- **Stage only the report's named paths.** A blanket `git add -A` sweeps unrelated working-tree residue from earlier `lfg` steps into the learn commit; a learning-only commit leaves the `CONCEPTS.md` and instruction-file edits uncommitted, so they never reach the PR — silently degrading capture to learning-only when R5 wants all of `sl-compound`'s outputs in the PR, not just the learning.
- **Same process only.** Invoke `sl-compound` via the in-session Skill tool, never a fresh `claude -p`. The hot solving context is the input it needs.
- **Always re-confirm green; never special-case docs-only.** The seam cannot know the target's CI `paths`/`paths-ignore` config, so it cannot assume a docs-only commit skips CI. Re-confirm every time.
- This seam writes into the repo and commits — that is the one way it diverges from `sl-handoff`'s read-only shape. It does not run `sl-compound-refresh`.
