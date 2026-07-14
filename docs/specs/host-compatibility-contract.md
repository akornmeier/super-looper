# Claude Code and Codex compatibility contract

Super Looper treats Claude Code and Codex as peer hosts. A core workflow is portable only when its shared semantic instructions pass on both hosts through explicit runtime adapters.

## Distribution surfaces

| Contract | Claude Code | Codex | Gate |
|---|---|---|---|
| Plugin manifest | `plugins/super-looper/.claude-plugin/plugin.json` | `plugins/super-looper/codex/super-looper/.codex-plugin/plugin.json` | Shared name, version, description, and author stay in lockstep |
| Marketplace | `.claude-plugin/marketplace.json` | `.agents/plugins/marketplace.json` | Each entry resolves its host package |
| Skills | `plugins/super-looper/skills/` | `plugins/super-looper/codex/super-looper/skills/` | Migrated skill semantics and resources stay equal by contract test |
| Hooks | `hooks/hooks.json` | Default plugin hook discovery | Hook commands use the cross-host `CLAUDE_PLUGIN_ROOT` compatibility variable |
| Typed agents | Plugin `agents/sl-*.md` | Not a portable plugin surface | Codex adapters inject compact roles into subagent tasks |

## Runtime adapter matrix

| Concern | Shared contract | Claude adapter | Codex adapter |
|---|---|---|---|
| Questions | Ask for the smallest decision that changes execution | `ToolSearch` + `AskUserQuestion`, chat fallback | Structured input tool when available, chat fallback |
| Workers | Bounded task, explicit input, structured result | `Agent`/`Task` with `sl-*` agents where applicable | Codex collaboration subagent with an injected role |
| Model roles | Semantic role such as frontier planner or worker | Host-supported model selection | Host-supported model selection |
| Worktrees | Isolate only when the phase requires it | Native or git fallback | Native or git fallback |
| Skill scripts | Execute the co-located script, never a project-relative guess | `${CLAUDE_SKILL_DIR}` | Absolute skill source path exposed at load time |
| Plugin updates | Fresh installed content and fresh session | Claude marketplace update/restart | Codex cachebuster/reinstall/new thread |
| Hooks | Preserve goal checksum authority | Claude event payload | Codex event payload plus compatibility root variables |

## Authoring rules

- Keep shared `SKILL.md` sections free of host tool syntax.
- Preserve Claude-only frontmatter in the Claude package and use `agents/openai.yaml` for Codex invocation policy; do not weaken one host to satisfy the other.
- Put unavoidable host mechanics in `references/runtime-claude.md` and `references/runtime-codex.md` inside the same skill.
- Keep each skill self-contained; do not import another skill's adapter.
- Treat unsupported dispatch, interaction, or script resolution as an explicit failure. Never report degraded sequential work as successful parallel or worker execution.
- Capture real hook payload fixtures from both hosts before changing payload parsing.
- Block promotion when either host's packaging, smoke workflow, behavioral eval, or safety gate fails.

`sl-host-smoke` is the first executable proof of this seam. Its two packaged copies are drift-checked byte for byte. It verifies shared reference loading, one question, one bundled script, one worker, and a structured result without modifying the target repository.
