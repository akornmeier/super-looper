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

**This document is the specification, not a report of live state.** It records what the
ruleset must enforce and why. Whether a given rule is active right now — during a
rollout window, after a rollback, or with enforcement disabled for an emergency — is
answered only by the API:

```bash
gh api repos/akornmeier/super-looper/rulesets/17763543 --jq '[.rules[].type]'
```

Do not infer from this document that a required-checks rule is already active. Ask the
API. Documentation asserting a protection it could not see is the failure this whole
contract exists to correct.

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

### The cron backstop is load-bearing. Do not delete it.

`pr-reviewed.yml` triggers on `pull_request_review` **and** on a `schedule`. The second
trigger looks redundant and is not.

**GitHub refuses to run workflows it attributes to the Copilot bot.** A
`pull_request_review` event whose `triggering_actor` is `Copilot` produces a run that
completes as `action_required` without ever executing. Copilot is the only reviewer on
this repository, so the fast path never fires for the reviews that matter. Observed on
PR #33, same workflow, same head, same reviews:

| `triggering_actor` | Conclusion |
| --- | --- |
| `akornmeier` | `success` |
| `Copilot` | `action_required` |

Scheduled runs are attributed to `github-actions` (in practice, the last identity to
edit the workflow) and always execute, so the sweep is the carrier that turns
`pr-reviewed` green after Copilot reviews; the `pull_request_review` trigger only helps
when a *human* reviews. Remove the schedule and this check silently never posts on a
Copilot-only review — which is indistinguishable from a mistyped context name, and
blocks merge forever.

**Cron is slow here. Do not rely on it for interactive merges.** The cron asks for
every 5 minutes, but GitHub throttles scheduled runs on this repo severely: the
measured gap between ticks was **60 minutes**, and intermediate ticks are dropped
outright. A reviewed pull request can therefore sit `blocked` on `pr-reviewed` for the
better part of an hour with nothing wrong.

Two fast paths exist for when you do not want to wait:

- **`gh workflow run "PR reviewed"`** (the `workflow_dispatch` trigger) re-evaluates
  every open pull request immediately, attributed to you, so it always executes. This
  is the scriptable unstick.
- **The "Approve workflows to run" button** on the pull request approves Copilot's own
  gated `pr-reviewed` run, which then posts in seconds. Note this is *not* scriptable:
  `POST /actions/runs/{id}/approve` returns `403 "This run is not from a fork pull
  request"` for these non-fork runs, so the button is the only way to reach it.

The sweep skips a pull request whose head already carries the state it would post.
Without that, cron and every dispatch would bury each open head under a pile of
identical statuses.

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

This payload is a verbatim pre-mutation snapshot, so it carries `bypass_actors`. That
is correct for a **rollback** — restoring the exact prior state — and wrong for an
**emergency unfreeze**, where the Emergencies section below applies instead: disable
enforcement, never reinstate a bypass. Once plan unit U10 removes `bypass_actors`
permanently, replaying this file reinstates the bypass it deleted. After U10, clear it
in the payload before the `PUT`:

```bash
jq '.bypass_actors = []' .github/rulesets/main-ruleset.restore.json \
  | gh api -X PUT repos/akornmeier/super-looper/rulesets/17763543 --input -
```

**Set it to `[]`; do not delete the key.** `PUT` on a ruleset is a *partial* update —
an omitted field is left unchanged, not cleared. `jq 'del(.bypass_actors)'` therefore
silently leaves the bypass exactly where it was, which looks like it worked. Verified
against the live ruleset: omitting the key preserved
`[{actor_id: 5, actor_type: RepositoryRole, bypass_mode: always}]`, while
`.bypass_actors = []` cleared it.

The restore path above has been rehearsed, not merely written down: replaying
`main-ruleset.restore.json` returned the ruleset to all four original rules and its
original bypass actor. A restore path that has never been executed is a hypothesis.

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

## The release train (R19)

release-please opens `chore: release main` from the `release-please--branches--main`
branch, authored by `github-actions[bot]`. Under this gate it is subject to the same
four required checks as any pull request, and there is no auto-merge: a release is
always a deliberate human merge, and blocking a release pull request never blocks
feature work — feature pull requests do not depend on a release merging.

**Chosen path: manual approval at release time. No exemption, no scoped ruleset, no
bot bypass.** Two facts make this work without any of those:

1. **The reviewer requirement is satisfied by the releaser.** The release pull
   request's author is `github-actions[bot]`, not the maintainer, so the maintainer's
   own review of it is a *non-author* review — exactly what `pr-reviewed` asserts.
   Reading the changelog before releasing is the review.
2. **The checks need one approval click.** release-please runs as `GITHUB_TOKEN`, so
   every workflow run on the release branch is attributed to `github-actions[bot]` and
   lands in `action_required` — GitHub will not auto-run bot-attributed workflows.
   Clicking "Approve workflows to run" once makes `test`, `pr-title`, and `pr-size`
   execute; reviewing the pull request makes `pr-reviewed` green (via dispatch or the
   next cron tick).

So the release flow is: **approve the workflows, review the pull request, merge.** One
extra click at release time, and nothing standing between releases.

**Rejected: give release-please a human-owned PAT.** Replacing `GITHUB_TOKEN` with a
fine-grained PAT owned by the maintainer would attribute the runs to a human, so they
would execute with no approval click. It was rejected for the reason the plan rejected
a separate machine identity for merges: a PAT is a credential to provision, store, and
rotate, and its silent expiry would stall releases with no obvious cause. A click at
release time is cheaper than a secret with a lifecycle. This can be revisited if
releases ever become frequent enough that the click is a real burden.

Not chosen, and deliberately not: restoring a general bypass, or scoping the required
checks to exclude the release ref. The first is what U10 removes; the second hides the
release pull request from the gate that exists to check it.

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
