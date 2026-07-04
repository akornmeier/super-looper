# Run-progress file contract

loop.sh-owned state that records how far a headless `lfg` run got. `lfg` is the sole writer; loop.sh owns the path and is the sole reader/scrubber. A run with no `progress:<path>` marker is interactive and writes nothing.

## Path ownership and lifecycle

- **loop.sh owns the path.** It passes the target via the `progress:<path>` marker and places the file under its own log directory, **outside the target tree** (KTD5). In-target placement would be destroyed by `reset_target`'s `git clean -fd` on retry and swept into the PR by step 8's "commit remaining changes".
- **Never committed.** `lfg` never stages, commits, or otherwise includes this file in a commit. It is machine state, not a run artifact.
- **Scrubbed by loop.sh at terminals.** loop.sh removes the file on every terminal path so stale state cannot seed a later run (that scrub is loop.sh's job, added in U8 — `lfg` only writes).

## Atomic write rule

Write at **every step boundary** — after each numbered step in `SKILL.md` completes. Each write is atomic:

1. Serialize the full JSON object to a temp file **in the same directory as the target** (same filesystem, so `rename` is atomic).
2. `rename` the temp file over the target path.

Never write the target in place. A reader (loop.sh, on the next attempt) must never observe a partially written file, so a half-written object can never be left behind.

## Schema

One JSON object. `schema_version` gates the shape; unknown/absent optional fields are tolerated by readers.

```json
{
  "schema_version": 1,
  "run_id": "<loop.sh run identifier>",
  "attempt": 1,
  "step": 7,
  "plan_path": "docs/plans/2026-07-04-001-....md",
  "branch": "feat/some-branch",
  "base_ref": "<sha or ref the branch forked from>",
  "head_sha": "<HEAD sha at this boundary>",
  "fix_iterations": 0,
  "flaky_dispositions": {},
  "ci_disposition": null,
  "residuals_pointer": null,
  "goal_fidelity": null,
  "updated_at": "2026-07-04T00:00:00Z"
}
```

### Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `schema_version` | integer | Contract version of this file's shape. Current value `1`. Readers reject a version they do not understand. |
| `run_id` | string | The loop.sh run identifier passed in with the marker. A resume reader binds on this to reject a progress file from a different run. |
| `attempt` | integer | The current attempt number within the run (loop.sh increments across retries). |
| `step` | integer | The **last completed** numbered `SKILL.md` step. Written after that step finishes, so a reader knows the highest boundary reached. |
| `plan_path` | string | Repo-relative path of the authoritative plan document (from step 1). |
| `branch` | string | The working branch for this run. A resume reader checks this branch exists before resuming. |
| `base_ref` | string | The ref/sha the branch forked from. A resume reader requires equality to trust the recorded branch. |
| `head_sha` | string | HEAD sha at this boundary. Lets a reader confirm the recorded branch's tip is reachable. |
| `fix_iterations` | integer | Step-9 fix-iteration counter (0–3). Records how many CI-fix cycles ran, for observability and to power the machine CI-disposition read that replaces the PR-body substring check. |
| `flaky_dispositions` | object | Per-check map of step-9 flaky-no-fix-path dispositions, keyed by check name. Empty object when none recorded. |
| `ci_disposition` | string \| null | Step-9 outcome. `null` before step 9 completes; `"green"` when CI reached green (normal or post-escalation green path); `"unresolved"` when the `## CI Failures Unresolved` floor was composed. This recorded value — not the PR-body section — is the machine gate that step 10 and `sl-learn` read. |
| `residuals_pointer` | string \| null | Pointer to the durable residual-findings record from step 6 (PR URL, or the `docs/residual-review-findings/<...>.md` fallback path). `null` when no residuals were filed. |
| `goal_fidelity` | object \| null | Plan-vs-outcome fidelity verdict. `null` for now — U9 populates it (verdict plus uncovered requirement IDs). Present in the schema so the shape is stable before U9 lands. |
| `updated_at` | string | ISO-8601 timestamp of this write. |

## Consumers

- **Step 9 boundary** sets `ci_disposition`, `fix_iterations`, and `flaky_dispositions` from the CI-watch loop's outcome.
- **Step 10 gate** and **`sl-learn`** read `ci_disposition` as the machine signal for "was CI left red?" — the `## CI Failures Unresolved` PR section is demoted to a human-facing record.
- **loop.sh (U8)** validates the file's shape plus binding fields (`run_id`, `base_ref`, `branch`) to decide resume vs. cold-restart, and scrubs it at every terminal.
