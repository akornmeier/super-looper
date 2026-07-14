# sl-run U9 evaluation report

Date: 2026-07-13

## Outcome

U9 passes. The documented product path is now `sl-strategy -> sl-plan -> sl-run` on Claude Code and Codex. `lfg` and `sl-work` remain short compatibility adapters, while their retired orchestration bodies are isolated behind explicit legacy modes rather than defining new runs.

## Evidence

- Root and plugin onboarding teach the three core commands, all four workflow profiles (`chore`, `bug`, `feature`, and `hotfix`), durable state/resume behavior, and the engineer-owned `review_ready` boundary.
- `lfg` routes descriptions through `sl-plan` and then `sl-run mode:unattended`; existing plan and state inputs route directly to `sl-run`. It does not infer approval or delivery.
- `sl-work` routes descriptions through `sl-plan` and then interactive `sl-run`; existing plan and state inputs route directly. It preserves explicit unattended requests and gives a direct replacement for HTML compatibility.
- Claude and Codex ship byte-identical hot-path wrappers. Claude-only retired workflows remain available behind `mode:legacy-pipeline` and `mode:legacy-workflow`, outside native Codex hot paths.
- `sl-handoff` refuses to duplicate active run state and points users back to `sl-run state:<path>`. It remains available only for genuine non-run research, debugging, design, or manual session transitions.
- Primary brainstorm, plan, and loop-driver callers route directly to `sl-plan` and `sl-run`; active entrypoints no longer dispatch fixed reviewer personas or treat `lfg`, `sl-work`, or `sl-handoff` as the workflow engine.
- No compatibility component or agent was deleted, and no U10 promotion work was performed.

## Behavioral evaluation

- Skill-creator fresh-source evaluation passed all four `lfg` routing cases.
- Skill-creator fresh-source evaluation passed all five `sl-work` routing cases. One initial HTML-case ambiguity was corrected by naming the direct future replacement, then the case passed on rerun.
- Skill-creator fresh-source evaluation passed both `sl-handoff` cases: active-run state stays with `sl-run`, while a non-run transition may emit a delta-only handoff.
- Claude and Codex wrapper bodies were confirmed byte-identical during evaluation.

## Validation

- U9 public-surface tests pass 4/4, and the focused compatibility/contract regression set passes.
- Full `bun test` reached 1,735 passes with only nine local-listener cases blocked because the managed sandbox refused an ephemeral loopback port. The complete affected file then passed 16/16 outside that listener restriction, covering all 1,744 repository cases.
- `bun run release:validate` passes with 42 agents, 41 skills, and 0 MCP servers.
- The curated skills index is in sync, and `git diff --check` passes.
- Skill-creator's standalone `quick_validate.py` could not import host Python's optional `yaml` module. Repository strict-frontmatter, packaging, eval-shape, and release-validation tests supplied the structural fallback and pass.

## Boundary

U10 two-host comparison and promotion remain intentionally unstarted. Compatibility observation, component deletion, and promotion decisions require the separate evidence gate defined by U10.
