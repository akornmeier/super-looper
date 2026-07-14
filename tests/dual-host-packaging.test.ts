import { describe, expect, test } from "bun:test"
import path from "node:path"

const root = process.cwd()
const pluginRoot = path.join(root, "plugins", "super-looper")
const codexPluginRoot = path.join(pluginRoot, "codex", "super-looper")

async function readJson(relativePath: string): Promise<any> {
  return JSON.parse(await Bun.file(path.join(root, relativePath)).text())
}

describe("dual-host plugin packaging", () => {
  test("keeps shared Claude and Codex manifest metadata aligned", async () => {
    const claude = await readJson("plugins/super-looper/.claude-plugin/plugin.json")
    const codex = await readJson(
      "plugins/super-looper/codex/super-looper/.codex-plugin/plugin.json",
    )

    expect(codex.name).toBe(claude.name)
    expect(codex.version).toBe(claude.version)
    expect(codex.description).toBe(claude.description)
    expect(codex.author).toEqual(claude.author)
    expect(codex.skills).toBe("./skills/")
    expect(codex.hooks).toBeUndefined()
  })

  test("ships native marketplace entries for both hosts", async () => {
    const claude = await readJson(".claude-plugin/marketplace.json")
    const codex = await readJson(".agents/plugins/marketplace.json")
    const claudeEntry = claude.plugins.find((entry: any) => entry.name === "super-looper")
    const codexEntry = codex.plugins.find((entry: any) => entry.name === "super-looper")

    expect(claudeEntry.source).toBe("./plugins/super-looper")
    expect(codexEntry.source).toEqual({
      source: "local",
      path: "./plugins/super-looper/codex/super-looper",
    })
    expect(codexEntry.policy).toEqual({
      installation: "AVAILABLE",
      authentication: "ON_INSTALL",
    })
    expect(codexEntry.category).toBe("Productivity")
  })

  test("lets release automation update both plugin versions", async () => {
    const config = await readJson(".github/release-please-config.json")
    const extraFiles = config.packages["plugins/super-looper"]["extra-files"]
    expect(extraFiles).toContainEqual({
      type: "json",
      path: ".claude-plugin/plugin.json",
      jsonpath: "$.version",
    })
    expect(extraFiles).toContainEqual({
      type: "json",
      path: "codex/super-looper/.codex-plugin/plugin.json",
      jsonpath: "$.version",
    })
  })

  test("keeps host tool syntax out of the shared smoke workflow", async () => {
    const shared = await Bun.file(
      path.join(pluginRoot, "skills", "sl-host-smoke", "SKILL.md"),
    ).text()
    const claude = await Bun.file(
      path.join(pluginRoot, "skills", "sl-host-smoke", "references", "runtime-claude.md"),
    ).text()
    const codex = await Bun.file(
      path.join(pluginRoot, "skills", "sl-host-smoke", "references", "runtime-codex.md"),
    ).text()

    expect(shared).not.toMatch(/AskUserQuestion|ToolSearch|\bAgent\b|\bTask\b|CLAUDE_SKILL_DIR/)
    expect(claude).toContain("AskUserQuestion")
    expect(claude).toContain("${CLAUDE_SKILL_DIR}")
    expect(codex).toContain("`spawn_agent` collaboration primitive")
    expect(codex).toContain("non-empty returned agent identifier")
    expect(codex).toContain("do not compute it from the known inputs")
    expect(codex).not.toContain("${CLAUDE_SKILL_DIR}")
  })

  test("keeps the migrated smoke skill copies byte-identical", async () => {
    const relativeFiles = [
      "SKILL.md",
      "agents/openai.yaml",
      "references/smoke-payload.md",
      "references/runtime-claude.md",
      "references/runtime-codex.md",
      "scripts/smoke.sh",
    ]

    for (const relativeFile of relativeFiles) {
      const claude = await Bun.file(
        path.join(pluginRoot, "skills", "sl-host-smoke", relativeFile),
      ).text()
      const codex = await Bun.file(
        path.join(codexPluginRoot, "skills", "sl-host-smoke", relativeFile),
      ).text()
      expect(codex).toBe(claude)
    }
  })

  test("runs the same bundled smoke script for both host markers", async () => {
    const script = path.join(pluginRoot, "skills", "sl-host-smoke", "scripts", "smoke.sh")

    for (const host of ["claude", "codex"]) {
      const proc = Bun.spawn(["bash", script, host, "alpha"], {
        stdout: "pipe",
        stderr: "pipe",
      })
      const output = await new Response(proc.stdout).text()
      expect(await proc.exited).toBe(0)
      expect(JSON.parse(output)).toEqual({ script_marker: `script:${host}:alpha` })
    }
  })

  test("keeps the migrated planner semantics aligned across hosts", async () => {
    const claudeRoot = path.join(pluginRoot, "skills", "sl-plan")
    const codexRoot = path.join(codexPluginRoot, "skills", "sl-plan")
    const claudeSkill = await Bun.file(path.join(claudeRoot, "SKILL.md")).text()
    const codexSkill = await Bun.file(path.join(codexRoot, "SKILL.md")).text()

    const semanticBody = (content: string) =>
      content
        .replace(/^---\n[\s\S]*?\n---\n/, "")
        .replace(
          /^\*\*Runtime adapter:\*\* this (?:Claude Code|Codex) package uses `references\/runtime-(?:claude|codex)\.md`\./m,
          "**Runtime adapter:** this host package uses its selected runtime adapter.",
        )

    expect(semanticBody(codexSkill)).toBe(semanticBody(claudeSkill))

    for (const relativeFile of [
      "references/plan-contract.md",
      "references/optional-renderer.md",
      "references/runtime-claude.md",
      "references/runtime-codex.md",
      "references/html-rendering.md",
      "references/html-plan-template.md",
      "references/plan-sections.md",
      "scripts/generate-plan-images.py",
      "scripts/wire-plan-references.py",
    ]) {
      expect(await Bun.file(path.join(codexRoot, relativeFile)).text()).toBe(
        await Bun.file(path.join(claudeRoot, relativeFile)).text(),
      )
    }
  })

  test("keeps compatibility wrapper routing aligned across hosts", async () => {
    for (const skill of ["lfg", "sl-work"]) {
      const claude = await Bun.file(
        path.join(pluginRoot, "skills", skill, "SKILL.md"),
      ).text()
      const codex = await Bun.file(
        path.join(codexPluginRoot, "skills", skill, "SKILL.md"),
      ).text()

      expect(codex).toBe(claude)
      expect(codex.split("\n").length).toBeLessThan(80)
      expect(codex).toContain("invoke `sl-run`")
    }
  })

  test("keeps Claude-only legacy behavior outside native Codex hot paths", async () => {
    const codexLfgLegacy = await Bun.file(
      path.join(codexPluginRoot, "skills", "lfg", "references", "legacy-pipeline.md"),
    ).text()
    const codexWorkLegacy = await Bun.file(
      path.join(codexPluginRoot, "skills", "sl-work", "references", "legacy-workflow.md"),
    ).text()

    expect(codexLfgLegacy).toContain("Claude Code-only")
    expect(codexLfgLegacy).toContain("Do not emulate")
    expect(codexWorkLegacy).toContain("Claude Code-only")
    expect(codexWorkLegacy).toContain("Do not")
  })

  test("cuts the planner hot-path instructions by more than 70 percent", async () => {
    const baseline = await readJson("docs/evals/core-loop-baseline.json")
    const prior = baseline.baseline.components.find(
      (component: any) => component.path === "plugins/super-looper/skills/sl-plan/SKILL.md",
    )
    const current = Bun.file(path.join(pluginRoot, "skills", "sl-plan", "SKILL.md")).size

    expect(prior.bytes).toBe(92956)
    expect(current).toBeLessThan(prior.bytes * 0.3)
  })

  test("keeps host mechanics in planner adapters", async () => {
    const shared = await Bun.file(
      path.join(pluginRoot, "skills", "sl-plan", "SKILL.md"),
    ).text()
    const claude = await Bun.file(
      path.join(pluginRoot, "skills", "sl-plan", "references", "runtime-claude.md"),
    ).text()
    const codex = await Bun.file(
      path.join(pluginRoot, "skills", "sl-plan", "references", "runtime-codex.md"),
    ).text()

    expect(shared).not.toMatch(/AskUserQuestion|ToolSearch|\bAgent\b|\bTask\b|CLAUDE_SKILL_DIR/)
    expect(claude).toContain("AskUserQuestion")
    expect(claude).toContain("${CLAUDE_SKILL_DIR}")
    expect(codex).toContain("Codex subagent collaboration tool")
    expect(codex).not.toContain("${CLAUDE_SKILL_DIR}")
  })

  test("keeps the sl-run coordinator and deterministic engine aligned across hosts", async () => {
    const claudeRoot = path.join(pluginRoot, "skills", "sl-run")
    const codexRoot = path.join(codexPluginRoot, "skills", "sl-run")

    for (const relativeFile of [
      "SKILL.md",
      "agents/openai.yaml",
      "references/state-engine.md",
      "references/worker-contract.md",
      "references/agent-contract.md",
      "references/verifier-contract.md",
      "references/router-contract.md",
      "references/team-execution.md",
      "references/review-packet.md",
      "references/delivery.md",
      "references/closeout.md",
      "references/workflow-profiles.json",
      "references/runtime-claude.md",
      "references/runtime-codex.md",
      "scripts/run-state.py",
    ]) {
      expect(await Bun.file(path.join(codexRoot, relativeFile)).text()).toBe(
        await Bun.file(path.join(claudeRoot, relativeFile)).text(),
      )
    }
  })

  test("keeps host mechanics in sl-run adapters", async () => {
    const shared = await Bun.file(
      path.join(pluginRoot, "skills", "sl-run", "SKILL.md"),
    ).text()
    const claude = await Bun.file(
      path.join(pluginRoot, "skills", "sl-run", "references", "runtime-claude.md"),
    ).text()
    const codex = await Bun.file(
      path.join(pluginRoot, "skills", "sl-run", "references", "runtime-codex.md"),
    ).text()

    expect(shared).not.toMatch(/AskUserQuestion|ToolSearch|CLAUDE_SKILL_DIR/)
    expect(claude).toContain("Agent")
    expect(claude).toContain("${CLAUDE_SKILL_DIR}")
    expect(codex).toContain("Codex subagent collaboration tool")
    expect(codex).not.toContain("${CLAUDE_SKILL_DIR}")
  })

  test("keeps the streamlined coordinator hot path under its shared budget", async () => {
    const bytes = ["sl-strategy", "sl-plan", "sl-run"].reduce(
      (total, skill) => total + Bun.file(path.join(pluginRoot, "skills", skill, "SKILL.md")).size,
      0,
    )
    expect(bytes).toBeLessThanOrEqual(120_000)
  })

  test("uses the documented plugin-root compatibility variable for hooks", async () => {
    const hooks = await readJson("plugins/super-looper/hooks/hooks.json")
    expect(hooks.hooks.PreToolUse[0].hooks[0].command).toContain("${CLAUDE_PLUGIN_ROOT}")
  })
})
