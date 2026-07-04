import { existsSync, readdirSync, readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"
import { parseFrontmatter } from "../src/utils/frontmatter"

// Enforces the agent-color convention documented in
// docs/solutions/skill-design/agent-color-palette-and-fleet-scoped-distinctness.md
// (this test is that doc's deferred follow-up) and specified in
// docs/brainstorms/2026-06-26-agent-color-scheme-requirements.md +
// docs/plans/2026-06-26-001-fix-agent-color-scheme-plan.html.
//
// Two invariants:
//   (a) every agent's `color` frontmatter is one of the 8 valid values, and
//   (b) per-fleet distinctness: agents co-dispatched in the same fan-out have
//       distinct colors, with the tier-sharing relaxation for a fleet that
//       overflows the 8-value palette (code-review).

const PLUGIN_ROOT = path.join(process.cwd(), "plugins/super-looper")
const AGENTS_DIR = path.join(PLUGIN_ROOT, "agents")
const SOLUTION_REF =
  "docs/solutions/skill-design/agent-color-palette-and-fleet-scoped-distinctness.md"

// The only values Claude Code accepts for an agent `color`. Off-palette values
// (e.g. `violet`) render colorless. Source: Claude Code sub-agents docs.
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

function colorOf(agentName: string): string {
  const filePath = path.join(AGENTS_DIR, `${agentName}.md`)
  if (!existsSync(filePath)) {
    throw new Error(
      `Fleet map references agent "${agentName}" but ${filePath} does not exist. ` +
        `Update the co-dispatch map in this test when retiring or renaming an agent — see ${SOLUTION_REF}.`,
    )
  }
  const { data } = parseFrontmatter(readFileSync(filePath, "utf8"), filePath)
  return typeof data.color === "string" ? data.color : ""
}

// Co-dispatch map derived by reading the dispatching SKILL.md files — NOT an
// imagined one. A persona *catalog* a skill lists for selection (e.g.
// sl-resolve-pr-feedback's 40-agent list) is not a parallel panel and imposes
// no distinctness constraint, so it is intentionally absent. sl-plan's
// deepening dispatch is a dynamic per-section menu (references/deepening-workflow.md),
// not a fixed fan-out, so it is not encoded as a single fleet.

// FLAT fleets fit the palette (<= 8): every co-dispatched agent must be a
// distinct color. Each entry cites the skill whose fan-out it models.
const FLAT_FLEETS: Record<string, string[]> = {
  // plugins/super-looper/skills/sl-doc-review/ — 7 personas in one panel.
  "sl-doc-review": [
    "sl-adversarial-document-reviewer",
    "sl-security-lens-reviewer",
    "sl-coherence-reviewer",
    "sl-feasibility-reviewer",
    "sl-product-lens-reviewer",
    "sl-design-lens-reviewer",
    "sl-scope-guardian-reviewer",
  ],
  // plugins/super-looper/skills/sl-compound/ — 8 validators in one panel.
  "sl-compound": [
    "sl-best-practices-researcher",
    "sl-code-simplicity-reviewer",
    "sl-data-integrity-guardian",
    "sl-framework-docs-researcher",
    "sl-pattern-recognition-specialist",
    "sl-performance-oracle",
    "sl-security-sentinel",
    "sl-session-historian",
  ],
  // plugins/super-looper/skills/sl-ideate/ — 4-agent grounding wave.
  "sl-ideate": [
    "sl-issue-intelligence-analyst",
    "sl-learnings-researcher",
    "sl-slack-researcher",
    "sl-web-researcher",
  ],
  // plugins/super-looper/skills/sl-optimize/ — fixed 2-agent grounding pair.
  "sl-optimize": ["sl-learnings-researcher", "sl-repo-research-analyst"],
}

// TIERED fleet overflows the palette (> 8): sub-split into attention tiers.
// Same-tier agents share a color; distinct tiers hold distinct colors, so the
// panel is never monochrome (the original bug). Source:
// plugins/super-looper/skills/sl-code-review/ + the color-scheme plan.
const TIERED_FLEETS: Record<string, Record<string, string[]>> = {
  "sl-code-review": {
    "high-stakes": [
      "sl-correctness-reviewer",
      "sl-security-reviewer",
      "sl-adversarial-reviewer",
    ],
    structural: [
      "sl-maintainability-reviewer",
      "sl-reliability-reviewer",
      "sl-api-contract-reviewer",
      "sl-data-migration-reviewer",
    ],
    routine: [
      "sl-testing-reviewer",
      "sl-project-standards-reviewer",
      "sl-performance-reviewer",
      "sl-previous-comments-reviewer",
    ],
    "stack-specific": [
      "sl-julik-frontend-races-reviewer",
      "sl-swift-ios-reviewer",
    ],
    parity: ["sl-agent-native-reviewer"],
    deploy: ["sl-deployment-verification-agent"],
  },
}

describe("agent color on-palette", () => {
  const agentFiles = readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)

  for (const fileName of agentFiles) {
    test(`agent "${fileName}" color is on the 8-value palette`, () => {
      const { data } = parseFrontmatter(
        readFileSync(path.join(AGENTS_DIR, fileName), "utf8"),
        fileName,
      )
      const color = data.color
      expect(
        typeof color === "string" && color.length > 0,
        `${fileName} must declare a "color" frontmatter value — see ${SOLUTION_REF}`,
      ).toBe(true)
      expect(
        PALETTE.has(color as string),
        `${fileName} color "${String(color)}" is off-palette; use one of ${[...PALETTE].join(", ")} — see ${SOLUTION_REF}`,
      ).toBe(true)
    })
  }
})

describe("fleet color distinctness (flat fleets)", () => {
  for (const [fleet, members] of Object.entries(FLAT_FLEETS)) {
    test(`fleet "${fleet}" co-dispatched agents have distinct colors`, () => {
      expect(
        members.length,
        `${fleet} has ${members.length} members but the palette holds ${PALETTE.size}; ` +
          `a fleet larger than the palette must be encoded as a tiered fleet — see ${SOLUTION_REF}`,
      ).toBeLessThanOrEqual(PALETTE.size)

      const seen = new Map<string, string>()
      for (const agent of members) {
        const color = colorOf(agent)
        const prior = seen.get(color)
        expect(
          prior,
          `Color collision in fleet "${fleet}": "${agent}" and "${prior}" both use "${color}". ` +
            `Agents co-dispatched in a panel that fits the palette must be distinct — see ${SOLUTION_REF}`,
        ).toBeUndefined()
        seen.set(color, agent)
      }
    })
  }
})

describe("fleet color distinctness (tiered fleets)", () => {
  for (const [fleet, tiers] of Object.entries(TIERED_FLEETS)) {
    test(`fleet "${fleet}" tiers are internally uniform and mutually distinct`, () => {
      const tierColor = new Map<string, string>()

      for (const [tier, members] of Object.entries(tiers)) {
        // Within a tier, every agent shares the tier's color.
        let color: string | undefined
        for (const agent of members) {
          const agentColor = colorOf(agent)
          if (color === undefined) color = agentColor
          expect(
            agentColor,
            `Tier "${tier}" of fleet "${fleet}" is not uniform: "${agent}" is "${agentColor}" ` +
              `but the tier color is "${color}". Same-tier agents must share one color — see ${SOLUTION_REF}`,
          ).toBe(color)
        }
        tierColor.set(tier, color as string)
      }

      // Across tiers, colors must differ so the panel shows several colors.
      const usedColors = new Map<string, string>()
      for (const [tier, color] of tierColor) {
        const prior = usedColors.get(color)
        expect(
          prior,
          `Tiers "${tier}" and "${prior}" of fleet "${fleet}" both use "${color}". ` +
            `Distinct attention tiers must hold distinct colors — see ${SOLUTION_REF}`,
        ).toBeUndefined()
        usedColors.set(color, tier)
      }
    })
  }
})
