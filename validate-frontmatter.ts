// validate-frontmatter.ts
// Real enum validation for docs/solutions/ learning docs.
// Parses frontmatter with js-yaml (already a repo dependency) and validates
// against the zod schemas in schema.ts (the single source of truth).
//
// Run: bun validate-frontmatter.ts <doc.md>
// Exit codes: 0 = valid, 1 = invalid, 2 = usage error.

import { load } from "js-yaml";
import { readFileSync } from "node:fs";
import { schemaFor } from "./schema";

const path = process.argv[2];
if (!path) {
  console.error("usage: validate-frontmatter <doc.md>");
  process.exit(2);
}

const raw = readFileSync(path, "utf8");
const block = raw.match(/^---\n([\s\S]*?)\n---/);
if (!block) {
  console.error(`✗ ${path}: no YAML frontmatter block`);
  process.exit(1);
}

let data: Record<string, unknown>;
try {
  data = (load(block[1]) ?? {}) as Record<string, unknown>;
} catch (e) {
  console.error(`✗ ${path}: unparseable frontmatter — ${(e as Error).message}`);
  process.exit(1);
}

const schema = schemaFor(data.problem_type);
if (!schema) {
  console.error(`✗ ${path}: unknown problem_type "${String(data.problem_type)}"`);
  process.exit(1);
}

const res = schema.safeParse(data);
if (!res.success) {
  console.error(`✗ ${path}`);
  for (const issue of res.error.issues) {
    console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(1);
}

console.log(`OK: ${path}`);
