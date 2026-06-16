// src/solutions/emit.ts
// Renders yaml-schema.md and schema.yaml from the single source (schema.ts
// enums + doc-model.ts metadata) and emits both into each consuming skill.
// Mirrors src/release/metadata.ts syncReleaseMetadata: a pure render plus an
// emitDocs({root, write}) that diffs against disk and returns FileUpdate[],
// writing only when write && changed — one code path for both --write and
// --check.

import path from "path"
import {
  BUG_PROBLEM_TYPES,
  KNOWLEDGE_PROBLEM_TYPES,
  COMPONENTS,
  ROOT_CAUSES,
  RESOLUTION_TYPES,
  SEVERITIES,
} from "./schema"
import {
  CATEGORY_MAP,
  FIELD_DESCRIPTIONS,
  TRACK_DESCRIPTIONS,
  YAML_RESERVED_INDICATORS,
  type ProblemType,
} from "./doc-model"
import { readText, writeText } from "../utils/files"

export type FileUpdate = {
  path: string
  changed: boolean
}

const ALL_PROBLEM_TYPES: ProblemType[] = [
  ...BUG_PROBLEM_TYPES,
  ...KNOWLEDGE_PROBLEM_TYPES,
]

// Skills that consume the generated contract. Both copies are written from one
// render, so they are byte-identical by construction (guarded by U4's
// cross-copy identity test).
const DESTINATIONS = [
  "plugins/super-looper/skills/sl-compound/references",
  "plugins/super-looper/skills/sl-compound-refresh/references",
] as const

function code(value: string): string {
  return "`" + value + "`"
}

function codeList(values: readonly string[]): string {
  return values.map(code).join(", ")
}

function yamlList(values: readonly string[], indent: string): string {
  return values.map((value) => `${indent}- ${value}`).join("\n")
}

// --- yaml-schema.md ---------------------------------------------------------

export function renderYamlSchemaMd(): string {
  const F = FIELD_DESCRIPTIONS
  const categoryRows = ALL_PROBLEM_TYPES.map(
    (pt) => `- ${code(pt)} -> ${code(CATEGORY_MAP[pt])}`,
  ).join("\n")
  const reservedList = YAML_RESERVED_INDICATORS.map((ch) =>
    ch === "`" ? "`` ` ``" : code(ch),
  ).join(", ")

  return `# YAML Frontmatter Schema

<!-- GENERATED FILE — do not edit by hand. Run \`bun run solutions:emit\` to regenerate. -->
<!-- Source of truth: src/solutions/schema.ts (enums) + src/solutions/doc-model.ts. -->

\`schema.yaml\` in this directory is the canonical contract for \`docs/solutions/\` frontmatter written by \`sl-compound\`.

Use this file as the quick reference for:
- required fields
- enum values
- validation expectations
- category mapping
- track classification (bug vs knowledge)

## Tracks

The \`problem_type\` determines which **track** applies. Each track has different required and optional fields.

| Track | problem_types | Description |
|-------|--------------|-------------|
| **Bug** | ${codeList(BUG_PROBLEM_TYPES)} | ${TRACK_DESCRIPTIONS.bug} |
| **Knowledge** | ${codeList(KNOWLEDGE_PROBLEM_TYPES)} | ${TRACK_DESCRIPTIONS.knowledge} |

## Required Fields (both tracks)

- **module**: ${F.shared.module}
- **date**: ${F.shared.date}
- **problem_type**: ${F.shared.problem_type}
- **component**: One of ${codeList(COMPONENTS)}
- **severity**: One of ${codeList(SEVERITIES)}

## Bug Track Fields

Required:
- **symptoms**: ${F.bug.symptoms} (1-5 items)
- **root_cause**: One of ${codeList(ROOT_CAUSES)}
- **resolution_type**: One of ${codeList(RESOLUTION_TYPES)}

## Knowledge Track Fields

No additional required fields beyond the shared ones. All fields below are optional:

- **applies_when**: ${F.knowledge.applies_when}
- **symptoms**: ${F.knowledge.symptoms}
- **root_cause**: ${F.knowledge.root_cause}
- **resolution_type**: ${F.knowledge.resolution_type}

## Optional Fields (both tracks)

- **related_components**: ${F.optional.related_components}
- **tags**: ${F.optional.tags} (max 8)

## Optional Fields (bug track only)

- **framework_version**: ${F.bug.framework_version}

## Backward Compatibility

Docs created before the track system may have \`symptoms\`/\`root_cause\`/\`resolution_type\` on knowledge-type problem_types. These are valid legacy docs:

- Bug-track fields present on a knowledge-track doc are harmless. Do not strip them during refresh unless the doc is being rewritten for other reasons.
- When creating **new** docs, follow the track rules above.

## Category Mapping

> Generated from the schema's \`problem_type\` enum. Not authoritative for on-disk
> layout until the taxonomy is reconciled — some directories below do not exist yet.

${categoryRows}

## Validation Rules

1. Determine the track from \`problem_type\` using the Tracks table.
2. All shared required fields must be present.
3. Bug-track required fields (\`symptoms\`, \`root_cause\`, \`resolution_type\`) must be present on bug-track docs.
4. Knowledge-track docs have no additional required fields beyond the shared ones.
5. Bug-track fields on existing knowledge-track docs are harmless (see Backward Compatibility).
6. Enum fields must match the allowed values exactly.
7. Array fields must respect min/max item counts.
8. \`date\` must match \`YYYY-MM-DD\`.
9. \`framework_version\`, if present, only applies to bug-track docs.

## YAML Safety Rules

Strict YAML 1.2 parsers (\`yq\`, \`js-yaml\` strict, PyYAML) reject array items
that start with a reserved indicator character as unquoted scalars. When
writing items for any array-of-strings field (\`symptoms\`, \`applies_when\`,
\`tags\`, \`related_components\`, or any future array field), wrap the value in
double quotes if it starts with any of:

${reservedList}

Also quote if the value contains the substring \`": "\` — that punctuation
confuses flow-style parsers.

Example — before (breaks strict YAML):

    symptoms:
      - \`sudo dscacheutil -flushcache\` does not restore in-container mDNS

Example — after (parses cleanly):

    symptoms:
      - "\`sudo dscacheutil -flushcache\` does not restore in-container mDNS"

This rule applies to all array-of-strings frontmatter fields. Scalar string
fields like \`description:\` have their own quoting rules (see plugin
\`AGENTS.md\` under "YAML Frontmatter").
`
}

// --- schema.yaml ------------------------------------------------------------

export function renderSchemaYaml(): string {
  const F = FIELD_DESCRIPTIONS
  const q = (value: string): string => JSON.stringify(value)
  const reservedList = YAML_RESERVED_INDICATORS.join(", ")

  return `# Documentation schema for learnings written by sl-compound
# Treat this as the canonical frontmatter contract for docs/solutions/.
#
# GENERATED FILE — do not edit by hand. Run \`bun run solutions:emit\` to regenerate.
# Source of truth: src/solutions/schema.ts (enums) + src/solutions/doc-model.ts.
#
# The schema has two tracks based on problem_type:
#   Bug track  — problem_type is a defect or failure (build_error, test_failure, etc.)
#   Knowledge track — problem_type is guidance or practice (best_practice, workflow_issue, etc.)
#
# Both tracks share the same required core fields. The tracks differ in which
# additional fields are required vs optional (see track_rules below).

# --- Track classification ---------------------------------------------------
tracks:
  bug:
    description: ${q(TRACK_DESCRIPTIONS.bug)}
    problem_types:
${yamlList(BUG_PROBLEM_TYPES, "      ")}
  knowledge:
    description: ${q(TRACK_DESCRIPTIONS.knowledge)}
    problem_types:
${yamlList(KNOWLEDGE_PROBLEM_TYPES, "      ")}

# --- Fields required by BOTH tracks -----------------------------------------
required_fields:
  module:
    type: string
    description: ${q(F.shared.module)}

  date:
    type: string
    pattern: '^\\d{4}-\\d{2}-\\d{2}$'
    description: ${q(F.shared.date)}

  problem_type:
    type: enum
    values:
${yamlList(ALL_PROBLEM_TYPES, "      ")}
    description: ${q(F.shared.problem_type)}

  component:
    type: enum
    values:
${yamlList(COMPONENTS, "      ")}
    description: ${q(F.shared.component)}

  severity:
    type: enum
    values:
${yamlList(SEVERITIES, "      ")}
    description: ${q(F.shared.severity)}

# --- Track-specific rules ----------------------------------------------------
track_rules:
  bug:
    required:
      symptoms:
        type: array[string]
        min_items: 1
        max_items: 5
        description: ${q(F.bug.symptoms)}
      root_cause:
        type: enum
        values:
${yamlList(ROOT_CAUSES, "          ")}
        description: ${q(F.bug.root_cause)}
      resolution_type:
        type: enum
        values:
${yamlList(RESOLUTION_TYPES, "          ")}
        description: ${q(F.bug.resolution_type)}

  knowledge:
    optional:
      applies_when:
        type: array[string]
        max_items: 5
        description: ${q(F.knowledge.applies_when)}
      symptoms:
        type: array[string]
        max_items: 5
        description: ${q(F.knowledge.symptoms)}
      root_cause:
        type: enum
        values:
${yamlList(ROOT_CAUSES, "          ")}
        description: ${q(F.knowledge.root_cause)}
      resolution_type:
        type: enum
        values:
${yamlList(RESOLUTION_TYPES, "          ")}
        description: ${q(F.knowledge.resolution_type)}

# --- Fields optional for BOTH tracks ----------------------------------------
optional_fields:
  related_components:
    type: array[string]
    description: ${q(F.optional.related_components)}

  tags:
    type: array[string]
    max_items: 8
    description: ${q(F.optional.tags)}

# --- Fields optional for bug track only -------------------------------------
bug_optional_fields:
  framework_version:
    type: string
    description: ${q(F.bug.framework_version)}

# --- Backward compatibility --------------------------------------------------
# Docs created before the track system was introduced may have bug-track
# fields (symptoms, root_cause, resolution_type) on knowledge-type
# problem_types. These are valid legacy docs:
#   - Bug-track fields present on a knowledge-track doc are harmless. Do not
#     strip them during refresh unless the doc is being rewritten for other reasons.
#   - When creating NEW docs, follow the track rules above.

# --- Validation rules --------------------------------------------------------
validation_rules:
  - "Determine track from problem_type using the tracks section above"
  - "All shared required_fields must be present"
  - "Bug-track required fields (symptoms, root_cause, resolution_type) must be present on bug-track docs"
  - "Knowledge-track docs have no additional required fields beyond the shared ones"
  - "Bug-track fields on existing knowledge-track docs are harmless (see backward compatibility note)"
  - "Track-specific optional fields may be included but are not required"
  - "Enum fields must match allowed values exactly"
  - "Array fields must respect min_items/max_items when specified"
  - "date must match YYYY-MM-DD format"
  - "framework_version, if provided, only applies to bug-track docs"
  - "tags should be lowercase and hyphen-separated"
  - "Array-of-strings frontmatter items (symptoms, applies_when, tags, related_components, or any future array field) must be wrapped in double quotes when the value starts with a YAML reserved indicator (${reservedList}) or contains the substring \`: \` — otherwise strict YAML parsers reject the file"
`
}

// --- Emit -------------------------------------------------------------------

export async function emitDocs(
  options: { root?: string; write?: boolean } = {},
): Promise<FileUpdate[]> {
  const root = options.root ?? process.cwd()
  const write = options.write ?? false
  const files: Array<[string, string]> = [
    ["yaml-schema.md", renderYamlSchemaMd()],
    ["schema.yaml", renderSchemaYaml()],
  ]

  const updates: FileUpdate[] = []
  for (const dir of DESTINATIONS) {
    for (const [name, content] of files) {
      const filePath = path.join(root, dir, name)
      // Read directly and treat a missing file as "no current content" rather
      // than pre-checking existence (one syscall, no TOCTOU window).
      const existing = await readText(filePath).catch((err: unknown) => {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
        throw err
      })
      const changed = existing !== content
      updates.push({ path: filePath, changed })
      if (write && changed) await writeText(filePath, content)
    }
  }
  return updates
}
