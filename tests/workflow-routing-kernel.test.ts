import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const ENGINE = path.join(process.cwd(), "plugins/super-looper/skills/sl-run/scripts/run-state.py")
let root: string
let target: string

function plan(type: string, units = [{ id: "one", area: "src/one", depends: "none" }], profile?: string) {
  return `---
title: Routing fixture
type: ${type}
date: 2026-07-13
schema_version: 1
goal: Route this work safely
strategy: STRATEGY.md
origin: none
${profile ? `workflow_profile: ${profile}\n` : ""}---

# Routing fixture

## Requirements
- R1. Preserve the safety floor

## Phases

## P1. Route work \`route-work\`
**Goal:** Exercise routing.
**Depends on:** none
**Risks:** none

${units.map((unit, index) => `### U${index + 1}. Unit ${index + 1} \`${unit.id}\` \`[]\`
**Scope:** Change ${unit.area}.
**Files or area:**
- \`${unit.area}\`
**Depends on:** ${unit.depends}
**Non-goals:**
- Deliver
**Acceptance:**
- Owned change exists
**Verification:**
- \`true\`
`).join("\n")}
**Phase completion gate:**
- Work is independently verified
`
}

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "workflow-routing-")))
  target = path.join(root, "target")
  fs.mkdirSync(path.join(target, "docs/plans"), { recursive: true })
  fs.writeFileSync(path.join(target, "STRATEGY.md"), "# Strategy\n")
  git("init", "-q")
  git("config", "user.email", "fixture@example.com")
  git("config", "user.name", "Fixture")
})

afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

function git(...args: string[]) {
  const result = Bun.spawnSync(["git", ...args], { cwd: target, stdout: "pipe", stderr: "pipe" })
  expect(result.exitCode, result.stderr.toString()).toBe(0)
}

function commitPlan(content: string) {
  fs.writeFileSync(path.join(target, "docs/plans/fixture.md"), content)
  git("add", ".")
  git("commit", "-q", "-m", "fixture")
}

function engine(...args: string[]) {
  const result = Bun.spawnSync(["python3", ENGINE, ...args], { cwd: target, stdout: "pipe", stderr: "pipe" })
  const stdout = result.stdout.toString().trim()
  const stderr = result.stderr.toString().trim()
  return { exitCode: result.exitCode, json: stdout ? JSON.parse(stdout) : null, error: stderr ? JSON.parse(stderr) : null }
}

function initialize(extra: string[] = []) {
  const state = path.join(root, "state", "run-state.json")
  const result = engine("init", "--kernel", "--target", target, "--plan", "docs/plans/fixture.md", "--state", state, "--run-id", "route-run", ...extra)
  return { state, result }
}

describe("U7 kernel routing and isolation", () => {
  test("routes a chore deterministically without frontier cost", () => {
    commitPlan(plan("chore"))
    const { state, result } = initialize()
    expect(result.exitCode, result.error?.error).toBe(0)
    expect(result.json).toMatchObject({ profile: "chore", route_source: "deterministic", next_action: "start-next", isolation_mode: "shared", max_workers: 1 })
    expect(JSON.parse(fs.readFileSync(state, "utf8")).workflow.nodes).toEqual([])
  })

  test("records isolated eligibility only for independent non-overlapping units", () => {
    commitPlan(plan("feature", [
      { id: "frontend", area: "web", depends: "none" },
      { id: "backend", area: "api", depends: "none" },
    ]))
    const { state, result } = initialize(["--isolation-capability", "shared", "--isolation-capability", "worktree", "--max-workers", "3"])
    expect(result.exitCode, result.error?.error).toBe(0)
    expect(JSON.parse(fs.readFileSync(state, "utf8")).workflow.isolation).toMatchObject({ selected: "worktree", max_workers: 2, parallel_eligible: true, eligible_group: ["frontend", "backend"] })
  })

  test("rejects an override below a hotfix safety floor", () => {
    commitPlan(plan("hotfix"))
    const { result } = initialize(["--profile", "chore"])
    expect(result.exitCode).toBe(3)
    expect(result.error.error).toContain("below the deterministic safety floor")
  })

  test("rejects plan profile metadata below observed incident risk", () => {
    commitPlan(plan("plan", undefined, "chore").replace("Route this work safely", "Restore production outage"))
    const { result } = initialize()
    expect(result.exitCode).toBe(3)
    expect(result.error.error).toContain("workflow_profile is below the deterministic safety floor")
  })

  test("requires proposal approval before hotfix implementation", () => {
    commitPlan(plan("hotfix"))
    const { state, result } = initialize()
    expect(result.json).toMatchObject({ profile: "hotfix", next_action: "await-hotfix-proposal-approval" })
    expect(engine("start-next", "--state", state).exitCode).toBe(5)
    const approved = engine("record-proposal-decision", "--state", state, "--decision", "approved", "--approved-by", "engineer")
    expect(approved.json.next_action).toBe("start-next")
    expect(engine("start-next", "--state", state).json.next_action).toBe("dispatch-agent")
    expect(JSON.parse(fs.readFileSync(path.join(path.dirname(state), "hotfix-proposal-decision.json"), "utf8")).delivery_authorized).toBe(false)
  })

  test("dispatches a router only for ambiguous work and persists its rationale", () => {
    commitPlan(plan("mystery"))
    const { state, result } = initialize()
    expect(result.json.next_action).toBe("dispatch-router")
    const incoming = path.join(path.dirname(state), "incoming-router-eval.json")
    fs.writeFileSync(incoming, JSON.stringify({ schema_version: 1, run_id: "route-run", role: "router", profile: "feature", rationale: "The requested behavior is product work with acceptance risk.", signals_considered: ["product behavior"] }))
    const routed = engine("record-router", "--state", state, "--result", incoming)
    expect(routed.exitCode, routed.error?.error).toBe(0)
    expect(routed.json).toMatchObject({ profile: "feature", route_source: "agent", next_action: "start-next" })
    expect(JSON.parse(fs.readFileSync(state, "utf8")).workflow.route.rationale).toContain("product work")
  })
})
