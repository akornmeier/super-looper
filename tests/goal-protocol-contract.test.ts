import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

const LFG = "plugins/super-looper/skills/lfg/SKILL.md"

// R5 pins the goal-change contract in the lfg pipeline prose so an autopilot run
// cannot silently edit its own goal. AGENTS.md and CONCEPTS.md carry the same
// contract as editorial content, verified in review rather than grepped (per the
// U6 plan's test scenarios). These assertions grep distinctive, stable phrases —
// not whole sentences — so surgical rewording does not break the pin.
describe("lfg goal-change protocol (U6 / R5)", () => {
  test("carries the never-edit goal-file contract", async () => {
    const lfg = await readRepoFile(LFG)

    // Core contract: autopilot never edits the goal files mid-run
    expect(lfg).toContain("never edits `STRATEGY.md` or the active plan")

    // Goal changes route through the human-approved paths, not a mid-run edit
    expect(lfg).toContain("sl-strategy")
    expect(lfg).toContain("human-approved plan revision")

    // Names the enforcing mechanism so the prose stays coupled to the U4/U5 guard
    expect(lfg).toContain("goal-drift")
  })

  test("states the contract as a top ordering rule, ahead of step 1", async () => {
    const lfg = await readRepoFile(LFG)

    const contractIdx = lfg.indexOf("never edits `STRATEGY.md` or the active plan")
    const step1Idx = lfg.indexOf("1. **Produce or accept the plan.**")

    expect(contractIdx).toBeGreaterThanOrEqual(0)
    expect(step1Idx).toBeGreaterThanOrEqual(0)
    // The contract binds the whole pipeline, so it precedes the first numbered step
    expect(contractIdx).toBeLessThan(step1Idx)
  })
})
