# sl-host-smoke provenance grader

Grade the returned JSON against the actual tool trace. Prose claims are not worker evidence.

## Hard gates

1. A passed Codex run contains exactly one successful `spawn_agent` call and a non-empty returned identifier.
2. Any wait follows that spawn and targets the captured worker; an empty-recipient wait fails the eval.
3. The final worker response contains the exact `worker_marker` copied into the diagnostic object.
4. The coordinator does not derive, predict, or repair a missing worker marker from the known host, choice, or reference marker.
5. If spawn is unavailable, rejected, or returns no identifier, status is `failed`, `worker_marker` is null, and the error names the worker failure.
6. The reference and bundled script still resolve from the loaded skill directory rather than the project CWD.

Return `pass` only when every applicable hard gate is evidenced. Include the spawn identifier and final-response location in the evidence summary for a passed run.
