# `lfg`

> Compatibility route for unattended `sl-plan` -> `sl-run`.

`lfg` keeps existing invocations working while the primary interface moves to `/sl-strategy`, `/sl-plan`, and `/sl-run`. It is an adapter, not a second workflow engine.

## Routing

| Input | Route |
|-------|-------|
| Feature description | Run `sl-plan` in pipeline mode, then pass its canonical Markdown path to `sl-run mode:unattended` |
| `plan:<path>` | Pass the exact plan marker to `sl-run mode:unattended` |
| `state:<absolute-path>` | Resume the exact `sl-run` state in unattended mode |

Profile, run ID, base ref, state path, and bounded-worker markers are forwarded unchanged. Invalid plan paths stop honestly; they never fall through to re-planning.

Unattended execution stops at durable `review_ready` unless an already-authorized run reaches `completed`. `lfg` never infers engineer approval or delivery authority. The absolute `sl-run` state path is the resume and audit handle.

```text
/lfg "make background job retries safer"
```

For new workflows, use the direct form:

```text
/sl-plan "make background job retries safer"
/sl-run plan:docs/plans/<plan>.md mode:unattended
```

## Explicit legacy route

The former plan-to-PR pipeline is preserved only for callers that explicitly pass `mode:legacy-pipeline`. `scripts/loop-phases.sh` uses this route to retain stacked-PR behavior. It is never selected for an ordinary `lfg` invocation.

## See also

- [`sl-plan`](./sl-plan.md) — produces canonical execution plans
- [`sl-run`](./sl-run.md) — owns workflow state, review, delivery, CI, and closeout
- [`sl-work`](./sl-work.md) — interactive compatibility wrapper
