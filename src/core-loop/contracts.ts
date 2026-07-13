import path from "node:path"
import { z } from "zod"
import { isolationStateSchema, workflowStateSchema } from "../workflows/contracts"
import { profileNameSchema } from "../workflows/profiles"

const idSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be lowercase hyphen-case")

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, "must be a lowercase sha256")

export const repoRelativePathSchema = z.string().min(1).superRefine((value, ctx) => {
  const normalized = value.replaceAll("\\", "/")
  if (path.posix.isAbsolute(normalized) || path.win32.isAbsolute(value)) {
    ctx.addIssue({ code: "custom", message: "must be repo-relative" })
  }
  if (normalized.split("/").includes("..")) {
    ctx.addIssue({ code: "custom", message: "must stay inside the repository" })
  }
})

function validateDependencyGraph(
  ids: string[],
  dependencies: Map<string, string[]>,
  ctx: z.RefinementCtx,
  pathPrefix: Array<string | number>,
) {
  const known = new Set(ids)
  const visiting = new Set<string>()
  const visited = new Set<string>()

  for (const [id, deps] of dependencies) {
    for (const dependency of deps) {
      if (!known.has(dependency)) {
        ctx.addIssue({
          code: "custom",
          message: `unknown dependency: ${dependency}`,
          path: [...pathPrefix, ids.indexOf(id), "depends_on"],
        })
      }
      if (dependency === id) {
        ctx.addIssue({
          code: "custom",
          message: "cannot depend on itself",
          path: [...pathPrefix, ids.indexOf(id), "depends_on"],
        })
      }
    }
  }

  function visit(id: string): boolean {
    if (visited.has(id)) return false
    if (visiting.has(id)) return true
    visiting.add(id)
    for (const dependency of dependencies.get(id) ?? []) {
      if (known.has(dependency) && visit(dependency)) return true
    }
    visiting.delete(id)
    visited.add(id)
    return false
  }

  for (const id of ids) {
    if (visit(id)) {
      ctx.addIssue({ code: "custom", message: "dependency graph contains a cycle", path: pathPrefix })
      break
    }
  }
}

function validateUniqueIds(
  ids: string[],
  ctx: z.RefinementCtx,
  pathPrefix: Array<string | number>,
) {
  const seen = new Set<string>()
  ids.forEach((id, index) => {
    if (seen.has(id)) {
      ctx.addIssue({ code: "custom", message: `duplicate id: ${id}`, path: [...pathPrefix, index, "id"] })
    }
    seen.add(id)
  })
}

export const workUnitSchema = z
  .object({
    id: idSchema,
    scope: z.string().min(1),
    files_or_area: z.array(z.string().min(1)).min(1),
    acceptance: z.array(z.string().min(1)).min(1),
    verification: z.array(z.string().min(1)).min(1),
    depends_on: z.array(idSchema).default([]),
    non_goals: z.array(z.string().min(1)).default([]),
  })
  .strict()

export const executionPhaseSchema = z
  .object({
    id: idSchema,
    goal: z.string().min(1),
    depends_on: z.array(idSchema).default([]),
    work_units: z.array(workUnitSchema).min(1),
    risks: z.array(z.string().min(1)).default([]),
    completion_gate: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((phase, ctx) => {
    const ids = phase.work_units.map((unit) => unit.id)
    validateUniqueIds(ids, ctx, ["work_units"])
    validateDependencyGraph(
      ids,
      new Map(phase.work_units.map((unit) => [unit.id, unit.depends_on])),
      ctx,
      ["work_units"],
    )
  })

export const executionPlanSchema = z
  .object({
    schema_version: z.literal(1),
    goal: z.string().min(1),
    plan_type: z.string().min(1).optional(),
    workflow_profile: z.enum(["chore", "bug", "feature", "hotfix"]).optional(),
    requirements: z.array(z.string().min(1)).default([]),
    phases: z.array(executionPhaseSchema).min(1),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const ids = plan.phases.map((phase) => phase.id)
    validateUniqueIds(ids, ctx, ["phases"])
    validateDependencyGraph(
      ids,
      new Map(plan.phases.map((phase) => [phase.id, phase.depends_on])),
      ctx,
      ["phases"],
    )
  })

export const progressStatusSchema = z.enum([
  "pending",
  "ready",
  "in_progress",
  "completed",
  "blocked",
  "failed",
])

export const verificationSchema = z
  .object({
    status: z.enum(["not_run", "passed", "failed"]),
    evidence: z.array(z.string().min(1)).default([]),
  })
  .strict()

export const runUnitStateSchema = z
  .object({
    id: idSchema,
    depends_on: z.array(idSchema).default([]),
    status: progressStatusSchema,
    worker_id: z.string().min(1).nullable().default(null),
    changed_files: z.array(repoRelativePathSchema).default([]),
    evidence: z.array(z.string().min(1)).default([]),
    unresolved: z.array(z.string().min(1)).default([]),
  })
  .strict()

export const runPhaseStateSchema = z
  .object({
    id: idSchema,
    depends_on: z.array(idSchema).default([]),
    status: progressStatusSchema,
    units: z.array(runUnitStateSchema).min(1),
    verification: verificationSchema,
    commits: z.array(z.string().regex(/^[a-f0-9]{7,64}$/)).default([]),
  })
  .strict()
  .superRefine((phase, ctx) => {
    const ids = phase.units.map((unit) => unit.id)
    validateUniqueIds(ids, ctx, ["units"])
    validateDependencyGraph(
      ids,
      new Map(phase.units.map((unit) => [unit.id, unit.depends_on])),
      ctx,
      ["units"],
    )
    if (phase.status === "completed" && phase.verification.status !== "passed") {
      ctx.addIssue({
        code: "custom",
        message: "completed phase requires passed verification",
        path: ["verification", "status"],
      })
    }
  })

const usageMetricSchema = z
  .object({
    input_tokens: z.number().int().nonnegative().optional(),
    output_tokens: z.number().int().nonnegative().optional(),
    instruction_bytes: z.number().int().nonnegative().optional(),
    context_packet_bytes: z.number().int().nonnegative().optional(),
    response_bytes: z.number().int().nonnegative().optional(),
    dispatches: z.number().int().nonnegative().optional(),
  })
  .strict()

export const runStateSchema = z
  .object({
    schema_version: z.literal(1),
    run_id: z.string().min(1),
    plan: z
      .object({ path: repoRelativePathSchema, sha256: sha256Schema })
      .strict(),
    strategy: z
      .object({ path: repoRelativePathSchema, sha256: sha256Schema })
      .strict()
      .nullable(),
    git: z
      .object({
        branch: z.string().min(1),
        base_ref: z.string().min(1),
        head_sha: z.string().regex(/^[a-f0-9]{7,64}$/),
      })
      .strict(),
    status: z.enum([
      "initialized",
      "running",
      "blocked",
      "review_ready",
      "completed",
      "failed",
      "cancelled",
    ]),
    current_phase: idSchema.nullable(),
    workflow: workflowStateSchema.optional(),
    phases: z.array(runPhaseStateSchema).min(1),
    usage: z
      .object({
        available: z.boolean(),
        by_role: z.record(z.string(), usageMetricSchema).default({}),
        by_phase: z.record(z.string(), usageMetricSchema).default({}),
      })
      .strict(),
    learning_candidates: z.array(z.string().min(1)).default([]),
    strategy_observations: z.array(z.string().min(1)).default([]),
    started_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    terminal: z
      .object({
        status: z.enum(["completed", "failed", "cancelled"]),
        reason: z.string().min(1),
        ended_at: z.string().datetime(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((state, ctx) => {
    const phaseIds = state.phases.map((phase) => phase.id)
    validateUniqueIds(phaseIds, ctx, ["phases"])
    validateDependencyGraph(
      phaseIds,
      new Map(state.phases.map((phase) => [phase.id, phase.depends_on])),
      ctx,
      ["phases"],
    )
    if (state.current_phase !== null && !phaseIds.includes(state.current_phase)) {
      ctx.addIssue({ code: "custom", message: "current_phase must name a run phase", path: ["current_phase"] })
    }
    const activePhases = state.phases.filter((phase) => phase.status === "in_progress")
    if (activePhases.length > 1) {
      ctx.addIssue({ code: "custom", message: "at most one phase may be in progress", path: ["phases"] })
    }
    if (activePhases.length === 1 && state.current_phase !== activePhases[0].id) {
      ctx.addIssue({
        code: "custom",
        message: "current_phase must name the in-progress phase",
        path: ["current_phase"],
      })
    }
    if (activePhases.length === 0 && state.current_phase !== null) {
      ctx.addIssue({
        code: "custom",
        message: "current_phase must be null when no phase is in progress",
        path: ["current_phase"],
      })
    }

    const isTerminal = ["completed", "failed", "cancelled"].includes(state.status)
    if (isTerminal && state.terminal === null) {
      ctx.addIssue({ code: "custom", message: "terminal run status requires terminal details", path: ["terminal"] })
    }
    if (!isTerminal && state.terminal !== null) {
      ctx.addIssue({ code: "custom", message: "non-terminal run cannot carry terminal details", path: ["terminal"] })
    }
    if (state.terminal !== null && state.terminal.status !== state.status) {
      ctx.addIssue({ code: "custom", message: "terminal status must match run status", path: ["terminal", "status"] })
    }
    if (state.status === "completed" && state.phases.some((phase) => phase.status !== "completed")) {
      ctx.addIssue({ code: "custom", message: "completed run requires every phase completed", path: ["phases"] })
    }
    if (state.status === "review_ready") {
      if (state.phases.some((phase) => phase.status !== "completed")) {
        ctx.addIssue({ code: "custom", message: "review-ready run requires every phase completed", path: ["phases"] })
      }
      if (state.workflow?.stage !== "review-ready" || state.workflow.review.status !== "ready") {
        ctx.addIssue({ code: "custom", message: "review-ready run requires a ready workflow review packet", path: ["workflow"] })
      }
    }
  })

export const phasePacketSchema = z
  .object({
    schema_version: z.literal(1),
    run_id: z.string().min(1),
    plan: z.object({ path: repoRelativePathSchema, sha256: sha256Schema }).strict(),
    phase_id: idSchema,
    unit_id: idSchema,
    phase_goal: z.string().min(1),
    unit_scope: z.string().min(1),
    acceptance: z.array(z.string().min(1)).min(1),
    owned_scope: z.array(z.string().min(1)).min(1),
    non_goals: z.array(z.string().min(1)).default([]),
    strategy_excerpt: z.string().min(1).nullable().default(null),
    solution_pointers: z.array(repoRelativePathSchema).default([]),
    evidence_dossier: z
      .object({ path: z.string().min(1), gist: z.string().min(1) })
      .strict()
      .nullable()
      .default(null),
    verification_commands: z.array(z.string().min(1)).min(1),
    workflow_profile: profileNameSchema.optional(),
    profile_required_evidence: z.array(z.string().min(1)).optional(),
    isolation: isolationStateSchema.nullable().optional(),
  })
  .strict()

export const workerResultSchema = z
  .object({
    schema_version: z.literal(1),
    run_id: z.string().min(1),
    phase_id: idSchema,
    unit_id: idSchema,
    status: z.enum(["completed", "blocked", "failed"]),
    changed_files: z.array(repoRelativePathSchema).default([]),
    evidence: z.array(z.string().min(1)).default([]),
    verification: z.array(z.string().min(1)).default([]),
    risks: z.array(z.string().min(1)).default([]),
    unresolved: z.array(z.string().min(1)).default([]),
  })
  .strict()

export type ExecutionPlan = z.infer<typeof executionPlanSchema>
export type RunState = z.infer<typeof runStateSchema>
export type ProgressStatus = z.infer<typeof progressStatusSchema>
export type Verification = z.infer<typeof verificationSchema>
export type PhasePacket = z.infer<typeof phasePacketSchema>
export type WorkerResult = z.infer<typeof workerResultSchema>
