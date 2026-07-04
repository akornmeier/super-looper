---
name: sl-test-browser
description: Run browser tests on pages affected by current PR or branch
argument-hint: "[PR number, branch name, 'current', or --port PORT]"
---

# Browser Test Skill

Run end-to-end browser tests on pages affected by a PR or branch changes using the `agent-browser` CLI.

## Use `agent-browser` Only For Browser Automation

This workflow uses the `agent-browser` CLI exclusively. Do not use any alternative browser automation system, browser MCP integration, or built-in browser-control tool. If the platform offers multiple ways to control a browser, always choose `agent-browser`.

Use `agent-browser` for: opening pages, clicking elements, filling forms, taking screenshots, and scraping rendered content.

Platform-specific hints:
- Do not use Chrome MCP tools (`mcp__claude-in-chrome__*`).

## Prerequisites

- Local development server running (e.g., `bin/dev`, `rails server`, `npm run dev`)
- `agent-browser` CLI installed (see Setup below)
- Git repository with changes to test

## Setup

Check whether `agent-browser` is installed:

```bash
command -v agent-browser >/dev/null 2>&1 && echo "Installed" || echo "NOT INSTALLED"
```

If not installed, inform the user: "`agent-browser` is not installed. Run `/sl-setup` to install required dependencies." Then stop — this skill cannot function without agent-browser.

## Workflow

### 1. Verify Installation

Before starting, verify `agent-browser` is available:

```bash
command -v agent-browser >/dev/null 2>&1 && echo "Ready" || echo "NOT INSTALLED"
```

If not installed, inform the user: "`agent-browser` is not installed. Run `/sl-setup` to install required dependencies." Then stop.

### 2. Ask Browser Mode

**Pipeline mode (`mode:pipeline`):** Skip this step entirely. Default to headless — no question, no blocking. Proceed directly to step 3.

**Manual mode:** Ask the user whether to run headed or headless using `AskUserQuestion` (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded). Fall back to presenting options in chat only if it is unavailable or the call errors. Never silently skip the question:

```
Do you want to watch the browser tests run?

1. Headed (watch) - Opens visible browser window so you can see tests run
2. Headless (faster) - Runs in background, faster but invisible
```

Store the choice and use the `--headed` flag when the user selects option 1.

### 3. Determine Test Scope

**If PR number provided:**
```bash
gh pr view [number] --json files -q '.files[].path'
```

**If 'current' or empty:**
```bash
git diff --name-only main...HEAD
```

**If branch name provided:**
```bash
git diff --name-only main...[branch]
```

### 4. Resolve Port and Start the Dev Server

Read `references/port-and-server.md` and follow it. It carries the port-priority resolution, the pipeline-only free-port scan, and the pipeline-only auto-start bash. Skipping it makes the agent assume port 3000 — which collides with other agents running in parallel in pipeline mode, or fails to boot a server that manual mode expects the user to own. Set `PIPELINE_MODE=1` in the shell when `mode:pipeline` is present.

### 5. Map Files to Routes and Test Each Page

Read `references/test-execution.md` and follow it: the file-pattern-to-route mapping, the per-page snapshot/verify/interact/screenshot recipe (headed and headless), human-verification prompts for OAuth/email/payment/SMS/external-API flows, failure handling, and the results-summary template. Without it the agent invents route mappings (missing affected pages) and an ad-hoc summary shape (inconsistent, unscannable reports). Pass the browser mode from step 2 through as the `--headed` flag where the recipe calls for it.

## agent-browser CLI Reference

The full command and flag reference lives in `references/agent-browser-cli.md`. Load it before issuing agent-browser commands — inventing subcommands or flags fails silently or errors mid-test.

## Quick Usage Examples

```bash
# Test current branch changes (auto-detects port)
/sl-test-browser

# Test specific PR
/sl-test-browser 847

# Test specific branch
/sl-test-browser feature/new-dashboard

# Test on a specific port
/sl-test-browser --port 5000
```
