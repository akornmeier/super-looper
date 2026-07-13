import { promises as fs } from "fs"
import path from "path"
import { readJson, writeJson } from "../utils/files"
import type { ReleaseComponent } from "./types"

type ClaudePluginManifest = {
  name?: string
  version: string
  description?: string
  author?: {
    name?: string
    email?: string
    url?: string
  }
  mcpServers?: Record<string, unknown>
}

type CodexPluginManifest = ClaudePluginManifest & {
  skills?: string
}

type MarketplaceManifest = {
  metadata: {
    version: string
    description?: string
  }
  plugins: Array<{
    name: string
    version?: string
    description?: string
  }>
}

type CodexMarketplaceManifest = {
  name?: string
  interface?: {
    displayName?: string
  }
  plugins: Array<{
    name: string
    source?: {
      source?: string
      path?: string
    }
    policy?: {
      installation?: string
      authentication?: string
    }
    category?: string
  }>
}

type SyncOptions = {
  root?: string
  componentVersions?: Partial<Record<ReleaseComponent, string>>
  write?: boolean
}

type FileUpdate = {
  path: string
  changed: boolean
}

export type MetadataSyncResult = {
  updates: FileUpdate[]
  errors: string[]
}

export type SuperLooperCounts = {
  agents: number
  skills: number
  mcpServers: number
}

const SUPER_LOOPER_DESCRIPTION =
  "AI-powered development tools for code review, research, design, and workflow automation."

const SUPER_LOOPER_MARKETPLACE_DESCRIPTION =
  "AI-powered development tools that get smarter with every use. Make each unit of engineering work easier than the last."

const SUPER_LOOPER_PLUGIN_NAME = "super-looper"
const SUPER_LOOPER_SKILLS_PATH = "./skills/"
const SUPER_LOOPER_SOURCE_PATH = "./plugins/super-looper/codex/super-looper"

function resolveExpectedVersion(
  explicitVersion: string | undefined,
  fallbackVersion: string,
): string {
  return explicitVersion ?? fallbackVersion
}

export async function countMarkdownFiles(root: string): Promise<number> {
  const entries = await fs.readdir(root, { withFileTypes: true })
  let total = 0

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      total += await countMarkdownFiles(fullPath)
      continue
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      total += 1
    }
  }

  return total
}

export async function countSkillDirectories(root: string): Promise<number> {
  const entries = await fs.readdir(root, { withFileTypes: true })
  let total = 0

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillPath = path.join(root, entry.name, "SKILL.md")
    try {
      await fs.access(skillPath)
      total += 1
    } catch {
      // Ignore non-skill directories.
    }
  }

  return total
}

export async function countMcpServers(pluginRoot: string): Promise<number> {
  const mcpPath = path.join(pluginRoot, ".mcp.json")
  try {
    const manifest = await readJson<{ mcpServers?: Record<string, unknown> }>(mcpPath)
    return Object.keys(manifest.mcpServers ?? {}).length
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0
    throw err
  }
}

export async function getSuperLooperCounts(root: string): Promise<SuperLooperCounts> {
  const pluginRoot = path.join(root, "plugins", "super-looper")
  const [agents, skills, mcpServers] = await Promise.all([
    countMarkdownFiles(path.join(pluginRoot, "agents")),
    countSkillDirectories(path.join(pluginRoot, "skills")),
    countMcpServers(pluginRoot),
  ])

  return { agents, skills, mcpServers }
}

export async function buildSuperLooperDescription(_root: string): Promise<string> {
  return SUPER_LOOPER_DESCRIPTION
}

export async function buildSuperLooperMarketplaceDescription(_root: string): Promise<string> {
  return SUPER_LOOPER_MARKETPLACE_DESCRIPTION
}

export async function syncReleaseMetadata(options: SyncOptions = {}): Promise<MetadataSyncResult> {
  const root = options.root ?? process.cwd()
  const write = options.write ?? false
  const versions = options.componentVersions ?? {}
  const updates: FileUpdate[] = []
  const errors: string[] = []

  const compoundDescription = await buildSuperLooperDescription(root)
  const compoundMarketplaceDescription = await buildSuperLooperMarketplaceDescription(root)

  const compoundClaudePath = path.join(root, "plugins", "super-looper", ".claude-plugin", "plugin.json")
  const compoundCodexPath = path.join(
    root,
    "plugins",
    "super-looper",
    "codex",
    "super-looper",
    ".codex-plugin",
    "plugin.json",
  )
  const marketplaceClaudePath = path.join(root, ".claude-plugin", "marketplace.json")
  const marketplaceCodexPath = path.join(root, ".agents", "plugins", "marketplace.json")

  const compoundClaude = await readJson<ClaudePluginManifest>(compoundClaudePath)
  const compoundCodex = await readJson<CodexPluginManifest>(compoundCodexPath)
  const marketplaceClaude = await readJson<MarketplaceManifest>(marketplaceClaudePath)
  const marketplaceCodex = await readJson<CodexMarketplaceManifest>(marketplaceCodexPath)
  const expectedCompoundVersion = resolveExpectedVersion(
    versions["super-looper"],
    compoundClaude.version,
  )

  let changed = false
  if (compoundClaude.version !== expectedCompoundVersion) {
    compoundClaude.version = expectedCompoundVersion
    changed = true
  }
  if (compoundClaude.description !== compoundDescription) {
    compoundClaude.description = compoundDescription
    changed = true
  }
  updates.push({ path: compoundClaudePath, changed })
  if (write && changed) await writeJson(compoundClaudePath, compoundClaude)

  changed = false
  if (compoundCodex.version !== expectedCompoundVersion) {
    compoundCodex.version = expectedCompoundVersion
    changed = true
  }
  if (compoundCodex.description !== compoundDescription) {
    compoundCodex.description = compoundDescription
    changed = true
  }
  if (JSON.stringify(compoundCodex.author) !== JSON.stringify(compoundClaude.author)) {
    compoundCodex.author = compoundClaude.author
    changed = true
  }
  updates.push({ path: compoundCodexPath, changed })
  if (write && changed) await writeJson(compoundCodexPath, compoundCodex)

  changed = false
  if (versions.marketplace && marketplaceClaude.metadata.version !== versions.marketplace) {
    marketplaceClaude.metadata.version = versions.marketplace
    changed = true
  }

  for (const plugin of marketplaceClaude.plugins) {
    if (plugin.name === "super-looper") {
      if (plugin.description !== compoundMarketplaceDescription) {
        plugin.description = compoundMarketplaceDescription
        changed = true
      }
    }
    // Plugin versions are not synced in marketplace.json -- the canonical
    // version lives in each plugin's own plugin.json. Duplicating versions
    // here creates drift that release-please can't maintain.
  }

  updates.push({ path: marketplaceClaudePath, changed })
  if (write && changed) await writeJson(marketplaceClaudePath, marketplaceClaude)

  updates.push({ path: marketplaceCodexPath, changed: false })

  if (compoundClaude.name !== SUPER_LOOPER_PLUGIN_NAME) {
    errors.push(`Claude plugin name must be "${SUPER_LOOPER_PLUGIN_NAME}"`)
  }
  if (compoundCodex.name !== compoundClaude.name) {
    errors.push("Claude and Codex plugin names must match")
  }
  if (compoundCodex.skills !== SUPER_LOOPER_SKILLS_PATH) {
    errors.push(`Codex plugin skills must point to "${SUPER_LOOPER_SKILLS_PATH}"`)
  }

  const claudeEntry = marketplaceClaude.plugins.find(
    (plugin) => plugin.name === SUPER_LOOPER_PLUGIN_NAME,
  )
  if (!claudeEntry) {
    errors.push("Claude marketplace must contain the super-looper plugin")
  }

  const codexEntry = marketplaceCodex.plugins.find(
    (plugin) => plugin.name === SUPER_LOOPER_PLUGIN_NAME,
  )
  if (!codexEntry) {
    errors.push("Codex marketplace must contain the super-looper plugin")
  } else {
    if (codexEntry.source?.source !== "local") {
      errors.push('Codex marketplace source must use "local"')
    }
    if (codexEntry.source?.path !== SUPER_LOOPER_SOURCE_PATH) {
      errors.push(`Codex marketplace source must point to "${SUPER_LOOPER_SOURCE_PATH}"`)
    }
    if (codexEntry.policy?.installation !== "AVAILABLE") {
      errors.push('Codex marketplace installation policy must be "AVAILABLE"')
    }
    if (codexEntry.policy?.authentication !== "ON_INSTALL") {
      errors.push('Codex marketplace authentication policy must be "ON_INSTALL"')
    }
    if (!codexEntry.category) {
      errors.push("Codex marketplace plugin category is required")
    }
  }

  return { updates, errors }
}
