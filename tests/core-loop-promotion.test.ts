import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  captureStructuralComparison,
  decideProfilePromotion,
  type ProfilePromotionEvidence,
} from "../src/core-loop/promotion"

function completeEvidence(): ProfilePromotionEvidence {
  return {
    profile: "chore",
    hosts: {
      claude: { discovery: "passed", worker: "passed", resume: "passed" },
      codex: { discovery: "passed", worker: "passed", resume: "passed" },
    },
    quality_delta_percent: -1,
    token_reduction_percent: 42,
  }
}

describe("U10 structural comparison", () => {
  test("primary hot-path and planner instruction proxies beat their budgets", async () => {
    const comparison = await captureStructuralComparison()

    expect(comparison.measurement_kind).toBe("instruction-byte-proxy")
    expect(comparison.primary_reduction_percent).toBeGreaterThanOrEqual(50)
    expect(comparison.planner_reduction_percent).toBeGreaterThanOrEqual(30)
    expect(comparison.strategy_plan_run_budget_passed).toBe(true)
    expect(comparison.current_strategy_plan_run_bytes).toBeLessThanOrEqual(120_000)
  })
})

describe("U10 profile promotion gate", () => {
  test("promotes only when both hosts and measured budgets pass", () => {
    expect(decideProfilePromotion(completeEvidence())).toEqual({
      profile: "chore",
      promoted: true,
      blockers: [],
    })
  })

  test("missing comparable token or quality measurements block promotion", () => {
    const evidence = completeEvidence()
    evidence.token_reduction_percent = null
    evidence.quality_delta_percent = null

    expect(decideProfilePromotion(evidence)).toMatchObject({
      promoted: false,
      blockers: ["efficiency.tokens:not_measured", "quality.delta:not_measured"],
    })
  })

  test("one failed or unmeasured host cell blocks only that profile", () => {
    const evidence = completeEvidence()
    evidence.profile = "feature"
    evidence.hosts.codex.worker = "failed"
    evidence.hosts.claude.resume = "not_measured"

    const decision = decideProfilePromotion(evidence)
    expect(decision.profile).toBe("feature")
    expect(decision.promoted).toBe(false)
    expect(decision.blockers).toContain("codex.worker:failed")
    expect(decision.blockers).toContain("claude.resume:not_measured")
  })

  test("the checked-in U10 evidence promotes no profile while host and measurement gaps remain", async () => {
    const evidencePath = path.join(
      import.meta.dir,
      "../docs/evals/sl-run-u10-evidence.json",
    )
    const evidence = JSON.parse(await readFile(evidencePath, "utf8")) as {
      status: string
      profiles: ProfilePromotionEvidence[]
    }

    expect(evidence.status).toBe("complete-no-promotions")
    expect(evidence.profiles.map(decideProfilePromotion).every((item) => !item.promoted)).toBe(true)
    for (const decision of evidence.profiles.map(decideProfilePromotion)) {
      expect(decision.blockers).toContain("codex.worker:failed")
      expect(decision.blockers).toContain("efficiency.tokens:not_measured")
      expect(decision.blockers).toContain("quality.delta:not_measured")
    }
  })
})
