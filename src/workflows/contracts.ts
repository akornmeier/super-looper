import { z } from "zod"

const idSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be lowercase hyphen-case")

const nodeIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, "must be a lowercase dotted identifier")

export const agentSessionSchema = z
  .object({
    handle: z.string().min(1),
    resumable: z.boolean(),
  })
  .strict()

export const nodeEvidenceSchema = z
  .object({
    summary: z.string().min(1),
    path: z.string().min(1).nullable().default(null),
    command: z.array(z.string()).min(1).nullable().default(null),
    exit_code: z.number().int().nullable().default(null),
  })
  .strict()

export const workflowNodeSchema = z
  .object({
    id: nodeIdSchema,
    kind: z.enum(["code", "agent", "human"]),
    status: z.enum(["pending", "running", "passed", "failed", "blocked"]),
    attempt: z.number().int().nonnegative(),
    phase_id: idSchema.nullable(),
    unit_id: idSchema.nullable(),
    input_paths: z.array(z.string()),
    output_paths: z.array(z.string()),
    session_handle: z.string().min(1).nullable(),
    evidence: z.array(nodeEvidenceSchema),
    next: z.string().min(1).nullable(),
    started_at: z.string().datetime(),
    ended_at: z.string().datetime().nullable(),
  })
  .strict()

export const workflowStateSchema = z
  .object({
    schema_version: z.literal(1),
    stage: z.enum([
      "idle",
      "awaiting-worker",
      "checking",
      "awaiting-repair",
      "awaiting-verifier",
      "review-ready",
      "failed",
    ]),
    current_node: nodeIdSchema.nullable(),
    max_repair_attempts: z.number().int().nonnegative(),
    repair_attempts: z.record(z.string(), z.number().int().nonnegative()),
    sessions: z.record(z.string(), agentSessionSchema),
    nodes: z.array(workflowNodeSchema),
    review: z
      .object({
        status: z.enum(["not-ready", "ready"]),
        packet_path: z.string().min(1).nullable(),
      })
      .strict(),
  })
  .strict()

export const agentResultSchema = z
  .object({
    schema_version: z.literal(1),
    run_id: z.string().min(1),
    phase_id: idSchema,
    unit_id: idSchema,
    role: z.enum(["implementation", "repair"]),
    status: z.enum(["completed", "blocked", "failed"]),
    session: agentSessionSchema.nullable(),
    changed_files: z.array(z.string()).default([]),
    evidence: z.array(z.string().min(1)).default([]),
    risks: z.array(z.string().min(1)).default([]),
    unresolved: z.array(z.string().min(1)).default([]),
  })
  .strict()

export const verifierResultSchema = z
  .object({
    schema_version: z.literal(1),
    run_id: z.string().min(1),
    phase_id: idSchema,
    role: z.literal("verifier"),
    status: z.enum(["passed", "failed", "blocked"]),
    evidence: z.array(z.string().min(1)).default([]),
    findings: z.array(z.string().min(1)).default([]),
    repair_unit_id: idSchema.nullable(),
  })
  .strict()

export const commandSpecSchema = z
  .object({
    argv: z.array(z.string()).min(1),
    cwd: z.string().min(1),
    timeout_seconds: z.number().int().positive().max(1800),
  })
  .strict()

export const commandResultSchema = z
  .object({
    argv: z.array(z.string()).min(1),
    exit_code: z.number().int().nullable(),
    timed_out: z.boolean(),
    duration_ms: z.number().int().nonnegative(),
    stdout_path: z.string().min(1),
    stderr_path: z.string().min(1),
  })
  .strict()

export type WorkflowState = z.infer<typeof workflowStateSchema>
export type WorkflowNode = z.infer<typeof workflowNodeSchema>
export type AgentResult = z.infer<typeof agentResultSchema>
export type VerifierResult = z.infer<typeof verifierResultSchema>
export type CommandSpec = z.infer<typeof commandSpecSchema>
export type CommandResult = z.infer<typeof commandResultSchema>
