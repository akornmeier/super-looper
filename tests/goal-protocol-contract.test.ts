import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

const LFG = "plugins/super-looper/skills/lfg/SKILL.md"

// U9 keeps the goal-change contract in the thin compatibility wrapper. The
// code-owned sl-run kernel remains the transition authority after routing.
describe("lfg compatibility goal-change protocol (U9)", () => {
  test("carries the never-edit goal-file contract", async () => {
    const lfg = await readRepoFile(LFG)

    // Core contract: autopilot never edits the goal files mid-run
    expect(lfg).toContain("Never edit `STRATEGY.md` or the active plan")

    // Goal changes route through the human-approved paths, not a mid-run edit
    expect(lfg).toContain("sl-strategy")
    expect(lfg).toContain("human-approved plan revision")

    // Names the enforcing mechanism so the prose stays coupled to the U4/U5 guard
    expect(lfg).toContain("goal-drift")
  })

  test("states the contract before routing", async () => {
    const lfg = await readRepoFile(LFG)

    const contractIdx = lfg.indexOf("Never edit `STRATEGY.md` or the active plan")
    const routeIdx = lfg.indexOf("## Route")

    expect(contractIdx).toBeGreaterThanOrEqual(0)
    expect(routeIdx).toBeGreaterThanOrEqual(0)
    expect(contractIdx).toBeLessThan(routeIdx)
  })
})
