import { z } from "zod"
import { profileNameSchema } from "./profiles"

const idSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be lowercase hyphen-case")

const nodeIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, "must be a lowercase dotted identifier")

const repoPathSchema = z.string().min(1).superRefine((value, ctx) => {
  const normalized = value.replaceAll("\\", "/")
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || normalized.split("/").includes("..")) {
    ctx.addIssue({ code: "custom", message: "must stay inside the repository" })
  }
})

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

export const isolationStateSchema = z
  .object({
    available: z.array(z.enum(["sandbox", "worktree", "shared"])).min(1),
    selected: z.enum(["sandbox", "worktree", "shared"]),
    requested_workers: z.number().int().min(1).max(3),
    max_workers: z.number().int().min(1).max(3),
    parallel_eligible: z.boolean(),
    eligible_group: z.array(idSchema),
    reason: z.string().min(1),
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
      "awaiting-router",
      "awaiting-proposal-approval",
      "review-ready",
      "delivery-ready",
      "awaiting-ci",
      "awaiting-closeout",
      "completed",
      "failed",
    ]),
    current_node: nodeIdSchema.nullable(),
    max_repair_attempts: z.number().int().nonnegative(),
    repair_attempts: z.record(z.string(), z.number().int().nonnegative()),
    sessions: z.record(z.string(), agentSessionSchema),
    nodes: z.array(workflowNodeSchema),
    route: z
      .object({
        status: z.enum(["selected", "needs-agent"]),
        profile: profileNameSchema.nullable(),
        source: z.enum(["override", "explicit-plan", "deterministic", "agent"]),
        rationale: z.string().min(1),
        signals: z.array(z.string().min(1)),
        safety_floor: profileNameSchema.nullable(),
      })
      .strict()
      .optional(),
    isolation: isolationStateSchema.optional(),
    review: z
      .object({
        status: z.enum(["not-ready", "ready", "approved", "rejected", "repair-requested"]),
        packet_path: z.string().min(1).nullable(),
        decision_path: z.string().min(1).nullable().default(null),
      })
      .strict(),
    delivery: z
      .object({
        status: z.enum(["not-authorized", "authorized", "committed", "awaiting-ci", "passed", "failed"]),
        packet_path: z.string().min(1).nullable(),
        commit_sha: z.string().regex(/^[a-f0-9]{7,64}$/).nullable(),
        pr_url: z.string().url().nullable(),
        ci_path: z.string().min(1).nullable(),
      })
      .strict()
      .optional(),
    closeout: z
      .object({
        status: z.enum(["not-started", "awaiting-assessment", "completed"]),
        packet_path: z.string().min(1).nullable(),
        result_path: z.string().min(1).nullable(),
        learning: z.enum(["pending", "no-learning", "written"]),
        strategy: z.enum(["pending", "no-change", "proposed"]),
      })
      .strict()
      .optional(),
  })
  .strict()

export const reviewDecisionSchema = z
  .object({
    schema_version: z.literal(1),
    run_id: z.string().min(1),
    decision: z.enum(["approved", "rejected", "repair-requested"]),
    decided_by: z.string().min(1),
    rationale: z.string().min(1),
    repair_unit_id: idSchema.nullable().default(null),
    decided_at: z.string().datetime(),
  })
  .strict()

export const closeoutResultSchema = z
  .object({
    schema_version: z.literal(1),
    run_id: z.string().min(1),
    learning: z
      .object({
        status: z.enum(["no-learning", "written"]),
        reason: z.string().min(1),
        claim: z.string().min(1).nullable(),
        path: repoPathSchema.nullable(),
        reusable: z.boolean(),
        evidence_backed: z.boolean(),
        novel: z.boolean(),
        behavior_changing: z.boolean(),
        existing_matches: z.array(repoPathSchema),
        evidence_paths: z.array(z.string().min(1)),
      })
      .strict(),
    strategy: z
      .object({
        observations: z.array(z.string().min(1)),
        proposed_delta: z.string().min(1).nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((result, ctx) => {
    const learning = result.learning
    const passes = learning.reusable && learning.evidence_backed && learning.novel && learning.behavior_changing
    if (learning.status === "written") {
      if (!passes || learning.existing_matches.length > 0 || !learning.path || !learning.claim) {
        ctx.addIssue({ code: "custom", message: "written learning must pass every evidence and novelty gate", path: ["learning"] })
      }
      if (learning.path && !learning.path.startsWith("docs/solutions/")) {
        ctx.addIssue({ code: "custom", message: "written learning must live under docs/solutions/", path: ["learning", "path"] })
      }
    } else if (learning.path !== null) {
      ctx.addIssue({ code: "custom", message: "no-learning cannot name a written path", path: ["learning", "path"] })
    }
  })

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

export const routerResultSchema = z
  .object({
    schema_version: z.literal(1),
    run_id: z.string().min(1),
    role: z.literal("router"),
    profile: profileNameSchema,
    rationale: z.string().min(1),
    signals_considered: z.array(z.string().min(1)).min(1),
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
export type RouterResult = z.infer<typeof routerResultSchema>
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>
export type CloseoutResult = z.infer<typeof closeoutResultSchema>
export type CommandSpec = z.infer<typeof commandSpecSchema>
export type CommandResult = z.infer<typeof commandResultSchema>
