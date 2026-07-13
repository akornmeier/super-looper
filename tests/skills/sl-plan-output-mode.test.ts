import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"
import { load as parseYaml } from "js-yaml"

const SKILL_ROOT = path.join(process.cwd(), "plugins/super-looper/skills/sl-plan")
const SKILL_BODY = readFileSync(path.join(SKILL_ROOT, "SKILL.md"), "utf8")
const RENDERER_BODY = readFileSync(
  path.join(SKILL_ROOT, "references/optional-renderer.md"),
  "utf8",
)

describe("sl-plan output compatibility", () => {
  test("advertises explicit Markdown and HTML output", () => {
    const frontmatterMatch = SKILL_BODY.match(/^---\n([\s\S]*?)\n---/)
    expect(frontmatterMatch).not.toBeNull()
    const frontmatter = parseYaml(frontmatterMatch![1]) as Record<string, unknown>
    expect(frontmatter["argument-hint"]).toContain("output:html")
    expect(frontmatter["argument-hint"]).toContain("output:md")
  })

  test("keeps resolution precedence and pipeline override in the hot path", () => {
    const start = SKILL_BODY.indexOf("#### 0.0 Output Mode")
    expect(start).toBeGreaterThan(-1)
    const region = SKILL_BODY.slice(start, start + 2200)
    expect(region).toContain("output:md")
    expect(region).toContain("output:html")
    expect(region).toContain("plan_output")
    expect(region).toMatch(/active, non-commented/i)
    expect(region).toContain("# plan_output: html")
    expect(region).toContain("disable-model-invocation")
    expect(region).toContain("OUTPUT_FORMAT=md")
    expect(region).toMatch(/exclusive|never both/i)
    expect(region).toMatch(/actual selected mode|final resolution/i)
  })

  test("consumes only literal flag prefixes", () => {
    expect(SKILL_BODY).toMatch(/literal prefixes `output:` and `mode:`/)
    for (const prefix of ["feat:", "fix:", "chore:"]) expect(SKILL_BODY).toContain(prefix)
  })

  test("makes Markdown canonical and HTML an optional renderer", () => {
    expect(SKILL_BODY).toContain("`references/plan-contract.md`")
    expect(SKILL_BODY).toContain("`references/optional-renderer.md`")
    expect(SKILL_BODY).toMatch(/Markdown is the canonical core-loop artifact/i)
    expect(RENDERER_BODY).toContain("`references/html-rendering.md`")
    expect(RENDERER_BODY).toContain("`references/html-plan-template.md`")
    expect(RENDERER_BODY).toMatch(/stamp the literal/i)
    expect(RENDERER_BODY).toMatch(/never compose free-form HTML/i)
  })

  test("does not couple HTML output to paid image generation", () => {
    expect(RENDERER_BODY).toContain("`output:html` does not authorize paid image generation")
    expect(RENDERER_BODY).toContain("`images:on`")
    expect(RENDERER_BODY).toMatch(/never image bytes/i)
    expect(RENDERER_BODY).toMatch(/never blocks the plan/i)
  })

  test("preserves stateful HTML and unit-marker behavior", () => {
    expect(RENDERER_BODY).toContain("append-only metadata lists")
    expect(RENDERER_BODY).toContain("status markers")
    expect(RENDERER_BODY).toContain("filled image slots")
    expect(RENDERER_BODY).toContain("Amendments")
    expect(SKILL_BODY).toContain("`[]`, `[wip]`, `[x]`, or `[f]`")
  })
})
