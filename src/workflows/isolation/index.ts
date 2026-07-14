import type { ProfileName } from "../profiles"
import { PROFILE_CATALOG } from "../profiles"

export type IsolationMode = "sandbox" | "worktree" | "shared"
export type UnitOwnership = { id: string; depends_on: string[]; files_or_area: string[] }

function scopesOverlap(left: string[], right: string[]): boolean {
  const normalize = (value: string) => value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "")
  return left.some((a) => right.some((b) => {
    const x = normalize(a)
    const y = normalize(b)
    if (!x || !y || x === "." || y === "." || x.includes("*") || y.includes("*")) return true
    return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`)
  }))
}

function dependsTransitively(unit: string, target: string, byId: Map<string, UnitOwnership>, seen = new Set<string>()): boolean {
  if (seen.has(unit)) return false
  seen.add(unit)
  return (byId.get(unit)?.depends_on ?? []).some((dependency) => dependency === target || dependsTransitively(dependency, target, byId, seen))
}

export function selectIsolation(
  available: IsolationMode[],
  requestedWorkers: number,
  profile: ProfileName,
  units: UnitOwnership[],
) {
  const capabilities = [...new Set(available.length ? available : ["shared"])]
  const selected: IsolationMode = capabilities.includes("sandbox")
    ? "sandbox"
    : capabilities.includes("worktree")
      ? "worktree"
      : "shared"
  const hardLimit = Math.max(1, Math.min(3, requestedWorkers, PROFILE_CATALOG.profiles[profile].max_workers))
  const byId = new Map(units.map((unit) => [unit.id, unit]))
  const eligible: string[] = []
  for (const unit of units) {
    if (eligible.length >= hardLimit) break
    const independent = eligible.every((otherId) => {
      const other = byId.get(otherId)!
      return !dependsTransitively(unit.id, otherId, byId) && !dependsTransitively(otherId, unit.id, byId) && !scopesOverlap(unit.files_or_area, other.files_or_area)
    })
    if (independent) eligible.push(unit.id)
  }
  const parallelEligible = selected !== "shared" && hardLimit > 1 && eligible.length > 1
  return {
    available: capabilities,
    selected,
    requested_workers: requestedWorkers,
    max_workers: parallelEligible ? Math.min(hardLimit, eligible.length) : 1,
    parallel_eligible: parallelEligible,
    eligible_group: parallelEligible ? eligible : [],
    reason: selected === "shared"
      ? "shared checkout forces serial execution"
      : parallelEligible
        ? "isolated, DAG-independent, non-overlapping units are eligible"
        : "profile, dependency, or ownership constraints force serial execution",
  }
}
