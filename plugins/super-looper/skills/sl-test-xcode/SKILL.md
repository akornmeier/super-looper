---
name: sl-test-xcode
description: "Build and test iOS apps on simulator using XcodeBuildMCP. Use after making iOS code changes, before creating a PR, or when verifying app behavior and checking for crashes on simulator."
argument-hint: "[scheme name or 'current' to use default]"
disable-model-invocation: true
---

# Xcode Test Skill

Build, install, and test iOS apps on the simulator using XcodeBuildMCP. Captures screenshots, logs, and verifies app behavior.

## Prerequisites

- Xcode installed with command-line tools
- XcodeBuildMCP MCP server connected
- Valid Xcode project or workspace
- At least one iOS Simulator available

## Workflow

### 0. Verify XcodeBuildMCP is Available

Check that the XcodeBuildMCP MCP server is connected by calling its `list_simulators` tool (`mcp__xcodebuildmcp__list_simulators`).

If the tool is not found or errors, inform the user they need to add the XcodeBuildMCP MCP server:

```
XcodeBuildMCP not installed

Install via Homebrew:
  brew tap getsentry/xcodebuildmcp && brew install xcodebuildmcp

Or via npx (no global install needed):
  npx -y xcodebuildmcp@latest mcp

Then add "XcodeBuildMCP" as an MCP server in your agent configuration
and restart your agent.
```

Do NOT proceed until XcodeBuildMCP is confirmed working.

### 1. Discover Project and Scheme

Call XcodeBuildMCP's `discover_projs` tool to find available projects, then `list_schemes` with the project path to get available schemes.

If an argument was provided, use that scheme name. If "current", use the default/last-used scheme.

### 2. Boot Simulator

Call `list_simulators` to find available simulators. Boot the preferred simulator (iPhone 15 Pro recommended) using `boot_simulator` with the simulator's UUID.

Wait for the simulator to be ready before proceeding.

### 3. Build the App

Call `build_ios_sim_app` with the project path and scheme name.

**On failure:**
- Capture build errors
- Report to user with specific error details

**On success:**
- Note the built app path for installation
- Proceed to step 4

### 4. Install and Launch

1. Call `install_app_on_simulator` with the built app path and simulator UUID
2. Call `launch_app_on_simulator` with the bundle ID and simulator UUID
3. Call `capture_sim_logs` with the simulator UUID and bundle ID to start log capture

### 5-9. Test, Verify, Report, Clean Up

Once the app is running with logs capturing, read `references/test-workflow.md` and follow steps 5-9: per-screen screenshot + log review, human-verification prompts for device-only flows, failure handling, the test-summary template, and cleanup. Loading it is required — it carries the SwiftUI `Text`-link automation limitation (simulated taps silently no-op, so a screen looks passing when the link never fired) and the exact summary shape; improvising these misreports link-driven flows and produces an inconsistent results table.

## Quick Usage Examples

```bash
# Test with default scheme
/sl-test-xcode

# Test specific scheme
/sl-test-xcode MyApp-Debug

# Test after making changes
/sl-test-xcode current
```

## Integration with sl-code-review

When reviewing PRs that touch iOS code, the `sl-code-review` workflow can spawn an agent to run this skill, build on the simulator, test key screens, and check for crashes.
