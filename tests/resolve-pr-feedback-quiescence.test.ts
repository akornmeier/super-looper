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

// Slice [headingText, nextLevel-2Heading) so a prose assertion is scoped to the
// section it claims to cover. Stops at the next `## ` so a sliced section keeps
// its own `###` subsections (e.g. step 8's quiescence-gate subheadings).
function section(body: string, heading: string): string {
  const start = body.indexOf(heading)
  if (start === -1) return ""
  const after = body.slice(start + heading.length)
  const nextHeading = after.search(/\n## /)
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

describe("full-mode.md step 8 quiescence gate (U2)", () => {
  const body = read("references/full-mode.md")
  const step8 = section(body, "## 8. Verify")

  test("step 8 region is non-empty (slice sanity)", () => {
    expect(step8.length).toBeGreaterThan(0)
  })

  test("invokes wait-for-bot-review before re-fetching threads (R1/R2)", () => {
    const gateAt = step8.indexOf("wait-for-bot-review")
    const refetchAt = step8.indexOf("get-pr-comments")
    expect(gateAt, "step 8 must invoke wait-for-bot-review").toBeGreaterThan(-1)
    expect(refetchAt, "step 8 must still re-fetch via get-pr-comments").toBeGreaterThan(-1)
    expect(
      gateAt,
      "the quiescence wait must run BEFORE the re-fetch -- waiting after re-fetching defeats the gate",
    ).toBeLessThan(refetchAt)
  })

  test("invokes the bundled script via ${CLAUDE_SKILL_DIR}, not a bare relative path", () => {
    expect(step8).toContain('"${CLAUDE_SKILL_DIR}/scripts/wait-for-bot-review"')
    expect(
      step8,
      "the Bash CWD is the project root, not the skill dir -- a bare `bash scripts/...` path silently resolves to <project>/scripts and the wait is skipped (the #764/#811/#898 bug class)",
    ).not.toContain("bash scripts/wait-for-bot-review")
  })

  test("states the bot-only / human-never rule (R3)", () => {
    expect(step8).toMatch(/automated reviewer/i)
    expect(
      step8,
      "must state the wait never targets human reviewers -- human threads are handled in the round they appear",
    ).toMatch(/never wait[s]? on human/i)
  })

  test("states both bounds: proceed-on-timeout and the raised cap of 3 (R4)", () => {
    expect(step8, "per-wait timeout must be stated").toMatch(/timeout/i)
    expect(step8, "the gate must proceed on timeout rather than hang").toMatch(/proceed/i)
    expect(step8).toContain("Max fix-round cap of 3")
    expect(step8).toContain("After the third fix-verify cycle")
    expect(
      step8,
      "the old 2-cycle cap wording must be replaced by the raised 3-round cap",
    ).not.toContain("After the second fix-verify cycle")
  })

  test("documents the settle-window fallback C for non-SHA reviewers (R5)", () => {
    expect(step8).toMatch(/settle-window/i)
    expect(step8).toMatch(/fallback/i)
  })

  test("skips the wait on reply-only rounds with no push (R7)", () => {
    expect(step8).toMatch(/only when this round pushed a fix/i)
    expect(step8).toMatch(/skips? the wait/i)
  })
})

describe("script surfacing and targeted-mode exclusion (U3)", () => {
  test("SKILL.md ## Scripts list includes wait-for-bot-review", () => {
    const scripts = section(read("SKILL.md"), "## Scripts")
    expect(scripts.length).toBeGreaterThan(0)
    expect(
      scripts,
      "the new script must be discoverable in the SKILL.md Scripts list",
    ).toContain("wait-for-bot-review")
  })

  test("targeted-mode.md scopes the quiescence gate out of targeted resolution (R8)", () => {
    const targeted = read("references/targeted-mode.md")
    expect(targeted).toMatch(/quiescence/i)
    expect(
      targeted,
      "targeted mode must state the gate is Full-mode-only and does not wait for a full re-review",
    ).toMatch(/Full[- ]mode/i)
    expect(targeted).toMatch(/does not apply|does not wait|not apply/i)
  })
})
