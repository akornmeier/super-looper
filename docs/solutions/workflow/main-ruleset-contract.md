---
title: "The main ruleset contract: required checks, restore path, and the stuck-gate detector"
date: 2026-07-10
category: docs/solutions/workflow/
module: release
problem_type: workflow_issue
component: build_tooling
severity: high
applies_when:
  - "a required status check on `main` is being added, renamed, or removed"
  - "a pull request reports blocked while no check has failed"
  - "a workflow job is being renamed and may be a required context"
  - "the `main` ruleset must be restored to a prior state"
related_components:
  - development_workflow
  - tooling
root_cause: missing_workflow_step
resolution_type: workflow_improvement
tags:
  - branch-protection
  - ruleset
  - required-status-checks
  - code-review
  - rollback
  - false-green
---

# The main ruleset contract

Ruleset `17763543` on `akornmeier/super-looper`, target `~DEFAULT_BRANCH`.

## The required contexts

GitHub matches required checks **by name, as a literal string**. A required context
that never reports is indistinguishable from one whose name was mistyped: both
present as *"Expected — waiting for status to be reported,"* and both block merge
forever. Every name below was recorded by observing it post on a real pull-request
head before it was named required. Do not add a name here that has not been
observed.

| Context | Kind | Emitted by | Asserts |
| --- | --- | --- | --- |
| `test` | check run | `.github/workflows/ci.yml`, job `test` | `release:validate`, plugin schema validation, and `bun test` all pass |
| `pr-title` | check run | `.github/workflows/ci.yml`, job `pr-title` | the title is conventional, so release-please can classify intent |
| `pr-size` | check run | `.github/workflows/pr-size.yml`, job `pr-size` | the diff changes at most 100 files |
| `pr-reviewed` | commit status | `.github/workflows/pr-reviewed.yml` | a non-author review exists on **this exact head**, and none request changes |

**A job rename silently blocks every pull request.** A check run's name is the job's
`name:` if set, otherwise its job id. Renaming `test` to `tests` in `ci.yml` does not
fail loudly — it just means the context `test` is never reported again, and every
pull request blocks. Renaming a required job is therefore a two-step change: update
the ruleset first, or accept a window where nothing can merge.

### Contexts deliberately *not* required

- **`copilot-pull-request-reviewer`** — Copilot began posting this check run in July 2026;
  it did not exist on PRs #24, #26, or #28, and appeared on #30 and #31. It is not
  required, for three reasons. Its conclusion when Copilot *declines* an oversized
  diff is undocumented, so a decline may report `success` on precisely the pull
  request that most needs review. It carries no `CHANGES_REQUESTED` signal, because
  Copilot only ever submits `COMMENTED`. And it is an unversioned vendor surface that
  appeared without announcement and can be withdrawn the same way. `pr-reviewed`
  asserts a fact this repository computes from the reviews API instead.
- **`report-status`** — the job inside `pr-reviewed.yml`. It reports whether the
  *workflow* ran, not whether a review happened. The gating signal is the
  `pr-reviewed` commit status that job posts.

## Why a review check and not required approvals

GitHub forbids a pull request's author from approving it, and no bot here submits
`APPROVED` — Copilot only ever submits `COMMENTED`. So `required_approving_review_count`
can never be satisfied on a solo-maintainer repository, and it is set to `0`.

A required status check is the only carrier that binds a specific reviewer to a
specific commit. `pr-reviewed` is that carrier: it goes green only when a review by
someone other than the author exists on the head SHA. A new push produces a new SHA
with no status, and an absent required context blocks merge on its own — which is why
`pr-reviewed.yml` needs no reset job.

The gate must assert a **positive fact**. "No unresolved review threads" is satisfied
vacuously by a pull request nobody reviewed; requiring conversation resolution would
relocate that inverted predicate into GitHub rather than fix it.

`pr-reviewed` also carries the changes-requested block, which nothing else does:
GitHub only refuses to merge over a `CHANGES_REQUESTED` review when required
approvals is at least 1, and it is 0 here. The status stays red while any such review
stands on the head. Clearing it means a human dismissing the review, which GitHub
audits. The gate never dismisses a review to satisfy itself.

## Why the size cap is repo-owned

Both reviewers answer an oversized diff by posting something shaped like a review.
Copilot's decline is a `COMMENTED` review, indistinguishable from a real one without
parsing its prose — and that prose is undocumented and unversioned. The day the
wording changes, a gate that parses it goes green on unreviewed pull requests and
nothing alerts anyone.

The cap is a number this repository computes from the `pull_request` payload. It is
the one merge condition no vendor can counterfeit. It starts at **100** — Copilot's
real ceiling is 300, but the cap exists to keep diffs reviewable, not to stay under a
vendor limit. To retune it, change `CAP` in `pr-size.yml` and this line together.

`pr-size.yml`'s job carries no `if:` conditional, on purpose. **A job skipped by a
conditional reports `success` to a required status check**, so a guard there would
open the gate on exactly the oversized diffs it exists to stop.

## Snapshot and restore path (R20)

Prior state is recorded as literal bytes, not as prose. Prose in a plan is not a
restore path.

| File | Contents |
| --- | --- |
| `.github/rulesets/main-ruleset.snapshot.json` | the raw `GET` response before any mutation |
| `.github/rulesets/main-ruleset.restore.json` | the same state, shaped as a `PUT` payload |
| `.github/rulesets/repo-merge-settings.snapshot.json` | `allow_auto_merge`, merge methods, `delete_branch_on_merge` |

Single-command restore:

```bash
gh api -X PUT repos/akornmeier/super-looper/rulesets/17763543 \
  --input .github/rulesets/main-ruleset.restore.json
```

No data is at risk in either direction. The cutover is pure configuration.

## The stuck-gate detector (R21)

> **A pull request reporting blocked while no check has failed means a required
> context is not reporting.** That is a misconfiguration, not a real failure.

The two states look identical in the merge box, so distinguish them from the API:

```bash
# What the head actually reported.
gh api repos/akornmeier/super-looper/commits/<head-sha>/check-runs --jq '.check_runs[].name'
gh api repos/akornmeier/super-looper/commits/<head-sha>/status      --jq '.statuses[].context'

# What the ruleset demands.
gh api repos/akornmeier/super-looper/rulesets/17763543 \
  --jq '.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context'
```

A name in the second list but not the first is a stuck gate. A failing check is a real
failure. Note that `pr-reviewed` is a **commit status**, not a check run — it appears
only in the `status` endpoint, and looking for it under `check-runs` will make a
working gate look stuck.

`pr-reviewed` is absent by design until a review lands on the current head. On a fresh
push it will not exist, and the pull request is correctly blocked until Copilot
re-reviews (the `copilot_code_review` rule sets `review_on_push: true`).

## Emergencies

**Disable ruleset enforcement. Do not restore a bypass actor.** Disabling is recorded
in the audit log; a standing bypass is not.

Removing `bypass_actors` removes rule *bypass*, not ruleset *administration*. The
owner can still disable or edit the ruleset at any time. The worst case is a
repository-wide pull-request freeze until the gate is fixed — an availability
incident, not an irreversible one.

This is a behavioral guarantee, not a capability boundary: the maintainer retains
admin and can disable the gate they installed. That is a known, accepted residual.

## Related

- `AGENTS.md` (Merge policy) — the contributor rule this ruleset enforces.
- [`release-please-version-drift-recovery.md`](release-please-version-drift-recovery.md) —
  why `test` must stay required; the drift that a missing gate produced.
- `docs/plans/2026-07-10-002-fix-main-merge-gate-plan.html` — the plan this contract
  implements, and the reasoning behind each decision.
