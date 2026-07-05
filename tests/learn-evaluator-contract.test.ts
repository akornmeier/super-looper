import { existsSync, readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"
import { parseFrontmatter } from "../src/utils/frontmatter"
import { validateFrontmatter } from "../src/solutions/validate"

// U11 / R8–R12: sl-learn separates the learning generator from an independent
// fresh-context evaluator on the write path. These are source-grep contract
// assertions on the skill/agent prose (the LLM-driven behavior can't be unit
// tested), plus a schema check that the frontmatter the flow emits validates.
// Distinctive, stable phrases are grepped — not whole sentences — so surgical
// rewording does not break the pins.

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8")
}

const SL_LEARN = "plugins/super-looper/skills/sl-learn/SKILL.md"
const SL_COMPOUND = "plugins/super-looper/skills/sl-compound/SKILL.md"
const EVALUATOR = "plugins/super-looper/agents/sl-learning-evaluator.md"
const RESEARCHER = "plugins/super-looper/agents/sl-learnings-researcher.md"

// The 8 values Claude Code accepts for an agent `color` (mirrors
// tests/agent-color-palette.test.ts — the U2 color test also picks up the new
// agent automatically; this is a focused duplicate for the U11 contract).
const PALETTE = new Set([
  "red",
  "blue",
  "green",
  "yellow",
  "purple",
  "orange",
  "pink",
  "cyan",
])

describe("sl-learn evaluator gate (U11 / R8–R10)", () => {
  test("carries the three-state verdict contract and dispatches the evaluator", () => {
    const learn = readRepoFile(SL_LEARN)

    // Dispatches the independent fresh-context evaluator with an evidence packet
    expect(learn).toContain("sl-learning-evaluator")
    expect(learn).toContain("evidence packet")

    // Three-state verdict — all three states named
    expect(learn).toContain("three-state verdict")
    expect(learn).toContain("verified")
    expect(learn).toContain("candidate")
    expect(learn).toContain("rejected")
  })

  test("verified/candidate commit with confidence + provenance + evidence (R8)", () => {
    const learn = readRepoFile(SL_LEARN)

    expect(learn).toContain("confidence: verified")
    expect(learn).toContain("confidence: candidate")
    expect(learn).toContain("provenance: loop-run")
    // evidence pointer is a PR URL or commit sha
    expect(learn).toMatch(/evidence:\s*<PR URL or/i)
  })

  test("fails toward candidate on evaluator crash/timeout (R10)", () => {
    const learn = readRepoFile(SL_LEARN)

    expect(learn).toMatch(/fail toward .?candidate/i)
    // Never silently verified, never dropped
    expect(learn).toMatch(/never silently .?verified/i)
    expect(learn).toMatch(/never dropped/i)
  })

  test("rejected does not commit and reverts sl-compound side effects (R9)", () => {
    const learn = readRepoFile(SL_LEARN)

    // Revert-on-reject: the rejected path restores the side effects
    expect(learn).toMatch(/revert/i)
    expect(learn).toContain("side effect")
    // Rejection is recorded for the run-record
    expect(learn).toMatch(/record the rejection/i)
  })
})

describe("sl-learning-evaluator agent (U11 / R8)", () => {
  test("exists, is sl- prefixed, and declares an on-palette color", () => {
    const filePath = path.join(process.cwd(), EVALUATOR)
    expect(existsSync(filePath)).toBe(true)

    const raw = readFileSync(filePath, "utf8")
    const { data } = parseFrontmatter(raw, EVALUATOR)

    expect(data.name).toBe("sl-learning-evaluator")
    expect(String(data.name).startsWith("sl-")).toBe(true)

    const color = data.color
    expect(typeof color === "string" && (color as string).length > 0).toBe(true)
    expect(PALETTE.has(color as string)).toBe(true)
  })

  test("defines the three verdicts and a parseable VERDICT output line", () => {
    const raw = readRepoFile(EVALUATOR)

    // Weighs evidence as claims, not truth (the separation principle)
    expect(raw).toMatch(/as claims/i)

    // Machine-parseable verdict contract with all three states
    expect(raw).toContain("VERDICT: verified")
    expect(raw).toContain("VERDICT: candidate")
    expect(raw).toContain("VERDICT: rejected")

    // Only affirmative refutation rejects; default toward candidate
    expect(raw).toMatch(/affirmative/i)
  })
})

describe("sl-learnings-researcher confidence weighting (U11 / R11)", () => {
  test("ranks verified above candidate and surfaces the label", () => {
    const researcher = readRepoFile(RESEARCHER)

    expect(researcher).toMatch(/confidence weighting/i)
    expect(researcher).toContain("verified")
    // Absent field is candidate-equivalent (KTD10)
    expect(researcher).toContain("candidate-equivalent")
    // Confidence is surfaced in the per-finding output
    expect(researcher).toContain("**Confidence**")
  })
})

describe("sl-compound provenance marking (U11 / R12)", () => {
  test("interactive marks interactive-session; headless defers to the caller", () => {
    const compound = readRepoFile(SL_COMPOUND)

    expect(compound).toContain("provenance: interactive-session")
    // Headless does not set the fields — the caller (sl-learn) does
    expect(compound).toContain("sl-learn")
    expect(compound).toMatch(/headless/i)
  })
})

// --- Schema: frontmatter the sl-compound + sl-learn flow emits validates -----
// (import validateFrontmatter the same way tests/solutions-schema.test.ts does)

describe("evaluator-stamped frontmatter validates against U10's schema", () => {
  function withFields(fields: string): string {
    return `---\n${fields}\n---\n\nBody.\n`
  }

  test("loop-run verified bug-track learning validates", () => {
    const result = validateFrontmatter(
      withFields(
        [
          "module: plugins/super-looper/skills/sl-learn",
          "date: 2026-07-04",
          "problem_type: logic_error",
          "component: development_workflow",
          "severity: medium",
          "symptoms:",
          "  - learning committed unverified",
          "root_cause: missing_workflow_step",
          "resolution_type: workflow_improvement",
          "confidence: verified",
          "provenance: loop-run",
          "evidence: https://github.com/akornmeier/super-looper/pull/42",
        ].join("\n"),
      ),
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  test("loop-run candidate knowledge-track learning validates (fail-toward-candidate)", () => {
    const result = validateFrontmatter(
      withFields(
        [
          "module: plugins/super-looper/skills/sl-learn",
          "date: 2026-07-04",
          "problem_type: workflow_issue",
          "component: development_workflow",
          "severity: low",
          "confidence: candidate",
          "provenance: loop-run",
          "evidence: a1b2c3d",
        ].join("\n"),
      ),
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  test("interactive-session provenance without confidence validates (R12)", () => {
    const result = validateFrontmatter(
      withFields(
        [
          "module: plugins/super-looper/skills/sl-compound",
          "date: 2026-07-04",
          "problem_type: best_practice",
          "component: development_workflow",
          "severity: low",
          "provenance: interactive-session",
        ].join("\n"),
      ),
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })
})
