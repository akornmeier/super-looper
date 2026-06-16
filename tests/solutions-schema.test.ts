import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { validateFrontmatter } from "../src/solutions/validate"

// --- Fixtures ---------------------------------------------------------------

const VALID_BUG = `---
module: src/solutions
date: 2026-06-16
problem_type: build_error
component: build_tooling
severity: high
symptoms:
  - tsc fails with TS2345
root_cause: type_error
resolution_type: code_fix
framework_version: react@19.0.0
---

Body.
`

const VALID_KNOWLEDGE = `---
module: src/solutions
date: 2026-06-16
problem_type: best_practice
component: tooling
severity: low
---

Body.
`

function withFields(fields: string): string {
  return `---\n${fields}\n---\n\nBody.\n`
}

// --- Logic: validateFrontmatter --------------------------------------------

describe("validateFrontmatter", () => {
  test("a valid bug-track doc passes", () => {
    const result = validateFrontmatter(VALID_BUG)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  test("a valid knowledge-track doc passes (shared required only)", () => {
    const result = validateFrontmatter(VALID_KNOWLEDGE)
    expect(result.valid).toBe(true)
  })

  test("a knowledge doc carrying optional bug fields passes (backward-compat)", () => {
    const result = validateFrontmatter(
      withFields(
        [
          "module: x",
          "date: 2026-06-16",
          "problem_type: convention",
          "component: documentation",
          "severity: low",
          "symptoms:",
          "  - friction observed",
          "root_cause: inadequate_documentation",
        ].join("\n"),
      ),
    )
    expect(result.valid).toBe(true)
  })

  test("tags with exactly 8 items passes", () => {
    const tags = Array.from({ length: 8 }, (_, i) => `  - tag${i}`).join("\n")
    const result = validateFrontmatter(
      withFields(
        [
          "module: x",
          "date: 2026-06-16",
          "problem_type: best_practice",
          "component: tooling",
          "severity: low",
          "tags:",
          tags,
        ].join("\n"),
      ),
    )
    expect(result.valid).toBe(true)
  })

  test("unknown problem_type fails naming problem_type", () => {
    const result = validateFrontmatter(
      withFields(
        [
          "module: x",
          "date: 2026-06-16",
          "problem_type: rails_model",
          "component: tooling",
          "severity: low",
        ].join("\n"),
      ),
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === "problem_type")).toBe(true)
  })

  test("invalid component enum fails naming component", () => {
    const result = validateFrontmatter(
      withFields(
        [
          "module: x",
          "date: 2026-06-16",
          "problem_type: build_error",
          "component: rails_model",
          "severity: low",
          "symptoms:",
          "  - boom",
          "root_cause: type_error",
          "resolution_type: code_fix",
        ].join("\n"),
      ),
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === "component")).toBe(true)
  })

  test("bug doc missing root_cause fails naming root_cause", () => {
    const result = validateFrontmatter(
      withFields(
        [
          "module: x",
          "date: 2026-06-16",
          "problem_type: build_error",
          "component: build_tooling",
          "severity: high",
          "symptoms:",
          "  - boom",
          "resolution_type: code_fix",
        ].join("\n"),
      ),
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === "root_cause")).toBe(true)
  })

  test("bug doc with empty symptoms fails naming symptoms", () => {
    const result = validateFrontmatter(
      withFields(
        [
          "module: x",
          "date: 2026-06-16",
          "problem_type: build_error",
          "component: build_tooling",
          "severity: high",
          "symptoms: []",
          "root_cause: type_error",
          "resolution_type: code_fix",
        ].join("\n"),
      ),
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === "symptoms")).toBe(true)
  })

  test("date not in YYYY-MM-DD fails naming date", () => {
    const result = validateFrontmatter(
      withFields(
        [
          "module: x",
          "date: 2026/06/16",
          "problem_type: best_practice",
          "component: tooling",
          "severity: low",
        ].join("\n"),
      ),
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === "date")).toBe(true)
  })

  test("tags with 9 items fails naming tags", () => {
    const tags = Array.from({ length: 9 }, (_, i) => `  - tag${i}`).join("\n")
    const result = validateFrontmatter(
      withFields(
        [
          "module: x",
          "date: 2026-06-16",
          "problem_type: best_practice",
          "component: tooling",
          "severity: low",
          "tags:",
          tags,
        ].join("\n"),
      ),
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === "tags")).toBe(true)
  })

  test("missing frontmatter block fails", () => {
    const result = validateFrontmatter("Just a body with no frontmatter.\n")
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  test("unparseable YAML fails", () => {
    const raw = `---\nproblem_type: build_error\nbad: "unterminated\n---\nBody\n`
    const result = validateFrontmatter(raw)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

// --- CLI: scripts/solutions/validate-frontmatter.ts -------------------------

const CLI = path.join(__dirname, "../scripts/solutions/validate-frontmatter.ts")
const CORPUS = path.join(__dirname, "../docs/solutions")

function runCli(args: string[]): { code: number; stdout: string; stderr: string } {
  const result = spawnSync("bun", [CLI, ...args], { encoding: "utf8" })
  return {
    code: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

function writeTempDoc(content: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "solutions-validate-"))
  const filePath = path.join(dir, "doc.md")
  writeFileSync(filePath, content, "utf8")
  return filePath
}

describe("validate-frontmatter CLI", () => {
  test("no argument exits 2 (usage)", () => {
    const result = runCli([])
    expect(result.code).toBe(2)
  })

  test("a valid file exits 0", () => {
    const doc = writeTempDoc(VALID_BUG)
    const result = runCli([doc])
    expect(result.code).toBe(0)
  })

  test("an invalid file exits 1 and names the offending field", () => {
    const doc = writeTempDoc(
      withFields(
        [
          "module: x",
          "date: 2026/06/16",
          "problem_type: best_practice",
          "component: tooling",
          "severity: low",
        ].join("\n"),
      ),
    )
    const result = runCli([doc])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("date")
  })

  test("corpus mode over the (empty) docs/solutions exits 0", () => {
    const result = runCli([CORPUS])
    expect(result.code).toBe(0)
  })
})
