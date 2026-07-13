# Worker result contract

Return exactly one JSON object with these fields:

```json
{
  "schema_version": 1,
  "run_id": "<from packet>",
  "phase_id": "<from packet>",
  "unit_id": "<from packet>",
  "status": "completed|blocked|failed",
  "changed_files": ["repo/relative/path"],
  "evidence": ["observable implementation evidence"],
  "verification": ["command and result actually run"],
  "risks": ["remaining risk"],
  "unresolved": ["specific unresolved item"]
}
```

Rules:

- Use only repository-relative changed-file paths inside `owned_scope`.
- Report `completed` only when the unit's acceptance criteria are satisfied and its verification commands were addressed.
- Report `blocked` when a missing decision, credential, authority, dependency, or environment prevents safe progress.
- Report `failed` for an attempted unit that cannot be completed safely or whose unit verification fails without a permitted repair.
- Keep evidence factual and compact. Do not include the full transcript or claim the phase/run passed.
- Never edit the plan, strategy, run state, phase packet, or another worker's result.
