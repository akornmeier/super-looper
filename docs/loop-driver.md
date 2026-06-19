# Loop driver (`scripts/loop.sh`) — operator guide

`loop.sh` runs the `lfg` pipeline **unattended** against a target repo: seed one
task, walk away, and the loop plans → works → reviews → fixes → opens a PR →
reaches green. It is a thin headless invoker around `lfg` (which already loops CI
to green); `loop.sh` adds only headless launch, permission bypass, a cap,
target/plugin wiring, and a final target-scoped stop-predicate check.

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
| `--plan-file <path>` | _(one required)_ | Plan doc **in the target** to execute; skips planning and runs `lfg`'s plan-input branch. Mutually exclusive with `--seed`/`--seed-file`. Commit the plan in the target so a retry's reset does not delete it. |
| `--handoff-file <path>` | _(off)_ | Handoff doc carried as orienting context for the run. **Valid only with `--plan-file`.** |
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
- **Plan** (`--plan-file`) — a plan doc already written **in the target**. The
  driver names it via the literal `plan:<path>` marker so `lfg` **skips planning**
  and executes the supplied plan directly, then runs the rest of the pipeline
  unchanged. `--handoff-file` (plan mode only) carries planning-session context —
  rationale, rejected alternatives, resolved questions — into the fresh process as
  orienting context; the plan stays authoritative.

A missing or unreadable `--plan-file` fails fast (`exit 2`) before the agent
launches; a readable-but-non-plan file is caught at launch by `lfg`'s hard
plan-shape gate, which stops with a clear error — either way there is no silent
fallback to planning. Commit the plan in the target before running: a retry resets
the target with `git clean -fd`, which would delete an untracked plan.

## Verification modes (one is always required)

- **GitHub-CI mode (default).** When the target has a git remote and no
  `--verify-cmd` is given, success requires an **open PR** for the target branch
  with **green `gh pr checks`**. A PR with **zero checks** is treated as *not*
  green — there is no unverified success. This is the faithful "reach CI-green"
  bar.
- **Command mode.** `--verify-cmd <cmd...>` runs a local command **in the target
  directory**; success requires it to exit `0`. Use for targets without Actions.
- **No verification available** (no remote *and* no `--verify-cmd`) → the driver
  **fails fast** (`exit 4`). There is no unverified success path.

`DONE` is a **routing** signal, not a success signal: `lfg` emits
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

`lfg` has no resume entry point — re-running it on a half-finished branch would
re-plan and stack commits. So a crash-**without**-`DONE` reconciles before
retrying:

- If an **open PR already exists** for the target branch → terminal: route to
  verification, do **not** re-launch.
- Otherwise → reset the target to its **clean base** and retry, up to
  `--max-retries`. After the cap is exhausted, exit non-zero.

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
seed/task text is never inlined.

`typed_failure` is the exit-code class:

| Exit | `typed_failure` | `outcome` |
| --- | --- | --- |
| `0` | `null` | `success` |
| `3` | `isolation-refusal` | `failure` |
| `4` | `no-verify` | `failure` |
| `5` | `cap-exhausted` | `failure` |
| `6` | `timeout` | `failure` |
| `7` | `done-but-red` | `failure` |

A record is written on every **operational** terminal path (the six exits above),
including failures. It is **not** written for pre-flight usage errors (`exit 2`),
`--help`, or `--dry-run` — those validate input or inspect the command rather than
running, so recording them would pollute the substrate with non-runs.

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

`LOOP_CLAUDE_BIN`, `LOOP_GH_BIN`, and `LOOP_TIMEOUT_BIN` override the `claude`,
`gh`, and `timeout` binaries (used by `tests/loop-driver.test.ts` to exercise
every path with stubs — no live Claude or GitHub call).
