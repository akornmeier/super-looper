# U4 lean planner evaluation report

Captured: 2026-07-13

## Outcome

The `sl-plan` hot path was replaced with a host-neutral frontier-planning workflow. Normal planning is parent-owned and uses no subagent. One scout and one critic remain available behind evidence and risk/confidence gates. Markdown is canonical; the existing stateful HTML template and scripts remain available as an explicit renderer in both host packages.

## Efficiency

The pre-refactor baseline records the Claude planner `SKILL.md` at 92,956 bytes and 855 lines. The refactored packages are:

| Host package | Main instructions | Canonical contract loaded for a normal plan | Normal-path instruction total | Reduction versus legacy main body |
|---|---:|---:|---:|---:|
| Claude Code | 9,569 bytes / 143 lines | 2,783 bytes | 12,352 bytes | 86.7% |
| Codex | 9,343 bytes / 141 lines | 2,783 bytes | 12,126 bytes | 87.0% |

The main-body-only reduction is 89.7% for Claude Code and 89.9% for Codex. Runtime adapters are conditional and are not loaded during the normal local-evidence scenario. HTML template/rendering references are also outside the Markdown hot path.

These are instruction-byte proxies, not token counts. Neither fresh-source collaboration run exposed per-role token telemetry, so the plan's "30% lower median planning tokens on each host" acceptance claim is not asserted as measured fact. The byte reduction comfortably exceeds that target, but a release promotion still needs comparable host token telemetry when available.

## Behavioral smoke

The skill-creator fresh-source workflow ran the `normal-local-plan-uses-no-subagent` scenario once against each packaged source.

| Host | Result | Dispatches | Contract evidence |
|---|---|---:|---|
| Claude Code package | pass | 0 | One phase and one bounded unit; dependencies, non-goals, acceptance, verification, concrete success/boundary/failure tests, completion gate |
| Codex package | pass | 0 | Equivalent phase/unit semantics and verification; explicitly rejected both scout and critic gates |

Both responses stayed at planning altitude and said concrete repo-relative paths/commands would replace placeholders during the evidence pass. This is an iteration smoke, not the suite's three-run variance gate. The four-case, three-run-per-host promotion protocol is documented in `plugins/super-looper/skills/sl-plan/evals/README.md`.

## Mechanical gates

- Native Codex skill quick validation: pass.
- Native Codex plugin validation: pass.
- Claude plugin/marketplace validation: pass, with the pre-existing root `CLAUDE.md` compatibility-shim warning.
- Planner contract, compatibility, eval-shape, and dual-host packaging tests: pass.
- HTML image and reciprocal-reference script self-tests: pass.
- TypeScript typecheck and release metadata validation: pass.

## Boundary

U4 implementation is complete. U5 begins with the `sl-run` parser/coordinator that consumes the canonical Markdown contract. Full promotion remains blocked on the planned two-host variance run and real token telemetry when the hosts expose it; this limitation does not block beginning U5.
