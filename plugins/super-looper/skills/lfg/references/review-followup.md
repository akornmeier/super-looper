# Review followup (LFG step 4–5)

`sl-code-review` is review-only. LFG applies eligible fixes itself, then commits.

## Step 4 — invoke review

```
sl-code-review mode:agent plan:<plan-path-from-step-1>
```

Read the **Actionable Findings** summary and artifact path. Do not pass `mode:autofix`.

Capture parsed JSON (`status`, `actionable_findings`, `findings`, `artifact_path`, `run_id`) or the markdown Actionable Findings section. If `status` is `failed`, stop and surface `reason`.

## Step 5 — apply and persist review fixes

### What to apply

Apply a finding in the working tree only when **all** of the following hold:

1. **`suggested_fix` is present** — concrete change shape from the reviewer.
2. **`confidence` is `100`, or `75` with cross-persona agreement noted in the report** — do not apply anchor-50 findings.
3. **The fix is mechanical** — one coherent change, no contract/permission/security posture change, no new public API shape, no behavior change that needs product sign-off.
4. **Evidence still matches the code** at the cited `file:line` before editing.

Do not treat `autofix_class` as permission to auto-apply.

### What not to apply

- `autofix_class: manual` without a clear mechanical `suggested_fix`
- `autofix_class: advisory` — report-only
- `gated_auto` findings that change behavior, contracts, auth, or permissions
- Anything that needs a design conversation

### Execution

1. Filter `actionable_findings` (or markdown Actionable Findings) with the bar above.
2. Apply eligible fixes in the working tree in severity order (`#` stable from the review).
3. Run targeted tests when `requires_verification: true` on any applied finding.
4. If `git status --short` shows changes, stage only review-driven files, commit `fix(review): apply review findings`, and push before step 6. To push: if an upstream exists, run `git push`. If no upstream exists (common on a fresh feature branch, since step 8's `sl-commit-push-pr` has not run yet), resolve a writable remote dynamically: prefer `origin` when present, otherwise use `git remote` and choose the first configured remote. Then run `git push --set-upstream <remote> HEAD`. If no eligible fixes were applied, note explicitly and skip commit.

### Goal-fidelity verdict (progress-file runs only)

When a `progress:<path>` marker is in play, distill step 4's `requirements_completeness` into a `goal_fidelity` verdict and write it into the progress file's `goal_fidelity` field at the step-5 boundary. This is semi-automated by design — the verdict derives from the requirements-completeness check step 4 already ran; there is no new review pass. `emit_record` in `loop.sh` then lifts the field into the run-record verbatim, and the pulse ledger aggregates it.

Derive the verdict from `requirements_completeness` (each planned requirement R-ID and implementation unit is met / partially addressed / not addressed):

- `met` — every requirement and unit is addressed; `uncovered: []`.
- `partial` — some are only partially addressed but none is entirely unaddressed.
- `drifted` — one or more is entirely unaddressed.

`uncovered` lists the requirement/unit IDs not fully met (partial or unaddressed). Write `null` (not an object) when step 4 ran no requirements check — no plan matched, or `requirements_completeness` is null. Interactive runs (no `progress:<path>` marker) write nothing at all.

## Step 6 — residual handoff

Residuals are actionable findings **not** applied in step 5 — not leftovers from in-skill autofix. Use the Actionable Findings summary / artifact from step 4.
