# U5 resumable coordinator evaluation report

Captured: 2026-07-13

## Outcome

U5 introduces `sl-run` as the shared Claude Code and Codex execution entry point without removing the legacy workflows. It consumes canonical `sl-plan` Markdown, dispatches one bounded implementation worker at a time, persists one-writer atomic state under `/tmp/super-looper/sl-run/<run-id>/`, and requires parent-owned independent verification before a phase can pass.

The bundled state engine covers initialization, dependency ordering, bounded phase packets, strict worker-result recording, phase gates, terminal state, immutable goal hashes, branch/HEAD resume safety, owned-scope containment, and no-repeat phase-boundary resume. `loop.sh --plan-file` now supervises `sl-run`; seed input still launches `lfg`, while `loop-phases.sh` explicitly selects `--legacy-lfg-plan` to preserve its stacked-PR behavior.

## Efficiency

The three streamlined main skill bodies total 23,065 bytes:

| Skill | Main instructions |
|---|---:|
| `sl-strategy` | 6,195 bytes |
| `sl-plan` | 9,569 bytes |
| `sl-run` | 7,301 bytes |

This is 19% of the 120 KB combined hot-path budget. Runtime adapters, the worker contract, and state-engine operations are loaded only when needed. The 31,768-byte deterministic Python engine is executed rather than carried as model instructions.

These byte counts are instruction-size proxies, not measured tokens. Neither fresh-source host run exposed comparable per-role token telemetry.

## Behavioral acceptance

The skill-creator fresh-source workflow ran a two-phase, one-unit-per-phase fixture against the latest packaged source for each host package.

| Package source | Harness | Result | Dispatches | Max concurrency | Boundary resume | Final gates |
|---|---|---:|---:|---:|---:|---|
| Claude Code | Codex collaboration analogue | pass | 2 | 1 | pass | `phase-one`, `phase-two` |
| Codex | Codex collaboration | pass | 2 | 1 | pass | `phase-one`, `phase-two` |

Both runs:

- finished with durable `completed` state and terminal reason `all phase completion gates passed`;
- resumed after phase one without repeating its worker or verification;
- preserved exact plan and `STRATEGY.md` hashes;
- kept repository HEAD unchanged and performed no commit, push, PR, delivery, or learning action;
- wrote the exact expected artifacts and independently verified their contents;
- preserved inline-code acceptance strings and shell verification commands in bounded packets.

The first Claude-package smoke exposed over-broad Markdown code-span stripping in list items. The parser was tightened to strip backticks only when the entire item is one code span, a regression assertion was added, and both latest-source confirmation runs preserved multiple inline code spans. The latest Claude confirmation also exercised the schema-correction rule: one worker returned a non-string verification entry, so the coordinator requested a schema-only correction from that worker instead of hand-editing the result.

This is a fresh-source semantic evaluation of both packages. Claude's plugin cache cannot load edited agent/skill prose in the current session; the Claude package was therefore evaluated through the repository-mandated skill-creator pattern with Codex collaboration as the generic-worker analogue, not through a native live Claude session.

## Deterministic and supervisor gates

- A focused engine suite completes two phases, validates emitted execution-plan/run-state/packet contracts, resumes at a boundary, refuses mid-unit redispatch, detects plan and strategy drift with exit 8, constrains changed-file claims, rejects cycles/unsafe run IDs, and enforces the state lock.
- Supervisor tests prove crash -> validated `state:` resume -> completed state -> independent command verification.
- `DONE` without matching durable completed state is rejected.
- A process exit after plan mutation remains typed goal drift instead of being flattened into cap exhaustion.
- Legacy seed, plan-to-PR, goal-guard, retry, timeout, and stacked-phase behavior remains covered.

## Mechanical gates

- Claude and Codex skill quick validation: pass.
- Native Codex plugin validation: pass.
- Claude plugin and marketplace validation: pass, with the pre-existing root `CLAUDE.md` compatibility-shim warning.
- Full Bun suite, TypeScript typecheck, release metadata validation, docs index drift, shell syntax, and diff whitespace checks: pass.
- Release metadata reports 42 agents, 41 Claude skills, and 0 MCP servers. Release-owned versions were not hand-bumped.

## Boundary

U5 is complete. The coordinator is intentionally serial and stops after implementation plus independent phase verification. U6 begins bounded phase teams and risk-selected verification. U7 owns commits, delivery, CI, learning capture, and strategy observations. Existing `sl-work`, `lfg`, and stacked-PR workflows remain available throughout the migration.
