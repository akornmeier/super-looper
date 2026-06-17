#!/usr/bin/env bun
// scripts/solutions/validate-frontmatter.ts
// Repo-side enum gate over docs/solutions/ frontmatter. Thin argv/exit shell;
// the validation logic lives in src/solutions/validate.ts.
//
// Usage:
//   bun run scripts/solutions/validate-frontmatter.ts <doc.md>        # one file
//   bun run scripts/solutions/validate-frontmatter.ts docs/solutions  # corpus
// Exit codes: 0 = valid, 1 = invalid, 2 = usage error.

import { promises as fs } from "node:fs"
import { readText, walkFiles } from "../../src/utils/files"
import { validateFrontmatter } from "../../src/solutions/validate"

const target = process.argv[2]
if (!target) {
  console.error("usage: validate-frontmatter <doc.md | docs/solutions>")
  process.exit(2)
}

async function validateOne(filePath: string): Promise<boolean> {
  const result = validateFrontmatter(await readText(filePath), filePath)
  if (result.valid) {
    console.log(`OK: ${filePath}`)
    return true
  }
  console.error(`INVALID: ${filePath}`)
  for (const error of result.errors) {
    // error.message may span multiple lines (e.g. parseFrontmatter appends a
    // "Tip:" line); indent continuation lines so they stay under the field.
    const message = error.message.replace(/\n/g, "\n  ")
    console.error(`  ${error.field}: ${message}`)
  }
  return false
}

let stat: Awaited<ReturnType<typeof fs.stat>>
try {
  stat = await fs.stat(target)
} catch (err) {
  const detail =
    (err as NodeJS.ErrnoException).code ??
    (err instanceof Error ? err.message : String(err))
  console.error(`usage: cannot read "${target}" (${detail})`)
  process.exit(2)
}

let ok = true
if (stat.isDirectory()) {
  // Corpus mode: walkFiles returns every file regardless of extension, so
  // filter to .md (mirrors countMarkdownFiles in src/release/metadata.ts).
  const files = (await walkFiles(target)).filter((file) => file.endsWith(".md"))
  for (const file of files) {
    if (!(await validateOne(file))) ok = false
  }
} else {
  ok = await validateOne(target)
}

process.exit(ok ? 0 : 1)
