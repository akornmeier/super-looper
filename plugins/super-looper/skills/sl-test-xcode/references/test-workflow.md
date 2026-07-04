# Xcode Test Workflow (Steps 5-9)

Per-screen testing, human verification, failure handling, summary, and cleanup. Load after the app is built, installed, launched, and log capture is running (Steps 1-4 in SKILL.md).

## 5. Test Key Screens

For each key screen in the app:

**Take screenshot:**
Call `take_screenshot` with the simulator UUID and a descriptive filename (e.g., `screen-home.png`).

**Review screenshot for:**
- UI elements rendered correctly
- No error messages visible
- Expected content displayed
- Layout looks correct

**Check logs for errors:**
Call `get_sim_logs` with the simulator UUID. Look for:
- Crashes
- Exceptions
- Error-level log messages
- Failed network requests

**Known automation limitation — SwiftUI Text links:**
Simulated taps (via XcodeBuildMCP or any simulator automation tool) do not trigger gesture recognizers on SwiftUI `Text` views with inline `AttributedString` links. Taps report success but have no effect. This is a platform limitation — inline links are not exposed as separate elements in the accessibility tree. When a tap on a Text link has no visible effect, prompt the user to tap manually in the simulator. If the target URL is known, `xcrun simctl openurl <device> <URL>` can open it directly as a fallback.

## 6. Human Verification (When Required)

Pause for human input when testing touches flows that require device interaction.

| Flow Type | What to Ask |
|-----------|-------------|
| Sign in with Apple | "Please complete Sign in with Apple on the simulator" |
| Push notifications | "Send a test push and confirm it appears" |
| In-app purchases | "Complete a sandbox purchase" |
| Camera/Photos | "Grant permissions and verify camera works" |
| Location | "Allow location access and verify map updates" |
| SwiftUI Text links | "Please tap on [element description] manually — automated taps cannot trigger inline text links" |

Ask the user using `AskUserQuestion` (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded). Fall back to numbered options in chat only if it is unavailable or the call errors. Never silently skip the question:

```
Human Verification Needed

This test requires [flow type]. Please:
1. [Action to take on simulator]
2. [What to verify]

Did it work correctly?
1. Yes - continue testing
2. No - describe the issue
```

## 7. Handle Failures

When a test fails:

1. **Document the failure:**
   - Take screenshot of error state
   - Capture console logs
   - Note reproduction steps

2. **Ask the user how to proceed:**

   ```
   Test Failed: [screen/feature]

   Issue: [description]
   Logs: [relevant error messages]

   How to proceed?
   1. Fix now - debug, propose a fix, rebuild and retest
   2. Skip - continue testing other screens
   ```

3. **If "Fix now":** investigate, propose a fix, rebuild and retest
4. **If "Skip":** log as skipped, continue

## 8. Test Summary

After all tests complete, present a summary:

```markdown
## Xcode Test Results

**Project:** [project name]
**Scheme:** [scheme name]
**Simulator:** [simulator name]

### Build: Success / Failed

### Screens Tested: [count]

| Screen | Status | Notes |
|--------|--------|-------|
| Launch | Pass | |
| Home | Pass | |
| Settings | Fail | Crash on tap |
| Profile | Skip | Requires login |

### Console Errors: [count]
- [List any errors found]

### Human Verifications: [count]
- Sign in with Apple: Confirmed
- Push notifications: Confirmed

### Failures: [count]
- Settings screen - crash on navigation

### Result: [PASS / FAIL / PARTIAL]
```

## 9. Cleanup

After testing:

1. Call `stop_log_capture` with the simulator UUID
2. Optionally call `shutdown_simulator` with the simulator UUID
