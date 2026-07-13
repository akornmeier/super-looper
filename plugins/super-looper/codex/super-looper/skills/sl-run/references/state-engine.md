# Workflow kernel operations

The bundled `scripts/run-state.py` is the sole state writer and transition authority. It emits one JSON summary on stdout and one structured error on stderr. Use the selected runtime adapter for the command prefix; never use a project-relative script path.

## Exit codes

| Code | Meaning |
|---:|---|
| 0 | Operation succeeded, including a typed check failure routed to repair |
| 2 | CLI usage error |
| 3 | Invalid plan, state, packet, result, or unsafe command |
| 4 | Resume safety failure such as branch mismatch or unreachable head |
| 5 | Illegal or concurrent state transition |
| 8 | Plan or strategy goal drift |

## Workflow kernel operations

```text
<kernel> init --kernel --target <repo-root> --plan <repo-relative-plan> [--profile chore|bug|feature|hotfix] [--isolation-capability sandbox|worktree|shared ...] [--max-workers 1..3] [--strategy <repo-relative-path>] [--run-id <id>] [--state <absolute-state-path>] [--base-ref <ref>] [--max-repair-attempts 0..3]
<kernel> inspect --state <absolute-state-path>
<kernel> resume --state <absolute-state-path>
<kernel> record-router --state <absolute-state-path> --result <absolute-result-path>
<kernel> record-proposal-decision --state <absolute-state-path> --decision approved|rejected --approved-by <identity>
<kernel> start-next --state <absolute-state-path> [--worker-id <id>]
<kernel> record-agent --state <absolute-state-path> --result <absolute-result-path>
<kernel> run-checks --state <absolute-state-path> [--timeout <1..1800>]
<kernel> record-verifier --state <absolute-state-path> --result <absolute-result-path>
```

`init --kernel` parses the canonical Markdown into `execution-plan.json`, selects or requests a workflow profile, records actual isolation capabilities and bounded-team eligibility, hashes the raw plan and strategy, records branch/base/head, creates the workflow journal, and atomically writes `run-state.json`. The default state path is `/tmp/super-looper/sl-run/<run-id>/run-state.json`.

Each mutating operation takes an exclusive state lock, revalidates goal hashes, branch identity, and recorded-head reachability, then uses temp-file-plus-rename replacement. `resume` validates without repeating a node.

The kernel emits actions; the host adapter performs them:

| `next_action` | Host behavior |
|---|---|
| `start-next` | Invoke `start-next` |
| `dispatch-router` | Start one frontier router with the emitted route packet |
| `await-hotfix-proposal-approval` | Stop for an explicit engineer decision; unattended mode cannot infer approval |
| `dispatch-agent` | Start one implementation/repair agent with the emitted packet |
| `resume-agent` | Continue the emitted session handle with the repair packet |
| `run-checks` | Invoke `run-checks`; do not execute commands through the model |
| `dispatch-verifier` | Start a fresh independent verifier with the emitted packet |
| `reconcile-in-progress-agent` | Stop and reconcile; do not blindly redispatch |
| `reconcile-in-progress-verifier` | Stop and reconcile; do not blindly redispatch |
| `reconcile-in-progress-router` | Stop and reconcile; do not blindly redispatch |
| `await-engineer-review` | Stop at the emitted review packet; U6 has no approval/delivery transition |

`run-checks` converts plan command entries to argument vectors, rejects shell control flow and shell `-c`, applies timeouts, writes stdout/stderr logs, and records a code node. Entries beginning with `Inspect ` are forwarded to the verifier packet instead of executed. A failed check is a successful kernel operation whose JSON routes repair; it is not a CLI failure.

Router, agent, and verifier returns enter through uniquely named `incoming-router-*.json`, `incoming-agent-*.json`, and `incoming-verifier-*.json` staging files. Names beginning `router-result-`, `agent-result-`, or `verifier-result-` are kernel-owned immutable outputs and are rejected as inputs.

Profiles are data in `workflow-profiles.json`. Clear plan metadata and risk signals route without an agent. Ambiguous work emits one router packet. A route override cannot lower the deterministic safety floor. Hotfix selection creates a pending human proposal node before implementation.

Isolation selection prefers declared `sandbox`, then `worktree`, then `shared`. The kernel records a parallel-eligible group only when requested capacity, profile policy, isolation, dependency independence, and owned-scope non-overlap all pass. Shared checkout always records `max_workers: 1`. U7's portable coordinator remains one-dispatch-at-a-time even when a group is eligible.

The legacy U5 `record-worker` and `verify-phase` operations remain available only for compatibility fixtures. New runs use the kernel operations above.
