---
name: sl-work
description: "Compatibility command for interactive implementation. Plans a software task when needed, then routes canonical Markdown execution through sl-run in mode:interactive. Prefer sl-run directly for new workflows."
argument-hint: "[description | plan:<path> | state:<path>]"
---

# Interactive run compatibility

`sl-work` is a compatibility wrapper. Tell the user once, concisely: **"`sl-work` now routes through `sl-plan` -> `sl-run`; use `/sl-run` directly with a canonical plan for new workflows."** Then perform the route instead of running a second workflow engine here.

## Invariants

- Never edit `STRATEGY.md` or the active plan. `sl-run` owns immutable-goal enforcement and all run-state transitions.
- Match skill names against the host's available-skills catalog before invoking them; a host may namespace the displayed name.
- Preserve literal `profile:`, `run-id:`, `base-ref:`, `state-path:`, and `max-workers:` tokens when forwarding to `sl-run`.
- Do not independently implement, delegate a reviewer fleet, run shipping steps, commit, push, or open a pull request. The `sl-run` kernel emits every implementation, verification, review, delivery, CI, and closeout action.
- Interactive execution still stops at the engineer review boundary. Only an explicit engineer decision can authorize delivery.

## Route

1. Parse literal input markers. If `mode:legacy-workflow` is present, remove it, read `references/legacy-workflow.md`, and follow the old workflow; this explicit route exists only for legacy callers and must never be selected implicitly for ordinary code work.
2. Default `RUN_MODE` to `mode:interactive`. If an older caller supplied `mode:unattended`, set `RUN_MODE` to `mode:unattended`, explain that `lfg` or `sl-run mode:unattended` is the direct replacement, and do not ask interactive questions.
3. If `state:<absolute-path>` is present, invoke `sl-run` with the state marker, `RUN_MODE`, and preserved forwarding tokens. Do not plan or initialize another run.
4. If the named input is an HTML plan or a plan carrying `execution: knowledge-work`, read `references/legacy-workflow.md` and use only its corresponding compatibility path. `sl-run` accepts canonical Markdown code plans; do not pretend these older inputs satisfy that contract. For HTML code plans, name `/sl-plan output:md` followed by `/sl-run plan:<returned-path>` as the direct replacement for future work.
5. If `plan:<repo-relative-path>` is present, or the sole remaining argument is a readable canonical Markdown plan path, normalize it to `plan:<path>` and invoke `sl-run` with `RUN_MODE` plus preserved forwarding tokens. Let `sl-run` reject an invalid plan; do not silently fall through to planning.
6. Otherwise invoke `sl-plan` with the supplied software-task description. A blank invocation may ask `sl-plan` to resolve the intended task; do not guess by selecting the newest plan yourself. Use pipeline context when `RUN_MODE` is unattended so planning emits canonical Markdown without questions.
7. When `sl-plan` returns a readable canonical Markdown plan, invoke `sl-run` with `plan:<returned-path>`, `RUN_MODE`, and preserved forwarding tokens.
8. Return `sl-run`'s compact status, review boundary, and absolute state path. Do not narrate implementation as complete when the durable state says otherwise.

The legacy reference is not a fallback for ordinary code work. Load it only for the explicit legacy token or the two input shapes named in step 4.
