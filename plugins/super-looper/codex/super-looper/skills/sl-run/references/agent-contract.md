# Implementation and repair agent result

Return exactly one JSON object:

```json
{
  "schema_version": 1,
  "run_id": "<from packet>",
  "phase_id": "<from packet>",
  "unit_id": "<from packet>",
  "role": "implementation|repair",
  "status": "completed|blocked|failed",
  "session": { "handle": "<opaque host handle>", "resumable": true },
  "changed_files": ["repo/relative/path"],
  "evidence": ["observable implementation evidence"],
  "risks": ["remaining risk"],
  "unresolved": ["specific unresolved item"]
}
```

Use `session: null` when the host exposes no stable handle. Set `resumable` true only when the selected runtime can actually continue that handle.
Never invent a resumable handle.

Rules:

- Change files only inside the packet's `owned_scope`; report repository-relative paths.
- Use the role requested by kernel output.
- Report implementation evidence, not a phase/run pass or required-check result.
- Report `blocked` for missing authority, dependency, credential, decision, or environment.
- Report `failed` when the bounded implementation or repair cannot finish safely.
- Never edit the plan, strategy, run state, packets, or another node's result.
