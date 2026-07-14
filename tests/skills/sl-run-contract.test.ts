import { describe, expect, test } from "bun:test"
import path from "node:path"

const ROOT = path.join(process.cwd(), "plugins/super-looper/skills/sl-run")
const SKILL = await Bun.file(path.join(ROOT, "SKILL.md")).text()
const ENGINE = await Bun.file(path.join(ROOT, "references/state-engine.md")).text()
const AGENT = await Bun.file(path.join(ROOT, "references/agent-contract.md")).text()
const VERIFIER = await Bun.file(path.join(ROOT, "references/verifier-contract.md")).text()
const ROUTER = await Bun.file(path.join(ROOT, "references/router-contract.md")).text()
const TEAM = await Bun.file(path.join(ROOT, "references/team-execution.md")).text()
const REVIEW = await Bun.file(path.join(ROOT, "references/review-packet.md")).text()
const DELIVERY = await Bun.file(path.join(ROOT, "references/delivery.md")).text()
const CLOSEOUT = await Bun.file(path.join(ROOT, "references/closeout.md")).text()
const EVALS = JSON.parse(await Bun.file(path.join(ROOT, "evals/evals.json")).text())

describe("sl-run U8 routed workflow contract", () => {
  test("makes the kernel the transition and routing authority", () => {
    expect(SKILL).toContain("bundled kernel selects every transition")
    expect(SKILL).toContain("Make the kernel the only run-state writer")
    expect(SKILL).toContain("Let code select the least expensive safe profile")
    expect(SKILL).toContain("U7 records bounded parallel eligibility")
    expect(SKILL).toContain("Perform only the `next_action` it emits")
  })

  test("runs required checks outside agent nodes", () => {
    expect(SKILL).toContain("only through kernel `run-checks`")
    expect(SKILL).toContain("do not run the plan commands yourself")
    expect(ENGINE).toContain("converts plan command entries to argument vectors")
    expect(ENGINE).toContain("rejects shell control flow and shell `-c`")
    expect(AGENT).not.toContain('"verification"')
  })

  test("routes repair through honest session capabilities", () => {
    expect(SKILL).toContain("Resume the responsible agent only when")
    expect(SKILL).toContain("dispatch a fresh repair agent")
    expect(AGENT).toContain('"session"')
    expect(AGENT).toContain("Never invent a resumable handle")
  })

  test("keeps semantic verification independent and review authority explicit", () => {
    expect(SKILL).toContain("Use a fresh independent verifier")
    expect(SKILL).toContain("An implementation or repair agent cannot certify its own phase")
    expect(SKILL).toContain("stop at durable `review_ready`")
    expect(SKILL).toContain("record only the engineer's explicit")
    expect(REVIEW).toContain("Do not translate silence")
    expect(VERIFIER).toContain('"repair_unit_id"')
  })

  test("keeps delivery, CI repair, learning, and strategy under typed policy", () => {
    expect(SKILL).toContain("only through kernel-emitted delivery actions")
    expect(DELIVERY).toContain("refuses unreported dirty paths")
    expect(DELIVERY).toContain("must pass deterministic checks, independent verification, and final engineer review again")
    expect(CLOSEOUT).toContain("all four")
    expect(CLOSEOUT).toContain("never edit `STRATEGY.md`")
  })

  test("bounds routing, hotfix approval, and isolation mechanically", () => {
    expect(SKILL).toContain("A user override may raise cost or review depth but cannot lower")
    expect(SKILL).toContain("await-hotfix-proposal-approval")
    expect(SKILL).toContain("Approval never grants delivery authority")
    expect(ROUTER).toContain('"role": "router"')
    expect(TEAM).toContain("shared-checkout")
    expect(TEAM).toContain("hard cap is three")
  })

  test("defines strict implementation and verifier results", () => {
    for (const field of [
      "schema_version",
      "run_id",
      "phase_id",
      "unit_id",
      "role",
      "status",
      "session",
      "changed_files",
      "evidence",
      "risks",
      "unresolved",
    ]) {
      expect(AGENT).toContain(`"${field}"`)
    }
    for (const field of ["schema_version", "run_id", "phase_id", "role", "status", "evidence", "findings", "repair_unit_id"]) {
      expect(VERIFIER).toContain(`"${field}"`)
    }
  })

  test("carries behavioral evals through U8 closeout boundaries", () => {
    expect(EVALS.evals.map((entry: any) => entry.name)).toEqual([
      "serial-review-ready",
      "code-check-same-session-repair",
      "non-resumable-repair-fallback",
      "unsafe-command-refusal",
      "phase-boundary-resume",
      "in-progress-agent-reconciliation",
      "goal-drift-refusal",
      "chore-routes-without-frontier-cost",
      "ambiguous-route-is-one-bounded-agent",
      "hotfix-needs-proposal-approval",
      "isolation-and-overlap-bound-concurrency",
      "engineer-rejects-or-requests-repair",
      "approved-exact-delivery",
      "ci-failure-bounded-repair",
      "no-op-learning-closeout",
      "strategy-proposal-remains-unapplied",
    ])
  })
})
