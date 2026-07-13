import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { runStateSchema } from "../src/core-loop/contracts"
import {
  agentResultSchema,
  verifierResultSchema,
  workflowStateSchema,
} from "../src/workflows/contracts"

const ENGINE = path.join(
  __dirname,
  "../plugins/super-looper/skills/sl-run/scripts/run-state.py",
)

let work: string
let target: string
let state: string

function plan(command: string) {
  return `---
title: Serial kernel fixture
type: plan
date: 2026-07-13
schema_version: 1
goal: Produce one independently checked result
strategy: STRATEGY.md
origin: none
---

# Serial kernel fixture

## Requirements
- R1. Code owns deterministic checks

## Phases

## P1. Build result \`build-result\`
**Goal:** Produce the checked result.
**Depends on:** none
**Risks:** false completion

### U1. Write result \`write-result\` \`[]\`
**Scope:** Write one result file.
**Files or area:**
- \`src\`
**Depends on:** none
**Non-goals:**
- Deliver the change
**Acceptance:**
- \`src/result.txt\` exists
**Verification:**
- \`${command}\`

**Phase completion gate:**
- The result passed deterministic and semantic verification
`
}

beforeEach(() => {
  work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "workflow-kernel-")))
  target = path.join(work, "target")
  state = path.join(work, "state", "run-state.json")
  fs.mkdirSync(path.join(target, "docs/plans"), { recursive: true })
  fs.writeFileSync(path.join(target, "docs/plans/fixture.md"), plan("test -f src/result.txt"))
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

function writeJson(name: string, value: unknown) {
  const file = path.join(work, name)
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`)
  return file
}

function agentResult(role: "implementation" | "repair", resumable = true) {
  return agentResultSchema.parse({
    schema_version: 1,
    run_id: "kernel-run",
    phase_id: "build-result",
    unit_id: "write-result",
    role,
    status: "completed",
    session: { handle: "agent-session-1", resumable },
    changed_files: role === "repair" ? ["src/result.txt"] : [],
    evidence: [`${role} attempt returned`],
    risks: [],
    unresolved: [],
  })
}

function verifierResult() {
  return verifierResultSchema.parse({
    schema_version: 1,
    run_id: "kernel-run",
    phase_id: "build-result",
    role: "verifier",
    status: "passed",
    evidence: ["completion gate independently observed"],
    findings: [],
    repair_unit_id: null,
  })
}

function initialize() {
  const initialized = engine(
    "init",
    "--target",
    target,
    "--plan",
    "docs/plans/fixture.md",
    "--run-id",
    "kernel-run",
    "--state",
    state,
    "--kernel",
  )
  expect(initialized.exitCode, initialized.stderr).toBe(0)
}

describe("serial workflow kernel", () => {
  test("routes a failed code check back to the same session and stops review-ready", () => {
    initialize()
    const started = engine("start-next", "--state", state)
    expect(started.exitCode, started.stderr).toBe(0)
    expect(started.json).toMatchObject({ next_action: "dispatch-agent", agent_role: "implementation" })

    const recorded = engine(
      "record-agent",
      "--state",
      state,
      "--result",
      writeJson("implementation.json", agentResult("implementation")),
    )
    expect(recorded.exitCode, recorded.stderr).toBe(0)
    expect(recorded.json.next_action).toBe("run-checks")

    const failedCheck = engine("run-checks", "--state", state, "--timeout", "10")
    expect(failedCheck.exitCode, failedCheck.stderr).toBe(0)
    expect(failedCheck.json).toMatchObject({ next_action: "resume-agent" })
    expect(fs.existsSync(failedCheck.json.packet_path)).toBe(true)

    fs.mkdirSync(path.join(target, "src"), { recursive: true })
    fs.writeFileSync(path.join(target, "src/result.txt"), "complete\n")
    const repaired = engine(
      "record-agent",
      "--state",
      state,
      "--result",
      writeJson("repair.json", agentResult("repair")),
    )
    expect(repaired.exitCode, repaired.stderr).toBe(0)

    const passedCheck = engine("run-checks", "--state", state, "--timeout", "10")
    expect(passedCheck.exitCode, passedCheck.stderr).toBe(0)
    expect(passedCheck.json.next_action).toBe("dispatch-verifier")

    const verified = engine(
      "record-verifier",
      "--state",
      state,
      "--result",
      writeJson("verifier.json", verifierResult()),
    )
    expect(verified.exitCode, verified.stderr).toBe(0)
    expect(verified.json).toMatchObject({
      status: "review_ready",
      next_action: "await-engineer-review",
      completed_gates: ["build-result"],
    })

    const parsed = runStateSchema.parse(JSON.parse(fs.readFileSync(state, "utf8")))
    const flow = workflowStateSchema.parse(parsed.workflow)
    expect(parsed.terminal).toBeNull()
    expect(flow.sessions["build-result/write-result"]).toEqual({
      handle: "agent-session-1",
      resumable: true,
    })
    expect(flow.nodes.map((node) => [node.kind, node.status])).toEqual([
      ["agent", "passed"],
      ["code", "failed"],
      ["agent", "passed"],
      ["code", "passed"],
      ["agent", "passed"],
      ["human", "pending"],
    ])
    expect(fs.existsSync(flow.review.packet_path!)).toBe(true)
  })

  test("uses a fresh repair agent when the host session is not resumable", () => {
    initialize()
    engine("start-next", "--state", state)
    engine(
      "record-agent",
      "--state",
      state,
      "--result",
      writeJson("implementation.json", agentResult("implementation", false)),
    )
    const failedCheck = engine("run-checks", "--state", state)
    expect(failedCheck.exitCode, failedCheck.stderr).toBe(0)
    expect(failedCheck.json.next_action).toBe("dispatch-agent")
    expect(JSON.parse(fs.readFileSync(failedCheck.json.packet_path, "utf8")).session).toEqual({
      handle: "agent-session-1",
      resumable: false,
    })
  })

  test("reserves immutable result filenames for kernel-owned copies", () => {
    initialize()
    engine("start-next", "--state", state)
    const reserved = path.join(path.dirname(state), "agent-result-build-result-write-result-0.json")
    fs.writeFileSync(reserved, JSON.stringify(agentResult("implementation")))
    const recorded = engine("record-agent", "--state", state, "--result", reserved)
    expect(recorded.exitCode).toBe(3)
    expect(recorded.error.error).toContain("kernel-reserved filename")
    expect(engine("resume", "--state", state).json.next_action).toBe(
      "reconcile-in-progress-agent",
    )
  })

  test("routes a semantic finding through the remaining repair budget and re-verifies", () => {
    initialize()
    fs.mkdirSync(path.join(target, "src"), { recursive: true })
    fs.writeFileSync(path.join(target, "src/result.txt"), "first attempt\n")
    engine("start-next", "--state", state)
    engine(
      "record-agent",
      "--state",
      state,
      "--result",
      writeJson("implementation.json", agentResult("implementation")),
    )
    expect(engine("run-checks", "--state", state).json.next_action).toBe("dispatch-verifier")

    const rejected = verifierResultSchema.parse({
      schema_version: 1,
      run_id: "kernel-run",
      phase_id: "build-result",
      role: "verifier",
      status: "failed",
      evidence: ["result exists but does not satisfy the semantic gate"],
      findings: ["replace the placeholder content"],
      repair_unit_id: "write-result",
    })
    const routed = engine(
      "record-verifier",
      "--state",
      state,
      "--result",
      writeJson("verifier-failed.json", rejected),
    )
    expect(routed.exitCode, routed.stderr).toBe(0)
    expect(routed.json.next_action).toBe("resume-agent")

    fs.writeFileSync(path.join(target, "src/result.txt"), "corrected\n")
    engine(
      "record-agent",
      "--state",
      state,
      "--result",
      writeJson("repair.json", agentResult("repair")),
    )
    expect(engine("run-checks", "--state", state).json.next_action).toBe("dispatch-verifier")
    const accepted = engine(
      "record-verifier",
      "--state",
      state,
      "--result",
      writeJson("verifier-passed.json", verifierResult()),
    )
    expect(accepted.exitCode, accepted.stderr).toBe(0)
    expect(accepted.json.status).toBe("review_ready")
    expect(fs.existsSync(path.join(work, "state/verifier-result-build-result-0.json"))).toBe(true)
    expect(fs.existsSync(path.join(work, "state/verifier-result-build-result-1.json"))).toBe(true)
  })

  test("rejects shell control flow without executing its side effect", () => {
    fs.writeFileSync(
      path.join(target, "docs/plans/fixture.md"),
      plan("test -f src/result.txt && touch escaped.txt"),
    )
    git("add", ".")
    git("commit", "-q", "-m", "unsafe fixture")
    initialize()
    engine("start-next", "--state", state)
    engine(
      "record-agent",
      "--state",
      state,
      "--result",
      writeJson("implementation.json", agentResult("implementation")),
    )
    const checks = engine("run-checks", "--state", state)
    expect(checks.exitCode).toBe(3)
    expect(checks.error.error).toContain("unsupported shell control flow")
    expect(fs.existsSync(path.join(target, "escaped.txt"))).toBe(false)
  })

  test("forwards inspection requirements to the verifier instead of executing them", () => {
    fs.writeFileSync(
      path.join(target, "docs/plans/fixture.md"),
      plan("Inspect src/result.txt for the expected content"),
    )
    git("add", ".")
    git("commit", "-q", "-m", "inspection fixture")
    initialize()
    fs.mkdirSync(path.join(target, "src"), { recursive: true })
    fs.writeFileSync(path.join(target, "src/result.txt"), "complete\n")
    engine("start-next", "--state", state)
    engine(
      "record-agent",
      "--state",
      state,
      "--result",
      writeJson("implementation.json", agentResult("implementation")),
    )
    const checks = engine("run-checks", "--state", state)
    expect(checks.exitCode, checks.stderr).toBe(0)
    expect(checks.json.next_action).toBe("dispatch-verifier")
    const checkResults = JSON.parse(fs.readFileSync(checks.json.check_results_path, "utf8"))
    expect(checkResults.results).toEqual([])
    expect(checkResults.inspection_requirements).toEqual([
      "Inspect src/result.txt for the expected content",
    ])
    const verifierPacket = JSON.parse(fs.readFileSync(checks.json.packet_path, "utf8"))
    expect(verifierPacket.units[0].inspection_requirements).toEqual(
      checkResults.inspection_requirements,
    )
  })
})
