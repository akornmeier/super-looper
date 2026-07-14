# Codex runtime adapter

1. Use the available structured user-input tool for the payload question. If no structured blocking-input tool is available in the current mode, present the two numbered options in chat and wait for the reply.
2. Resolve the skill directory from the absolute `SKILL.md` source path provided when the skill loaded. Invoke Bash with the absolute script path and arguments `codex` and the selected choice:

```bash
bash "<absolute-skill-directory>/scripts/smoke.sh" codex <alpha-or-beta>
```

Do not execute the script directly and do not assume the user's project CWD contains it.
3. Call the Codex `spawn_agent` collaboration primitive exactly once with `fork_turns: "none"`, an ASCII task name such as `host_smoke_worker`, and a task containing only the host, choice, `reference_marker`, and the JSON request below. Capture the non-empty returned agent identifier. If `spawn_agent` is unavailable or returns no identifier, the diagnostic fails immediately; do not call a wait primitive and do not manufacture the expected response.

```json
{"worker_marker":"worker:<host>:<choice>:<reference_marker>"}
```

4. Wait only for the captured worker identifier until it returns a final response. Copy `worker_marker` verbatim from that final response; do not compute it from the known inputs. An empty-recipient wait, a wait without a preceding spawn receipt, or coordinator-authored marker is failure evidence.
5. Treat a missing question response, non-zero script, malformed marker, unavailable worker tool, missing dispatch identifier, missing final worker response, or malformed worker result as a failed diagnostic.
