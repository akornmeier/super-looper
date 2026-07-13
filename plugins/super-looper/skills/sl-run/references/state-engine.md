# State engine operations

The bundled `scripts/run-state.py` is the sole run-state writer. It emits one JSON summary on stdout and one structured error on stderr. Use the selected runtime adapter to form the script prefix; never use a project-relative script path.

## Exit codes

| Code | Meaning |
|---:|---|
| 0 | Operation succeeded |
| 2 | CLI usage error |
| 3 | Invalid plan, state, packet, result, or file |
| 4 | Resume safety failure such as branch mismatch or unreachable recorded head |
| 5 | Illegal/concurrent state transition |
| 8 | Plan or strategy goal drift |

## Operations

```text
<engine> init --target <repo-root> --plan <repo-relative-plan> [--strategy <repo-relative-path>] [--run-id <id>] [--state <absolute-state-path>] [--base-ref <ref>]
<engine> inspect --state <absolute-state-path>
<engine> resume --state <absolute-state-path>
<engine> start-next --state <absolute-state-path> [--worker-id <id>]
<engine> record-worker --state <absolute-state-path> --result <absolute-result-path>
<engine> verify-phase --state <absolute-state-path> --status passed|failed --evidence <text> [--evidence <text> ...]
```

`init` parses the canonical Markdown into `execution-plan.json`, hashes the raw plan and strategy, records branch/base/head, and atomically writes `run-state.json`. Its default state path is `/tmp/super-looper/sl-run/<run-id>/run-state.json`.

Every mutating operation takes an exclusive state lock, revalidates goal hashes, branch identity, and recorded-head reachability, then uses temp-file-plus-rename atomic replacement. `resume` validates without changing completion state.

`start-next` never repeats completed work. It writes one `phase-packet-<phase>-<unit>.json` and marks only that unit in progress. If a unit was already in progress before the current session, `resume` reports `reconcile-in-progress-unit`; do not call `start-next` or redispatch blindly.

`record-worker` copies a valid result into the state bundle and updates only the active unit. `verify-phase` is the only operation that records a phase gate; the final passing gate makes the run terminal `completed`.
