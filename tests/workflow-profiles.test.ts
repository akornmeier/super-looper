import { describe, expect, test } from "bun:test"
import { selectIsolation } from "../src/workflows/isolation"
import { routeWorkflow } from "../src/workflows/profiles"

describe("workflow profile router", () => {
  const base = {
    goal: "Maintain the project",
    requirements: [],
    risks: [],
    phaseCount: 1,
    unitCount: 1,
  }

  test("routes explicit task types without an agent", () => {
    expect(routeWorkflow({ ...base, planType: "chore" })).toMatchObject({ status: "selected", profile: "chore", source: "deterministic" })
    expect(routeWorkflow({ ...base, planType: "fix" })).toMatchObject({ status: "selected", profile: "bug", source: "deterministic" })
    expect(routeWorkflow({ ...base, planType: "feat" })).toMatchObject({ status: "selected", profile: "feature", source: "deterministic" })
    expect(routeWorkflow({ ...base, planType: "hotfix" })).toMatchObject({ status: "selected", profile: "hotfix", source: "deterministic" })
  })

  test("uses a frontier router only when deterministic signals are insufficient", () => {
    expect(routeWorkflow({ ...base, planType: "mystery" })).toMatchObject({ status: "needs-agent", profile: null, source: "agent" })
  })

  test("rejects a user override below the safety floor", () => {
    expect(() => routeWorkflow({ ...base, planType: "hotfix", override: "chore" })).toThrow("below safety floor hotfix")
    expect(routeWorkflow({ ...base, planType: "chore", override: "feature" })).toMatchObject({ profile: "feature", source: "override", safetyFloor: "chore" })
  })

  test("rejects plan metadata that understates observed incident risk", () => {
    expect(() => routeWorkflow({ ...base, planType: "plan", planProfile: "chore", goal: "Restore production outage" })).toThrow("plan profile chore is below safety floor hotfix")
  })
})

describe("isolation policy", () => {
  const units = [
    { id: "frontend", depends_on: [], files_or_area: ["web"] },
    { id: "backend", depends_on: [], files_or_area: ["api"] },
  ]

  test("prefers sandbox and admits only independent non-overlapping work", () => {
    expect(selectIsolation(["shared", "worktree", "sandbox"], 3, "feature", units)).toEqual({
      available: ["shared", "worktree", "sandbox"],
      selected: "sandbox",
      requested_workers: 3,
      max_workers: 2,
      parallel_eligible: true,
      eligible_group: ["frontend", "backend"],
      reason: "isolated, DAG-independent, non-overlapping units are eligible",
    })
  })

  test("serializes shared, overlapping, dependent, and chore work", () => {
    expect(selectIsolation(["shared"], 3, "feature", units)).toMatchObject({ selected: "shared", max_workers: 1, parallel_eligible: false })
    expect(selectIsolation(["worktree"], 3, "feature", [units[0], { ...units[1], files_or_area: ["web/components"] }])).toMatchObject({ max_workers: 1, parallel_eligible: false })
    expect(selectIsolation(["worktree"], 3, "feature", [units[0], { ...units[1], depends_on: ["frontend"] }])).toMatchObject({ max_workers: 1, parallel_eligible: false })
    expect(selectIsolation(["sandbox"], 3, "chore", units)).toMatchObject({ max_workers: 1, parallel_eligible: false })
  })
})
