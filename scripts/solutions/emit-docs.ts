#!/usr/bin/env bun
// scripts/solutions/emit-docs.ts
// Generates yaml-schema.md + schema.yaml into both consuming skills from the
// single source (src/solutions/schema.ts + doc-model.ts). Thin argv/exit shell;
// the diff/write logic lives in src/solutions/emit.ts.
//
// Usage:
//   bun run scripts/solutions/emit-docs.ts --write   # regenerate the docs
//   bun run scripts/solutions/emit-docs.ts           # check for drift (exit 1)
//   bun run scripts/solutions/emit-docs.ts --check    # same as default

import { emitDocs } from "../../src/solutions/emit"

const write = process.argv.includes("--write")
const updates = await emitDocs({ write })

if (write) {
  for (const update of updates) {
    console.log(`${update.changed ? "update" : "keep"} ${update.path}`)
  }
  process.exit(0)
}

const drifted = updates.filter((update) => update.changed)
if (drifted.length === 0) {
  console.log("docs/solutions schema docs are in sync.")
  process.exit(0)
}

console.error("Schema doc drift detected (run `bun run solutions:emit` to fix):")
for (const update of drifted) {
  console.error(`- ${update.path}`)
}
process.exit(1)
