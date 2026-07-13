# Codex runtime adapter

1. Use the available structured user-input tool for the payload question. If no structured blocking-input tool is available in the current mode, present the two numbered options in chat and wait for the reply.
2. Resolve the skill directory from the absolute `SKILL.md` source path provided when the skill loaded. Invoke Bash with the absolute script path and arguments `codex` and the selected choice:

```bash
bash "<absolute-skill-directory>/scripts/smoke.sh" codex <alpha-or-beta>
```

Do not execute the script directly and do not assume the user's project CWD contains it.
3. Dispatch exactly one worker with the Codex subagent collaboration tool. Pass only the host, choice, and `reference_marker`. Wait for it to finish and ask for exactly this JSON shape with no tool use:

```json
{"worker_marker":"worker:<host>:<choice>:<reference_marker>"}
```

4. Treat a missing question response, non-zero script, malformed marker, unavailable worker tool, or malformed worker result as a failed diagnostic.
