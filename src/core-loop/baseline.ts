import { promises as fs } from "node:fs"
import path from "node:path"

export const CORE_LOOP_SKILLS = [
  "lfg",
  "sl-plan",
  "sl-work",
  "sl-code-review",
  "sl-learn",
  "sl-compound",
  "sl-strategy",
] as const

type FileMetric = {
  path: string
  lines: number
  bytes: number
}

type CouplingMetric = {
  files: number
  occurrences: number
}

export type CoreLoopBaseline = {
  schema_version: 1
  components: FileMetric[]
  totals: {
    main_instruction_lines: number
    main_instruction_bytes: number
    markdown_lines_in_core_skill_trees: number
    markdown_bytes_in_core_skill_trees: number
    agents: number
    skills: number
    eval_suites: number
  }
  host_coupling: {
    blocking_question_tools: CouplingMetric
    claude_skill_dir: CouplingMetric
    claude_paths_or_commands: CouplingMetric
    typed_agent_dispatch: CouplingMetric
  }
}

function lineCount(value: string): number {
  if (value.length === 0) return 0
  return value.endsWith("\n") ? value.split("\n").length - 1 : value.split("\n").length
}

async function fileMetric(root: string, relativePath: string): Promise<FileMetric> {
  const content = await fs.readFile(path.join(root, relativePath), "utf8")
  return {
    path: relativePath,
    lines: lineCount(content),
    bytes: Buffer.byteLength(content),
  }
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)))
    } else if (entry.isFile()) {
      files.push(fullPath)
    }
  }

  return files
}

async function countNamedFiles(root: string, name: string): Promise<number> {
  return (await walkFiles(root)).filter((file) => path.basename(file) === name).length
}

async function countTopLevelFiles(root: string, suffix: string): Promise<number> {
  const entries = await fs.readdir(root, { withFileTypes: true })
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(suffix)).length
}

async function couplingMetric(files: string[], pattern: RegExp): Promise<CouplingMetric> {
  let matchingFiles = 0
  let occurrences = 0

  for (const file of files) {
    const content = await fs.readFile(file, "utf8")
    const matches = content.match(pattern) ?? []
    if (matches.length > 0) matchingFiles += 1
    occurrences += matches.length
  }

  return { files: matchingFiles, occurrences }
}

export async function captureCoreLoopBaseline(root = process.cwd()): Promise<CoreLoopBaseline> {
  const pluginRoot = path.join(root, "plugins", "super-looper")
  const skillsRoot = path.join(pluginRoot, "skills")
  const coreSkillRoots = CORE_LOOP_SKILLS.map((skill) => path.join(skillsRoot, skill))
  const coreFiles = (await Promise.all(coreSkillRoots.map(walkFiles))).flat()
  const coreMarkdownFiles = coreFiles.filter((file) => file.endsWith(".md"))

  const components = await Promise.all(
    CORE_LOOP_SKILLS.map((skill) =>
      fileMetric(root, path.join("plugins", "super-looper", "skills", skill, "SKILL.md")),
    ),
  )
  const markdownMetrics = await Promise.all(
    coreMarkdownFiles.map((file) => fileMetric(root, path.relative(root, file))),
  )

  return {
    schema_version: 1,
    components,
    totals: {
      main_instruction_lines: components.reduce((sum, metric) => sum + metric.lines, 0),
      main_instruction_bytes: components.reduce((sum, metric) => sum + metric.bytes, 0),
      markdown_lines_in_core_skill_trees: markdownMetrics.reduce(
        (sum, metric) => sum + metric.lines,
        0,
      ),
      markdown_bytes_in_core_skill_trees: markdownMetrics.reduce(
        (sum, metric) => sum + metric.bytes,
        0,
      ),
      agents: await countTopLevelFiles(path.join(pluginRoot, "agents"), ".md"),
      skills: await countNamedFiles(skillsRoot, "SKILL.md"),
      eval_suites: await countNamedFiles(skillsRoot, "evals.json"),
    },
    host_coupling: {
      blocking_question_tools: await couplingMetric(
        coreMarkdownFiles,
        /AskUserQuestion|ToolSearch/g,
      ),
      claude_skill_dir: await couplingMetric(coreMarkdownFiles, /\$\{CLAUDE_SKILL_DIR\}/g),
      claude_paths_or_commands: await couplingMetric(
        coreMarkdownFiles,
        /~\/\.claude|\.claude\/|claude --|claude plugin/g,
      ),
      typed_agent_dispatch: await couplingMetric(
        coreMarkdownFiles,
        /`Agent` tool|`Task` tool|subagent_type|Agent\(|Task\(/g,
      ),
    },
  }
}
