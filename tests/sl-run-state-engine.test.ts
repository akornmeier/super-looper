import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { executionPlanSchema, phasePacketSchema, runStateSchema } from "../src/core-loop/contracts"

const ENGINE = path.join(
  __dirname,
  "../plugins/super-looper/skills/sl-run/scripts/run-state.py",
)

let work: string
let target: string
let state: string

const PLAN = `---
title: Fixture plan
type: plan
date: 2026-07-13
schema_version: 1
goal: Complete two independently verified phases
strategy: STRATEGY.md
origin: none
---

# Fixture plan

## Requirements
- R1. Completed gates survive a resume

## Phases

## P1. Establish fixture \`phase-one\`
**Goal:** Establish the first observable result.
**Depends on:** none
**Risks:** state drift

### U1. Write first result \`first-unit\` \`[]\`
**Scope:** Write the first fixture file.
**Files or area:**
- \`src/phase-one\`
**Depends on:** none
**Non-goals:**
- Complete phase two
**Acceptance:**
- \`src/phase-one/result.txt\` contains \`first\`
**Verification:**
- \`test -f src/phase-one/result.txt\`

**Phase completion gate:**
- The first result is independently observable

## P2. Complete fixture \`phase-two\`
**Goal:** Establish the second observable result.
**Depends on:** \`phase-one\`
**Risks:** none

### U2. Write second result \`second-unit\` \`[]\`
**Scope:** Write the second fixture file.
**Files or area:**
- \`src/phase-two\`
**Depends on:** none
**Non-goals:**
- Re-run phase one
**Acceptance:**
- The second result exists
**Verification:**
- \`test -f src/phase-two/result.txt\`

**Phase completion gate:**
- Both fixture results are independently observable
`

beforeEach(() => {
  work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sl-run-state-")))
  target = path.join(work, "target")
  state = path.join(work, "state", "run-state.json")
  fs.mkdirSync(path.join(target, "docs/plans"), { recursive: true })
  fs.writeFileSync(path.join(target, "docs/plans/fixture.md"), PLAN)
  fs.writeFileSync(path.join(target, "STRATEGY.md"), "# Strategy\n\nKeep the goal stable.\n")
  git("init", "-q")
  git("config", "user.email", "fixture@example.com")
  git("config", "user.name", "Fixture")
  git("add", ".")
  git("commit", "-q", "-m", "fixture")
})

afterEach(() => {
  fs.rmSync(work, { recursive: true, force: true })
})

function git(...args: string[]) {
  const result = Bun.spawnSync(["git", ...args], { cwd: target, stdout: "pipe", stderr: "pipe" })
  expect(result.exitCode, result.stderr.toString()).toBe(0)
}

function engine(...args: string[]) {
  const result = Bun.spawnSync(["python3", ENGINE, ...args], {
    cwd: target,
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = result.stdout.toString().trim()
  const stderr = result.stderr.toString().trim()
  return {
    exitCode: result.exitCode,
    stdout,
    stderr,
    json: stdout ? JSON.parse(stdout) : null,
    error: stderr ? JSON.parse(stderr) : null,
  }
}

function initialize() {
  const result = engine(
    "init",
    "--target",
    target,
    "--plan",
    "docs/plans/fixture.md",
    "--run-id",
    "fixture-run",
    "--state",
    state,
  )
  expect(result.exitCode, result.stderr).toBe(0)
  return result
}

function workerResult(phaseId: string, unitId: string, changedFiles: string[] = []) {
  const resultPath = path.join(work, `result-${phaseId}-${unitId}.json`)
  fs.writeFileSync(
    resultPath,
    JSON.stringify({
      schema_version: 1,
      run_id: "fixture-run",
      phase_id: phaseId,
      unit_id: unitId,
      status: "completed",
      changed_files: changedFiles,
      evidence: ["fixture result written"],
      verification: ["unit check passed"],
      risks: [],
      unresolved: [],
    }),
  )
  return resultPath
}

function completeActiveUnit(phaseId: string, unitId: string) {
  const result = engine(
    "record-worker",
    "--state",
    state,
    "--result",
    workerResult(phaseId, unitId),
  )
  expect(result.exitCode, result.stderr).toBe(0)
}

function passPhase(evidence: string) {
  const result = engine(
    "verify-phase",
    "--state",
    state,
    "--status",
    "passed",
    "--evidence",
    evidence,
  )
  expect(result.exitCode, result.stderr).toBe(0)
  return result
}

describe("sl-run deterministic state engine", () => {
  test("executes a two-phase run and resumes at the boundary without repeating work", () => {
    const initialized = initialize()
    expect(initialized.json).toMatchObject({
      status: "initialized",
      next_action: "start-next",
      state_path: state,
    })
    const parsedPlan = executionPlanSchema.parse(
      JSON.parse(fs.readFileSync(path.join(work, "state/execution-plan.json"), "utf8")),
    )
    expect(parsedPlan.phases).toHaveLength(2)
    expect(parsedPlan.phases[0].work_units[0].acceptance[0]).toBe(
      "`src/phase-one/result.txt` contains `first`",
    )
    expect(runStateSchema.parse(JSON.parse(fs.readFileSync(state, "utf8"))).status).toBe("initialized")

    const first = engine("start-next", "--state", state)
    expect(first.exitCode, first.stderr).toBe(0)
    expect(first.json).toMatchObject({
      current_phase: "phase-one",
      current_unit: "first-unit",
      next_action: "dispatch-worker",
    })
    expect(phasePacketSchema.parse(JSON.parse(fs.readFileSync(first.json.packet_path, "utf8"))).owned_scope).toEqual(["src/phase-one"])
    completeActiveUnit("phase-one", "first-unit")
    const phaseOne = passPhase("first phase gate observed")
    expect(phaseOne.json).toMatchObject({ completed_gates: ["phase-one"], next_action: "start-next" })

    const resumed = engine("resume", "--state", state)
    expect(resumed.exitCode, resumed.stderr).toBe(0)
    expect(resumed.json).toMatchObject({
      completed_gates: ["phase-one"],
      current_phase: null,
      next_action: "start-next",
      resume_valid: true,
    })
    const second = engine("start-next", "--state", state)
    expect(second.exitCode, second.stderr).toBe(0)
    expect(second.json).toMatchObject({ current_phase: "phase-two", current_unit: "second-unit" })
    expect(JSON.parse(fs.readFileSync(second.json.packet_path, "utf8")).phase_id).toBe("phase-two")

    completeActiveUnit("phase-two", "second-unit")
    const completed = passPhase("second phase gate observed")
    expect(completed.json).toMatchObject({
      status: "completed",
      completed_gates: ["phase-one", "phase-two"],
      next_action: "none",
      terminal_reason: "all phase completion gates passed",
    })
    expect(runStateSchema.parse(JSON.parse(fs.readFileSync(state, "utf8"))).terminal?.status).toBe("completed")
    expect(engine("resume", "--state", state).exitCode).toBe(5)
  })

  test("requires reconciliation after an interrupted in-progress unit", () => {
    initialize()
    engine("start-next", "--state", state)

    const resumed = engine("resume", "--state", state)
    expect(resumed.exitCode, resumed.stderr).toBe(0)
    expect(resumed.json).toMatchObject({
      current_phase: "phase-one",
      current_unit: "first-unit",
      next_action: "reconcile-in-progress-unit",
    })
    const duplicate = engine("start-next", "--state", state)
    expect(duplicate.exitCode).toBe(5)
    expect(duplicate.error.error).toContain("must not dispatch it again")
  })

  test("reports plan and strategy mutation as typed goal drift", () => {
    initialize()
    fs.appendFileSync(path.join(target, "docs/plans/fixture.md"), "\nmutated\n")
    const planDrift = engine("resume", "--state", state)
    expect(planDrift.exitCode).toBe(8)
    expect(planDrift.error).toMatchObject({
      typed_failure: "goal-drift",
      file: "docs/plans/fixture.md",
    })

    fs.writeFileSync(path.join(target, "docs/plans/fixture.md"), PLAN)
    fs.appendFileSync(path.join(target, "STRATEGY.md"), "changed\n")
    const strategyDrift = engine("resume", "--state", state)
    expect(strategyDrift.exitCode).toBe(8)
    expect(strategyDrift.error).toMatchObject({ typed_failure: "goal-drift", file: "STRATEGY.md" })
  })

  test("rejects worker file claims outside the unit owned scope", () => {
    initialize()
    engine("start-next", "--state", state)
    const result = engine(
      "record-worker",
      "--state",
      state,
      "--result",
      workerResult("phase-one", "first-unit", ["src/phase-two/not-owned.txt"]),
    )
    expect(result.exitCode).toBe(3)
    expect(result.error.error).toContain("outside the unit owned scope")
    expect(engine("resume", "--state", state).json.next_action).toBe("reconcile-in-progress-unit")
  })

  test("fails closed on malformed plans, unsafe run ids, and concurrent state locks", () => {
    const planPath = path.join(target, "docs/plans/fixture.md")
    fs.writeFileSync(
      planPath,
      PLAN.replace(
        "## P1. Establish fixture `phase-one`\n**Goal:** Establish the first observable result.\n**Depends on:** none",
        "## P1. Establish fixture `phase-one`\n**Goal:** Establish the first observable result.\n**Depends on:** `phase-two`",
      ),
    )
    const cyclic = engine(
      "init", "--target", target, "--plan", "docs/plans/fixture.md", "--state", state,
    )
    expect(cyclic.exitCode).toBe(3)
    expect(cyclic.error.error).toContain("cycle")

    fs.writeFileSync(planPath, PLAN)
    const unsafe = engine(
      "init", "--target", target, "--plan", "docs/plans/fixture.md", "--run-id", "../../escape", "--state", state,
    )
    expect(unsafe.exitCode).toBe(3)
    expect(unsafe.error.error).toContain("run id")

    initialize()
    fs.mkdirSync(`${state}.lock`)
    const locked = engine("start-next", "--state", state)
    expect(locked.exitCode).toBe(5)
    expect(locked.error.error).toContain("already being updated")
  })
})
