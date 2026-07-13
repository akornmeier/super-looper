import { mkdtemp, mkdir, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { afterEach, describe, expect, test } from "bun:test"
import {
  buildSuperLooperDescription,
  getSuperLooperCounts,
  syncReleaseMetadata,
} from "../src/release/metadata"

const COMPOUND_DESCRIPTION =
  "AI-powered development tools for code review, research, design, and workflow automation."
const COMPOUND_MARKETPLACE_DESCRIPTION =
  "AI-powered development tools that get smarter with every use. Make each unit of engineering work easier than the last."

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    await Bun.$`rm -rf ${root}`.quiet()
  }
})

async function makeFixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "release-metadata-"))
  tempRoots.push(root)

  await mkdir(path.join(root, "plugins", "super-looper", "agents", "review"), {
    recursive: true,
  })
  await mkdir(path.join(root, "plugins", "super-looper", "skills", "sl-plan"), {
    recursive: true,
  })
  await mkdir(path.join(root, "plugins", "super-looper", ".claude-plugin"), {
    recursive: true,
  })
  await mkdir(path.join(root, "plugins", "super-looper", "codex", "super-looper", ".codex-plugin"), {
    recursive: true,
  })
  await mkdir(path.join(root, ".claude-plugin"), { recursive: true })
  await mkdir(path.join(root, ".agents", "plugins"), { recursive: true })

  await writeFile(
    path.join(root, "plugins", "super-looper", "agents", "review", "agent.md"),
    "# Review Agent\n",
  )
  await writeFile(
    path.join(root, "plugins", "super-looper", "skills", "sl-plan", "SKILL.md"),
    "# sl-plan\n",
  )
  await writeFile(
    path.join(root, "plugins", "super-looper", ".mcp.json"),
    JSON.stringify({ mcpServers: { context7: { command: "ctx7" } } }, null, 2),
  )
  await writeFile(
    path.join(root, "plugins", "super-looper", ".claude-plugin", "plugin.json"),
    JSON.stringify(
      {
        name: "super-looper",
        version: "2.42.0",
        description: "old",
        author: { name: "Example" },
      },
      null,
      2,
    ),
  )
  await writeFile(
    path.join(root, "plugins", "super-looper", "codex", "super-looper", ".codex-plugin", "plugin.json"),
    JSON.stringify(
      {
        name: "super-looper",
        version: "2.41.0",
        description: "old",
        author: { name: "Drifted" },
        skills: "./skills/",
      },
      null,
      2,
    ),
  )
  await writeFile(
    path.join(root, ".claude-plugin", "marketplace.json"),
    JSON.stringify(
      {
        metadata: { version: "1.0.0", description: "marketplace" },
        plugins: [
          { name: "super-looper", version: "2.41.0", description: "old" },
        ],
      },
      null,
      2,
    ),
  )
  await writeFile(
    path.join(root, ".agents", "plugins", "marketplace.json"),
    JSON.stringify(
      {
        name: "super-looper",
        interface: { displayName: "Super Looper" },
        plugins: [
          {
            name: "super-looper",
            source: { source: "local", path: "./plugins/super-looper/codex/super-looper" },
            policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
            category: "Productivity",
          },
        ],
      },
      null,
      2,
    ),
  )

  return root
}

describe("release metadata", () => {
  test("reports current super-looper counts from the repo", async () => {
    const counts = await getSuperLooperCounts(process.cwd())

    expect(counts).toEqual({
      agents: expect.any(Number),
      skills: expect.any(Number),
      mcpServers: expect.any(Number),
    })
    expect(counts.agents).toBeGreaterThan(0)
    expect(counts.skills).toBeGreaterThan(0)
    expect(counts.mcpServers).toBeGreaterThanOrEqual(0)
  })

  test("builds a stable super-looper manifest description", async () => {
    const description = await buildSuperLooperDescription(process.cwd())

    expect(description).toBe(COMPOUND_DESCRIPTION)
  })

  test("detects plugin and marketplace description drift", async () => {
    const root = await makeFixtureRoot()
    const result = await syncReleaseMetadata({ root, write: false })
    const changedPaths = result.updates.filter((update) => update.changed).map((update) => update.path)

    expect(changedPaths).toContain(
      path.join(root, "plugins", "super-looper", ".claude-plugin", "plugin.json"),
    )
    expect(changedPaths).toContain(
      path.join(root, "plugins", "super-looper", "codex", "super-looper", ".codex-plugin", "plugin.json"),
    )
    expect(changedPaths).toContain(path.join(root, ".claude-plugin", "marketplace.json"))
  })

  test("rewrites the plugin manifest description on write", async () => {
    const root = await makeFixtureRoot()
    const pluginPath = path.join(root, "plugins", "super-looper", ".claude-plugin", "plugin.json")

    await syncReleaseMetadata({ root, write: true })

    const after = JSON.parse(await Bun.file(pluginPath).text())
    expect(after.description).toBe(COMPOUND_DESCRIPTION)
  })

  test("keeps the Claude and Codex plugin metadata in lockstep", async () => {
    const root = await makeFixtureRoot()
    const codexPath = path.join(
      root,
      "plugins",
      "super-looper",
      "codex",
      "super-looper",
      ".codex-plugin",
      "plugin.json",
    )

    await syncReleaseMetadata({
      root,
      write: true,
      componentVersions: { "super-looper": "2.43.0" },
    })

    const after = JSON.parse(await Bun.file(codexPath).text())
    expect(after.version).toBe("2.43.0")
    expect(after.description).toBe(COMPOUND_DESCRIPTION)
    expect(after.author).toEqual({ name: "Example" })
  })

  test("rewrites the marketplace plugin description on write", async () => {
    const root = await makeFixtureRoot()
    const marketplacePath = path.join(root, ".claude-plugin", "marketplace.json")

    await syncReleaseMetadata({ root, write: true })

    const after = JSON.parse(await Bun.file(marketplacePath).text())
    const entry = after.plugins.find((p: { name: string }) => p.name === "super-looper")
    expect(entry.description).toBe(COMPOUND_MARKETPLACE_DESCRIPTION)
  })

  test("applies the marketplace version override on write", async () => {
    const root = await makeFixtureRoot()
    const marketplacePath = path.join(root, ".claude-plugin", "marketplace.json")

    await syncReleaseMetadata({
      root,
      write: true,
      componentVersions: { marketplace: "1.2.3" },
    })

    const after = JSON.parse(await Bun.file(marketplacePath).text())
    expect(after.metadata.version).toBe("1.2.3")
  })

  test("reports no structural errors for a dual-host fixture", async () => {
    const root = await makeFixtureRoot()
    const result = await syncReleaseMetadata({ root, write: false })
    expect(result.errors).toEqual([])
  })

  test("rejects an invalid Codex marketplace source", async () => {
    const root = await makeFixtureRoot()
    const marketplacePath = path.join(root, ".agents", "plugins", "marketplace.json")
    const marketplace = JSON.parse(await Bun.file(marketplacePath).text())
    marketplace.plugins[0].source.path = "../super-looper"
    await writeFile(marketplacePath, JSON.stringify(marketplace, null, 2))

    const result = await syncReleaseMetadata({ root, write: false })
    expect(result.errors).toContain(
      'Codex marketplace source must point to "./plugins/super-looper/codex/super-looper"',
    )
  })
})
