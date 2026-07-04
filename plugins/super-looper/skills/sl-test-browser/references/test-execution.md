# Test Execution: Route Mapping, Per-Page Testing, Verification, Reporting

Loaded once the dev server is confirmed listening. Carries the file-to-route mapping, the per-page test recipe, the human-verification triggers, failure handling, and the results-summary shape. These are not improvisable: guessing route mappings misses affected pages, and an ad-hoc summary produces inconsistent, unscannable reports.

## Map Files to Routes

Map changed files to testable routes:

| File Pattern | Route(s) |
|-------------|----------|
| `app/views/users/*` | `/users`, `/users/:id`, `/users/new` |
| `app/controllers/settings_controller.rb` | `/settings` |
| `app/javascript/controllers/*_controller.js` | Pages using that Stimulus controller |
| `app/components/*_component.rb` | Pages rendering that component |
| `app/views/layouts/*` | All pages (test homepage at minimum) |
| `app/assets/stylesheets/*` | Visual regression on key pages |
| `app/helpers/*_helper.rb` | Pages using that helper |
| `src/app/*` (Next.js) | Corresponding routes |
| `src/components/*` | Pages using those components |

Build a list of URLs to test based on the mapping.

## Test Each Affected Page

For each affected route:

**Navigate and capture snapshot:**
```bash
agent-browser open "http://localhost:${PORT}/[route]"
agent-browser snapshot -i
```

**For headed mode:**
```bash
agent-browser --headed open "http://localhost:${PORT}/[route]"
agent-browser --headed snapshot -i
```

**Verify key elements:**
- Use `agent-browser snapshot -i` to get interactive elements with refs
- Page title/heading present
- Primary content rendered
- No error messages visible
- Forms have expected fields

**Test critical interactions:**
```bash
agent-browser click @e1
agent-browser snapshot -i
```

**Take screenshots:**
```bash
agent-browser screenshot page-name.png
agent-browser screenshot --full page-name-full.png
```

## Human Verification (When Required)

Pause for human input when testing touches flows that require external interaction:

| Flow Type | What to Ask |
|-----------|-------------|
| OAuth | "Please sign in with [provider] and confirm it works" |
| Email | "Check your inbox for the test email and confirm receipt" |
| Payments | "Complete a test purchase in sandbox mode" |
| SMS | "Verify you received the SMS code" |
| External APIs | "Confirm the [service] integration is working" |

Ask the user (using the platform's question tool, or present numbered options and wait):

```
Human Verification Needed

This test touches [flow type]. Please:
1. [Action to take]
2. [What to verify]

Did it work correctly?
1. Yes - continue testing
2. No - describe the issue
```

## Handle Failures

When a test fails:

1. **Document the failure:**
   - Screenshot the error state: `agent-browser screenshot error.png`
   - Note the exact reproduction steps

2. **Ask the user how to proceed:**

   ```
   Test Failed: [route]

   Issue: [description]
   Console errors: [if any]

   How to proceed?
   1. Fix now - debug and fix the failing test
   2. Skip - continue testing other pages
   ```

3. **If "Fix now":** investigate, propose a fix, apply, re-run the failing test
4. **If "Skip":** log as skipped, continue

## Test Summary

After all tests complete, present a summary:

```markdown
## Browser Test Results

**Test Scope:** PR #[number] / [branch name]
**Server:** http://localhost:${PORT}

### Pages Tested: [count]

| Route | Status | Notes |
|-------|--------|-------|
| `/users` | Pass | |
| `/settings` | Pass | |
| `/dashboard` | Fail | Console error: [msg] |
| `/checkout` | Skip | Requires payment credentials |

### Console Errors: [count]
- [List any errors found]

### Human Verifications: [count]
- OAuth flow: Confirmed
- Email delivery: Confirmed

### Failures: [count]
- `/dashboard` - [issue description]

### Result: [PASS / FAIL / PARTIAL]
```
