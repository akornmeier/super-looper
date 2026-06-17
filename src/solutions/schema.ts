// src/solutions/schema.ts
// Single source of truth for docs/solutions/ frontmatter written by sl-compound.
// Retargeted from the Rails-flavored upstream enums to a TS/React/Vue/a11y stack.
//
// Run the validator with Bun: `bun run scripts/solutions/validate-frontmatter.ts <doc.md>`
// Deps: `bun add zod`
//
// Design rule: this file is the ONLY place enums live. The model-facing docs
// (yaml-schema.md) are generated from here, so there is no 4-file drift to maintain.

import { z } from "zod";

// --- Enums (the only source of truth) ---------------------------------------

export const BUG_PROBLEM_TYPES = [
  "build_error",
  "test_failure",
  "runtime_error",
  "performance_issue",
  "database_issue",
  "security_issue",
  "ui_bug",
  "integration_issue",
  "logic_error",
] as const;

export const KNOWLEDGE_PROBLEM_TYPES = [
  "best_practice",
  "documentation_gap",
  "workflow_issue",
  "developer_experience",
  "architecture_pattern",
  "design_pattern",
  "tooling_decision",
  "convention",
] as const;

export const COMPONENTS = [
  "react_component",
  "vue_component",
  "design_system",
  "accessibility_rule",
  "browser_extension",
  "mcp_server",
  "backend_function",
  "api_client",
  "state_management",
  "routing",
  "styling",
  "types",
  "database",
  "authentication",
  "build_tooling",
  "e2e_test",
  "storybook",
  "testing_framework",
  "development_workflow",
  "documentation",
  "tooling",
] as const;

export const ROOT_CAUSES = [
  "wrong_api",
  "type_error",
  "logic_error",
  "stale_closure",
  "missing_dependency",
  "reactivity_bug",
  "hydration_mismatch",
  "race_condition",
  "async_timing",
  "missing_aria",
  "focus_management",
  "memory_leak",
  "config_error",
  "bundler_config",
  "dependency_conflict",
  "missing_validation",
  "missing_permission",
  "test_isolation",
  "missing_workflow_step",
  "inadequate_documentation",
  "missing_tooling",
  "incomplete_setup",
] as const;

export const RESOLUTION_TYPES = [
  "code_fix",
  "migration",
  "config_change",
  "test_fix",
  "dependency_update",
  "environment_setup",
  "workflow_improvement",
  "documentation_update",
  "tooling_addition",
  "seed_data_update",
] as const;

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;

// Derived union types — free, no duplication.
export type Component = (typeof COMPONENTS)[number];
export type RootCause = (typeof ROOT_CAUSES)[number];

// --- Schemas ----------------------------------------------------------------

const shared = {
  module: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  component: z.enum(COMPONENTS),
  severity: z.enum(SEVERITIES),
  related_components: z.array(z.string()).optional(),
  tags: z.array(z.string()).max(8).optional(),
};

export const bugSchema = z.object({
  ...shared,
  problem_type: z.enum(BUG_PROBLEM_TYPES),
  symptoms: z.array(z.string()).min(1).max(5),
  root_cause: z.enum(ROOT_CAUSES),
  resolution_type: z.enum(RESOLUTION_TYPES),
  framework_version: z.string().optional(), // e.g. "react@19.0.0", "vue@3.5.13"
});

export const knowledgeSchema = z.object({
  ...shared,
  problem_type: z.enum(KNOWLEDGE_PROBLEM_TYPES),
  applies_when: z.array(z.string()).max(5).optional(),
  symptoms: z.array(z.string()).max(5).optional(),
  root_cause: z.enum(ROOT_CAUSES).optional(),
  resolution_type: z.enum(RESOLUTION_TYPES).optional(),
});

export type Learning =
  | z.infer<typeof bugSchema>
  | z.infer<typeof knowledgeSchema>;

/** Pick the right schema from problem_type. Returns null for unknown types. */
export function schemaFor(problemType: unknown) {
  if ((BUG_PROBLEM_TYPES as readonly string[]).includes(problemType as string))
    return bugSchema;
  if (
    (KNOWLEDGE_PROBLEM_TYPES as readonly string[]).includes(
      problemType as string,
    )
  )
    return knowledgeSchema;
  return null;
}
