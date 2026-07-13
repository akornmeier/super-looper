# Loop driver (`scripts/loop.sh`) — operator guide

`loop.sh` is the unattended process supervisor for two migration paths. A
`--plan-file` launches the streamlined `sl-run` coordinator; a seed retains the
legacy `lfg` pipeline. The shell owns isolation, headless launch, timeout/retry
caps, durable-state routing, goal hashes, terminal records, and an independent
target check. Workflow policy stays in the selected skill.

## Quick start

```bash
# Faithful GitHub-CI run against a throwaway with a remote + Actions:
GH_TOKEN=<repo-scoped-token> bash scripts/loop.sh \
  --target /abs/path/to/throwaway \
  --seed-file "$PWD/examples/loop-seed.md"

# Local proxy (no Actions): verify with the target's own command:
bash scripts/loop.sh \
  --target /abs/path/to/throwaway \
  --seed-file "$PWD/examples/loop-seed.md" \
  --verify-cmd bun test

# Execute an already-written plan (committed in the target), skipping planning:
bash scripts/loop.sh \
  --target /abs/path/to/throwaway \
  --plan-file docs/plans/<date>-<slug>-plan.md \
  --verify-cmd bun test
```

`scripts/loop.example.env` is a copy-and-edit wrapper that prints the constructed
command (`--dry-run`) and then runs it. Always preview with `--dry-run` first.

## Flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `--target <dir>` | _(required)_ | Directory the loop runs in and edits. |
| `--seed <text>` | _(one required)_ | Seed task, inline. |
| `--seed-file <path>` | _(one required)_ | Seed task read from a file. |
| `--plan-file <path>` | _(one required)_ | Canonical plan **in the target** to execute with `sl-run`. Mutually exclusive with `--seed`/`--seed-file`. |
| `--legacy-lfg-plan` | off | Run the old plan-to-PR `lfg` pipeline. `loop-phases.sh` uses this to preserve stacked PRs during migration. |
| `--handoff-file <path>` | _(off)_ | Legacy `lfg` plan-mode context. Requires `--legacy-lfg-plan`. |
| `--plugin-dir <path>` | this repo root | Pinned Super Looper checkout loaded via `--plugin-dir`. |
| `--model <model>` | `opus` | Top-level orchestrator model (`opus` or `fable`). |
| `--timeout <seconds>` | `1800` | Per-attempt wall-clock cap. |
| `--kill-after <seconds>` | `20` | SIGKILL grace after the timeout SIGTERM. |
| `--max-retries <N>` | `2` | Re-launch attempts after a crash-without-`DONE`. |
| `--log-dir <dir>` | `/tmp/super-looper/loop` | Run-log directory (audit trail). |
| `--verify-cmd <cmd...>` | _(off)_ | Local verification command. **Must be last** — consumes the rest of the args and runs them as an argv vector (never `eval`'d). When omitted, verification uses the target's GitHub CI. |
| `--dry-run` | off | Print the constructed command + verification; do not run. |
| `-h`, `--help` | | Usage. |

## Task sources (pick one)

A run executes exactly one task source:

- **Seed** (`--seed` / `--seed-file`) — an inline task. `lfg` plans it first, then
  implements: plan → work → review → … → green.
- **Plan** (`--plan-file`) — a canonical Markdown plan already written **in the
  target**. The driver names it with `plan:<path>`, gives `sl-run` a deterministic
  state destination and run id, and supervises serial phased execution. On retry,
  it switches to `state:<absolute-path>` rather than repeating initialization.
- **Legacy plan** (`--plan-file --legacy-lfg-plan`) — preserves the old `lfg`
  plan-to-PR pipeline, including `--phase` and `--handoff-file` support.

A missing or unreadable `--plan-file` fails fast (`exit 2`) before launch. A
readable malformed plan is rejected by the `sl-run` state engine; there is no
silent fallback to planning.

## Verification modes (one is always required)

- **GitHub-CI mode (legacy default).** When the target has a git remote and no
  `--verify-cmd` is given, success requires an **open PR** for the target branch
  with **green `gh pr checks`**. A PR with **zero checks** is treated as *not*
  green — there is no unverified success. This is the faithful "reach CI-green"
  bar.
- **Command mode.** `--verify-cmd <cmd...>` runs a local command **in the target
  directory**; success requires it to exit `0`. Use for targets without Actions.
- **U5 plan mode requires command mode.** `sl-run` deliberately stops before
  commit/PR delivery at this boundary, so GitHub-CI verification is unavailable
  until closeout lands. Omitting `--verify-cmd` fails fast with exit 4.
- **No verification available** (no remote *and* no `--verify-cmd`) → the driver
  **fails fast** (`exit 4`). There is no unverified success path.

`DONE` is a **routing** signal, not a success signal. In `sl-run` plan mode the
driver additionally requires a matching durable `completed` run state before it
accepts the sentinel. In legacy mode, `lfg` emits
`<promise>DONE</promise>` in every exit path — including when it gives up on red
CI. The driver detects `DONE` only to know the run *finished* (matching the last
output line, so a mid-transcript echo never counts), then gates success on the
independent verification above. `DONE` + red verification reports a
**DONE-but-red** failure, not success.

## Cap and retry reconciliation

Each attempt is bounded by `--timeout` (a SIGTERM, escalating to SIGKILL after
`--kill-after`). The driver never loops unbounded: a `timeout` (or `gtimeout`)
binary is **required** for a real run — without one, the per-attempt wall-clock
cap cannot be enforced and the driver fails fast (see Safety) rather than
risking a hung, uncapped run.

A crash-**without**-`DONE` reconciles before retrying. For `sl-run`, a valid
non-terminal state resumes without resetting the target; completed gates remain
completed, an in-progress unit requires reconciliation, and malformed existing
state is preserved and fails closed. A blocked/failed/cancelled state is not
blindly retried. For legacy `lfg`:

- If an **open PR already exists** for the target branch → terminal: route to
  verification, do **not** re-launch. This reconciliation keeps **precedence** —
  resume never fires once a PR exists (see Resume below).
- Otherwise → decide **resume vs. cold restart** from the run-progress file (see
  Resume), then retry up to `--max-retries`. After the cap is exhausted, exit
  non-zero.

The cap is checked **before** the resume/reset decision, so resume never extends
the retry budget — the give-up floor (`exit 5`) is intact.

## Resume

A legacy `lfg` attempt that got partway through the pipeline records its progress in a
**run-progress file** — `lfg` writes it at each step boundary to a path `loop.sh`
owns under `--log-dir`, **outside** the target tree (so a retry's `git clean -fd`
cannot delete it and `lfg` step 8 cannot sweep it into the PR). On a
crash-without-`DONE` retry with **no open PR**, the driver validates that file and,
when it is trustworthy, resumes the failed attempt instead of cold-restarting from
step 1.

**The resume lattice** (no-PR retry): validate the progress file → **resume** on
success, or **scrub + cold-restart** on any failure. A stale or forged file must
never fake a resume point, so validation gates on what each signal *proves*, not on
mere file presence. All of these binding checks must hold:

- **Shape** — parses as JSON (`jq -e`) with a `schema_version` the driver
  understands and every binding field present as the right type.
- **`run_id`** — equals THIS run's id (embeds a timestamp and pid, so it is
  unguessable); a file from any other run is rejected.
- **`attempt`** — a non-negative integer at or below the just-finished attempt.
- **`base_ref`** — equals the run's clean base (the branch forked from *our* base).
- **`branch`** — the recorded branch exists in the target (`refs/heads` scope
  only, never a bare sha masquerading as a branch).
- **`head_sha`** — the recorded HEAD sha is reachable as a commit in the target.

On **success**, the driver skips `reset_target`, checks out the recorded branch,
and relaunches `lfg` with a `resume:<path>` marker (alongside the normal markers).
`lfg`'s resume entry mode re-verifies the postconditions of the completed steps
(branch present, plan gate passes, expected commits reachable) and continues at the
next step; if a postcondition fails, it records the discrepancy and exits **without**
`DONE`, so the next retry cold-restarts honestly. **Any validation failure** —
missing, corrupt, wrong `run_id`, mismatched `base_ref`, absent branch, unreachable
`head_sha` — **scrubs** the file and resets the target to its clean base before the
cold restart. The driver always **fails toward cold restart, never toward trusting
the file**.

Resume is scoped to **steps 1–7 only**: it fires only *pre-PR*. Once a PR exists,
open-PR crash reconciliation is authoritative and resume does not run (post-PR
resume would need a cross-attempt fix-iteration cap to bound CI-fix looping —
deferred). The legacy progress file is **scrubbed on every terminal path** and
before every cold restart. `sl-run` state is different:
`/tmp/super-looper/sl-run/<run-id>/run-state.json` is the durable resume and audit
handle, so the supervisor preserves it on success and failure.

## Goal-drift guard

An unattended run must not silently rewrite its own goal. `loop.sh` snapshots the
sha256 of the run's **goal files** at each attempt's start (after any retry reset
restores the clean base) and re-hashes them on **every** `done_reached` path —
both the `DONE` sentinel and the crash-reconciled open-PR route — **before**
verification. If a hash changed, the run reached a finish on a mutated goal, so
success cannot be reported: the driver prints a multi-line explanation (the file
and the change kind), writes a `goal-drift` run-record with `verification: not-run`,
and exits `8`.

- **Guarded files.** `STRATEGY.md` in the target is always guarded; the resolved
  `--plan-file` is also guarded in plan mode. Seed mode guards `STRATEGY.md` only.
- **Absent is a valid state.** A missing file hashes to a sentinel, so a
  `STRATEGY.md` absent at both start and end passes; created mid-run is drift
  (`created`), deleted mid-run is drift (`deleted`), and an in-place edit is
  `modified`.
- **Drift is terminal, not retryable.** Like DONE-but-red (`exit 7`), a
  completed-but-untrustworthy run is a hard stop — retries exist for
  crash-without-`DONE`, not for a finish that moved the goalposts. Goal changes
  must route through interactive `sl-strategy` or a human-approved plan revision,
  never an unattended run.

The end-of-run checksum is the authoritative guard: it catches every mutation
path (`sed -i`, shell redirection, subagent worktree merges) that a tool-level
interception would miss.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success — `DONE` (or reconciled open PR) **and** verification green. |
| `2` | Usage / missing input. |
| `3` | Isolation guard refused (self-edit hazard). |
| `4` | No verification mode available. |
| `5` | Cap exhausted — crashed without `DONE`, no open PR. |
| `6` | Timeout — last attempt timed out without `DONE`. |
| `7` | DONE-but-red — finished, but target verification is red. |
| `8` | Goal drift — a goal file (`STRATEGY.md` or the plan) changed during the run. |

## Run record

Alongside the transcript log, every run that reaches a terminal outcome writes one
structured, machine-readable JSON record — the loop's queryable black box. It is a
sibling of the transcript under `--log-dir`, sharing the run's stem:
`loop-<ts>-<pid>.json` next to `loop-<ts>-<pid>.log`. That stem is also the
record's `run_id`, a stable join key for later tooling.

The record captures what the driver directly observes — `outcome`, `exit_code`,
`typed_failure`, `route`, `verification` (mode + result), the per-attempt
`attempts`, and `timing` — plus `pointers` to the transcript, the PR, and
(best-effort) the residual-review findings. It carries a `schema_version` and a
self-describing `coverage_boundary` that names what it indexes by pointer versus
what it does not contain, so a partial record is never mistaken for a complete one.
It is an **index, not a copy**: deeper detail lives behind the pointers, and the
seed/task text is never inlined. In `sl-run` plan mode, `coordinator` also surfaces
the durable state path, current phase/unit, completed gates, next action, and
terminal reason.

`typed_failure` is the exit-code class:

| Exit | `typed_failure` | `outcome` |
| --- | --- | --- |
| `0` | `null` | `success` |
| `3` | `isolation-refusal` | `failure` |
| `4` | `no-verify` | `failure` |
| `5` | `cap-exhausted` | `failure` |
| `6` | `timeout` | `failure` |
| `7` | `done-but-red` | `failure` |
| `8` | `goal-drift` | `failure` |

A record is written on every **operational** terminal path (the seven exits
above), including failures. It is **not** written for pre-flight usage errors
(`exit 2`), `--help`, or `--dry-run` — those validate input or inspect the command
rather than running, so recording them would pollute the substrate with non-runs.

A goal-drift record (`exit 8`) additionally carries a `goal_drift` object naming
the changed `file` and the `change` kind (`modified` / `deleted` / `created`); it
is `null` on every other path.

Every record also carries a `goal_fidelity` field: the lfg step-5 plan-vs-outcome
verdict, lifted verbatim from the run-progress file when lfg recorded one
(`{"verdict": "met" | "partial" | "drifted", "uncovered": [<requirement IDs>]}`),
and `null` when no verdict was recorded — no progress file, no requirements check,
or a null value. The driver never fabricates it; "no data" stays honest as `null`.
It is read out of the progress file *before* that file is scrubbed at the terminal.

A `learning_rejection` field is lifted the same way: `sl-learn` sets it in the
progress file when its evaluator rejects a drafted learning
(`{"claim": "<the refuted claim>", "reason": "<evaluator rationale>"}`), and it is
`null` when no learning was rejected — so a rejection survives the terminal scrub
into the ledger.

A `refresh_due` field is lifted the same way: `sl-learn` sets it in the progress
file when a committed learning grows `docs/solutions/` past the refresh threshold
since the last `sl-compound-refresh` run
(`{"since_refresh": <count>, "threshold": <n>}`), and it is `null` otherwise. The
nudge is advisory — `sl-learn` records it and annotates the PR body, but never
dispatches the refresh (a human-approved maintenance pass).

## Isolation rule

`loop.sh` is for running the loop on **other** repos. It refuses to run when the
target equals, contains, or is contained by `--plugin-dir` (the self-edit guard),
so an unattended permission-bypassed run can never edit the plugin running it.

Running the loop **on this plugin repo itself stays out of scope**: it remains
direct-edits + gate (TDD + `bun test`/`plugin:validate`/`release:validate` + a
human-reviewed PR) until a pinned stable Super Looper plugin exists, because the
live `sl-*` skills load as `super-looper@inline` from the working copy — so the
"SL builds SL" tool/target isolation isn't satisfiable when the target *is* this
repo. See the 2026-06-16 execution-model decision.

The driver also never runs this repo's gate scripts (`solutions:validate`,
`plugin:validate`, `release:validate`) against the target — those validate *this*
repo's structure and would fail spuriously on a throwaway.

## Safety

- **Environment allowlist.** The agent launches under `env -i` with only `HOME`,
  `PATH`, and (when set) `GH_TOKEN` / `GITHUB_TOKEN`. Ambient operator secrets
  are **not** inherited. Token values are redacted in `--dry-run` output.
- **Use a target-scoped token.** Export a **fine-grained `gh` token scoped to the
  throwaway repo only**, so a hallucinated or compromised seed cannot reach other
  repos.
- **`--verify-cmd` is yours to keep safe.** It is passed as an argv vector (never
  `eval`'d), but the driver runs whatever you give it — keep it trustworthy.
- **Audit trail.** The full run transcript is tee'd to a timestamped log under
  `--log-dir` (`/tmp/super-looper/loop/loop-*.log` by default). Every failure
  report points at it. A structured JSON record (`loop-*.json`) sits beside each
  transcript — see [Run record](#run-record).
- **Timeout is required.** The wall-clock cap needs a `timeout` (or `gtimeout`)
  binary. If none is found, a real run **fails fast** (`exit 2`) with an install
  hint rather than running uncapped — the "never unbounded" guarantee is real,
  not best-effort. On macOS, `brew install coreutils` provides `gtimeout`.
  (`--dry-run` is exempt and only warns.)

## Seed-authoring guidance

Keep the seed **tight enough that `sl-plan` never reaches a clarifying-question
branch** — an underspecified seed stalls the unattended run until the wall-clock
cap instead of failing fast. Specify exact file paths, the interface, and named
input/expected-output pairs; remove domain ambiguity and any unresolved product
question. Size it to plan → implement → verify in one run. See
`examples/loop-seed.md`.

## Advanced / testing seams

`LOOP_CLAUDE_BIN`, `LOOP_GH_BIN`, `LOOP_TIMEOUT_BIN`, and `LOOP_JQ_BIN` override the
`claude`, `gh`, `timeout`, and `jq` binaries (used by `tests/loop-driver.test.ts`
to exercise every path with stubs — no live Claude or GitHub call). `jq` validates
the run-progress file before a resume; a missing `jq` is treated as a validation
failure (cold restart), so it never weakens the guard. The suite exercises the
`LOOP_JQ_BIN` seam directly: pointed at a nonexistent binary with a valid progress
file present, the run cold-restarts (no resume) and the run-record's progress-file
lifts read `null`.
