import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { runStateSchema } from "../src/core-loop/contracts"
import { closeoutResultSchema, workflowStateSchema } from "../src/workflows/contracts"
import { reviewPacketSchema } from "../src/workflows/review"

const ENGINE = path.join(process.cwd(), "plugins/super-looper/skills/sl-run/scripts/run-state.py")
let root: string
let target: string
let state: string

const PLAN = `---
title: U8 fixture
type: refactor
date: 2026-07-13
schema_version: 1
goal: Complete the review and closeout workflow
strategy: STRATEGY.md
origin: none
---

# U8 fixture

## Requirements
- R1. Require engineer delivery approval

## Phases

## P1. Build result \`build-result\`
**Goal:** Produce the checked result.
**Depends on:** none
**Risks:** delivery authority

### U1. Write result \`write-result\` \`[]\`
**Scope:** Write one result file.
**Files or area:**
- \`src\`
**Depends on:** none
**Non-goals:**
- Edit strategy
**Acceptance:**
- \`src/result.txt\` exists
**Verification:**
- \`test -f src/result.txt\`

**Phase completion gate:**
- The result passed independent verification
`

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "workflow-closeout-")))
  target = path.join(root, "target")
  state = path.join(root, "state", "run-state.json")
  fs.mkdirSync(path.join(target, "docs/plans"), { recursive: true })
  fs.writeFileSync(path.join(target, "docs/plans/fixture.md"), PLAN)
  fs.writeFileSync(path.join(target, "STRATEGY.md"), "# Strategy\n\nKeep this immutable.\n")
  git("init", "-q")
  git("config", "user.email", "fixture@example.com")
  git("config", "user.name", "Fixture")
  git("add", ".")
  git("commit", "-q", "-m", "fixture")
})

afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

function git(...args: string[]) {
  const result = Bun.spawnSync(["git", ...args], { cwd: target, stdout: "pipe", stderr: "pipe" })
  expect(result.exitCode, result.stderr.toString()).toBe(0)
  return result.stdout.toString().trim()
}

function engine(...args: string[]) {
  const result = Bun.spawnSync(["python3", ENGINE, ...args], {
    cwd: target,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PATH: `${path.join(root, "bin")}:${process.env.PATH}`, U8_CI_FILE: path.join(root, "ci.json") },
  })
  const stdout = result.stdout.toString().trim()
  const stderr = result.stderr.toString().trim()
  return { exitCode: result.exitCode, json: stdout ? JSON.parse(stdout) : null, error: stderr ? JSON.parse(stderr) : null }
}

function writeJson(name: string, value: unknown) {
  const file = path.join(root, name)
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`)
  return file
}

function initialize(action: "commit" | "commit-push-pr" = "commit") {
  const result = engine(
    "init", "--kernel", "--target", target, "--plan", "docs/plans/fixture.md",
    "--run-id", "u8-run", "--state", state, "--delivery-action", action,
  )
  expect(result.exitCode, result.error?.error).toBe(0)
}

function driveToReviewReady(action: "commit" | "commit-push-pr" = "commit") {
  initialize(action)
  fs.mkdirSync(path.join(target, "src"), { recursive: true })
  fs.writeFileSync(path.join(target, "src/result.txt"), "complete\n")
  engine("start-next", "--state", state)
  const agent = engine("record-agent", "--state", state, "--result", writeJson("agent.json", {
    schema_version: 1,
    run_id: "u8-run",
    phase_id: "build-result",
    unit_id: "write-result",
    role: "implementation",
    status: "completed",
    session: { handle: "builder-1", resumable: true },
    changed_files: ["src/result.txt"],
    evidence: ["implemented the bounded result"],
    risks: [],
    unresolved: [],
  }))
  expect(agent.exitCode, agent.error?.error).toBe(0)
  expect(engine("run-checks", "--state", state).json.next_action).toBe("dispatch-verifier")
  const verifier = engine("record-verifier", "--state", state, "--result", writeJson("verifier.json", {
    schema_version: 1,
    run_id: "u8-run",
    phase_id: "build-result",
    role: "verifier",
    status: "passed",
    evidence: ["acceptance and delivery boundary independently checked"],
    findings: [],
    repair_unit_id: null,
  }))
  expect(verifier.exitCode, verifier.error?.error).toBe(0)
  return verifier
}

function approve() {
  const approved = engine(
    "record-review-decision", "--state", state, "--decision", "approved",
    "--decided-by", "engineer@example.com", "--rationale", "Evidence is sufficient for the proposed delivery.",
  )
  expect(approved.exitCode, approved.error?.error).toBe(0)
  return approved
}

function noLearning(strategyDelta: string | null = null) {
  return closeoutResultSchema.parse({
    schema_version: 1,
    run_id: "u8-run",
    learning: {
      status: "no-learning",
      reason: "The run followed established workflow behavior without a novel causal lesson.",
      claim: null,
      path: null,
      reusable: false,
      evidence_backed: true,
      novel: false,
      behavior_changing: false,
      existing_matches: [],
      evidence_paths: [],
    },
    strategy: {
      observations: strategyDelta ? ["The outcome may affect a tracked workflow investment."] : [],
      proposed_delta: strategyDelta,
    },
  })
}

describe("U8 engineer review, delivery, and closeout", () => {
  test("emits a complete review packet and requires an explicit final decision", () => {
    const ready = driveToReviewReady()
    expect(ready.json.next_action).toBe("await-engineer-review")
    const packet = reviewPacketSchema.parse(JSON.parse(fs.readFileSync(ready.json.packet_path, "utf8")))
    expect(packet.intent.goal).toContain("review and closeout")
    expect(packet.scope.changed_files).toEqual(["src/result.txt"])
    expect(packet.deterministic_checks).not.toHaveLength(0)
    expect(packet.semantic_verification).not.toHaveLength(0)
    expect(packet.authority).toEqual({
      proposal_approved: false,
      delivery_authorized: false,
      final_engineer_approval_required: true,
    })
    expect(engine("deliver", "--state", state).exitCode).toBe(5)
  })

  test("rejection is terminal and repair requests resume the responsible session", () => {
    driveToReviewReady()
    const rejected = engine(
      "record-review-decision", "--state", state, "--decision", "rejected",
      "--decided-by", "engineer", "--rationale", "The delivery risk is not acceptable.",
    )
    expect(rejected.json).toMatchObject({ status: "cancelled", next_action: "none" })
    expect(fs.existsSync(rejected.json.run_record_path)).toBe(true)

    fs.rmSync(path.dirname(state), { recursive: true, force: true })
    git("reset", "--hard", "HEAD")
    driveToReviewReady()
    const repair = engine(
      "record-review-decision", "--state", state, "--decision", "repair-requested",
      "--decided-by", "engineer", "--rationale", "Tighten the result before delivery.",
      "--repair-unit-id", "write-result",
    )
    expect(repair.json).toMatchObject({ status: "running", next_action: "resume-agent" })
    expect(fs.existsSync(repair.json.packet_path)).toBe(true)
  })

  test("approved local delivery closes with no learning and a separate strategy proposal", () => {
    const strategyBefore = fs.readFileSync(path.join(target, "STRATEGY.md"), "utf8")
    driveToReviewReady()
    expect(approve().json.next_action).toBe("deliver")
    const delivered = engine("deliver", "--state", state)
    expect(delivered.exitCode, delivered.error?.error).toBe(0)
    expect(delivered.json.next_action).toBe("dispatch-closeout")
    expect(git("log", "-1", "--format=%s")).toMatch(/^refactor\(run\):/)

    const closed = engine(
      "record-closeout", "--state", state, "--result",
      writeJson("closeout.json", noLearning("Consider making review latency a tracked metric.")),
    )
    expect(closed.exitCode, closed.error?.error).toBe(0)
    expect(closed.json).toMatchObject({ status: "completed", next_action: "none" })
    expect(fs.existsSync(closed.json.strategy_proposal_path)).toBe(true)
    expect(fs.readFileSync(path.join(target, "STRATEGY.md"), "utf8")).toBe(strategyBefore)
    const parsed = runStateSchema.parse(JSON.parse(fs.readFileSync(state, "utf8")))
    const flow = workflowStateSchema.parse(parsed.workflow)
    expect(flow.closeout).toMatchObject({ learning: "no-learning", strategy: "proposed" })
    expect(fs.existsSync(closed.json.run_record_path)).toBe(true)
  })

  test("a warranted learning is committed only after every closeout gate passes", () => {
    driveToReviewReady()
    approve()
    expect(engine("deliver", "--state", state).json.next_action).toBe("dispatch-closeout")
    fs.mkdirSync(path.join(target, "docs/solutions/workflow"), { recursive: true })
    fs.writeFileSync(
      path.join(target, "docs/solutions/workflow/evidence-closeout.md"),
      "---\nmodule: workflow\ntags: [closeout]\nproblem_type: workflow\n---\n\n# Evidence closeout\n",
    )
    const result = closeoutResultSchema.parse({
      schema_version: 1,
      run_id: "u8-run",
      learning: {
        status: "written",
        reason: "A reusable evidence boundary was established and is absent from the indexed corpus.",
        claim: "Commit warranted learning through the same code-owned delivery boundary.",
        path: "docs/solutions/workflow/evidence-closeout.md",
        reusable: true,
        evidence_backed: true,
        novel: true,
        behavior_changing: true,
        existing_matches: [],
        evidence_paths: [path.join(path.dirname(state), "review-packet.json")],
      },
      strategy: { observations: [], proposed_delta: null },
    })
    const closed = engine("record-closeout", "--state", state, "--result", writeJson("learning-closeout.json", result))
    expect(closed.exitCode, closed.error?.error).toBe(0)
    expect(closed.json.status).toBe("completed")
    expect(git("log", "-1", "--format=%s")).toBe("docs(run): capture evidence-backed learning")
    expect(git("status", "--short")).toBe("")
  })

  test("the typed closeout contract refuses a written learning with a failed novelty gate", () => {
    expect(() => closeoutResultSchema.parse({
      ...noLearning(),
      learning: {
        ...noLearning().learning,
        status: "written",
        claim: "Duplicate an existing lesson.",
        path: "docs/solutions/workflow/duplicate.md",
        reusable: true,
        evidence_backed: true,
        novel: false,
        behavior_changing: true,
      },
    })).toThrow("written learning must pass every evidence and novelty gate")
  })

  test("failed PR CI routes a typed repair within the existing budget", () => {
    const remote = path.join(root, "remote.git")
    const bare = Bun.spawnSync(["git", "init", "--bare", "-q", remote])
    expect(bare.exitCode).toBe(0)
    git("remote", "add", "origin", remote)
    git("push", "-u", "origin", "HEAD")
    fs.mkdirSync(path.join(root, "bin"), { recursive: true })
    const gh = path.join(root, "bin", "gh")
    fs.writeFileSync(gh, `#!/usr/bin/env bash
if [ "$1 $2" = "pr view" ]; then exit 1; fi
if [ "$1 $2" = "pr create" ]; then printf '%s\n' 'https://example.test/pull/1'; exit 0; fi
if [ "$1 $2" = "pr checks" ]; then cat "$U8_CI_FILE"; exit 0; fi
exit 2
`)
    fs.chmodSync(gh, 0o755)
    fs.writeFileSync(path.join(root, "ci.json"), JSON.stringify([
      { name: "test", bucket: "fail", state: "FAILURE", link: "https://example.test/check/1" },
    ]))

    driveToReviewReady("commit-push-pr")
    approve()
    expect(engine("deliver", "--state", state).json.next_action).toBe("observe-ci")
    const observed = engine("observe-ci", "--state", state)
    expect(observed.exitCode, observed.error?.error).toBe(0)
    expect(observed.json).toMatchObject({ ci_disposition: "failed", next_action: "resume-agent" })
    expect(JSON.parse(fs.readFileSync(observed.json.ci_path, "utf8"))).toMatchObject({ disposition: "failed" })
  })
})
