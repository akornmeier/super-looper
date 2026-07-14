import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const SCRIPT = path.join(import.meta.dir, "../scripts/core-loop/validate-contract.ts")
let work = ""

afterEach(() => {
  if (work) rmSync(work, { recursive: true, force: true })
  work = ""
})

async function run(args: string[]) {
  const proc = Bun.spawn(["bun", "run", SCRIPT, ...args], {
    cwd: path.join(import.meta.dir, ".."),
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { stdout, stderr, exitCode }
}

function writeFixture(value: unknown): string {
  work = mkdtempSync(path.join(tmpdir(), "core-loop-validator-"))
  const file = path.join(work, "fixture.json")
  writeFileSync(file, `${JSON.stringify(value)}\n`)
  return file
}

describe("core-loop contract validator", () => {
  test("returns 0 for a valid plan", async () => {
    const file = writeFixture({
      schema_version: 1,
      goal: "Validate the contract",
      requirements: [],
      phases: [
        {
          id: "phase-one",
          goal: "Establish validation",
          depends_on: [],
          work_units: [
            {
              id: "validator",
              scope: "Validate fixtures",
              files_or_area: ["scripts/core-loop"],
              acceptance: ["Valid input exits zero"],
              verification: ["Run validator tests"],
              depends_on: [],
              non_goals: [],
            },
          ],
          risks: [],
          completion_gate: ["Tests pass"],
        },
      ],
    })
    const result = await run(["plan", file])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("plan: valid")
  })

  test("returns 1 with field issues for an invalid contract", async () => {
    const file = writeFixture({ schema_version: 1, goal: "Missing phases", phases: [] })
    const result = await run(["plan", file])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("too_small")
  })

  test("returns 2 for usage and JSON errors", async () => {
    expect((await run([])).exitCode).toBe(2)
    const workdir = mkdtempSync(path.join(tmpdir(), "core-loop-validator-"))
    work = workdir
    const file = path.join(workdir, "invalid.json")
    writeFileSync(file, "not json\n")
    const result = await run(["plan", file])
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("Unable to read JSON contract file")
  })
})
