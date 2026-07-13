import { describe, expect, test } from "bun:test"
import path from "node:path"

const ROOT = path.join(process.cwd(), "plugins/super-looper/skills/sl-plan")
const SKILL = await Bun.file(path.join(ROOT, "SKILL.md")).text()
const CONTRACT = await Bun.file(path.join(ROOT, "references/plan-contract.md")).text()
const EVALS = JSON.parse(await Bun.file(path.join(ROOT, "evals/evals.json")).text())

describe("sl-plan to workflow-kernel command boundary", () => {
  test("requires one argv-compatible command or an explicit inspection per item", () => {
    expect(SKILL).toContain("one argv-compatible verification command per list item")
    expect(SKILL).toContain("semantic evidence prefixed with `Inspect `")
    expect(CONTRACT).toContain("do not use pipes, redirects, `&&`, `;`, command substitution")
    expect(CONTRACT).toContain("Prefix non-command evidence with `Inspect `")
  })

  test("ships a behavioral eval for the kernel handoff", () => {
    const evalCase = EVALS.evals.find(
      (entry: any) => entry.name === "verification-is-kernel-compatible",
    )
    expect(evalCase).toBeDefined()
    expect(evalCase.expected_context).toHaveLength(3)
  })

  test("writes explicit safe workflow profile metadata", () => {
    expect(SKILL).toContain("Select one `workflow_profile` for frontmatter")
    expect(CONTRACT).toContain("workflow_profile: chore | bug | feature | hotfix")
    expect(CONTRACT).toContain("may reject a profile below mechanically observed risk")
    expect(EVALS.evals.find((entry: any) => entry.name === "workflow-profile-is-explicit-and-safe")).toBeDefined()
  })
})
