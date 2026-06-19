import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

/**
 * Bot-aware reviewer-quiescence gate in sl-resolve-pr-feedback Full-mode step 8.
 *
 * Automated reviewers (Copilot, CodeRabbit, Greptile) re-review asynchronously:
 * a fix push triggers a re-review that lands seconds-to-minutes later. The old
 * step 8 re-fetched threads immediately after pushing, saw "0 unresolved", and
 * exited before the bot's next round arrived -- forcing a re-run. The gate waits
 * for each *active* known bot to post a review tied to the pushed HEAD SHA
 * (`gh pr view --json reviews` -> `.reviews[].commit.oid == HEAD`) before
 * concluding, bounded by a per-wait timeout and a raised fix-round cap.
 *
 * These are script-structure / prose-contract assertions (read-and-regex), the
 * same idiom as resolve-pr-feedback-pagination.test.ts. Runtime poll behavior is
 * eval-validated (no live-network unit test), per the plan's execution note.
 */

const SKILL_DIR = path.join(
  process.cwd(),
  "plugins/super-looper/skills/sl-resolve-pr-feedback",
)

function read(relativePath: string): string {
  return readFileSync(path.join(SKILL_DIR, relativePath), "utf8")
}

// Slice [headingText, nextSiblingHeading) so a prose assertion is scoped to the
// section it claims to cover, not the whole file.
function section(body: string, heading: string): string {
  const start = body.indexOf(heading)
  if (start === -1) return ""
  const after = body.slice(start + heading.length)
  const nextHeading = after.search(/\n#{1,3} /)
  return nextHeading === -1 ? after : after.slice(0, nextHeading)
}

describe("wait-for-bot-review poll script (U1)", () => {
  const body = read("scripts/wait-for-bot-review")

  test("is an executable bash script with set -e", () => {
    expect(body.startsWith("#!/usr/bin/env bash")).toBe(true)
    expect(body).toMatch(/^set -e$/m)
  })

  test("declares the default bot-login list, commented as the extension point", () => {
    expect(body).toContain("copilot-pull-request-reviewer")
    expect(body).toContain("coderabbitai[bot]")
    expect(body).toContain("greptile-apps[bot]")
    expect(
      body,
      "the bot-login list must be commented as the extension point so adding a reviewer is a documented one-line edit (R6)",
    ).toMatch(/EXTENSION POINT/i)
  })

  test("compares a review's commit against the passed HEAD SHA (R2)", () => {
    expect(body).toMatch(/--json reviews\b/)
    expect(
      body,
      "must key on the per-review commit oid -- a bot has re-reviewed HEAD when it has a review with commit.oid == HEAD",
    ).toMatch(/\.commit\.oid/)
    expect(body).toMatch(/HEAD_SHA/)
  })

  test("bounds the wait by a timeout, not an unbounded loop (R4)", () => {
    expect(body, "a timeout constant must exist").toMatch(/TIMEOUT_SECONDS\s*=/)
    expect(
      body,
      "the loop must guard on elapsed wall-clock against the timeout",
    ).toMatch(/SECONDS - start/)
    expect(
      body,
      "no unbounded `while true` -- the wait must always terminate (the timeout is the loop guard, hanging is the worst failure)",
    ).not.toMatch(/while\s+true/)
  })

  test("waits only on bots active on the PR, not the full known list (R3)", () => {
    // active_bots = known_bots intersect reviewers-present-on-the-PR.
    expect(body).toMatch(/active_bots/)
    expect(
      body,
      "must intersect the known list against logins present in the reviews payload (set-difference intersection), so a known bot that never reviewed this PR is never waited on",
    ).toContain("$known_bots - ($known_bots - $present)")
  })
})
