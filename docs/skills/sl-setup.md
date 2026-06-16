# `sl-setup`

> Diagnose your environment, install missing tools, and bootstrap project-local config — in one interactive flow.

`sl-setup` is the **onboarding** skill. It diagnoses what's installed, what's missing, what the plugin version is, what repo-local config exists, and offers guided installation for the missing pieces. Run it on first install, after upgrading the plugin, when troubleshooting why a skill claims a tool isn't available, or before onboarding a new repo to super-looper.

Beta-style explicit-invocation only (`disable-model-invocation: true`) — won't auto-fire.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Runs an environment diagnostic, presents missing tools/skills with install commands, bootstraps `.super-looper/config.local.yaml`, optionally adds a `.gitignore` entry |
| When to use it | First-time install, post-upgrade health check, "why does this skill say X isn't installed?", new repo onboarding |
| What it produces | Confirmed-installed report, or a guided install flow for missing tools, plus a bootstrapped local config |
| Status | Explicit-invocation only |

---

## The Problem

Super-looper relies on multiple external CLIs and per-repo config that's easy to skip:

- **Tool dependencies** — `agent-browser`, `gh`, `jq`, `vhs`, `silicon`, `ffmpeg`, `ast-grep` — each install command is different and not all are obvious
- **Skill dependencies** — some skills depend on other agent skills (e.g., `ast-grep` skill); knowing which ones are needed and where to install them is opaque
- **Plugin version drift** — old installed plugin behaving differently from current docs; without checking, the user files bug reports against fixed bugs
- **Per-repo config** — `.super-looper/config.local.yaml` for machine-local settings; without bootstrapping, skills like `sl-product-pulse` ask the same questions every run
- **Stale legacy config** — `super-looper.local.md` was the old format; lingering files cause confusion
- **Gitignore gotchas** — `.super-looper/config.local.yaml` should be gitignored (machine-local) but isn't always; the user accidentally commits secrets
- **Manual setup is tedious** — installing 7 tools one at a time with the right command for each is friction

## The Solution

`sl-setup` runs setup as a structured diagnostic-then-fix flow:

- **Phase 1: Diagnose** — runs `bash scripts/check-health` once; reports tool/skill installation status, plugin version, repo-local CE config state in one pass
- **Phase 2: Fix** (only when issues exist):
  - Resolve repo-local cleanup (delete obsolete `super-looper.local.md` if present)
  - Bootstrap `.super-looper/config.local.yaml` (offer to create from template, offer `.gitignore` entry)
  - Offer guided install for missing tools and skills (multiSelect, all pre-selected)
  - Run install commands one at a time, verifying each before continuing
- **Final summary** — report installed / skipped, and recommend `/sl-update` if Claude Code

---

## What Makes It Novel

### 1. Single diagnostic pass

The skill runs **one** check script that handles all CLI tools, agent skills, repo-local CE files, and `.gitignore` guidance. No manual per-tool checks, no repeated questioning. The output is a colored report ready to display to the user. If everything is installed, no repo-local cleanup needed, and the local config exists and is gitignored — the skill prints the success message and stops.

### 2. Repo-local config bootstrapping

`.super-looper/config.local.yaml` is where machine-local settings live (which tools to use, how workflows behave, pulse settings). The skill:

- Always refreshes `.super-looper/config.local.example.yaml` from the template (committed; a teammate-reference for available settings)
- Creates `.super-looper/config.local.yaml` once if missing (gitignored; the actual local settings, all commented out — opt in only what's needed)
- Offers to add `.super-looper/*.local.yaml` to `.gitignore` if not already covered

The split between example (committed) and local (gitignored) is the canonical pattern for machine-local config in a repo. Bootstrapping it means future skills don't have to.

### 3. Multi-select install with all pre-selected

When tools or skills are missing, the skill presents them as a multi-select with **all items pre-selected**. The user can deselect anything they don't want. Items are grouped under `Tools:` and `Skills:` so it's clear which runtime each targets. Already-installed items are omitted entirely.

### 4. Verify each install before continuing

After running each install command, the skill verifies the tool actually installed:

- For CLI tools: `command -v <tool>`
- For agent skills: `npx skills list --global --json | jq -r '.[].name' | grep -qx <skill-name>` if `npx` available, else check the `~/.claude/skills/<skill-name>` path

If verification succeeds, success is reported. If it fails, the project URL is displayed as fallback and the skill continues to the next dependency rather than blocking.

### 5. Legacy `super-looper.local.md` cleanup

The skill detects if the obsolete `super-looper.local.md` exists at the repo root. If so, it explains the file is obsolete (review-agent selection is now automatic, machine-local state moved to `.super-looper/config.local.yaml`) and asks whether to delete. The user controls the cleanup; the skill doesn't silently delete repo files.

### 6. Pre-resolved plugin root for Claude Code detection

The skill uses pre-resolution (`!` backtick at skill load) to capture `${CLAUDE_PLUGIN_ROOT}`. If it resolves to an absolute path, this is Claude Code and the skill recommends `/sl-update` for upgrades. If it doesn't resolve (empty, literal token, or non-Claude harness), `/sl-update` references are omitted. No guessing at platform.

### 7. Explicit-invocation only

`disable-model-invocation: true` prevents the skill from auto-firing on prose mentions of "setup" or installation discussion. Setup is a deliberate user choice — invoke `/sl-setup` directly.

---

## Quick Example

You just installed super-looper and want to verify everything's set up. You invoke `/sl-setup`.

The skill announces "Super Looper — checking your environment..." and runs `bash scripts/check-health --version 3.4.1`.

Diagnostic report:

```text
Tools:
  🟢 agent-browser  🟡 gh (not installed)  🟢 jq  🟡 vhs (not installed)
  🟢 silicon  🟢 ffmpeg  🟡 ast-grep (not installed)

Skills:
  🟡 ast-grep (not installed)

Config:
  ❌ .super-looper/config.local.yaml not found
```

The skill detects 3 missing tools, 1 missing skill, no local config. It walks through:

1. Bootstrap config: "Set up a local config file for this project? (y/n)" — you say yes. Copies template to `.super-looper/config.local.yaml`. Offers to add `.super-looper/*.local.yaml` to `.gitignore` — adds it.
2. Install missing tools: "Select which to install (all pre-selected): [x] gh, [x] vhs, [x] ast-grep, [x] ast-grep skill" — you keep all selected.
3. For each: shows the install command, asks for approval, runs, verifies. `gh` installs successfully via Homebrew. `vhs` succeeds. `ast-grep` succeeds. The `ast-grep` skill installs via `npx skills add ...`.

Final summary:

```text
✅ Super Looper setup complete

   Installed: gh, vhs, ast-grep (CLI), ast-grep (skill)
   Config:    ✅

   Run /sl-update to grab the latest plugin version.
   Run /sl-setup anytime to re-check.
```

---

## When to Reach For It

Reach for `sl-setup` when:

- You just installed super-looper for the first time
- You upgraded the plugin and want to confirm dependencies still match
- A skill complained "X is not installed" and you want to fix it
- You're onboarding a new repo and want to bootstrap `.super-looper/config.local.yaml`
- It's been a while since you checked and you want a health snapshot

Skip `sl-setup` when:

- You're not yet authenticated to package managers (it can't help with that)
- You only want to install one specific tool and know its command — direct install is faster

---

## Use as Part of the Workflow

`sl-setup` is mostly standalone — it doesn't sit inside the chain. It's a setup utility:

- Called when other skills surface "X is not installed" errors and the user runs `sl-setup` to fix
- Called periodically as a health check
- Called before onboarding a new repo or new machine

After running, the user typically continues to `/sl-update` (Claude Code only) for plugin version checks, or to whichever skill they originally tried to run.

---

## Use Standalone

Direct invocation:

- `/sl-setup`

The skill diagnoses, presents missing pieces with install commands, bootstraps config. No arguments, no flags — the diagnostic pass drives everything.

---

## Reference

| Phase | Step |
|-------|------|
| 1. Diagnose | Determine plugin version, run health check script, evaluate results |
| 2. Fix | Resolve repo-local issues (delete obsolete `super-looper.local.md`), bootstrap `.super-looper/config.local.yaml`, offer install for missing dependencies |
| Final | Summary report; recommend `/sl-update` if on Claude Code |

Required tools list (defaults; varies by repo): `agent-browser`, `gh`, `jq`, `vhs`, `silicon`, `ffmpeg`, `ast-grep`. Required skills: `ast-grep` (when present in repo's needs).

---

## FAQ

**What's `super-looper.local.md` and why is it being deleted?**
The old machine-local config format, replaced by `.super-looper/config.local.yaml`. The skill detects the obsolete file, explains, and asks before deleting. Review-agent selection is now automatic via `sl-code-review`; manual selection in `super-looper.local.md` no longer applies.

**Why is `.super-looper/config.local.yaml` gitignored?**
Because it carries machine-local settings (tool preferences, pulse configuration, etc.) that shouldn't pollute teammates' setups. The committed `.super-looper/config.local.example.yaml` shows what's available; each user opts in locally.

**What if a tool installs but the verification fails?**
The skill displays the project URL as fallback and continues to the next dependency. Failed verification doesn't block the rest of the install pass.

**Can I selectively skip tools I don't want?**
Yes. The multi-select pre-selects all missing items, but you can deselect anything before confirming. The skill installs only what's selected.

**Why is it explicit-invocation only?**
`disable-model-invocation: true` prevents auto-firing on prose mentions of "setup" or "install." Setup is a user-deliberate action — running it as a side-effect of asking about something else would be surprising.

---

## See Also

- [`/sl-update`](./sl-update.md) — check plugin version and recommend update command (Claude Code only)
- [`/sl-test-browser`](./sl-test-browser.md) — depends on `agent-browser`, which `sl-setup` installs
- [`/sl-demo-reel`](./sl-demo-reel.md) — depends on `vhs` / `silicon` / `ffmpeg`, all installed by `sl-setup`
- [`/sl-product-pulse`](./sl-product-pulse.md) — uses `.super-looper/config.local.yaml` that `sl-setup` bootstraps
