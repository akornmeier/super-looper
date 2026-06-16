import { describe, expect, test } from "bun:test"
import {
  applyOverride,
  bumpVersion,
  detectComponentsFromFiles,
  inferBumpFromIntent,
  parseReleaseIntent,
  resolveComponentWarnings,
} from "../src/release/components"

describe("release component detection", () => {
  test("maps plugin-only changes to the matching plugin component", () => {
    const components = detectComponentsFromFiles([
      "plugins/super-looper/skills/sl-plan/SKILL.md",
    ])

    expect(components.get("super-looper")).toEqual([
      "plugins/super-looper/skills/sl-plan/SKILL.md",
    ])
    expect(components.get("marketplace")).toEqual([])
  })

  test("does not map non-releasable files (release tooling) to any component", () => {
    const components = detectComponentsFromFiles([
      "src/release/components.ts",
      "plugins/super-looper/.claude-plugin/plugin.json",
    ])

    expect(components.get("super-looper")).toEqual([
      "plugins/super-looper/.claude-plugin/plugin.json",
    ])
    // Release tooling under src/ is no longer a released component.
    expect([...components.keys()]).not.toContain("cli")
  })

  test("maps claude marketplace metadata without bumping plugin components", () => {
    const components = detectComponentsFromFiles([".claude-plugin/marketplace.json"])
    expect(components.get("marketplace")).toEqual([".claude-plugin/marketplace.json"])
    expect(components.get("super-looper")).toEqual([])
  })
})

describe("release intent parsing", () => {
  test("parses conventional titles with optional scope and breaking marker", () => {
    const parsed = parseReleaseIntent("feat(super-looper)!: add review reset flow")
    expect(parsed.type).toBe("feat")
    expect(parsed.scope).toBe("super-looper")
    expect(parsed.breaking).toBe(true)
    expect(parsed.description).toBe("add review reset flow")
  })

  test("supports conventional titles without scope", () => {
    const parsed = parseReleaseIntent("fix: adjust sl-plan wording")
    expect(parsed.type).toBe("fix")
    expect(parsed.scope).toBeNull()
    expect(parsed.breaking).toBe(false)
  })

  test("infers bump levels from parsed intent", () => {
    expect(inferBumpFromIntent(parseReleaseIntent("feat: add release preview"))).toBe("minor")
    expect(inferBumpFromIntent(parseReleaseIntent("fix: correct preview output"))).toBe("patch")
    expect(inferBumpFromIntent(parseReleaseIntent("docs: update requirements"))).toBeNull()
    expect(inferBumpFromIntent(parseReleaseIntent("refactor!: break compatibility"))).toBe("major")
  })
})

describe("override handling", () => {
  test("keeps inferred bump when override is auto", () => {
    expect(applyOverride("patch", "auto")).toBe("patch")
  })

  test("promotes inferred bump when override is explicit", () => {
    expect(applyOverride("patch", "minor")).toBe("minor")
    expect(applyOverride(null, "major")).toBe("major")
  })

  test("increments semver versions", () => {
    expect(bumpVersion("2.42.0", "patch")).toBe("2.42.1")
    expect(bumpVersion("2.42.0", "minor")).toBe("2.43.0")
    expect(bumpVersion("2.42.0", "major")).toBe("3.0.0")
  })
})

describe("scope mismatch warnings", () => {
  test("does not require scope when omitted", () => {
    const warnings = resolveComponentWarnings(
      parseReleaseIntent("fix: update ce plan copy"),
      ["super-looper"],
    )
    expect(warnings).toEqual([])
  })

  test("warns when explicit scope contradicts detected files", () => {
    const warnings = resolveComponentWarnings(
      parseReleaseIntent("fix(marketplace): update super-looper text"),
      ["super-looper"],
    )
    expect(warnings[0]).toContain('Optional scope "marketplace" does not match')
  })
})
