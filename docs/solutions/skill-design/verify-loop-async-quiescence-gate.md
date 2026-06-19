---
title: "Wait for the asynchronous signal before concluding a verify loop"
date: 2026-06-19
category: docs/solutions/skill-design/
module: sl-resolve-pr-feedback
problem_type: design_pattern
component: development_workflow
severity: medium
applies_when:
  - a verify or fix-then-check loop re-reads state immediately after an action whose effect arrives asynchronously
  - the authoritative signal lands seconds-to-minutes after the triggering action (async bot re-review, eventual-consistency read, queued job)
  - concluding on the instantaneous "nothing pending right now" reading would miss the round and force a manual re-run
related_components:
  - tooling
  - documentation
tags:
  - skill-design
  - verify-loop
  - async-timing
  - quiescence
  - false-green
  - pr-feedback
  - bounded-wait
---

# Wait for the asynchronous signal before concluding a verify loop

## Context

`sl-resolve-pr-feedback`'s Full-mode verify step (step 8) re-fetched unresolved threads the instant it finished pushing a fix, then concluded if none remained. But automated reviewers (GitHub Copilot, CodeRabbit, Greptile) re-review **asynchronously** — the push triggers a re-review that lands seconds-to-minutes later. So the verify almost always read "0 unresolved" against a commit the bots had not yet re-reviewed, concluded, and the bot's next round arrived afterward — forcing the user to re-run the whole command. The loop already had a bounded fix-verify escalation, but it never engaged for bot rounds: at re-fetch time the bot had not posted, so the loop saw zero and exited.

## Guidance

When a verify loop's termination depends on an effect that arrives asynchronously, do not conclude on the instantaneous "nothing pending right now" reading. Gate the conclusion on the *authoritative* async signal, with three properties:

1. **Key on the event, not the clock.** Find a signal that proves the async actor has acted on *this* action, not merely that time passed. Here: `gh pr view --json reviews` exposes a `commit.oid` per review, and a bot has re-reviewed when it has a review tied to the pushed HEAD SHA. Polling for `commit.oid == HEAD` is deterministic where a fixed sleep is a guess.
2. **Wait only on actors that produce the async signal.** Intersect the set you wait on (known bot logins) with the actors actually present (reviewers on this PR), and never wait on actors handled synchronously (humans — their threads are processed in the round they appear). A configured actor that never shows up must be a no-op, not a full-timeout hang.
3. **Bound the wait two ways, and stay honest on the boundary.** A per-wait timeout makes the gate *proceed* rather than hang if the signal never comes (hanging is the worst failure); a max-round cap stops the outer loop. On timeout, or for a variant the signal can't detect, the summary must label the conclusion provisional ("a late round may still arrive") — never imply a quiescence it did not observe. A documented settle-window covers actors whose output is not tied to the SHA.

The gate engages only after the triggering action actually happened (a reply-only round pushed no commit, so there is nothing for a bot to re-review) and only where the async dynamic exists (Full mode, not single-thread targeted mode).

## Why This Matters

Concluding on a premature signal is the same failure family as a re-check that confirms green over the wrong check set (see Related): the reading is true *at that instant* but does not answer the question the loop is actually asking — "have the reviewers finished with this commit?" The cost is silent: the loop reports success, the user trusts it, and the missed round surfaces only when the next review notification arrives. Bounding the wait keeps the worst case no worse than the original behavior (proceed, and the user re-runs occasionally), while the common case is now captured in a single invocation.

## When to Apply

- A fix-then-verify loop re-reads state right after an action whose effect is asynchronous (external bot/webhook, eventual-consistency store, queued worker).
- An authoritative per-action signal exists or can be derived (a SHA-tied review, an idempotency key, a version/etag that advances only on the real event).
- The wait can be bounded, and the conclusion can be honestly labeled provisional when the signal does not arrive in time.

## Examples

**The `sl-resolve-pr-feedback` quiescence gate.** After a fix push, step 8 runs a bundled `wait-for-bot-review` poll that blocks until every active known bot has a review with `commit.oid == HEAD`, or a ~5-minute timeout (tuned to the observed ~3-minute Copilot latency) elapses; then it re-fetches and loops up to a raised cap of 3 fix-verify cycles. On timeout it prints which bots were still pending so the step-9 summary can flag a possible late round.

**A degraded-path gotcha that silently defeats the bound (caught in review).** The poll script's whole safety story is "always exit 0, never hang past the timeout." A subtle bash bug nearly broke it: under `set -e`, an assignment `pending=$(pending_bots)` aborts the *entire script* when the function's last command — a `jq` pipeline — exits non-zero. `gh` can return a valid JSON error object with no `reviews` key (`{"message":"Not Found"}`) or a non-JSON page; `jq '.reviews[]'` then errors ("Cannot iterate over null") and `set -e` kills the script *before the timeout logic runs* — the bound the gate depends on is bypassed by the very failure it was meant to survive. An empty-string guard (`[ -z "$reviews" ]`) does not catch this, because the payload is non-empty. The fix is to make the data path degrade instead of abort: default the missing key with `(.reviews // [])` and guard the pipe with `|| true`, so a malformed fetch reads as "nothing pending." The general lesson: when a bound (timeout, retry cap) lives *after* a data-processing step, that step's failure path must not be able to skip the bound — verify it degrades rather than aborts under `set -e`.

## Related

- [`bounded-escalation-rung.md`](./bounded-escalation-rung.md) — sibling pattern on the same honesty principle: a re-check certifies only the *existing* signal and cannot prove the underlying question was answered, so the bound and the honest give-up floor are load-bearing, not optional polish.
