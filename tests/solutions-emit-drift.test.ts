import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { emitDocs } from "../src/solutions/emit"

const REPO_ROOT = path.join(__dirname, "..")
const CLI = path.join(REPO_ROOT, "scripts/solutions/emit-docs.ts")

const COMPOUND = path.join(
  REPO_ROOT,
  "plugins/super-looper/skills/sl-compound/references",
)
const REFRESH = path.join(
  REPO_ROOT,
  "plugins/super-looper/skills/sl-compound-refresh/references",
)

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

describe("schema doc drift gate", () => {
  test("the committed docs equal generator output (no drift)", async () => {
    const updates = await emitDocs({ root: REPO_ROOT, write: false })
    const drifted = updates.filter((u) => u.changed).map((u) => u.path)
    expect(drifted).toEqual([])
  })
})

describe("cross-copy identity", () => {
  test("both skills carry byte-identical yaml-schema.md", () => {
    const a = readFileSync(path.join(COMPOUND, "yaml-schema.md"), "utf8")
    const b = readFileSync(path.join(REFRESH, "yaml-schema.md"), "utf8")
    expect(a).toBe(b)
  })

  test("both skills carry byte-identical schema.yaml", () => {
    const a = readFileSync(path.join(COMPOUND, "schema.yaml"), "utf8")
    const b = readFileSync(path.join(REFRESH, "schema.yaml"), "utf8")
    expect(a).toBe(b)
  })
})

describe("regenerated content", () => {
  test("yaml-schema.md carries web enums, not Rails ones", () => {
    const md = readFileSync(path.join(COMPOUND, "yaml-schema.md"), "utf8")
    expect(md).toContain("react_component")
    expect(md).toContain("framework_version")
    expect(md).not.toContain("rails_version")
  })
})

describe("emit-docs CLI", () => {
  test("--write then --check exits 0; a stale doc makes --check exit 1", () => {
    const root = mkdtempSync(path.join(tmpdir(), "emit-cli-"))

    const written = runCli(["--write"], root)
    expect(written.code).toBe(0)

    const clean = runCli(["--check"], root)
    expect(clean.code).toBe(0)

    const stalePath = path.join(
      root,
      "plugins/super-looper/skills/sl-compound/references/yaml-schema.md",
    )
    writeFileSync(stalePath, "stale\n", "utf8")

    const drifted = runCli(["--check"], root)
    expect(drifted.code).toBe(1)
    expect(drifted.stderr).toContain(stalePath)

    spawnSync("rm", ["-rf", root])
  })
})
