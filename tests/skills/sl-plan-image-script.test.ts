import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"

const SCRIPT = path.join(
  process.cwd(),
  "plugins",
  "super-looper",
  "skills",
  "sl-plan",
  "scripts",
  "generate-plan-images.py",
)

/**
 * The script's contract is "image failure never blocks the plan": every failure
 * mode degrades to a per-slot skip, exit 0, and a plan file left valid. These
 * tests run with OPENAI_API_KEY unset, so they never touch the network — which
 * is exactly the most important path to pin, since it is the one every user
 * without a key hits.
 */
async function run(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const env = { ...process.env }
  delete env.OPENAI_API_KEY
  const proc = Bun.spawn(["python3", SCRIPT, ...args], { stdout: "pipe", stderr: "pipe", env })
  const exitCode = await proc.exited
  return {
    exitCode,
    stdout: await new Response(proc.stdout).text(),
    stderr: await new Response(proc.stderr).text(),
  }
}

const EMPTY_SLOT = `<figure>
  <!-- image-slot:hero prompt="A wide diagram" -->
  <figcaption>Hero shot.</figcaption>
  <!-- /image-slot:hero -->
</figure>`

const FILLED_SLOT = `<figure>
  <!-- image-slot:design prompt="Two flows diverging" -->
  <img src="data:image/webp;base64,QUJD" alt="Design.">
  <figcaption>Design.</figcaption>
  <!-- /image-slot:design -->
</figure>`

let dir: string
let plan: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "sl-plan-images-"))
  plan = path.join(dir, "plan.html")
  await fs.writeFile(plan, `${EMPTY_SLOT}\n${FILLED_SLOT}\n`)
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe("generate-plan-images.py self-test", () => {
  test("the bundled offline parser checks pass", async () => {
    const { exitCode, stdout } = await run(["--self-test"])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("self-test ok")
  })
})

describe("generate-plan-images.py --edit", () => {
  test("refusing to edit an empty slot skips it rather than generating one", async () => {
    const { exitCode, stdout } = await run([plan, "--edit", "hero", "--instruction", "make it blue"])

    expect(exitCode).toBe(0)
    const report = JSON.parse(stdout)
    expect(report.edited).toEqual([])
    expect(report.filled).toEqual([])
    expect(report.skipped[0].slot).toBe("hero")
    expect(report.skipped[0].reason).toContain("empty")
    // An --edit that quietly fell back to generation would spend money the
    // caller did not ask to spend, on a prompt they did not pass.
    expect(await fs.readFile(plan, "utf8")).not.toContain("image-slot:hero -->\n  <img")
  })

  test("an absent API key degrades to a skip, exit 0, and an untouched plan", async () => {
    const before = await fs.readFile(plan, "utf8")
    const { exitCode, stdout } = await run([plan, "--edit", "design", "--instruction", "make it blue"])

    expect(exitCode).toBe(0)
    const report = JSON.parse(stdout)
    expect(report.edited).toEqual([])
    expect(report.skipped[0].slot).toBe("design")
    expect(report.skipped[0].reason).toContain("OPENAI_API_KEY")
    expect(report.skipped[0].reason).toContain("refine")
    expect(await fs.readFile(plan, "utf8")).toBe(before)
  })

  test("an unknown slot name warns instead of failing silently", async () => {
    const { exitCode, stdout } = await run([plan, "--edit", "nope", "--instruction", "x"])

    expect(exitCode).toBe(0)
    const report = JSON.parse(stdout)
    expect(report.warnings.join(" ")).toContain("nope")
    expect(report.edited).toEqual([])
  })

  test("the report carries an `edited` list alongside `filled`", async () => {
    const { stdout } = await run([plan, "--edit", "design", "--instruction", "x"])
    const report = JSON.parse(stdout)
    expect(report).toHaveProperty("slots_found")
    expect(report).toHaveProperty("filled")
    expect(report).toHaveProperty("edited")
    expect(report).toHaveProperty("skipped")
    expect(report).toHaveProperty("warnings")
  })
})

describe("generate-plan-images.py flag validation", () => {
  test("--edit without --instruction is a usage error", async () => {
    const { exitCode, stderr } = await run([plan, "--edit", "design"])
    expect(exitCode).toBe(2)
    expect(stderr).toContain("--instruction")
  })

  test("--instruction without --edit is a usage error", async () => {
    const { exitCode, stderr } = await run([plan, "--instruction", "x"])
    expect(exitCode).toBe(2)
    expect(stderr).toContain("only valid with --edit")
  })

  test("the three slot selectors are mutually exclusive", async () => {
    const { exitCode, stderr } = await run([plan, "--edit", "design", "--regenerate", "design", "--instruction", "x"])
    expect(exitCode).toBe(2)
    expect(stderr).toContain("mutually exclusive")
  })
})
