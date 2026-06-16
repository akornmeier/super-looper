// src/solutions/validate.ts
// Repo-side enum validator for docs/solutions/ frontmatter. Parses frontmatter
// with the shared js-yaml helper and validates against the zod schemas in
// schema.ts (the single source of truth). Logic only — exit-code handling lives
// in scripts/solutions/validate-frontmatter.ts.

import { parseFrontmatter } from "../utils/frontmatter"
import { schemaFor } from "./schema"

export type FieldError = {
  field: string
  message: string
}

export type ValidationResult = {
  valid: boolean
  errors: FieldError[]
}

function fail(field: string, message: string): ValidationResult {
  return { valid: false, errors: [{ field, message }] }
}

export function validateFrontmatter(raw: string, sourcePath?: string): ValidationResult {
  // parseFrontmatter returns empty data (it does not throw) for a missing or
  // unterminated block, and throws only on genuinely unparseable YAML.
  let data: Record<string, unknown>
  try {
    data = parseFrontmatter(raw, sourcePath).data
  } catch (err) {
    return fail("(frontmatter)", err instanceof Error ? err.message : String(err))
  }

  if (Object.keys(data).length === 0) {
    return fail("(frontmatter)", "missing or empty YAML frontmatter block")
  }

  // js-yaml hydrates an unquoted `date: 2026-06-16` into a Date (YAML 1.1
  // timestamp type), but the schema's contract is a YYYY-MM-DD string as
  // written in the file. Normalize back to that string before validating.
  // Date-only timestamps are stored as UTC midnight, so the UTC slice is exact.
  if (data.date instanceof Date) {
    data.date = data.date.toISOString().slice(0, 10)
  }

  const schema = schemaFor(data.problem_type)
  if (!schema) {
    return fail("problem_type", `unknown problem_type "${String(data.problem_type)}"`)
  }

  const result = schema.safeParse(data)
  if (result.success) {
    return { valid: true, errors: [] }
  }

  const errors = result.error.issues.map((issue) => ({
    field: issue.path.map(String).join(".") || "(root)",
    message: issue.message,
  }))
  return { valid: false, errors }
}
