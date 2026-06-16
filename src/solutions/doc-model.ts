// src/solutions/doc-model.ts
// The non-enum half of the docs/solutions/ frontmatter contract: field and
// track descriptions, the problem_type -> category-directory map, and the
// YAML-safety reserved-indicator list. Everything here is typed against the
// schema.ts enums, so adding a problem_type without a CATEGORY_MAP entry is a
// compile error (and is caught at runtime by the emit coverage test). Enum
// values themselves live ONLY in schema.ts.

import { BUG_PROBLEM_TYPES, KNOWLEDGE_PROBLEM_TYPES } from "./schema"

export type ProblemType =
  | (typeof BUG_PROBLEM_TYPES)[number]
  | (typeof KNOWLEDGE_PROBLEM_TYPES)[number]

export const TRACK_DESCRIPTIONS = {
  bug: "Defects, failures, and errors that were diagnosed and fixed",
  knowledge:
    "Practices, patterns, conventions, decisions, workflow improvements, and documentation",
} as const

export const FIELD_DESCRIPTIONS = {
  shared: {
    module: "Module or area affected",
    date: "Date documented (YYYY-MM-DD)",
    problem_type:
      "Primary category — determines track (bug vs knowledge). Prefer the narrowest applicable value; best_practice is the fallback when no narrower knowledge-track value fits.",
    component: "Component involved",
    severity: "Impact severity",
  },
  bug: {
    symptoms: "Observable symptoms such as errors or broken behavior",
    root_cause: "Fundamental technical cause of the problem",
    resolution_type: "Type of fix applied",
    framework_version:
      "Framework and version, e.g. react@19.0.0 or vue@3.5.13. Only relevant for bug-track docs.",
  },
  knowledge: {
    applies_when: "Conditions or situations where this guidance applies",
    symptoms:
      "Observable gaps or friction that prompted this guidance (optional for knowledge track)",
    root_cause:
      "Underlying cause, if there is a specific one (optional for knowledge track)",
    resolution_type: "Type of change, if applicable (optional for knowledge track)",
  },
  optional: {
    related_components: "Other components involved",
    tags: "Search keywords, lowercase and hyphen-separated",
  },
} as const

// problem_type -> destination directory. Typed-complete (one entry per
// problem_type). These values preserve the current mapping and are NOT
// authoritative for on-disk layout until the taxonomy is reconciled (OQ1):
// some listed directories (e.g. build-errors/, conventions/) do not exist yet.
export const CATEGORY_MAP: Record<ProblemType, string> = {
  build_error: "docs/solutions/build-errors/",
  test_failure: "docs/solutions/test-failures/",
  runtime_error: "docs/solutions/runtime-errors/",
  performance_issue: "docs/solutions/performance-issues/",
  database_issue: "docs/solutions/database-issues/",
  security_issue: "docs/solutions/security-issues/",
  ui_bug: "docs/solutions/ui-bugs/",
  integration_issue: "docs/solutions/integration-issues/",
  logic_error: "docs/solutions/logic-errors/",
  best_practice: "docs/solutions/best-practices/",
  documentation_gap: "docs/solutions/documentation-gaps/",
  workflow_issue: "docs/solutions/workflow-issues/",
  developer_experience: "docs/solutions/developer-experience/",
  architecture_pattern: "docs/solutions/architecture-patterns/",
  design_pattern: "docs/solutions/design-patterns/",
  tooling_decision: "docs/solutions/tooling-decisions/",
  convention: "docs/solutions/conventions/",
}

// YAML reserved indicator characters that must be quoted when they START an
// array-of-strings item. Consumed by the emit template's YAML Safety Rules.
export const YAML_RESERVED_INDICATORS = [
  "`",
  "[",
  "*",
  "&",
  "!",
  "|",
  ">",
  "%",
  "@",
  "?",
] as const
