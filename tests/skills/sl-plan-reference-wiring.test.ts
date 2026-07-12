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

async function run(
  args: string[],
  cwd?: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["python3", SCRIPT, ...args], { stdout: "pipe", stderr: "pipe", cwd })
  // Drain both pipes before awaiting exit: the script writes a line per wired
  // ref, and an unread pipe can fill and deadlock the subprocess.
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { exitCode: await proc.exited, stdout, stderr }
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

  test("an absolute back ref is refused, not written to", async () => {
    const outside = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "sl-plan-outside-")), "outside.html")
    await fs.writeFile(outside, plan("Outside", "none", "none"))
    await fs.writeFile(planPath("b.html"), plan("Downstream", outside, "none"))

    const { exitCode, stdout } = await run([planPath("b.html")], repo)

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout).wired).toEqual([])
    expect(JSON.parse(stdout).skipped[0].reason).toContain("repo-relative")
    // The file outside the repo is untouched — this writer only ever writes inside it.
    expect(field(await fs.readFile(outside, "utf8"), "forward refs")).toBe("none")
    await fs.rm(path.dirname(outside), { recursive: true, force: true })
  })

  test("a back ref that escapes the repo root with ../ is refused, not written to", async () => {
    const outside = path.join(repo, "..", `escape-${path.basename(repo)}.html`)
    await fs.writeFile(outside, plan("Outside", "none", "none"))
    // Repo-relative in form, but it climbs out of the repo root once resolved.
    await fs.writeFile(
      planPath("b.html"),
      plan("Downstream", `docs/plans/../../../${path.basename(outside)}`, "none"),
    )

    const { exitCode, stdout } = await run([planPath("b.html")], repo)

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout).wired).toEqual([])
    expect(JSON.parse(stdout).skipped[0].reason).toContain("repo-relative")
    expect(field(await fs.readFile(outside, "utf8"), "forward refs")).toBe("none")
    await fs.rm(outside, { force: true })
  })

  test("a plan with no back refs wires nothing", async () => {
    await fs.writeFile(planPath("b.html"), plan("Standalone", "none", "none"))

    const { exitCode, stdout } = await run([planPath("b.html")], repo)

    expect(exitCode).toBe(0)
    const report = JSON.parse(stdout)
    expect(report.back_refs).toEqual([])
    expect(report.wired).toEqual([])
  })

  test("no repo root is a warned no-op, not a wire against the plan's own directory", async () => {
    const bare = await fs.mkdtemp(path.join(os.tmpdir(), "sl-plan-norepo-"))
    try {
      const target = path.join(bare, "a.html")
      const source = path.join(bare, "b.html")
      await fs.writeFile(target, plan("Upstream", "none", "none"))
      await fs.writeFile(source, plan("Downstream", "docs/plans/a.html", "none"))
      const before = await fs.readFile(target, "utf8")

      const { exitCode, stdout } = await run([source], bare)

      expect(exitCode).toBe(0)
      const report = JSON.parse(stdout)
      expect(report.wired).toEqual([])
      expect(report.skipped).toHaveLength(1)
      expect(report.warnings.join(" ")).toContain("no git repo root")
      expect(await fs.readFile(target, "utf8")).toBe(before)
    } finally {
      await fs.rm(bare, { recursive: true, force: true })
    }
  })
})
