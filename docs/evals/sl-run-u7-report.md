---
title: "sl-run U7 risk-routed workflow profiles evaluation"
date: 2026-07-13
unit: U7
status: passed
---

# sl-run U7 Evaluation Report

## Outcome

U7 adds four data-defined workflow profiles over the U6 code-owned kernel: `chore`, `bug`, `feature`, and `hotfix`. Deterministic code now selects the least expensive safe profile from explicit plan metadata and observable risk signals. A frontier router is dispatched only when those inputs are genuinely ambiguous, and its typed result and rationale are persisted.

The selected profile controls required evidence, verification lenses, repair and worker limits, and isolation policy. A user override is accepted only when it does not fall below the mechanically observed safety floor. Hotfixes create a pending human proposal node before implementation, and approval still grants no delivery authority.

Isolation selection is capability based: dedicated sandbox first, existing dedicated worktree second, and serialized shared checkout otherwise. A requested team is capped at three. Eligibility requires a non-shared backend, same-phase DAG independence, and non-overlapping owned scopes; shared, dependent, overlapping, and chore work serialize.

## Deterministic Evidence

The profile, routing, isolation, and kernel suites prove that:

- explicit task types route without an agent;
- ambiguous input emits one router node and persists its typed result;
- an override or plan profile below an observed incident floor is rejected;
- chore work remains single-worker and avoids frontier routing;
- isolated, independent, non-overlapping units are eligible within the profile and global caps;
- shared, dependent, or overlapping units are mechanically serialized;
- hotfix implementation cannot start until the proposal is explicitly approved;
- approval does not authorize delivery;
- profile requirements, review lenses, isolation facts, and worker bounds flow into phase and verifier packets;
- the U6 build -> checks -> bounded repair -> independent verifier -> `review_ready` graph remains intact.

The planner contract and eval suite now require one explicit safe `workflow_profile` in canonical plan frontmatter and distinguish planning-time eligibility from execution authority.

## Fresh-source Behavioral Evidence

The repository-mandated skill-creator pattern was used so generic evaluators read the current source from disk instead of a session-cached plugin definition.

| Package source | Harness | Scenario | Result |
|---|---|---|---|
| Claude Code package | Fresh generic Codex harness reading the Claude-package source | Ambiguous one-unit plan | Pass: one typed router dispatch selected `chore`; state recorded `route_source: agent`, shared isolation, and one worker; execution stopped before implementation. This is source-level evidence, not a native Claude runtime claim. |
| Native Codex package | Fresh Codex collaboration harness reading the Codex-package source | Active production outage | Pass: deterministic routing selected `hotfix`; the run stopped at `await-hotfix-proposal-approval`; delivery remained unauthorized; no implementation or repository mutation occurred. |
| Claude Code planner source | Fresh generic Codex harness reading the current `sl-plan` source | Chore, defect, feature, and outage planning | Pass: emitted canonical `chore`, `bug`, `feature`, and `hotfix` metadata, bounded ownership/dependency guidance, no parallel authority, and the no-downgrade safety rule. |

All behavioral runs preserved goal files and repository HEAD. A future native Claude runtime promotion run remains part of U10.

## Efficiency Evidence

- Deterministic chore, bug, feature, and hotfix definitions occupy 1,192 bytes of data and do not duplicate orchestration prose.
- Clear work incurs no router-agent dispatch. Only ambiguity spends a frontier turn.
- Shared checkout and chore work default to one worker; extra compute is admitted only after mechanical isolation and overlap checks.
- Successful code checks still consume no agent turn, and only compact failure evidence returns to repair.
- The always-loaded `sl-run/SKILL.md` grew from 7,018 bytes at U6 to 8,748 bytes at U7 to expose routing and approval boundaries. The larger 80,140-byte state engine is executed code, not prompt context. Host token telemetry was unavailable, so bytes remain an instruction-size proxy rather than a token claim.

## Validation

- `bun test`: 1,727 passed, 0 failed.
- `bunx tsc --noEmit`: passed.
- `bun run release:validate`: passed; metadata remains 42 agents, 41 skills, and 0 MCP servers.
- `bun run plugin:validate`: passed with the pre-existing root `CLAUDE.md` compatibility-shim warning.
- Generated docs drift, Python compilation, shell syntax, diff whitespace, and both host skill quick validators: passed.
- Claude and Codex coordinator, profile data, contracts, references, and state-engine copies remain aligned by drift tests.

## Boundary

U7 stops at `review_ready`, or earlier at hotfix proposal approval. It does not commit, push, open a pull request, watch CI, deliver, capture learnings, or edit strategy.

The portable coordinator records mechanically valid bounded-concurrency eligibility but still dispatches one unit per coordinator action. This is deliberately not presented as parallel execution. Actual concurrent isolated integration must remain disabled until a host adapter can prove that worker outputs can be integrated without weakening ownership, checks, or review.

U8 may add engineer acceptance, code-owned delivery, and evidence closeout while keeping hotfix proposal and final delivery approval mandatory.
