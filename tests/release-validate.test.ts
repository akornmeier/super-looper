import { mkdtemp, mkdir, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { afterEach, describe, expect, test } from "bun:test"
import {
  buildSuperLooperDescription,
  buildSuperLooperMarketplaceDescription,
} from "../src/release/metadata"

// Integration coverage for the R19 validator gap: release:validate must flag a
// plugin.json $.version that has drifted from the release-please manifest entry
// release-please owns. Before the fix, plugin.json's version was only ever
// compared against itself, so a hand-bump slipped through. These tests run the
// real scripts/release/validate.ts against a fixture repo (cwd override) so they
// guard the actual wiring, not just the underlying sync helper.

const VALIDATE_SCRIPT = path.join(process.cwd(), "scripts", "release", "validate.ts")
const MANIFEST_SUPER_LOOPER_VERSION = "5.0.0"
const MANIFEST_MARKETPLACE_VERSION = "1.0.0"

const tempRoots: string[] = []

afterEach(async () => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    await Bun.$`rm -rf ${root}`.quiet()
  }
})

// Builds a minimal but complete release fixture whose only intentional drift is
// the plugin.json version (descriptions and marketplace version are written to
// match, so a non-zero exit isolates the version check). `pluginVersion` is the
// hand-set plugin.json $.version to compare against the manifest.
async function makeFixtureRoot(pluginVersion: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "release-validate-"))
  tempRoots.push(root)

  const pluginDescription = await buildSuperLooperDescription(root)
  const marketplaceDescription = await buildSuperLooperMarketplaceDescription(root)

  await mkdir(path.join(root, ".github"), { recursive: true })
  await mkdir(path.join(root, "plugins", "super-looper", "agents"), { recursive: true })
  await mkdir(path.join(root, "plugins", "super-looper", "skills", "sl-plan"), {
    recursive: true,
  })
  await mkdir(path.join(root, "plugins", "super-looper", ".claude-plugin"), {
    recursive: true,
  })
  await mkdir(path.join(root, ".claude-plugin"), { recursive: true })

  await writeFile(
    path.join(root, ".github", "release-please-config.json"),
    JSON.stringify(
      {
        packages: {
          "plugins/super-looper": { "release-type": "simple", "package-name": "super-looper" },
          ".claude-plugin": { "release-type": "simple", "package-name": "marketplace" },
        },
      },
      null,
      2,
    ),
  )
  await writeFile(
    path.join(root, ".github", ".release-please-manifest.json"),
    JSON.stringify(
      {
        "plugins/super-looper": MANIFEST_SUPER_LOOPER_VERSION,
        ".claude-plugin": MANIFEST_MARKETPLACE_VERSION,
      },
      null,
      2,
    ),
  )
  await writeFile(
    path.join(root, "plugins", "super-looper", "agents", "sl-example.md"),
    "# sl-example\n",
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
    JSON.stringify({ version: pluginVersion, description: pluginDescription }, null, 2),
  )
  await writeFile(
    path.join(root, ".claude-plugin", "marketplace.json"),
    JSON.stringify(
      {
        metadata: { version: MANIFEST_MARKETPLACE_VERSION, description: "marketplace" },
        plugins: [{ name: "super-looper", description: marketplaceDescription }],
      },
      null,
      2,
    ),
  )

  return root
}

async function runValidate(root: string): Promise<number> {
  const proc = Bun.spawn(["bun", VALIDATE_SCRIPT], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  })
  return await proc.exited
}

describe("release:validate manifest/plugin.json version sync", () => {
  test("exits non-zero when plugin.json $.version drifts from the manifest", async () => {
    const root = await makeFixtureRoot("5.0.1")
    const exitCode = await runValidate(root)
    expect(exitCode).not.toBe(0)
  })

  test("exits zero when plugin.json $.version matches the manifest", async () => {
    const root = await makeFixtureRoot(MANIFEST_SUPER_LOOPER_VERSION)
    const exitCode = await runValidate(root)
    expect(exitCode).toBe(0)
  })
})
