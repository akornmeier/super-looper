#!/usr/bin/env bun
// scripts/docs/emit-skills-index.ts
// Generates docs/skills/README.md from each skill's SKILL.md frontmatter. Thin
// argv/exit shell; the render + diff/write logic lives in
// src/docs/emit-skills-index.ts.
//
// Usage:
//   bun run scripts/docs/emit-skills-index.ts --write   # regenerate the index
//   bun run scripts/docs/emit-skills-index.ts           # check for drift (exit 1)
//   bun run scripts/docs/emit-skills-index.ts --check    # same as default

import { emitSkillsIndex } from "../../src/docs/emit-skills-index"

const write = process.argv.includes("--write")
const updates = await emitSkillsIndex({ write })

if (write) {
  for (const update of updates) {
    console.log(`${update.changed ? "update" : "keep"} ${update.path}`)
  }
  process.exit(0)
}

const drifted = updates.filter((update) => update.changed)
if (drifted.length === 0) {
  console.log("docs/skills index is in sync.")
  process.exit(0)
}

console.error("Skills index drift detected (run `bun run docs:emit-index` to fix):")
for (const update of drifted) {
  console.error(`- ${update.path}`)
}
process.exit(1)
