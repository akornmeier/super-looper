import {
  type ProgressStatus,
  type RunState,
  type Verification,
  runStateSchema,
} from "./contracts"

const PROGRESS_TRANSITIONS: Record<ProgressStatus, readonly ProgressStatus[]> = {
  pending: ["ready", "blocked", "failed"],
  ready: ["in_progress", "blocked", "failed"],
  in_progress: ["completed", "blocked", "failed"],
  blocked: ["ready", "failed"],
  failed: ["ready"],
  completed: [],
}

const RUN_TRANSITIONS: Record<RunState["status"], readonly RunState["status"][]> = {
  initialized: ["running", "failed", "cancelled"],
  running: ["blocked", "completed", "failed", "cancelled"],
  blocked: ["running", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
}

function clone(state: RunState): RunState {
  return structuredClone(state)
}

function assertTransition<T extends string>(
  current: T,
  next: T,
  allowed: Record<T, readonly T[]>,
  subject: string,
) {
  if (!allowed[current].includes(next)) {
    throw new Error(`illegal ${subject} transition: ${current} -> ${next}`)
  }
}

function phaseIndex(state: RunState, phaseId: string): number {
  const index = state.phases.findIndex((phase) => phase.id === phaseId)
  if (index === -1) throw new Error(`unknown phase: ${phaseId}`)
  return index
}

function unitIndex(state: RunState, phaseIndexValue: number, unitId: string): number {
  const index = state.phases[phaseIndexValue].units.findIndex((unit) => unit.id === unitId)
  if (index === -1) throw new Error(`unknown unit: ${unitId}`)
  return index
}

export function transitionRun(
  input: RunState,
  next: RunState["status"],
  at: string,
  reason?: string,
): RunState {
  const state = clone(runStateSchema.parse(input))
  assertTransition(state.status, next, RUN_TRANSITIONS, "run")

  if (next === "completed" && state.phases.some((phase) => phase.status !== "completed")) {
    throw new Error("cannot complete run before every phase is completed")
  }
  if (["completed", "failed", "cancelled"].includes(next) && state.current_phase !== null) {
    throw new Error("resolve the active phase before entering a terminal run state")
  }

  state.status = next
  state.updated_at = at
  if (["completed", "failed", "cancelled"].includes(next)) {
    if (!reason) throw new Error(`terminal run transition to ${next} requires a reason`)
    state.current_phase = null
    state.terminal = { status: next as "completed" | "failed" | "cancelled", reason, ended_at: at }
  }

  return runStateSchema.parse(state)
}

export function transitionPhase(
  input: RunState,
  phaseId: string,
  next: ProgressStatus,
  at: string,
): RunState {
  const state = clone(runStateSchema.parse(input))
  const index = phaseIndex(state, phaseId)
  const phase = state.phases[index]
  assertTransition(phase.status, next, PROGRESS_TRANSITIONS, "phase")

  if (next === "ready") {
    const incompleteDependency = phase.depends_on.find(
      (dependency) => state.phases.find((candidate) => candidate.id === dependency)?.status !== "completed",
    )
    if (incompleteDependency) {
      throw new Error(`phase dependency is not completed: ${incompleteDependency}`)
    }
  }

  if (next === "in_progress") {
    if (state.status !== "running") throw new Error("run must be running before a phase can start")
    if (state.current_phase !== null && state.current_phase !== phaseId) {
      throw new Error(`another phase is already active: ${state.current_phase}`)
    }
    state.current_phase = phaseId
  }

  if (next === "completed") {
    if (phase.units.some((unit) => unit.status !== "completed")) {
      throw new Error("cannot complete phase before every unit is completed")
    }
    if (phase.verification.status !== "passed") {
      throw new Error("cannot complete phase before verification passes")
    }
    state.current_phase = null
  }
  if (["blocked", "failed"].includes(next) && state.current_phase === phaseId) {
    state.current_phase = null
  }

  phase.status = next
  state.updated_at = at
  return runStateSchema.parse(state)
}

export function transitionUnit(
  input: RunState,
  phaseId: string,
  unitId: string,
  next: ProgressStatus,
  at: string,
): RunState {
  const state = clone(runStateSchema.parse(input))
  const phaseIndexValue = phaseIndex(state, phaseId)
  const phase = state.phases[phaseIndexValue]
  const unitIndexValue = unitIndex(state, phaseIndexValue, unitId)
  const unit = phase.units[unitIndexValue]
  assertTransition(unit.status, next, PROGRESS_TRANSITIONS, "unit")

  if (next === "ready") {
    const incompleteDependency = unit.depends_on.find(
      (dependency) => phase.units.find((candidate) => candidate.id === dependency)?.status !== "completed",
    )
    if (incompleteDependency) {
      throw new Error(`unit dependency is not completed: ${incompleteDependency}`)
    }
  }

  if (next === "in_progress" && phase.status !== "in_progress") {
    throw new Error("phase must be in progress before a unit can start")
  }

  unit.status = next
  state.updated_at = at
  return runStateSchema.parse(state)
}

export function recordPhaseVerification(
  input: RunState,
  phaseId: string,
  verification: Verification,
  at: string,
): RunState {
  const state = clone(runStateSchema.parse(input))
  const index = phaseIndex(state, phaseId)
  const phase = state.phases[index]
  if (phase.status !== "in_progress") {
    throw new Error("phase must be in progress before verification is recorded")
  }
  if (phase.units.some((unit) => unit.status !== "completed")) {
    throw new Error("cannot verify phase before every unit is completed")
  }

  phase.verification = verification
  state.updated_at = at
  return runStateSchema.parse(state)
}
