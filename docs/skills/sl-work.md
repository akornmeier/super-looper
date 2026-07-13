# `sl-work`

> Compatibility route for interactive `sl-plan` -> `sl-run`.

`sl-work` keeps older execution commands working while canonical code work moves to `/sl-run`. It no longer carries a separate implementation, reviewer-fleet, or shipping engine.

## Routing

| Input | Route |
|-------|-------|
| Feature description | Run `sl-plan`, then pass its canonical Markdown path to `sl-run mode:interactive` |
| `plan:<path>` or a Markdown plan path | Normalize to `plan:<path>` and invoke `sl-run mode:interactive` |
| `state:<absolute-path>` | Resume that `sl-run` state interactively |
| Older `mode:unattended` caller | Preserve unattended policy, with `lfg` or `sl-run mode:unattended` named as the direct replacement |

The wrapper forwards profile, run ID, base ref, state path, and bounded-worker markers. It does not implement, review, commit, push, or open a PR itself; the kernel emits those actions and enforces the engineer authority boundary.

```text
/sl-work plan:docs/plans/<plan>.md
```

For new workflows, use:

```text
/sl-run plan:docs/plans/<plan>.md
```

## Older input compatibility

HTML plans and plans marked `execution: knowledge-work` retain an isolated compatibility route because `sl-run` intentionally accepts canonical Markdown code plans only. These exceptions do not become a fallback for ordinary code work. Prefer `/sl-plan output:md` followed by `/sl-run` for future code plans.

## See also

- [`sl-plan`](./sl-plan.md) — produces the canonical plan
- [`sl-run`](./sl-run.md) — primary execution and resume workflow
- [`lfg`](./lfg.md) — unattended compatibility wrapper
