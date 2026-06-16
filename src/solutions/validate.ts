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
  // written in the file. A date-only value hydrates to UTC midnight; normalize
  // it back to its YYYY-MM-DD string. A value carrying a time or offset
  // component is NOT a plain date — keep it as a full ISO string so the
  // schema's YYYY-MM-DD regex rejects it rather than silently day-shifting it.
  if (data.date instanceof Date) {
    const d = data.date
    const isDateOnly =
      d.getUTCHours() === 0 &&
      d.getUTCMinutes() === 0 &&
      d.getUTCSeconds() === 0 &&
      d.getUTCMilliseconds() === 0
    data.date = isDateOnly ? d.toISOString().slice(0, 10) : d.toISOString()
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
