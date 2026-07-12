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
  "wire-plan-references.py",
)

async function run(args: string[], cwd?: string): Promise<{ exitCode: number; stdout: string }> {
  const proc = Bun.spawn(["python3", SCRIPT, ...args], { stdout: "pipe", stderr: "pipe", cwd })
  const exitCode = await proc.exited
  return { exitCode, stdout: await new Response(proc.stdout).text() }
}

function plan(title: string, backRefs: string, forwardRefs: string): string {
  return [
    "<dl>",
    `  <dt>title</dt>        <dd>${title}</dd>`,
    `  <dt>back refs</dt>    <dd>${backRefs}</dd>`,
    `  <dt>forward refs</dt> <dd>${forwardRefs}</dd>`,
    "</dl>",
    "",
  ].join("\n")
}

const field = (content: string, name: string) =>
  content.match(new RegExp(`<dt>${name}</dt>\\s*<dd>(.*?)</dd>`))?.[1] ?? null

let repo: string
const planPath = (name: string) => path.join(repo, "docs", "plans", name)

beforeEach(async () => {
  repo = await fs.mkdtemp(path.join(os.tmpdir(), "sl-plan-refs-"))
  await fs.mkdir(path.join(repo, "docs", "plans"), { recursive: true })
  await fs.mkdir(path.join(repo, "docs", "brainstorms"), { recursive: true })
  Bun.spawnSync(["git", "init", "-q"], { cwd: repo })
})

afterEach(async () => {
  await fs.rm(repo, { recursive: true, force: true })
})

describe("wire-plan-references.py self-test", () => {
  test("the bundled offline parser checks pass", async () => {
    const { exitCode, stdout } = await run(["--self-test"])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("self-test ok")
  })
})

describe("wire-plan-references.py", () => {
  test("a back ref becomes a reciprocal forward ref on the upstream plan", async () => {
    await fs.writeFile(planPath("a.html"), plan("Upstream", "none", "none"))
    await fs.writeFile(planPath("b.html"), plan("Downstream", "docs/plans/a.html", "none"))

    const { exitCode, stdout } = await run([planPath("b.html")], repo)

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout).wired).toEqual(["docs/plans/a.html"])
    // The first append replaces the `none` literal rather than sitting beside it.
    expect(field(await fs.readFile(planPath("a.html"), "utf8"), "forward refs")).toBe("docs/plans/b.html")
  })

  test("re-running is a byte-for-byte no-op", async () => {
    await fs.writeFile(planPath("a.html"), plan("Upstream", "none", "none"))
    await fs.writeFile(planPath("b.html"), plan("Downstream", "docs/plans/a.html", "none"))

    await run([planPath("b.html")], repo)
    const afterFirst = await fs.readFile(planPath("a.html"), "utf8")
    const { stdout } = await run([planPath("b.html")], repo)

    // Idempotence is what makes it safe for a resume or a second sl-plan pass
    // to re-enter this step without duplicating references.
    expect(JSON.parse(stdout).wired).toEqual([])
    expect(JSON.parse(stdout).skipped[0].reason).toContain("already lists")
    expect(await fs.readFile(planPath("a.html"), "utf8")).toBe(afterFirst)
  })

  test("appending preserves existing forward refs and their order", async () => {
    await fs.writeFile(planPath("a.html"), plan("Upstream", "none", "docs/plans/old.html"))
    await fs.writeFile(planPath("b.html"), plan("Downstream", "docs/plans/a.html", "none"))

    await run([planPath("b.html")], repo)

    expect(field(await fs.readFile(planPath("a.html"), "utf8"), "forward refs")).toBe(
      "docs/plans/old.html, docs/plans/b.html",
    )
  })

  test("no field other than forward refs is touched, and the source plan is never modified", async () => {
    await fs.writeFile(planPath("a.html"), plan("Upstream", "docs/plans/z.html", "none"))
    const sourceBefore = plan("Downstream", "docs/plans/a.html", "none")
    await fs.writeFile(planPath("b.html"), sourceBefore)

    await run([planPath("b.html")], repo)
    const target = await fs.readFile(planPath("a.html"), "utf8")

    expect(field(target, "back refs")).toBe("docs/plans/z.html")
    expect(field(target, "title")).toBe("Upstream")
    expect(await fs.readFile(planPath("b.html"), "utf8")).toBe(sourceBefore)
  })

  test("a markdown target is skipped, not given a forward refs field it does not define", async () => {
    const brainstorm = path.join(repo, "docs", "brainstorms", "x.md")
    await fs.writeFile(brainstorm, "# Brainstorm\n")
    await fs.writeFile(planPath("b.html"), plan("Downstream", "docs/brainstorms/x.md", "none"))

    const { stdout } = await run([planPath("b.html")], repo)

    expect(JSON.parse(stdout).wired).toEqual([])
    expect(JSON.parse(stdout).skipped[0].reason).toContain("not an HTML plan")
    expect(await fs.readFile(brainstorm, "utf8")).toBe("# Brainstorm\n")
  })

  test("a missing target is a skip, not a failure", async () => {
    await fs.writeFile(planPath("b.html"), plan("Downstream", "docs/plans/ghost.html", "none"))

    const { exitCode, stdout } = await run([planPath("b.html")], repo)

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout).skipped[0].reason).toContain("does not exist")
  })

  test("--dry-run reports what it would wire and writes nothing", async () => {
    await fs.writeFile(planPath("a.html"), plan("Upstream", "none", "none"))
    await fs.writeFile(planPath("b.html"), plan("Downstream", "docs/plans/a.html", "none"))
    const before = await fs.readFile(planPath("a.html"), "utf8")

    const { stdout } = await run([planPath("b.html"), "--dry-run"], repo)

    expect(JSON.parse(stdout).wired).toEqual(["docs/plans/a.html"])
    expect(JSON.parse(stdout).dry_run).toBe(true)
    expect(await fs.readFile(planPath("a.html"), "utf8")).toBe(before)
  })

  test("a plan with no back refs wires nothing", async () => {
    await fs.writeFile(planPath("b.html"), plan("Standalone", "none", "none"))

    const { exitCode, stdout } = await run([planPath("b.html")], repo)

    expect(exitCode).toBe(0)
    const report = JSON.parse(stdout)
    expect(report.back_refs).toEqual([])
    expect(report.wired).toEqual([])
  })
})
