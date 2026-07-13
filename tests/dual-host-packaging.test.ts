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
    expect(codex).toContain("Codex subagent collaboration tool")
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

  test("uses the documented plugin-root compatibility variable for hooks", async () => {
    const hooks = await readJson("plugins/super-looper/hooks/hooks.json")
    expect(hooks.hooks.PreToolUse[0].hooks[0].command).toContain("${CLAUDE_PLUGIN_ROOT}")
  })
})
