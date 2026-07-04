// src/docs/emit-skills-index.ts
// Generates docs/skills/README.md — the index of user-facing skill docs — from
// each skill's SKILL.md frontmatter (name + description). The curated per-skill
// pages stay hand-written (plugin AGENTS.md convention); only this index is
// generated, so a skill's one-line summary can never drift from its frontmatter.
//
// Mirrors src/solutions/emit.ts: a pure render plus an emitSkillsIndex({root,
// write}) that diffs against disk and returns FileUpdate[], writing only when
// write && changed — one code path for both --write and --check.

import fs from "fs"
import path from "path"
import { parseFrontmatter } from "../utils/frontmatter"
import { readText, writeText } from "../utils/files"

export type FileUpdate = {
  path: string
  changed: boolean
}

const SKILLS_DIR = "plugins/super-looper/skills"
const INDEX_PATH = "docs/skills/README.md"

export type SkillEntry = {
  name: string
  oneLine: string
}

// Reduce a SKILL.md description to a single index line: collapse whitespace,
// keep the first sentence (the "what it does" clause before the "Use when …"
// triggers), drop a trailing terminator, and escape pipes so the table cell
// can't break.
export function oneLine(description: string): string {
  const collapsed = description.replace(/\s+/g, " ").trim()
  const match = collapsed.match(/^(.*?[.!?])(\s|$)/)
  const sentence = match ? match[1] : collapsed
  return sentence
    .replace(/[.!?]+$/, "")
    .trim()
    .replace(/\|/g, "\\|")
}

// Read every skill directory's frontmatter, sorted by directory name.
export function readSkills(root: string): SkillEntry[] {
  const skillsDir = path.join(root, SKILLS_DIR)
  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const skillPath = path.join(skillsDir, name, "SKILL.md")
      const { data } = parseFrontmatter(fs.readFileSync(skillPath, "utf8"), skillPath)
      const description = typeof data.description === "string" ? data.description : ""
      return { name, oneLine: oneLine(description) }
    })
}

export function renderSkillsIndex(root: string): string {
  const rows = readSkills(root)
    .map((skill) => `| [\`${skill.name}\`](./${skill.name}.md) | ${skill.oneLine} |`)
    .join("\n")

  return `# Skill Documentation

<!-- GENERATED FILE — do not edit by hand. Run \`bun run docs:emit-index\` to regenerate. -->
<!-- Source of truth: each skill's SKILL.md frontmatter under ${SKILLS_DIR}/. -->

End-user-facing index of super-looper plugin skills. Every row links to a hand-written page covering that skill's purpose, novel mechanics, and chain position. This index is generated from each skill's \`SKILL.md\` frontmatter, so the one-line summaries below never drift from the source; the linked pages are curated by hand.

For runtime behavior and contributor reference, the \`SKILL.md\` in each skill's source folder under \`${SKILLS_DIR}/\` is authoritative.

| Skill | What it does |
|-------|--------------|
${rows}

---

For the complete catalog grouped by category (core loop, git workflow, research, and more), see [\`plugins/super-looper/README.md\`](../../plugins/super-looper/README.md).
`
}

export async function emitSkillsIndex(
  options: { root?: string; write?: boolean } = {},
): Promise<FileUpdate[]> {
  const root = options.root ?? process.cwd()
  const write = options.write ?? false
  const content = renderSkillsIndex(root)
  const filePath = path.join(root, INDEX_PATH)

  // Read directly and treat a missing file as "no current content" rather than
  // pre-checking existence (one syscall, no TOCTOU window).
  const existing = await readText(filePath).catch((err: unknown) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
    throw err
  })
  const changed = existing !== content
  if (write && changed) await writeText(filePath, content)
  return [{ path: filePath, changed }]
}
