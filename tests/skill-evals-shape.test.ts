import { readFileSync, readdirSync, existsSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

// U13 / R24-R25: behavioral eval suites for the load-bearing skills, cloning the
// sl-sessions/evals/ three-file shape. This test does NOT run the suites (that
// goes through the skill-creator workflow — see each suite's README). It checks
// only that every evals/evals.json carries the required keys, so a suite added
// without them fails here NAMING the suite. It also source-greps the
// learning-to-eval rule (R25) into sl-compound and the root AGENTS.md.

const REPO_ROOT = path.join(__dirname, "..")
const SKILLS_DIR = path.join(REPO_ROOT, "plugins/super-looper/skills")

/** Every skill directory that ships an evals/evals.json. */
function evalSuites(): { skill: string; jsonPath: string }[] {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      skill: entry.name,
      jsonPath: path.join(SKILLS_DIR, entry.name, "evals", "evals.json"),
    }))
    .filter(({ jsonPath }) => existsSync(jsonPath))
    .sort((a, b) => a.skill.localeCompare(b.skill))
}

// The suites U13 requires exist, plus the sl-sessions suite they clone. A suite
// silently dropped (dir renamed/removed) fails this pin, not just the per-suite
// shape checks below.
const REQUIRED_SUITES = [
  "lfg",
  "sl-code-review",
  "sl-compound",
  "sl-sessions",
  "sl-work",
]

const TOP_LEVEL_KEYS = [
  "skill_name",
  "variance_protocol",
  "grading_pipeline",
  "evals",
]

const PER_EVAL_KEYS = ["prompt", "expected_terms", "ground_truth"]

describe("skill eval-suite coverage", () => {
  test("every U13 required suite ships an evals/evals.json", () => {
    const present = evalSuites().map((s) => s.skill)
    const missing = REQUIRED_SUITES.filter((s) => !present.includes(s))
    // Failure names the suite(s) missing an evals.json.
    expect(missing).toEqual([])
  })
})

describe("skill eval-suite shape", () => {
  for (const { skill, jsonPath } of evalSuites()) {
    test(`${skill}/evals/evals.json carries the required keys`, () => {
      const raw = readFileSync(jsonPath, "utf8")

      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>
      } catch (err) {
        throw new Error(`${skill}/evals/evals.json is not valid JSON: ${err}`)
      }

      // Top-level keys — a missing one fails NAMING the suite via the test title.
      const missingTop = TOP_LEVEL_KEYS.filter((k) => !(k in parsed))
      expect(`${skill}: missing ${missingTop.join(", ")}`).toBe(`${skill}: missing `)

      // skill_name field matches the directory it lives in.
      expect(parsed.skill_name).toBe(skill)

      // variance_protocol pins runs_per_eval (>= 3 per the plan).
      const variance = parsed.variance_protocol as { runs_per_eval?: number }
      expect(typeof variance).toBe("object")
      expect(typeof variance.runs_per_eval).toBe("number")
      expect(variance.runs_per_eval as number).toBeGreaterThanOrEqual(3)

      // grading_pipeline names two stages (two-stage grader).
      const pipeline = parsed.grading_pipeline as Record<string, unknown>
      expect(typeof pipeline).toBe("object")
      expect("stage_1" in pipeline).toBe(true)
      expect("stage_2" in pipeline).toBe(true)

      // evals[] — 3+ scenarios, each carrying the per-eval required keys.
      const evals = parsed.evals as Record<string, unknown>[]
      expect(Array.isArray(evals)).toBe(true)
      expect(evals.length).toBeGreaterThanOrEqual(3)

      evals.forEach((evalCase, i) => {
        const missingPerEval = PER_EVAL_KEYS.filter((k) => !(k in evalCase))
        // Failure names the suite + eval index + the missing key.
        expect(`${skill}[eval ${i}]: missing ${missingPerEval.join(", ")}`).toBe(
          `${skill}[eval ${i}]: missing `,
        )
        // expected_terms is an array (may be empty for a negative case).
        expect(Array.isArray(evalCase.expected_terms)).toBe(true)
      })
    })

    test(`${skill}/evals ships grader.md and README.md alongside evals.json`, () => {
      const evalsDir = path.dirname(jsonPath)
      expect(existsSync(path.join(evalsDir, "grader.md"))).toBe(true)
      expect(existsSync(path.join(evalsDir, "README.md"))).toBe(true)
    })
  }
})

describe("learning-to-eval rule (U13 / R25)", () => {
  const RULE_PHRASES = ["identifies a skill gap", "include or update a behavioral eval"]

  test("sl-compound/SKILL.md carries the learning-to-eval rule", () => {
    const raw = readFileSync(
      path.join(SKILLS_DIR, "sl-compound", "SKILL.md"),
      "utf8",
    )
    for (const phrase of RULE_PHRASES) {
      expect(raw).toContain(phrase)
    }
  })

  test("root AGENTS.md carries the learning-to-eval rule in a behavioral-validation context", () => {
    const raw = readFileSync(path.join(REPO_ROOT, "AGENTS.md"), "utf8")
    for (const phrase of RULE_PHRASES) {
      expect(raw).toContain(phrase)
    }
    // The rule lands in the behavioral-validation section, not floating loose.
    const section = raw.slice(raw.indexOf("## Validating Agent and Skill Changes"))
    expect(section).toContain("identifies a skill gap")
  })
})
