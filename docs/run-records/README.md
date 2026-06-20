# Run-record ledger

`ledger.jsonl` is the committed, append-only ledger of loop-driver run-records.

- **One record per line** — each line is a single JSON object emitted by `scripts/loop.sh` (`emit_record`), appended by the operator-side `scripts/append-run-record.sh` after a real run.
- **Index, not copy** — a record points at a run (transcript log, PR URL, residual findings); it never inlines seed text, prompts, or message content. No PII.
- **Append-only operator output** — `loop.sh` is the sole writer of records; the append step adds no fields. The file appears on first append, so its absence is a valid "no data yet" state, not an error.

The pulse skill (`sl-product-pulse`) reads this ledger to compute `unattended_completion_rate` (`success / total` over the report window, where `success` = `outcome == "success"`).
