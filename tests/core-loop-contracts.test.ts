import { describe, expect, test } from "bun:test"
import {
  executionPlanSchema,
  phasePacketSchema,
  repoRelativePathSchema,
  runStateSchema,
  workerResultSchema,
  type RunState,
} from "../src/core-loop/contracts"
import {
  recordPhaseVerification,
  transitionPhase,
  transitionRun,
  transitionUnit,
} from "../src/core-loop/state-machine"

const SHA = "a".repeat(64)
const NOW = "2026-07-12T12:00:00.000Z"
const LATER = "2026-07-12T12:01:00.000Z"

function validPlan() {
  return {
    schema_version: 1,
    goal: "Ship a resumable phased runner",
    requirements: ["Preserve immutable goals"],
    phases: [
      {
        id: "phase-one",
        goal: "Establish contracts",
        depends_on: [],
        work_units: [
          {
            id: "schema",
            scope: "Define the state schema",
            files_or_area: ["src/core-loop"],
            acceptance: ["Invalid states are rejected"],
            verification: ["bun test tests/core-loop-contracts.test.ts"],
            depends_on: [],
            non_goals: ["Run agent teams"],
          },
        ],
        risks: ["Schema drift"],
        completion_gate: ["Contract tests pass"],
      },
      {
        id: "phase-two",
        goal: "Use the contracts",
        depends_on: ["phase-one"],
        work_units: [
          {
            id: "runner",
            scope: "Initialize run state",
            files_or_area: ["plugins/super-looper/skills/sl-run"],
            acceptance: ["A run starts from a valid plan"],
            verification: ["Run the smoke fixture"],
            depends_on: [],
            non_goals: [],
          },
        ],
        risks: [],
        completion_gate: ["Smoke fixture passes"],
      },
    ],
  } as const
}

function validRunState(): RunState {
  return runStateSchema.parse({
    schema_version: 1,
    run_id: "run-1",
    plan: { path: "docs/plans/example.md", sha256: SHA },
    strategy: { path: "STRATEGY.md", sha256: SHA },
    git: { branch: "feat/example", base_ref: "main", head_sha: "abcdef1" },
    status: "initialized",
    current_phase: null,
    phases: [
      {
        id: "phase-one",
        depends_on: [],
        status: "pending",
        units: [
          {
            id: "schema",
            depends_on: [],
            status: "pending",
            worker_id: null,
            changed_files: [],
            evidence: [],
            unresolved: [],
          },
        ],
        verification: { status: "not_run", evidence: [] },
        commits: [],
      },
      {
        id: "phase-two",
        depends_on: ["phase-one"],
        status: "pending",
        units: [
          {
            id: "runner",
            depends_on: [],
            status: "pending",
            worker_id: null,
            changed_files: [],
            evidence: [],
            unresolved: [],
          },
        ],
        verification: { status: "not_run", evidence: [] },
        commits: [],
      },
    ],
    usage: { available: false, by_role: {}, by_phase: {} },
    learning_candidates: [],
    strategy_observations: [],
    started_at: NOW,
    updated_at: NOW,
    terminal: null,
  })
}

describe("execution plan contract", () => {
  test("accepts a phased plan with acyclic dependencies", () => {
    expect(executionPlanSchema.parse(validPlan()).phases).toHaveLength(2)
  })

  test("rejects duplicate phase ids", () => {
    const plan = structuredClone(validPlan())
    plan.phases[1].id = "phase-one"
    expect(() => executionPlanSchema.parse(plan)).toThrow("duplicate id")
  })

  test("rejects unknown and cyclic dependencies", () => {
    const unknown = structuredClone(validPlan())
    unknown.phases[1].depends_on = ["missing-phase"]
    expect(() => executionPlanSchema.parse(unknown)).toThrow("unknown dependency")

    const cyclic = structuredClone(validPlan())
    cyclic.phases[0].depends_on = ["phase-two"]
    expect(() => executionPlanSchema.parse(cyclic)).toThrow("cycle")
  })

  test("rejects absolute and escaping repository paths", () => {
    expect(repoRelativePathSchema.safeParse("docs/plans/example.md").success).toBe(true)
    expect(repoRelativePathSchema.safeParse("/tmp/example.md").success).toBe(false)
    expect(repoRelativePathSchema.safeParse("../outside.md").success).toBe(false)
    expect(repoRelativePathSchema.safeParse("C:\\outside.md").success).toBe(false)
  })
})

describe("run-state contract", () => {
  test("accepts initialized resumable state", () => {
    expect(runStateSchema.parse(validRunState()).status).toBe("initialized")
  })

  test("rejects a completed phase without passed verification", () => {
    const state = validRunState()
    state.phases[0].status = "completed"
    state.phases[0].units[0].status = "completed"
    expect(() => runStateSchema.parse(state)).toThrow("passed verification")
  })

  test("rejects terminal status without matching terminal details", () => {
    const state = validRunState()
    state.status = "failed"
    expect(() => runStateSchema.parse(state)).toThrow("terminal details")
  })

  test("rejects current_phase that does not match the active phase", () => {
    const state = validRunState()
    state.status = "running"
    state.phases[0].status = "in_progress"
    state.current_phase = "phase-two"
    expect(() => runStateSchema.parse(state)).toThrow("in-progress phase")
  })
})

describe("phase packet and worker result contracts", () => {
  test("accepts a bounded context packet", () => {
    const packet = phasePacketSchema.parse({
      schema_version: 1,
      run_id: "run-1",
      plan: { path: "docs/plans/example.md", sha256: SHA },
      phase_id: "phase-one",
      unit_id: "schema",
      phase_goal: "Establish contracts",
      unit_scope: "Define the state schema",
      acceptance: ["Invalid states are rejected"],
      owned_scope: ["src/core-loop"],
      non_goals: ["Implement the runner"],
      strategy_excerpt: "Preserve goal fidelity",
      solution_pointers: ["docs/solutions/skill-design/example.md"],
      evidence_dossier: { path: "/tmp/super-looper/evidence.md", gist: "Relevant contracts" },
      verification_commands: ["bun test tests/core-loop-contracts.test.ts"],
    })
    expect(packet.owned_scope).toEqual(["src/core-loop"])
  })

  test("rejects worker results that claim files outside the repository", () => {
    const result = workerResultSchema.safeParse({
      schema_version: 1,
      run_id: "run-1",
      phase_id: "phase-one",
      unit_id: "schema",
      status: "completed",
      changed_files: ["../outside.md"],
      evidence: [],
      verification: [],
      risks: [],
      unresolved: [],
    })
    expect(result.success).toBe(false)
  })
})

describe("run-state transitions", () => {
  test("completes a verified phase and run through legal transitions", () => {
    let state = validRunState()
    state = transitionRun(state, "running", LATER)
    state = transitionPhase(state, "phase-one", "ready", LATER)
    state = transitionPhase(state, "phase-one", "in_progress", LATER)
    state = transitionUnit(state, "phase-one", "schema", "ready", LATER)
    state = transitionUnit(state, "phase-one", "schema", "in_progress", LATER)
    state = transitionUnit(state, "phase-one", "schema", "completed", LATER)
    state = recordPhaseVerification(
      state,
      "phase-one",
      { status: "passed", evidence: ["contract tests passed"] },
      LATER,
    )
    state = transitionPhase(state, "phase-one", "completed", LATER)

    state = transitionPhase(state, "phase-two", "ready", LATER)
    state = transitionPhase(state, "phase-two", "in_progress", LATER)
    state = transitionUnit(state, "phase-two", "runner", "ready", LATER)
    state = transitionUnit(state, "phase-two", "runner", "in_progress", LATER)
    state = transitionUnit(state, "phase-two", "runner", "completed", LATER)
    state = recordPhaseVerification(
      state,
      "phase-two",
      { status: "passed", evidence: ["smoke fixture passed"] },
      LATER,
    )
    state = transitionPhase(state, "phase-two", "completed", LATER)
    state = transitionRun(state, "completed", LATER, "all phase gates passed")

    expect(state.status).toBe("completed")
    expect(state.current_phase).toBeNull()
    expect(state.terminal?.reason).toBe("all phase gates passed")
  })

  test("blocks a dependent phase until its dependency completes", () => {
    const running = transitionRun(validRunState(), "running", LATER)
    expect(() => transitionPhase(running, "phase-two", "ready", LATER)).toThrow(
      "phase dependency is not completed",
    )
  })

  test("rejects completion before units and verification pass", () => {
    let state = transitionRun(validRunState(), "running", LATER)
    state = transitionPhase(state, "phase-one", "ready", LATER)
    state = transitionPhase(state, "phase-one", "in_progress", LATER)
    expect(() => transitionPhase(state, "phase-one", "completed", LATER)).toThrow(
      "every unit is completed",
    )
  })

  test("clears the active phase when the phase blocks", () => {
    let state = transitionRun(validRunState(), "running", LATER)
    state = transitionPhase(state, "phase-one", "ready", LATER)
    state = transitionPhase(state, "phase-one", "in_progress", LATER)
    state = transitionPhase(state, "phase-one", "blocked", LATER)
    expect(state.current_phase).toBeNull()
    expect(state.phases[0].status).toBe("blocked")
  })

  test("requires the active phase to resolve before terminal failure", () => {
    let state = transitionRun(validRunState(), "running", LATER)
    state = transitionPhase(state, "phase-one", "ready", LATER)
    state = transitionPhase(state, "phase-one", "in_progress", LATER)
    expect(() => transitionRun(state, "failed", LATER, "worker crashed")).toThrow(
      "resolve the active phase",
    )
  })

  test("terminal states cannot resume", () => {
    const state = validRunState()
    state.status = "failed"
    state.terminal = { status: "failed", reason: "verification failed", ended_at: LATER }
    expect(() => transitionRun(state, "running", LATER)).toThrow("illegal run transition")
  })
})
