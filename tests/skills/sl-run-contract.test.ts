import { describe, expect, test } from "bun:test"
import path from "node:path"

const ROOT = path.join(process.cwd(), "plugins/super-looper/skills/sl-run")
const SKILL = await Bun.file(path.join(ROOT, "SKILL.md")).text()
const ENGINE = await Bun.file(path.join(ROOT, "references/state-engine.md")).text()
const WORKER = await Bun.file(path.join(ROOT, "references/worker-contract.md")).text()
const EVALS = JSON.parse(await Bun.file(path.join(ROOT, "evals/evals.json")).text())

describe("sl-run U5 coordinator contract", () => {
  test("keeps execution serial and context bounded", () => {
    expect(SKILL).toContain("Dispatch at most one implementation worker at a time")
    expect(SKILL).toContain("complete phase packet, and nothing broader")
    expect(SKILL).toContain("Do not send the full plan")
    expect(SKILL).not.toContain("parallel workers")
  })

  test("separates worker completion from independent phase verification", () => {
    expect(SKILL).toContain("A worker's completed result is not a phase pass")
    expect(SKILL).toContain("Run the phase's verification commands from the coordinator")
    expect(SKILL).toContain("verify-phase --status passed")
  })

  test("resumes without blind redispatch and stops on goal drift", () => {
    expect(SKILL).toContain("reconcile-in-progress-unit")
    expect(SKILL).toContain("do not redispatch it")
    expect(SKILL).toContain("exit `8` is terminal goal drift")
    expect(ENGINE).toContain("never repeats completed work")
  })

  test("keeps U6 and U7 behavior outside the U5 boundary", () => {
    expect(SKILL).toContain("Do not commit, push, create a pull request")
    expect(SKILL).toContain("Parallel or multi-worker phase teams")
    expect(SKILL).toContain("not available in this version")
  })

  test("defines a strict portable worker result", () => {
    for (const field of [
      "schema_version",
      "run_id",
      "phase_id",
      "unit_id",
      "status",
      "changed_files",
      "evidence",
      "verification",
      "risks",
      "unresolved",
    ]) {
      expect(WORKER).toContain(`"${field}"`)
    }
    expect(WORKER).toContain("inside `owned_scope`")
  })

  test("carries focused behavioral evals for the U5 safety cases", () => {
    expect(EVALS.evals.map((entry: any) => entry.name)).toEqual([
      "serial-two-phase-completion",
      "phase-boundary-resume",
      "mid-unit-interruption",
      "goal-drift-refusal",
      "worker-claim-is-not-phase-pass",
    ])
  })
})
