# sl-run U10 two-host comparison

Date: 2026-07-13

## Outcome

U10 is complete with no workflow profile promoted. The streamlined hot path clears its structural instruction budgets, but structural bytes are only a proxy. The required comparable token and scored-quality baselines are absent, Claude fresh-process execution is unauthenticated on this machine, and the installed Codex CLI smoke fails worker provenance. The code-owned promotion gate therefore blocks `chore`, `bug`, `feature`, and `hotfix` independently while retaining every compatibility path.

Machine-readable evidence is in `docs/evals/sl-run-u10-evidence.json`.

## Efficiency evidence

| Measure | Baseline | Current | Change | Gate |
|---|---:|---:|---:|---|
| Primary always-carried instructions | 160,728 bytes (`lfg` + `sl-plan` + `sl-work` + `sl-strategy`) | 27,493 bytes (`sl-strategy` + `sl-plan` + `sl-run`) | -82.89% | Proxy passes |
| Planner main body | 92,956 bytes | 10,269 bytes | -88.95% | Proxy passes |
| `sl-strategy` + `sl-plan` + `sl-run` budget | 120,000-byte ceiling | 27,493 bytes | 77.09% below ceiling | Passes |
| Representative-suite tokens | No comparable host telemetry | Current Codex run only | Not comparable | Blocks promotion |

The comparison script is `bun scripts/core-loop/capture-u10-comparison.ts`. It labels every value as an instruction-byte proxy. It does not convert bytes to fabricated tokens.

## Quality evidence

Deterministic suites cover profile routing, safety floors, isolation, repair, resume, goal drift, review packets, approval, delivery, CI, learning, and strategy boundaries. U9's full repository run covered all 1,744 cases. U10 adds a mechanical rule that any failed or unmeasured host cell, missing token reduction, or missing quality delta blocks only the affected profile.

The pre-refactor baseline did not record a scored behavioral quality value. A within-5% comparison therefore remains unmeasured rather than being inferred from current green tests.

## Host matrix

| Gate | Claude Code | Codex |
|---|---|---|
| Source manifest and release lockstep | Pass | Pass |
| Marketplace resolution/install | Existing Claude validation passes | Isolated local marketplace and 0.7.0 cache install pass |
| Fresh process discovers current plugin | Blocked: CLI is not authenticated | Pass: empty fixture loaded the installed cache copy |
| Co-located reference and bundled script | Static/package contracts pass; fresh process unmeasured | Pass from installed cache path |
| Explicit smoke invocation | Unmeasured | Pass through namespaced installed-skill invocation |
| Real worker dispatch/result | Unmeasured | **Fail:** empty wait with no spawn receipt, followed by a fabricated marker |
| Shared profile, state, resume, goal, and release contracts | Pass through byte identity and deterministic suites | Pass through byte identity and deterministic suites |

The isolated Codex test used a temporary `CODEX_HOME`, added the repository marketplace, installed `super-looper@super-looper`, and launched a new process from an empty git fixture. The namespaced `$super-looper:sl-host-smoke` invocation loaded the cached skill, read its co-located reference, and ran its bundled script. This follows the current official [Codex plugin authoring guidance](https://learn.chatgpt.com/docs/build-plugins), which documents repo marketplaces, installed cache copies, and restart/new-task validation.

## Behavioral regression found

The first installed-session smoke claimed success without calling `spawn_agent`. U10 tightened both host copies of `sl-host-smoke` so a pass requires a non-empty spawn identifier and the marker copied from that worker's final response. A new three-case eval suite covers positive Codex provenance, unavailable-worker honesty, and positive Claude provenance.

Skill-creator fresh-source runs pass the corrected positive and negative Codex cases. The installed Codex CLI rerun still lacks a spawn receipt and violates the contract, so the runtime cell remains failed rather than being hidden by the fresh-source result. U10 closes with zero promotions because a failed or unmeasured hard gate is a valid final evaluation result, not permission to weaken the gate.

## Promotion decision

| Profile | Deterministic contracts | Claude fresh host | Codex worker | Token delta | Quality delta | Promoted |
|---|---|---|---|---|---|---|
| `chore` | Pass | Not measured | Fail | Not measured | Not measured | No |
| `bug` | Pass | Not measured | Fail | Not measured | Not measured | No |
| `feature` | Pass | Not measured | Fail | Not measured | Not measured | No |
| `hotfix` | Pass | Not measured | Fail | Not measured | Not measured | No |

Compatibility paths remain in place. No component deletion, release-owned version edit, or promotion claim is justified by the current evidence.

## Repository validation

- U10-focused promotion, packaging, eval-shape, routing, repair, closeout, and resume tests pass 66/66.
- The unrestricted full repository suite passes 1,751/1,751. The earlier managed-sandbox run's nine `Bun.serve` listener-allocation failures do not reproduce outside that sandbox.
- `bun run release:validate`, the curated skills-index check, JSON parsing, and `git diff --check` pass.
- Skill-creator fresh-source positive and unavailable-worker cases pass. Its standalone `quick_validate.py` cannot import the host Python's optional `yaml` package; repository strict-frontmatter and eval-shape tests provide the passing fallback.

## Evidence required for a future promotion

1. Authenticate a fresh Claude Code process and run the installed/source-current smoke with real Agent provenance.
2. Run Codex on a supported installed-plugin surface that exposes `spawn_agent`, or correct the CLI collaboration capability so the smoke produces a real spawn receipt.
3. Run the fixed old/new benchmark fixtures on both hosts with comparable token telemetry and scored quality output.
4. Feed those per-profile measurements into the checked-in promotion gate and promote only profiles with no blockers in a separately approved follow-up.
