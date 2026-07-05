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

Before committing, the seam gates the drafted learning through an independent, fresh-context evaluator (`sl-learning-evaluator`). The generator that wrote the learning — the same hot context that did the work — is not trusted to grade it, so a separate agent weighs an evidence packet and returns a three-state verdict: `verified`, `candidate`, or `rejected`. The verdict decides whether the learning is committed and with what confidence label. Only an affirmative `rejected` blocks the commit; an unconfirmed-but-uncontradicted learning still commits, labeled `candidate`.

## Steps

1. **Gate.** Decide whether to proceed at all, in this order:

   - **No open PR → skip the whole seam and return.** Capture is defined as a commit into the run's PR; with no PR there is no sink (a fallback is out of scope). Detect with:

     ```bash
     gh pr view --json number,state,body
     ```

     If this errors or reports no open PR, return without doing anything.
   - **Step 9 ended red → do not fire.** When `lfg` forwards a `progress:<path>` marker (a headless `loop.sh` run), read the recorded step-9 `ci_disposition` from that file — that recorded disposition is the machine gate: a non-green value (e.g. `unresolved`) means the run's problem was not solved (`sl-compound`'s `solution_verified` precondition is unmet by definition), so return without firing. With no progress marker (interactive invocation), fall back to the documented signal: the PR body carrying a `## CI Failures Unresolved` section. Firing on a known-red PR would only commit a no-op. The `## CI Failures Unresolved` PR section is the human-facing record, not the machine gate.
   - **Otherwise, judge whether a non-trivial problem plausibly occurred** from in-session signals: a `fix(ci):` commit on the branch since its base (CI went red→green in step 9), review-fix commits from step 5, or the agent's own read of a debugging detour solved during the work phase (the only signal when CI never failed). **Err toward proceeding when unsure** — stage 1 is deliberately permissive; `sl-compound`'s precondition gate is the authoritative backstop. Only when nothing noteworthy was solved (a plain feature ship), skip without invoking `sl-compound`.

2. **Invoke `sl-compound` headless.** Load the `sl-compound` skill via the Skill tool, in this same process, with the `mode:headless` token and a brief one-line context hint about what the run solved. The token makes it run non-interactively; its preconditions are the keep/skip authority (stage 2).

3. **Read the terminal report.** `sl-compound` ends with one of two sentinels:

   - `Documentation skipped` → return without committing. The PR stays exactly as it was.
   - `Documentation complete` → build the staging set from the report's named lines:
     - the `File:` path (the learning — always present),
     - `CONCEPTS.md` **only** when the `CONCEPTS.md:` line says `created …` or `updated …` (not `scanned, no qualifying terms`),
     - the instruction file **only** when `Instruction-file edit: applied to <path>` (not `none needed` / `gap noted, not applied`).

4. **Evaluate before committing (generator ≠ evaluator).** The learning was drafted by the same hot context that did the work, and generators reliably over-praise their own output — so an independent, fresh-context evaluator gates the commit. This step runs only when step 3 produced a staging set (a `Documentation complete` learning); a skipped learning has nothing to evaluate.

   a. **Assemble the evidence packet** — the material the evaluator weighs *as claims, not truth*:

      - the branch diff against the PR base (`git diff <base>...HEAD`),
      - the commit log since the base (`git log <base>..HEAD`),
      - the CI check timeline (`gh pr checks`), and
      - transcript excerpts from this still-hot session that the seam selects to support each of the learning's causal claims (root cause, fix, prevention).

      Resolve `<base>` from the progress file's `base_ref` when a `progress:<path>` marker is in play, otherwise `gh pr view --json baseRefName`.

   b. **Dispatch `sl-learning-evaluator` fresh-context** via the Agent tool (omit the `mode` parameter), passing the drafted learning's path, any `CONCEPTS.md` / instruction-file edits named in step 3, and the evidence packet. It runs with no hot session state — that separation is the point — and returns exactly one `VERDICT:` line: `verified`, `candidate`, or `rejected`.

   c. **Act on the three-state verdict:**

      - **`verified`** → set the learning's frontmatter `confidence: verified`, `provenance: loop-run`, and `evidence: <PR URL or HEAD commit sha>`, then continue to step 5.
      - **`candidate`** → identical, but `confidence: candidate`.
      - **`rejected`** → do **not** commit the learning. **Revert every `sl-compound` side effect**: restore tracked files the run modified (`CONCEPTS.md`, the instruction file) to HEAD with `git checkout -- <path>`, and delete any file the run newly created (the learning doc, a newly-created `CONCEPTS.md`). Record the rejection in the run-record: when a `progress:<path>` marker is in play, set the progress file's `learning_rejection` field to `{"claim": "<the refuted claim>", "reason": "<evaluator rationale>"}` (atomic tmp+rename, like every progress write) — loop.sh's `emit_record` lifts it into the run-record verbatim; always surface it in the seam's return. Then return without committing — the PR stays exactly as it was, and the loop still reaches `DONE`.

   d. **Fail toward `candidate`.** If the evaluator crashes, times out, or returns no parseable `VERDICT:` line, commit the learning labeled `confidence: candidate` (with `provenance: loop-run` and the evidence pointer) — never silently `verified`, and never dropped. An unreachable evaluator degrades trust in the learning; it does not discard it.

   Add the confidence/provenance/evidence fields by editing the drafted doc's YAML frontmatter — headless `sl-compound` deliberately leaves them to this caller. They are optional schema fields, so a `rejected`-then-reverted run simply never adds them.

5. **Validate (only when the target adopts a schema validator).** `sl-compound`'s self-check covers parser-safety, not schema (enum values, required fields) — so in a repo whose CI gates `docs/solutions/` frontmatter against a schema, a schema-invalid learning passes self-check and then turns the PR red on the learn commit. When the target repo carries such a validator, run it on the new learning from the target repo root and repair any failure before committing. In **this** repo, run it with Bun from the repo root (the path resolves against the target repo, not this skill):

   ```bash
   bun run ./scripts/solutions/validate-frontmatter.ts <learning-path>
   ```

   Exit 1 = invalid: repair the frontmatter and re-run until it passes. A `loop.sh` throwaway target — or a fork that wires its validator differently — has no such file; fall back to `sl-compound`'s parser-safety self-check and do not invent a validator.

6. **Commit and push.** Stage **exactly** the named paths from step 3 — never `git add -A` (see Constraints), then commit and push to the PR branch:

   ```bash
   git add <learning-path> [CONCEPTS.md] [instruction-file]
   git commit -m "docs(<scope>): capture <one-line learning summary>"
   git push
   ```

   The intent is documentation, so the prefix is `docs(<scope>):` with the narrowest useful scope (repo Commit Conventions).

7. **Re-confirm green.** The learn commit re-triggers the target's CI, and nothing else watches it before `loop.sh` evaluates `target_ci_green` once after `DONE`. Re-confirm green before returning so the loop reports success on a verified-green PR:

   ```bash
   gh pr checks --watch
   ```

   Mirror step 9's watch-to-green and cap the wait against the target's typical CI latency. **Do not trust an immediate exit-0:** right after a push the new commit's checks may not be registered yet, so `--watch` can return against the *prior* (green) commit's already-complete checks — and `loop.sh`'s post-`DONE` `target_ci_green` would then see the learn commit's freshly-queued checks as pending and report `DONE`-but-red. Before returning, confirm the PR head shows **at least one check, all in a passing bucket** (`pass`/`skipping`) — the exact condition `target_ci_green` enforces — re-watching until that holds or the bound elapses. Then return — `lfg` emits `DONE` next.

8. **Signal refresh-due (advisory — never dispatch).** A committed learning grows the `docs/solutions/` corpus; over many runs the store bloats and drifts, which is what `sl-compound-refresh` exists to prune. This step raises a **human-actionable nudge** when the corpus has grown past a threshold — it **never dispatches the refresh itself**. Bounded autonomy: an unattended run must not trigger an autonomous refresh (a maintenance pass that consolidates and deletes docs), so the note is the whole action; a human, or an out-of-band scheduled run, decides. Run this **only after a learning committed** (steps 5–7 ran) — a `Documentation skipped` or `rejected` learning grew nothing, so skip it.

   a. **Count corpus growth since the last refresh.** `sl-compound-refresh` stamps its run date in the corpus-map header it maintains at `docs/solutions/README.md` — a `last-refreshed: <YYYY-MM-DD>` line. Read that stamp, then count learning docs under `docs/solutions/` (excluding `README.md`) whose `date:` frontmatter is on or after it — that is the **growth since the last refresh**. When the header is absent (no refresh has ever run) or carries no stamp, treat the whole corpus as the growth count; when `docs/solutions/` does not exist in the target, the count is 0 and this step is a no-op.

   b. **Compare to the threshold (default 10).** When growth since the last refresh is **at least 10 new learnings**, the corpus is refresh-due. Below the threshold, return without a note.

   c. **Append the refresh-due note — do not run the refresh.** Append a short `## Refresh due` section to the PR body (additive via `gh pr edit --body` — preserve the existing body, including any `## CI Failures Unresolved` section) naming the growth count, the threshold, and recommending an operator run `/sl-compound-refresh` out of band. Record the same signal in the run's progress state: when a `progress:<path>` marker is in play, set the progress file's `refresh_due` field to `{"since_refresh": <count>, "threshold": 10}` (atomic tmp+rename, exactly like the `learning_rejection` write) — `loop.sh`'s `emit_record` lifts it into the run-record. Always surface it in the seam's return. **Never load or dispatch `sl-compound-refresh` from this seam** — signalling is the boundary; the actual refresh stays a human-approved action.

## Constraints

- **Stage only the report's named paths.** A blanket `git add -A` sweeps unrelated working-tree residue from earlier `lfg` steps into the learn commit; a learning-only commit leaves the `CONCEPTS.md` and instruction-file edits uncommitted, so they never reach the PR — silently degrading capture to learning-only when R5 wants all of `sl-compound`'s outputs in the PR, not just the learning.
- **Same process only.** Invoke `sl-compound` via the in-session Skill tool, never a fresh `claude -p`. The hot solving context is the input it needs.
- **Always re-confirm green; never special-case docs-only.** The seam cannot know the target's CI `paths`/`paths-ignore` config, so it cannot assume a docs-only commit skips CI. Re-confirm every time.
- This seam writes into the repo and commits — that is the one way it diverges from `sl-handoff`'s read-only shape. It **signals** refresh-due (step 8) but never dispatches `sl-compound-refresh`: the refresh is a maintenance pass that consolidates and deletes docs, so it stays a human-approved action, never an autonomous one triggered from an unattended loop.
