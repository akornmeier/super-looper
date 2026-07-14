import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILL_BODY = readFileSync(
  path.join(process.cwd(), "plugins/super-looper/skills/sl-plan/SKILL.md"),
  "utf8",
)

describe("sl-plan lean handoff", () => {
  test("reports a plan without launching the next workflow", () => {
    expect(SKILL_BODY).toMatch(/Report the plan path/i)
    expect(SKILL_BODY).toContain("Do not launch execution")
    expect(SKILL_BODY).toContain("unless the user explicitly asks")
  })

  test("prefers sl-run and preserves sl-work during the compatibility window", () => {
    expect(SKILL_BODY).toContain("`sl-run plan:<repo-relative-path>`")
    expect(SKILL_BODY).toContain("compatibility window")
    expect(SKILL_BODY).toContain("`sl-work <repo-relative-path>`")
  })

  test("removes the mandatory multi-option handoff ceremony", () => {
    expect(SKILL_BODY).not.toContain("Start the work loop (`lfg`)")
    expect(SKILL_BODY).not.toContain("Open in Proof")
    expect(SKILL_BODY).not.toContain("Create Issue")
    expect(SKILL_BODY).not.toContain("`references/plan-handoff.md`")
  })

  test("returns directly to unattended callers", () => {
    expect(SKILL_BODY).toMatch(/In headless or pipeline mode, return control immediately/i)
  })
})
