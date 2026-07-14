---
name: lfg
description: "Compatibility command for the streamlined unattended developer workflow. Plans a software task with sl-plan when needed, then routes execution through sl-run in mode:unattended. Prefer sl-plan followed by sl-run for new workflows."
argument-hint: "[feature description | plan:<path> | state:<path>]"
---

# Unattended run compatibility

`lfg` is a compatibility wrapper. Tell the user once, concisely: **"`lfg` now routes through `sl-plan` -> `sl-run`; use those commands directly for new workflows."** Then perform the route instead of recreating the former pipeline in this skill.

## Invariants

- Never edit `STRATEGY.md` or the active plan. A goal change requires interactive `sl-strategy` or a human-approved plan revision before a new run. The supervisor and goal guard report violations as exit `8`, `typed_failure: "goal-drift"`.
- Match skill names against the host's available-skills catalog before invoking them; a host may namespace the displayed name.
- Preserve literal `profile:`, `run-id:`, `base-ref:`, `state-path:`, and `max-workers:` tokens when forwarding to `sl-run`.
- Do not implement, review, commit, push, open a pull request, watch CI, or capture learning in this wrapper. `sl-run` owns workflow transitions and authority gates.
- Unattended `sl-run` stops at durable `review_ready` by default. It never infers engineer approval or delivery authority.

## Route

1. Parse literal input markers.
2. If `mode:legacy-pipeline` is present, remove that token, read `references/legacy-pipeline.md`, and follow it. This explicit compatibility route exists only for the legacy per-phase loop driver; never select it implicitly.
3. If `state:<absolute-path>` is present, invoke `sl-run` with the state marker, `mode:unattended`, and the preserved forwarding tokens. Do not plan or initialize another run.
4. If `plan:<repo-relative-path>` is present, invoke `sl-run` with that exact plan marker, `mode:unattended`, and the preserved forwarding tokens. Let `sl-run` validate the canonical Markdown plan; do not silently re-plan an invalid path.
5. Otherwise invoke `sl-plan` with the software-task description in pipeline/unattended context. It must produce canonical Markdown. If planning rejects a non-software task or does not return a readable plan path, stop with that error.
6. Invoke `sl-run` with `plan:<returned-path> mode:unattended` plus the preserved forwarding tokens.
7. Return `sl-run`'s compact status and absolute state path. Emit `<promise>DONE</promise>` as the final non-empty line only when `sl-run` durably reports `review_ready` or `completed`; otherwise stop honestly without the sentinel.

`progress:<path>` and `resume:<path>` belong only to `mode:legacy-pipeline`. Never translate them into new primary-workflow state. New unattended runs use `state-path:<absolute-path>` and resume with `state:<absolute-path>`.
