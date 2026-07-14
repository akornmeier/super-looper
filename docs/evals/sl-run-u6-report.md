---
title: "sl-run U6 code-owned workflow kernel evaluation"
date: 2026-07-13
unit: U6
status: passed
---

# sl-run U6 Evaluation Report

## Outcome

U6 extracts the outer serial workflow from `sl-run` prose into the portable `run-state.py` kernel. The skill is now a host adapter: it performs only the typed `next_action` emitted by the kernel, stages an agent or verifier result, and returns control to code.

The proven graph is:

```text
agent: implementation
  -> code: deterministic checks
  -> agent: independent semantic verifier
  -> human: final review (pending)
```

Failed deterministic or semantic verification routes through a bounded repair node. The responsible session is resumed only when the host supplies a real resumable handle; otherwise state records a fresh-agent fallback. Successful verification stops at `review_ready`. U6 does not commit, push, open a pull request, deliver, learn, route profiles, or run workers in parallel.

## Deterministic Evidence

`tests/workflow-kernel.test.ts` exercises the code/agent boundary without asking a model to simulate process control:

- a failed command routes to the same resumable session, then passes checks and independent verification;
- a non-resumable session produces an explicit fresh repair dispatch;
- a semantic verifier failure consumes the bounded repair budget and is independently re-verified;
- shell control operators, redirects, substitutions, environment assignment prefixes, and shell `-c` are refused without side effects;
- non-command evidence prefixed with `Inspect ` is preserved for the verifier and is never executed;
- kernel-owned immutable result names cannot be supplied as staging input;
- node history distinguishes `code`, `agent`, and `human` ownership and ends with a pending human review node.

Contract tests also cover the thin `sl-run` adapter, the `sl-plan` argv-compatible verification handoff, dual-host package drift, loop-driver handling of `review_ready`, and the shared TypeScript schemas.

A separate fresh-source `sl-plan` evaluation produced three standalone argv-compatible commands for formatting, typechecking, and tests, followed by a distinct `Inspect ` visual-evidence item. It used no shell control operators or compound command.

## Fresh-source Behavioral Evidence

The repository-mandated fresh-source pattern was used so the evaluators read the current files from disk instead of a session-cached skill.

| Package source | Harness | Result | Evidence |
|---|---|---|---|
| Claude Code package | Fresh generic Codex subagent with the current Claude-package `SKILL.md` injected by path | Pass with qualification | Reached `review_ready`; kernel ran the configured check; a fresh verifier passed the semantic gate; `HEAD` was unchanged; only the requested result file was untracked. This is source-level behavioral confirmation, not a native Claude Code runtime claim. |
| Native Codex package | Fresh Codex collaboration agents using the current Codex-package `SKILL.md` | Pass | Reached `review_ready` through implementation -> code check -> verifier -> pending human review. `test -f src/result.txt` exited 0 in 8 ms; the verifier confirmed exact content; `HEAD` was unchanged and no delivery occurred. |

The direct host fixtures exercised the success path. The failed-check, same-session repair, non-resumable fallback, and semantic-repair paths are covered deterministically with mocked typed agent results in the kernel suite. A future native Claude runtime promotion run remains part of U10's two-host evaluation boundary.

## Efficiency Evidence

- The always-loaded `sl-run/SKILL.md` body decreased from 7,301 bytes at U5 to 7,018 bytes at U6 while adding the code/agent/human separation contract.
- Successful deterministic commands consume no agent dispatch. Their logs remain on disk and state carries pointers plus compact classifications.
- The default graph is one implementation agent and one independent verifier. Repairs are conditional and bounded to one by default.
- Claude and Codex skill bodies and kernel scripts are byte-identical, enforced by package drift tests.
- Host token telemetry was unavailable, so this report does not infer token counts from bytes.

## Validation

The U6 boundary requires:

- the full Bun test suite;
- TypeScript typechecking;
- release metadata validation;
- plugin validation;
- generated skill-index drift validation;
- Python and shell syntax validation;
- fresh-source skill validation and behavioral confirmation.

Final command results are recorded in the implementing commit handoff.

## Boundary

U6 stops at engineer review. U7 may add deterministic task/risk profiles and an isolation interface, but it must preserve the serial default and must not grant delivery authority.
