import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { emitSkillsIndex, renderSkillsIndex } from "../src/docs/emit-skills-index"

const REPO_ROOT = path.join(__dirname, "..")
const CLI = path.join(REPO_ROOT, "scripts/docs/emit-skills-index.ts")
const SKILLS_DIR = path.join(REPO_ROOT, "plugins/super-looper/skills")
const DOCS_DIR = path.join(REPO_ROOT, "docs/skills")
const INDEX = path.join(DOCS_DIR, "README.md")

function skillNames(): string[] {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(path.join(SKILLS_DIR, entry.name, "SKILL.md")),
    )
    .map((entry) => entry.name)
    .sort()
}

function runCli(
  args: string[],
  cwd: string,
): { code: number; stdout: string; stderr: string } {
  const result = spawnSync("bun", [CLI, ...args], { cwd, encoding: "utf8" })
  return {
    code: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

describe("docs/skills coverage", () => {
  test("every skill directory has a curated docs page", () => {
    const missing = skillNames().filter(
      (name) => !existsSync(path.join(DOCS_DIR, `${name}.md`)),
    )
    // Failure names the skill(s) missing a page.
    expect(missing).toEqual([])
  })
})

describe("docs/skills index link integrity", () => {
  test("every link in the index resolves to an existing file", () => {
    const index = readFileSync(INDEX, "utf8")
    const targets = [...index.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1])
    const broken = targets.filter((target) => {
      if (/^[a-z]+:\/\//i.test(target)) return false // skip external URLs
      const clean = target.split("#")[0]
      if (clean === "") return false // pure in-page anchor
      return !existsSync(path.resolve(DOCS_DIR, clean))
    })
    // Failure names the unresolved link target(s).
    expect(broken).toEqual([])
  })
})

describe("docs/skills index drift gate", () => {
  test("the committed index equals generator output (no drift)", async () => {
    const updates = await emitSkillsIndex({ root: REPO_ROOT, write: false })
    const drifted = updates.filter((u) => u.changed).map((u) => u.path)
    // A schema-visible frontmatter change without regen fails here until
    // `bun run docs:emit-index`.
    expect(drifted).toEqual([])
  })
})

describe("docs/skills index skips non-skill debris", () => {
  test("a bare directory under skills/ without SKILL.md is excluded, not fatal", () => {
    // Real checkouts accumulate debris under skills/ (e.g. logs/, .claude/ —
    // see this branch's .gitignore). Copy the real sources into an isolated
    // root, drop a bare non-skill directory in, and confirm rendering succeeds
    // and omits it rather than throwing ENOENT on a missing SKILL.md.
    const root = mkdtempSync(path.join(tmpdir(), "skills-index-debris-"))
    const destSkills = path.join(root, "plugins/super-looper/skills")
    mkdirSync(path.dirname(destSkills), { recursive: true })
    cpSync(SKILLS_DIR, destSkills, { recursive: true })
    mkdirSync(path.join(destSkills, "logs"), { recursive: true })

    const rendered = renderSkillsIndex(root)
    expect(rendered).not.toContain("[`logs`]")

    rmSync(root, { recursive: true, force: true })
  })
})

describe("emit-skills-index CLI", () => {
  test("--write then --check exits 0; a stale index makes --check exit 1", () => {
    // Copy the sources the generator reads into an isolated root so the CLI can
    // write and re-check without touching the repo's committed index.
    const root = mkdtempSync(path.join(tmpdir(), "skills-index-cli-"))
    const destSkills = path.join(root, "plugins/super-looper/skills")
    mkdirSync(path.dirname(destSkills), { recursive: true })
    mkdirSync(path.join(root, "docs/skills"), { recursive: true })
    cpSync(SKILLS_DIR, destSkills, { recursive: true })

    const written = runCli(["--write"], root)
    expect(written.code).toBe(0)

    const clean = runCli(["--check"], root)
    expect(clean.code).toBe(0)

    writeFileSync(path.join(root, "docs/skills/README.md"), "stale\n", "utf8")

    const drifted = runCli(["--check"], root)
    expect(drifted.code).toBe(1)
    expect(drifted.stderr).toContain(path.join(root, "docs/skills/README.md"))

    rmSync(root, { recursive: true, force: true })
  })
})
