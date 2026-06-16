# Agent Instructions

This repository houses the `super-looper` Claude Code plugin and the Claude Code marketplace/catalog metadata used to distribute it. It also contains the release and metadata tooling that versions and validates the plugin and marketplace.

`AGENTS.md` is the canonical repo instruction file. Root `CLAUDE.md` exists only as a compatibility shim for tools that still look for it.

## Quick Start

```bash
bun install
bun test                  # full test suite
bun run release:validate  # check plugin/marketplace consistency
```

## Working Agreement

- **Branching:** Create a feature branch for any non-trivial change. If already on the correct branch for the task, keep using it; do not create additional branches or worktrees unless explicitly requested.
- **Merge policy:** All changes to `main` go through pull requests. Direct pushes and direct merges are not allowed; branch protection on `main` enforces this by requiring the `test` status check to pass. The direct path bypasses `release:validate`, the test suite, and PR title validation — past direct merges have caused version drift requiring multi-PR recovery (see `docs/solutions/workflow/release-please-version-drift-recovery.md`).
- **Safety:** Do not delete or overwrite user data. Avoid destructive commands.
- **Testing:** Run `bun test` after changes that affect the release tooling or the plugin-content contracts.
- **Release versioning:** Releases are prepared by release automation, not normal feature PRs. The repo has two release components (`super-looper`, `marketplace`). GitHub release PRs and GitHub Releases are the canonical release-notes surface for new releases; root `CHANGELOG.md` is only a pointer to that history. Use conventional titles such as `feat:` and `fix:` so release automation can classify change intent, but do not hand-bump release-owned versions or hand-author release notes in routine PRs.
- **Scratch Space:** Default to OS temp. Use `.context/` only when explicitly justified by the rules below.
  - **Default: OS temp** — covers most scratch, including per-run throwaway AND cross-invocation reusable, regardless of whether a repo is present or whether other skills may read the files. A stable OS-temp prefix handles cross-skill and cross-invocation coordination equally well as an in-repo path; repo-adjacency is rarely the relevant property.
    - **Per-run throwaway**: `mktemp -d -t <prefix>-XXXXXX` (OS handles cleanup). Use for files consumed once and discarded — captured screenshots, stitched GIFs, intermediate build outputs, recordings, delegation prompts/results, single-run checkpoints. The resulting path is opaque (on macOS it resolves under `$TMPDIR`/`/var/folders/...`) — that is appropriate for throwaway files users are not meant to access.
    - **Cross-invocation reusable**: stable path `/tmp/super-looper/<skill-name>/<run-id>/` — **not** `mktemp -d` — so later invocations of the same skill can discover sibling run-ids. Use `/tmp` directly rather than `$TMPDIR` so paths stay accessible: `$TMPDIR` on macOS resolves to `/var/folders/64/.../T/`, which is hostile for users who want to inspect checkpoints, grep them, or copy them out. The per-user isolation `$TMPDIR` provides is not valuable for cross-invocation reusable scratch where users are the intended audience. Use for caches keyed by session, checkpoints meant to survive context compaction within a loose session, or any state where later runs of the same skill need to locate prior outputs.
  - **Exception: `.context/`** — use only when the artifact is genuinely bound to the CWD repo AND meets at least one of:
    - (a) **User-curated**: the user is expected to inspect, manipulate, or manually curate the artifact outside the skill (e.g., a per-repo TODO database, a per-spec optimization log that survives across sessions on the same checkout).
    - (b) **Repo+branch-inseparable**: the artifact's meaning is inseparable from this specific repo or branch (e.g., branch-specific resume state that a user expects to pick up again in the same checkout).
    - (c) **Path is core UX**: surfacing the artifact path back to the user is a core part of the skill's output and that path is easier to communicate as a repo-relative location than an OS-temp one.
    Namespace under `.context/super-looper/<workflow-or-skill-name>/`, add a per-run subdirectory when concurrent runs are plausible, and decide cleanup behavior per the artifact's lifecycle (per-run scratch clears on success; user-curated state persists). "Shared between skills" is not by itself sufficient — OS temp handles that equally well.
  - **Durable outputs** (plans, specs, learnings, docs, final deliverables) belong in `docs/` or another repo-tracked location, not in either scratch tier.
  - **Cross-platform note:** `/tmp` is writable on macOS (symlink to `/private/tmp`), Linux, and WSL. `mktemp -d -t <prefix>-XXXXXX` also works on all three. Skills authored here assume Unix-like shells; native Windows is not a current target.
- **Character encoding:**
  - **Identifiers** (file names, agent names, command names): ASCII only -- tooling and regex patterns depend on it.
  - **Markdown tables:** Use pipe-delimited (`| col | col |`), never box-drawing characters.
  - **Prose and skill content:** Unicode is fine (emoji, punctuation, etc.). Prefer ASCII arrows (`->`, `<-`) over Unicode arrows in code blocks and terminal examples.

## Directory Layout

```
plugins/          The super-looper plugin
.claude-plugin/   Claude marketplace catalog metadata
src/release/      Release component, config, and metadata tooling
src/utils/        Shared helpers used by the release tooling
scripts/release/  Release preview / validate / sync entry points
tests/            Release-tooling and plugin-content contract tests + fixtures
docs/             Requirements, plans, solutions, and specs
CONCEPTS.md       Shared domain vocabulary (glossary of project-specific terms)
```

## Repo Surfaces

Changes in this repo may affect one or more of these surfaces:

- `super-looper` under `plugins/super-looper/`
- the Claude marketplace catalog under `.claude-plugin/`
- the release tooling in `src/release/`, `scripts/release/`, and `package.json`

Do not assume a repo change is "just release tooling" or "just plugin" without checking which surface owns the affected files.

## Plugin Maintenance

When changing `plugins/super-looper/` content:

- Update substantive docs like `plugins/super-looper/README.md` when the plugin behavior, inventory, or usage changes.
- Do not hand-bump release-owned versions in plugin or marketplace manifests.
- Do not hand-add release entries to `CHANGELOG.md` or treat it as the canonical source for new releases.
- Run `bun run release:validate` if agents, commands, skills, MCP servers, or release-owned descriptions/counts may have changed.

Useful validation commands:

```bash
bun run release:validate
cat .claude-plugin/marketplace.json | jq .
cat plugins/super-looper/.claude-plugin/plugin.json | jq .
```

## Validating Agent and Skill Changes

Behavioral changes to a plugin agent or skill (anything under `plugins/*/agents/` or `plugins/*/skills/`) need a different validation path than mechanical code changes, because of how Claude Code loads plugins.

- **Use the `skill-creator` skill to test changes.** Skill-creator is purpose-built for this: it spawns a generic subagent and injects the agent or skill content into the subagent's prompt at dispatch time, so each run reads the current source from disk. Invoke `/skill-creator` and use its eval workflow rather than reaching for ad-hoc workarounds.

- **Plugin agent and skill definitions both cache at session start.** Once a Claude Code session is open, dispatching a typed agent (e.g., `Agent({subagent_type: "super-looper:sl-session-historian"})`) runs the in-memory copy that was loaded when the session began. The same applies to skills: invoking a skill goes through the cached skill loader, so edits to skill scripts are also not tested via that path. File edits to either layer after session start do not propagate within the same session. Any iteration loop built around typed-agent dispatch or Skill-tool invocation in the same session is testing pre-edit content, not your changes.

- **Do NOT edit `~/.claude/plugins/cache/` or `~/.claude/plugins/marketplaces/` to try to force a reload.** Those paths are user machine state, not repo-managed. Modifying them does not reliably bypass the in-session cache, risks being silently overwritten by plugin updates, and is the wrong layer to test from. The skill-creator pattern is the proper approach; if you genuinely need fresh-loaded behavior of the typed-agent dispatch path, restart the Claude Code session — but skill-creator is preferred for fast iteration.

- **Mechanical changes do not have this restriction.** Skill scripts (e.g., `extract-metadata.py`), the release tooling, and anything `bun test` exercises always run the current source. The caching issue only affects LLM-driven agent or skill prose behavior dispatched through the plugin loader.

## Commit Conventions

- **Prefix is based on intent, not file type.** Use conventional prefixes (`feat:`, `fix:`, `docs:`, `refactor:`, etc.) but classify by what the change does, not the file extension. Files under `plugins/*/skills/`, `plugins/*/agents/`, and `.claude-plugin/` are product code even though they are Markdown or JSON. Reserve `docs:` for files whose sole purpose is documentation (`README.md`, `docs/`, `CHANGELOG.md`).
- **Type selection — classify by intent, not diff shape.** Where `fix:` and `feat:` could both seem to fit, default to `fix:`: a change that remedies broken or missing behavior is `fix:` even when implemented by adding code, and net additions do not turn a fix into a `feat:`. Reserve `feat:` for capabilities the user could not previously accomplish where nothing was broken. Other conventional types (`chore:`, `refactor:`, `docs:`, `perf:`, `test:`, `ci:`, `build:`, `style:`) remain primary when they describe the change more precisely than either. Heuristic: if a regression test you could write today would have failed *before* the change, it's `fix:`. The user may override this default for a specific change.
- **Include a component scope.** The scope appears verbatim in the changelog. Pick the narrowest useful label: skill/agent name (`document-review`, `learnings-researcher`), marketplace or release area (`marketplace`, `release`), or a shared area when cross-cutting (`review`, `research`). Never use `super-looper` — it's the entire plugin and tells the reader nothing. Omit scope only when no single label adds clarity.
- **Never use `!` or a `BREAKING CHANGE:` footer without explicit user confirmation.** These markers trigger release-please's automatic major version bump — a decision the user may not want even when a change is technically breaking. If a change appears breaking, surface that to the user and let them decide whether to apply the marker.

## Agent References in Skills

When referencing agents from within skill SKILL.md files (e.g., via the `Agent` or `Task` tool), use the bare `sl-<agent-name>` form. The `sl-` prefix identifies the agent as a super-looper component and is sufficient for uniqueness across plugins.

Example:
- `sl-learnings-researcher` (correct)
- `learnings-researcher` (wrong — the `sl-` prefix is required; it's what prevents collisions with agents from other plugins that might share a short name)

## File References in Skills

Each skill directory is a self-contained unit. A SKILL.md file must only reference files within its own directory tree (e.g., `references/`, `assets/`, `scripts/`) using relative paths from the skill root. Never reference files outside the skill directory — whether by relative traversal or absolute path.

Broken patterns:

- `../other-skill/references/schema.yaml` — relative traversal into a sibling skill
- `/home/user/plugins/super-looper/skills/other-skill/file.md` — absolute path to another skill
- `~/.claude/plugins/cache/marketplace/super-looper/1.0.0/skills/other-skill/file.md` — absolute path to an installed plugin location

Why this matters:

- **Runtime resolution:** Skills execute from the user's working directory, not the skill directory. Cross-directory paths and absolute paths will not resolve as expected.
- **Unpredictable install paths:** Plugins installed from the marketplace are cached at versioned paths. Absolute paths that worked in the source repo will not match the installed layout, and the version segment changes on every release.

If two skills need the same supporting file, duplicate it into each skill's directory. Prefer small, self-contained reference files over shared dependencies.

> **Note (March 2026):** This constraint reflects current Claude Code skill resolution behavior and known path-resolution bugs ([#11011](https://github.com/anthropics/claude-code/issues/11011), [#17741](https://github.com/anthropics/claude-code/issues/17741), [#12541](https://github.com/anthropics/claude-code/issues/12541)). If Anthropic introduces a shared-files mechanism or cross-skill imports in the future, this guidance should be revisited with supporting documentation.

## Bundled Script Paths in Skills

Whether a relative path resolves against the skill directory depends on *who* resolves it, so the two cases below must be handled differently. Do not assume a bare `scripts/…` path works in both.

**Read-time file references — resolve against the skill directory:** When skill *content* points the agent at a co-located file to read (e.g., "read `references/schema.yaml`"), use a relative path from the skill root. The skill loader resolves these against the skill's own directory — no variable prefix needed. This is the rule in *File References in Skills* above.

**Runtime script invocations via the Bash tool — resolve against the project CWD:** When skill content tells the agent to *execute* a bundled script through the Bash tool, a bare relative path does **not** work. The Bash tool's working directory is the user's project, not the skill directory, so `bash scripts/my-script.sh` resolves to `<project>/scripts/…`, finds nothing, and the step is silently skipped. This is a recurring bug class — see #764 (`sl-worktree`), #811 (`sl-code-review`), and #898 (`sl-compound`). Build the path from `${CLAUDE_SKILL_DIR}`:

```
bash "${CLAUDE_SKILL_DIR}/scripts/my-script.sh" ARG
```

`${CLAUDE_SKILL_DIR}` is substituted into SKILL.md content by Claude Code, covering both marketplace-cached installs and `claude --plugin-dir` local dev; it resolves to the skill's own directory. Note it is a SKILL.md *content* substitution, not an environment variable available inside the executed process — a script that needs its own directory should derive it from `BASH_SOURCE` rather than reading `$CLAUDE_SKILL_DIR` (see `sl-update/scripts/`).

**Permission caveat.** Claude Code's permission checker evaluates every subcommand of a compound command, and a bare `[ -f … ]` test is not pre-approved — so wrapping a pinned `bash "…sh"` call in an `if … then … fi` guard defeats a narrow `Bash(bash *…sh)` allow-rule and prompts on every run. Keep a pinned bundled-script call a single pinned command rather than guarding it inline.

## Repository Docs Convention

- **Requirements** live in `docs/brainstorms/` — requirements exploration and ideation.
- **Plans** live in `docs/plans/` — implementation plans and progress tracking.
- **Solutions** live in `docs/solutions/` — documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). Relevant when implementing or debugging in documented areas.
- **Specs** live in `docs/specs/` — the Claude Code plugin format spec (`claude-code.md`).

### Solution categories (`docs/solutions/`)

This repo builds a plugin *for* developers. Categorize solutions from the perspective of the end user (a developer using the plugin), not a contributor to this repo.

- **`developer-experience/`** — Issues with contributing to *this repo*: local dev setup, shell aliases, test ergonomics, CI friction. If the fix only matters to someone with a checkout of this repo, it belongs here.
- **`workflow/`**, **`skill-design/`** — Plugin skill and agent design patterns, workflow improvements.
