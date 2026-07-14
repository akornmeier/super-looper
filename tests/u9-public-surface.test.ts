import { describe, expect, test } from "bun:test"
import path from "node:path"

const root = process.cwd()

async function read(relativePath: string): Promise<string> {
  return Bun.file(path.join(root, relativePath)).text()
}

describe("U9 public workflow surface", () => {
  test("onboarding teaches three core commands and four profiles", async () => {
    const readme = await read("README.md")
    const start = readme.indexOf("## Three-command workflow")
    const end = readme.indexOf("## Install")
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    const onboarding = readme.slice(start, end)

    expect(onboarding).toContain("`/sl-strategy`")
    expect(onboarding).toContain("`/sl-plan`")
    expect(onboarding).toContain("`/sl-run`")
    for (const profile of ["chore", "bug", "feature", "hotfix"]) {
      expect(onboarding).toContain(`\`${profile}\``)
    }
    expect(onboarding).toContain("durable `review_ready`")
    expect(onboarding).toContain("Only approval authorizes")
  })

  test("lfg and sl-work are thin sl-run compatibility adapters", async () => {
    const lfg = await read("plugins/super-looper/skills/lfg/SKILL.md")
    const work = await read("plugins/super-looper/skills/sl-work/SKILL.md")

    expect(lfg.split("\n").length).toBeLessThan(80)
    expect(work.split("\n").length).toBeLessThan(80)
    expect(lfg).toContain("mode:unattended")
    expect(lfg).toContain("invoke `sl-run`")
    expect(work).toContain("mode:interactive")
    expect(work).toContain("invoke `sl-run`")
    expect(lfg).not.toContain("Invoke the `sl-work` skill")
    expect(work).not.toContain("Deterministic Section-to-Agent Mapping")
  })

  test("new run callers bypass sl-work, lfg, and sl-handoff", async () => {
    const brainstorm = await read(
      "plugins/super-looper/skills/sl-brainstorm/references/handoff.md",
    )
    const planHandoff = await read(
      "plugins/super-looper/skills/sl-plan/references/plan-handoff.md",
    )
    const handoff = await read("plugins/super-looper/skills/sl-handoff/SKILL.md")

    expect(brainstorm).toContain("invoke `sl-run`")
    expect(brainstorm).toContain("do not route through `sl-work`")
    expect(planHandoff).toContain("Do not create a `sl-handoff` document")
    expect(planHandoff).toContain("Invoke `sl-run`")
    expect(handoff).toContain("an active run needs no handoff")
    expect(handoff).toContain("/sl-run state:<absolute-path>")
  })

  test("active core entrypoints do not dispatch fixed reviewer personas", async () => {
    const active = await Promise.all([
      "plugins/super-looper/skills/sl-plan/SKILL.md",
      "plugins/super-looper/skills/sl-run/SKILL.md",
      "plugins/super-looper/skills/lfg/SKILL.md",
      "plugins/super-looper/skills/sl-work/SKILL.md",
    ].map(read))

    const fixedPersona = /sl-(?:correctness|security|performance|testing|maintainability|adversarial)-reviewer/
    for (const content of active) expect(content).not.toMatch(fixedPersona)
  })
})
