import { z } from "zod"
import catalogJson from "../../../plugins/super-looper/skills/sl-run/references/workflow-profiles.json"

export const profileNameSchema = z.enum(["chore", "bug", "feature", "hotfix"])

export const workflowProfileSchema = z
  .object({
    risk_rank: z.number().int().min(0).max(3),
    max_repair_attempts: z.number().int().min(0).max(3),
    max_workers: z.number().int().min(1).max(3),
    requires_proposal_approval: z.boolean(),
    verifier_lenses: z.array(z.string().min(1)).min(1),
    required_evidence: z.array(z.string().min(1)).min(1),
  })
  .strict()

export const profileCatalogSchema = z
  .object({
    schema_version: z.literal(1),
    profiles: z.object({
      chore: workflowProfileSchema,
      bug: workflowProfileSchema,
      feature: workflowProfileSchema,
      hotfix: workflowProfileSchema,
    }),
  })
  .strict()

export const PROFILE_CATALOG = profileCatalogSchema.parse(catalogJson)
export type ProfileName = z.infer<typeof profileNameSchema>

export type RouteInput = {
  override?: ProfileName
  planProfile?: ProfileName
  planType?: string
  goal: string
  requirements: string[]
  risks: string[]
  phaseCount: number
  unitCount: number
}

export type RouteDecision = {
  status: "selected" | "needs-agent"
  profile: ProfileName | null
  source: "override" | "explicit-plan" | "deterministic" | "agent"
  rationale: string
  signals: string[]
  safetyFloor: ProfileName | null
}

function deterministicFloor(input: RouteInput): Omit<RouteDecision, "status" | "profile" | "source"> & {
  floor: ProfileName | null
  source: "explicit-plan" | "deterministic" | "agent"
} {
  const planType = (input.planType ?? "").trim().toLowerCase()
  const text = [input.goal, ...input.requirements, ...input.risks].join(" ").toLowerCase()
  let signalFloor: ProfileName | null = null
  let signal = ""
  let signalRationale = ""
  if (/\b(hotfix|sev[- ]?[01]|production (?:down|outage)|active incident)\b/.test(text) || planType === "hotfix") {
    signalFloor = "hotfix"; signal = "incident-or-hotfix"; signalRationale = "Incident or urgent production signal requires the hotfix profile."
  } else if (["fix", "bug"].includes(planType) || /\b(bug|regression|reproduce|root cause)\b/.test(text)) {
    signalFloor = "bug"; signal = "defect"; signalRationale = "Defect signals require reproduction and regression evidence."
  } else if (["feat", "feature", "refactor"].includes(planType) || input.phaseCount > 1 || input.unitCount > 1) {
    signalFloor = "feature"; signal = "feature-or-cross-cutting"; signalRationale = "Feature, refactor, or multi-unit scope requires the feature profile."
  } else if (["chore", "docs", "doc", "test", "ci", "build"].includes(planType)) {
    signalFloor = "chore"; signal = "bounded-maintenance"; signalRationale = "A bounded maintenance plan qualifies for the chore profile."
  }
  if (input.planProfile) {
    if (signalFloor && PROFILE_CATALOG.profiles[input.planProfile].risk_rank < PROFILE_CATALOG.profiles[signalFloor].risk_rank) {
      throw new Error(`plan profile ${input.planProfile} is below safety floor ${signalFloor}`)
    }
    return {
      floor: input.planProfile,
      source: "explicit-plan",
      rationale: "Plan frontmatter selected the workflow profile without lowering observed risk.",
      signals: [signal || "explicit-plan", `workflow_profile:${input.planProfile}`],
      safetyFloor: signalFloor ?? input.planProfile,
    }
  }
  if (signalFloor) {
    return { floor: signalFloor, source: "deterministic", rationale: signalRationale, signals: [signal], safetyFloor: signalFloor }
  }
  if (planType === "plan") {
    return { floor: "feature", source: "deterministic", rationale: "An unclassified canonical plan uses the conservative feature profile.", signals: ["canonical-plan-default"], safetyFloor: "feature" }
  }
  return { floor: null, source: "agent", rationale: "Deterministic signals are insufficient to classify the work safely.", signals: ["ambiguous"], safetyFloor: null }
}

export function routeWorkflow(input: RouteInput): RouteDecision {
  const floor = deterministicFloor(input)
  if (input.override) {
    if (floor.floor && PROFILE_CATALOG.profiles[input.override].risk_rank < PROFILE_CATALOG.profiles[floor.floor].risk_rank) {
      throw new Error(`profile override ${input.override} is below safety floor ${floor.floor}`)
    }
    return { status: "selected", profile: input.override, source: "override", rationale: "User selected a profile without lowering the deterministic safety floor.", signals: [...floor.signals, `override:${input.override}`], safetyFloor: floor.floor }
  }
  if (floor.floor) {
    return { status: "selected", profile: floor.floor, source: floor.source, rationale: floor.rationale, signals: floor.signals, safetyFloor: floor.floor }
  }
  return { status: "needs-agent", profile: null, source: "agent", rationale: floor.rationale, signals: floor.signals, safetyFloor: null }
}
