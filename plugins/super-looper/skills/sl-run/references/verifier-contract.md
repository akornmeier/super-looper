# Independent verifier result

Return exactly one JSON object:

```json
{
  "schema_version": 1,
  "run_id": "<from packet>",
  "phase_id": "<from packet>",
  "role": "verifier",
  "status": "passed|failed|blocked",
  "evidence": ["observable completion-gate evidence"],
  "findings": ["specific semantic or risk finding"],
  "repair_unit_id": null
}
```

Rules:

- Apply the packet's profile-specific verifier lenses and required evidence; do not invent extra standing reviewer personas.
- Be independent: do not reuse the implementation or repair agent session.
- Judge the phase goal and completion gate using the packet, changed files, and direct inspection.
- Treat deterministic command results as evidence only for what those commands cover.
- On `failed`, set `repair_unit_id` to the responsible packet unit when a bounded repair is possible.
- On `blocked`, name the missing evidence or authority in `findings`.
- Do not edit implementation files or any workflow artifact.
