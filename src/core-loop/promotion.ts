import { promises as fs } from "node:fs"
import path from "node:path"

export type GateStatus = "passed" | "failed" | "not_measured"
export type WorkflowProfile = "chore" | "bug" | "feature" | "hotfix"
export type HostName = "claude" | "codex"

type BaselineComponent = {
  path: string
  bytes: number
}

type BaselineSnapshot = {
  baseline: {
    components: BaselineComponent[]
  }
}

export type StructuralComparison = {
  baseline_primary_instruction_bytes: number
  current_primary_instruction_bytes: number
  primary_reduction_percent: number
  baseline_planner_instruction_bytes: number
  current_planner_instruction_bytes: number
  planner_reduction_percent: number
  current_strategy_plan_run_bytes: number
  strategy_plan_run_budget_bytes: number
  strategy_plan_run_budget_passed: boolean
  measurement_kind: "instruction-byte-proxy"
}

export type ProfilePromotionEvidence = {
  profile: WorkflowProfile
  hosts: Record<HostName, Record<string, GateStatus>>
  quality_delta_percent: number | null
  token_reduction_percent: number | null
}

export type PromotionDecision = {
  profile: WorkflowProfile
  promoted: boolean
  blockers: string[]
}

const BASELINE_PRIMARY = ["lfg", "sl-plan", "sl-work", "sl-strategy"]
const CURRENT_PRIMARY = ["sl-strategy", "sl-plan", "sl-run"]

function roundedPercent(reduction: number): number {
  return Math.round(reduction * 100) / 100
}

async function fileBytes(root: string, relativePath: string): Promise<number> {
  return Buffer.byteLength(await fs.readFile(path.join(root, relativePath), "utf8"))
}

function componentName(component: BaselineComponent): string {
  return path.basename(path.dirname(component.path))
}

export async function captureStructuralComparison(
  root = process.cwd(),
): Promise<StructuralComparison> {
  const snapshot = JSON.parse(
    await fs.readFile(path.join(root, "docs/evals/core-loop-baseline.json"), "utf8"),
  ) as BaselineSnapshot

  const baselineBytes = new Map(
    snapshot.baseline.components.map((component) => [componentName(component), component.bytes]),
  )
  const baselinePrimary = BASELINE_PRIMARY.reduce((sum, name) => {
    const bytes = baselineBytes.get(name)
    if (bytes === undefined) throw new Error(`baseline component missing: ${name}`)
    return sum + bytes
  }, 0)
  const currentPrimary = (
    await Promise.all(
      CURRENT_PRIMARY.map((name) =>
        fileBytes(root, `plugins/super-looper/skills/${name}/SKILL.md`),
      ),
    )
  ).reduce((sum, bytes) => sum + bytes, 0)
  const baselinePlanner = baselineBytes.get("sl-plan")
  if (baselinePlanner === undefined) throw new Error("baseline component missing: sl-plan")
  const currentPlanner = await fileBytes(
    root,
    "plugins/super-looper/skills/sl-plan/SKILL.md",
  )

  return {
    baseline_primary_instruction_bytes: baselinePrimary,
    current_primary_instruction_bytes: currentPrimary,
    primary_reduction_percent: roundedPercent(
      ((baselinePrimary - currentPrimary) / baselinePrimary) * 100,
    ),
    baseline_planner_instruction_bytes: baselinePlanner,
    current_planner_instruction_bytes: currentPlanner,
    planner_reduction_percent: roundedPercent(
      ((baselinePlanner - currentPlanner) / baselinePlanner) * 100,
    ),
    current_strategy_plan_run_bytes: currentPrimary,
    strategy_plan_run_budget_bytes: 120_000,
    strategy_plan_run_budget_passed: currentPrimary <= 120_000,
    measurement_kind: "instruction-byte-proxy",
  }
}

export function decideProfilePromotion(
  evidence: ProfilePromotionEvidence,
): PromotionDecision {
  const blockers: string[] = []

  for (const host of ["claude", "codex"] as const) {
    for (const [gate, status] of Object.entries(evidence.hosts[host])) {
      if (status !== "passed") blockers.push(`${host}.${gate}:${status}`)
    }
  }

  if (evidence.token_reduction_percent === null) {
    blockers.push("efficiency.tokens:not_measured")
  } else if (evidence.token_reduction_percent < 40) {
    blockers.push(`efficiency.tokens:${evidence.token_reduction_percent}%`)
  }

  if (evidence.quality_delta_percent === null) {
    blockers.push("quality.delta:not_measured")
  } else if (Math.abs(evidence.quality_delta_percent) > 5) {
    blockers.push(`quality.delta:${evidence.quality_delta_percent}%`)
  }

  return { profile: evidence.profile, promoted: blockers.length === 0, blockers }
}
