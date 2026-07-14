# Legacy pipeline availability

Stop with a compatibility message: `mode:legacy-pipeline` is a Claude Code-only bridge for the old stacked-PR loop driver and is not packaged as a native Codex workflow.

Give the direct replacements:

- Use `sl-run plan:<path> mode:unattended` for a canonical Markdown plan.
- Use the repository's Claude Code `scripts/loop-phases.sh` entrypoint only when the operator explicitly needs the legacy stacked-PR behavior.

Do not emulate the old orchestration in coordinator prose.
