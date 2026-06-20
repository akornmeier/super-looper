---
title: A set -e wrapper silently skips a downstream capture step when an earlier command exits non-zero
date: 2026-06-20
category: docs/solutions/best-practices/
module: loop-driver
problem_type: best_practice
component: tooling
severity: high
applies_when:
  - "a wrapper script runs set -e (or set -euo pipefail) and calls a command that can legitimately exit non-zero"
  - "a downstream step must run after that command to capture, promote, or clean up its output"
  - "the captured output is most valuable exactly on the upstream command's failure path"
tags: [set-e, pipefail, exit-code, wrapper-script, shell, metric-integrity, data-loss, run-record]
---

# A set -e wrapper silently skips a downstream capture step when an earlier command exits non-zero

## Context

An operator wrapper (`scripts/loop.example.env`) runs under `set -euo pipefail`. It launches the loop driver (`scripts/loop.sh`), then runs a downstream step (`scripts/append-run-record.sh`) that promotes the loop's newest run-record into a committed JSONL ledger the pulse reads. `loop.sh` exits non-zero on its honest failure terminals — exit 5 (cap-exhausted), 6 (timeout), 7 (done-but-red). Under `set -e`, the shell aborts the instant `loop.sh` returns non-zero, so the append never ran on a failed loop. Only successful runs reached the ledger.

## Guidance

When a `set -e` wrapper must run a downstream step after a command that can legitimately exit non-zero, do not let the command's non-zero exit abort the script. Capture the exit code, run the downstream step unconditionally, then re-exit with the captured code so the wrapper still reports the real outcome:

```bash
# Before — set -e aborts here on any non-zero loop exit; the append never runs.
bash "$HERE/loop.sh" ... 
bash "$HERE/append-run-record.sh"      # unreachable on a failed loop

# After — capture, then run the downstream step unconditionally, then re-exit.
LOOP_EXIT=0
bash "$HERE/loop.sh" ... || LOOP_EXIT=$?
bash "$HERE/append-run-record.sh"      # always runs
exit "$LOOP_EXIT"                       # wrapper still reports the real outcome
```

`|| LOOP_EXIT=$?` is what neutralizes `set -e` for that one command — the `||` makes the non-zero exit "handled," so the script continues. The final `exit "$LOOP_EXIT"` preserves the upstream outcome the operator and any caller depend on. Keep the downstream step itself safe to run unconditionally (a no-op when there is nothing to capture), so this restructuring never introduces a new failure of its own.

## Why This Matters

The insidious part is that the downstream step's output is most valuable exactly on the failure path the wrapper drops. Here the ledger feeds `unattended_completion_rate = success / total`, and the failure run-records are the denominator. `set -e` skipped precisely those, so the metric was biased toward ~100% — a number a reader would trust and shouldn't.

This is not a loud crash you would notice; it is silent, self-selecting data loss. The records that never get captured are the ones that prove the system sometimes fails, so a metric built to measure failure renders itself healthy by construction. A comment calling the downstream step "safe to run unconditionally" is also wrong here — the wrapper, not the step, made it conditional.

## When to Apply

- A wrapper runs `set -e`/`set -euo pipefail` and a later step must run regardless of an earlier command's exit.
- The earlier command has meaningful non-zero exits (a tool with a documented exit-code contract, a test runner, a CI gate).
- The later step captures, promotes, logs, or cleans up output whose failure-case form is the form you care about most (metrics denominators, failure diagnostics, partial-result salvage, teardown).

## Examples

A general teardown/capture wrapper has the same shape:

```bash
set -euo pipefail
RC=0
run_the_job ... || RC=$?     # job may fail; we still want its artifacts
collect_artifacts            # runs on success AND failure
exit "$RC"                   # report the job's real outcome
```

Without the `|| RC=$?` guard, a failed `run_the_job` aborts before `collect_artifacts`, and the failure artifacts — the ones you reach for when something broke — are never collected.

## Related

- [`../skill-design/verify-loop-async-quiescence-gate.md`](../skill-design/verify-loop-async-quiescence-gate.md) — the same `set -e` abort mechanism in a different context: a data-processing step's non-zero exit bypasses a timeout/quiescence bound that lives after it. Same family of fix (`|| true` / `|| RC=$?`).
- [`../skill-design/bounded-escalation-rung.md`](../skill-design/bounded-escalation-rung.md) — documents `loop.sh`'s exit codes (5/6/7) and the honest give-up floor. This learning is the shell-layer mechanism that was silently suppressing the run-records that floor produces.
