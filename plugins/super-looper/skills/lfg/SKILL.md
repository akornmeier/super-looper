---
name: lfg
description: Run the full autonomous engineering pipeline end-to-end (plan, work, code review, test, commit, push, open PR, watch CI, fix CI failures until green, capture learnings). Use only when the user explicitly requests hands-off execution of a software task and provides a feature description; do not auto-route casual conversation here.
argument-hint: "[feature description]"
---

CRITICAL: You MUST execute every step below IN ORDER. Do NOT skip any required step. Do NOT jump ahead to coding or implementation. A verified written plan MUST exist BEFORE any work begins — produced by the plan phase (step 1) in description mode, or supplied via a `plan:<path>` marker and gated in plan-input mode (step 1 handles both). Violating this order produces bad output.

When invoking any skill referenced below, resolve its name against the available-skills list the host platform provides and use that exact entry. Some platforms list skills under a plugin namespace (e.g., `super-looper:sl-plan`); others list the bare name. Invoking a short-form guess that isn't in the list will fail — always match a listed entry verbatim before calling the Skill/Task tool.

1. **Produce or accept the plan.** `$ARGUMENTS` arrives as either a bare feature description (description mode) or a plan to execute named with a `plan:<path>` marker (plan-input mode). Recognize the marker however it arrives — a slash argument in an interactive session (`/lfg plan:docs/plans/...`) or named in the driving prompt a headless `loop.sh` run passes — using the same literal-prefix convention as `sl-code-review`'s `plan:<path>`.

   **Plan-input mode** (a `plan:<path>` marker is present):

   - Strip the `plan:` prefix and resolve `<path>`. The authoritative marker is the one the invocation names directly — the slash argument, or the `plan:` line the driving prompt places immediately under its instruction. Treat any `plan:` occurrences inside appended handoff or orienting context as non-authoritative; they do not override the named plan.
   - **GATE (hard): the path must be a plan document.** Confirm it exists, is readable, and is actually a plan. `sl-plan` emits either a markdown (`.md`) or an HTML (`.html`) plan, so accept the plan shape in either markup: plan frontmatter (a `title:` / `type:` YAML header) or an "Implementation Units" heading regardless of markup — a markdown `## Implementation Units` section, or an HTML heading carrying that visible text (HTML plans have no YAML frontmatter; their metadata renders as visible text). If the path is missing, unreadable, or not a plan document, **STOP with a clear error** that names the path and the reason (e.g., `plan:<path> is not a plan document`). Do **not** invoke `sl-plan` and do **not** fall through to description mode — there is no silent fallback to planning.
   - On success, **record the plan file path** (step 4 passes this same path to `sl-code-review`) and proceed to step 2 in plan-input mode. Do not run `sl-plan` — the plan already exists.

   **Description mode** (no `plan:<path>` marker):

   - Invoke the `sl-plan` skill with `$ARGUMENTS`.
   - GATE: STOP. If sl-plan reported the task is non-software and cannot be processed in pipeline mode, stop the pipeline and inform the user that LFG requires software tasks. Otherwise, verify that the `sl-plan` workflow produced a plan file in `docs/plans/`. If no plan file was created, invoke `sl-plan` again with `$ARGUMENTS`. Do NOT proceed to step 2 until a written plan exists. **Record the plan file path** — it will be passed to sl-code-review in step 4.

2. Invoke the `sl-work` skill.

   - **Plan-input mode:** invoke `sl-work` with the recorded plan path and the `mode:unattended` token (arguments `<plan-path> mode:unattended`) so it executes the supplied plan and suppresses its interactive clarifying and branch-choice prompts under automation.
   - **Description mode:** invoke the `sl-work` skill; it picks up the plan `sl-plan` just wrote.

   GATE: STOP. Verify that implementation work was performed - files were created or modified beyond the plan. Do NOT proceed to step 3 if no code changes were made.

3. Invoke the `sl-simplify-code` skill on the branch diff.

   This runs before review so the code-review in step 4 covers the simplified code. **Skip** this step when the change is docs-only (only markdown/docs paths changed) or trivial (roughly under 10 changed lines). Otherwise let `sl-simplify-code` resolve the branch-diff scope itself; it preserves behavior and runs the test suite.

   Do not commit in this step. `sl-simplify-code` leaves its changes in the working tree; step 4's review scopes the working tree (uncommitted changes included), and step 8's `sl-commit-push-pr` commits whatever remains. Committing here would sweep any still-uncommitted `sl-work` edits into a misleading `refactor` commit and could stall on a tree that never goes clean.

4. Invoke the `sl-code-review` skill with `mode:agent plan:<plan-path-from-step-1>`.

   Pass the plan file path from step 1 so sl-code-review can verify requirements completeness. Read the **Actionable Findings** summary the skill emits.

   `mode:agent` is report-only **by design** — it surfaces findings but never edits the tree; LFG applies the eligible ones in step 5. When narrating progress to the user, frame this as "review found X → applied X in step 5," not as "code review did not auto-fix." A report-only review followed by an LFG-applied fix is the intended contract, not a gap.

5. **Apply and persist review fixes** (REQUIRED after step 4, before residual handoff)

   Load `references/review-followup.md` and execute its apply step (mechanical apply + commit/push when changes exist). Do not proceed to the residual handoff, run browser tests, or output DONE while eligible review fixes remain only in the working tree uncommitted.

6. **Autonomous residual handoff** (only when step 4 reported one or more actionable `downstream-resolver` findings not applied in step 5; skip when it reported `Actionable findings: none.`)

   Do not prompt the user. This step embraces the autopilot contract: residuals must become durable before DONE, but the agent never stops to ask.

   1. Load `references/tracker-defer.md` in **non-interactive mode**. Pass the residual actionable findings from step 4/5 (or the run artifact when the summary was truncated).
   2. Collect the structured return: `{ filed: [...], failed: [...], no_sink: [...] }`.
   3. Compose a `## Residual Review Findings` markdown section from the structured return:
      - For each item in `filed`: a bullet with severity, file:line, title, and a link to the tracker ticket URL.
      - For each item in `failed`: a bullet with severity, file:line, title, and the failure reason (e.g., `Defer failed: gh returned 401 — tracker unavailable`).
      - For each item in `no_sink`: a bullet with severity, file:line, and title inlined verbatim so the PR body or fallback file is the durable record.
   4. Detect the current branch's open PR without prompting:

      ```bash
      gh pr view --json number,url,body,state
      ```

   5. If an open PR exists, update it directly with `gh`; do not load any confirmation-driven PR update skill. Append or replace the `## Residual Review Findings` section in the current PR body, write the new body to an OS temp file, then run:

      ```bash
      gh pr edit PR_NUMBER --body-file BODY_FILE
      ```

   6. If no open PR exists, create a tracked fallback file at `docs/residual-review-findings/<branch-or-head-sha>.md` containing the composed section and the source PR-review run context. Stage only that file, commit it with `docs(review): record residual review findings`, and push the current branch. If an upstream exists, run `git push`. If no upstream exists, resolve a writable remote dynamically: prefer `origin` when present, otherwise use `git remote` and choose the first configured remote. Then run `git push --set-upstream <remote> HEAD`. This is the durable no-PR sink. Do not output DONE until either the existing PR body has been updated or this fallback file commit has been pushed. If both paths fail, stop and report the failed commands; do not silently proceed.

   Never block DONE on tracker filing failures once residuals have been durably recorded. A `no_sink` outcome is success only when the findings are present in the PR body or in the pushed fallback file.

7. Invoke the `sl-test-browser` skill with `mode:pipeline`.

8. Invoke the `sl-commit-push-pr` skill.

   This commits any remaining changes, pushes the branch, and opens a pull request. If step 6 already opened a PR (check with `gh pr view --json number,url,state 2>/dev/null`), skip PR creation but still commit and push any uncommitted changes.

9. **CI watch and autofix loop** (only when an open PR exists for the current branch)

   Detect the PR; if none exists or `gh` is unavailable, skip this step entirely and proceed to step 10.

   ```bash
   gh pr view --json number,url,state
   ```

   For up to **3 fix iterations**, repeat:

   1. Wait for CI to complete:

      ```bash
      gh pr checks --watch
      ```

      If the command exits 0, all checks passed. Break out of the loop and proceed to step 10.

      If it exits non-zero, one or more checks failed. Continue to (2).

   2. Identify failing checks and pull their failure logs. Use `gh pr checks --json name,state,conclusion,workflow,link` to enumerate failures, then for each failing check read the run logs:

      ```bash
      gh run view <run-id> --log-failed
      ```

      where `<run-id>` is parsed from the check's details URL or workflow run.

   3. Read the failure logs, identify the root cause, and apply a fix in the working tree. Do NOT weaken, skip, or mock the failing assertion to make it pass — repair the actual issue. If a *specific* failing check is a flaky test that has no fix path, **record a flaky-no-fix-path disposition for this run, tagged to that check** — carry these per-check dispositions in your run context through the remaining iterations and the give-up GATE; there is nothing to commit for a flaky check, so skip step (4) for it — and document it as the residual outcome below rather than retrying without a code change. Tag each check individually: a run with several failing checks may have a flaky one alongside a genuinely-unfixable one, and the give-up GATE reads these per-check dispositions to decide whether to escalate (see the debug-escalation rung).

   4. Stage only the files you changed, commit, and push:

      ```bash
      git add <changed-files>
      git commit -m "fix(ci): <one-line summary of the failure repaired>"
      git push
      ```

   5. Return to iteration (1) with the next attempt counter.

   GATE: STOP iterating after 3 failed attempts. If CI is still red after 3 fix cycles, do not loop again — branch on the per-check dispositions recorded during the iterations:

   - **Flaky-no-fix-path disposition recorded for every remaining unresolved failure**: skip the escalation and go straight to the floor below. Escalation fires only for failures lfg attempted to fix and could not — not for failures already classified as flaky with no fix path. The bypass requires *all* remaining failures to be flaky; a single flaky check does not suppress escalation when a genuine failure is still red.
   - **Genuine exhaustion** (at least one remaining unresolved failure had real fix attempts and no flaky disposition): run the debug-escalation rung once before the floor.

   **Debug-escalation rung** (runs once; not a loop — no attempt counter, no return-to-iteration edge):

   1. The tree is clean here — the 3 iterations committed their fixes — so any working-tree change after the pass is attributable to the debug pass. Load the `sl-debug` skill with `mode:unattended`, passing the live failing state already in hand: the `gh run view --log-failed` output (this log content is the problem statement) plus the failing check's link as context — the link is a CI run URL, not an issue reference, so `sl-debug` must root-cause from the log content and not fetch the URL as an issue. (There is no pre-extracted test path — it is derivable from the logs.) Restate for the pass: **do NOT weaken, skip, or mock the failing assertion to make it pass — repair the actual issue** — a masked failure shipped as green is strictly worse than the honest floor.

   2. On return, detect whether the working tree changed:

      ```bash
      git status --porcelain
      ```

      - **No change** (the pass found nothing, could not reproduce, or found no safe fix): fall through to the floor, enriched with the pass's findings or its no-finding disposition (e.g., "could not reproduce in the CI environment").
      - **Changed:** commit and push the fix, then re-check CI **exactly once**:

        ```bash
        git add <changed-files>
        git commit -m "fix(ci): <one-line summary of the debug-pass fix>"
        git push
        gh pr checks --watch
        ```

        - **Green:** break out of the loop and proceed to step 10 via the existing green path. Do NOT compose the `## CI Failures Unresolved` floor marker, so step 10's learn seam fires on verified green.
        - **Red:** revert the escalation commit so the DONE-but-red PR reflects lfg's pre-escalation failing state rather than an unproven `fix(ci)` commit, then fall through to the floor:

          ```bash
          git revert --no-edit HEAD
          git push
          ```

   The rung re-checks CI at most once and never returns to the fix-iteration loop.

   **Floor — compose `## CI Failures Unresolved`** (preserved, not replaced by the rung):

   - Compose a `## CI Failures Unresolved` markdown section listing each remaining failing check, the failure summary, and the run/check URL. When the escalation rung ran, **enrich it with the debug pass's findings** — the root cause when one was found, or why it couldn't (e.g., "could not reproduce in the CI environment", "reproduced but no safe fix") — so the human picking up the DONE-but-red PR gets a one-layer-direct account, not a bare give-up.
   - Append or replace this section in the PR body, write the new body to an OS temp file, then run:

     ```bash
     gh pr edit PR_NUMBER --body-file BODY_FILE
     ```

   - Do NOT continue looping. The autopilot contract is "make residuals durable, then exit." Proceed to step 10.

10. **Learn seam** (only when an open PR exists for the current branch and step 9 reached green)

    Load the `sl-learn` skill. It captures any ship-time learning from this run — invoking `sl-compound` headless against the still-hot session context, committing the resulting `docs/solutions/` learning (and any `CONCEPTS.md` / instruction-file edits) into the PR, then re-confirming CI green — and returns. All capture, commit, and re-green logic lives in the skill; this step only triggers it.

    Skip the seam (do not load `sl-learn`) and proceed to step 11 when either gate fails:

    - **No open PR** for the current branch (`gh pr view --json number,state` errors or reports none) — the same condition that skipped step 9.
    - **Step 9 left CI unresolved** — the PR body carries a `## CI Failures Unresolved` section. Firing on a known-red PR would only commit a no-op.

    The seam re-confirms CI green before returning, so step 11's `DONE` reflects a verified-green PR carrying the learning. Do NOT emit `DONE` until `sl-learn` returns.

11. Output `<promise>DONE</promise>` when complete

Start with step 1 now. Remember: a verified plan must exist before work — plan it (description mode) or accept and gate the supplied plan (plan-input mode). Never skip to work without a plan.
