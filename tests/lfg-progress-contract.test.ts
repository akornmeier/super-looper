import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

// Guarded slice: asserts BOTH markers are present so a renamed/removed marker fails
// loudly instead of silently over-slicing onto the wrong region.
function sliceBetween(content: string, start: string, end: string): string {
  const startIdx = content.indexOf(start)
  expect(startIdx).toBeGreaterThanOrEqual(0)
  const rest = content.slice(startIdx + start.length)
  const endIdx = rest.indexOf(end)
  expect(endIdx).toBeGreaterThanOrEqual(0)
  return rest.slice(0, endIdx)
}

const LFG = "plugins/super-looper/skills/lfg/SKILL.md"
const SL_LEARN = "plugins/super-looper/skills/sl-learn/SKILL.md"
const PROGRESS_REF = "plugins/super-looper/skills/lfg/references/progress-file.md"

// U7 (R14 + R17): lfg writes a structured run-progress file at every step boundary,
// and step 10 / sl-learn read the recorded step-9 CI disposition from it instead of
// grepping the PR body. These assertions grep distinctive, stable phrases so surgical
// rewording does not break the pin, while the machine-gate wording is pinned precisely
// because the literal `## CI Failures Unresolved` legitimately survives as the step-9
// floor marker and the interactive fallback — mere absence would be the wrong signal.

describe("lfg run-progress protocol (U7 / R14)", () => {
  test("carries the write-at-boundary contract and atomic tmp+rename instruction", async () => {
    const lfg = await readRepoFile(LFG)

    // Write at every step boundary
    expect(lfg).toContain("at every step boundary")
    // Atomic tmp file + rename over target
    expect(lfg).toContain("write to a temp file in the same directory, then rename it over the target")
    // Points at the reference for the exact schema (progressive disclosure)
    expect(lfg).toContain("references/progress-file.md")
  })

  test("gates all writes on the progress: marker (no marker → no writes)", async () => {
    const lfg = await readRepoFile(LFG)

    // Same literal-prefix convention as plan:<path>
    expect(lfg).toContain("progress:<path>")
    // Interactive run (no marker) writes nothing at all
    expect(lfg).toContain("make no progress writes at all")
  })

  test("declares the file as loop.sh-owned and never committed", async () => {
    const lfg = await readRepoFile(LFG)

    expect(lfg).toContain("loop.sh owns the path")
    // Lives outside the target tree, never swept into a commit
    expect(lfg).toMatch(/never stage, commit, or otherwise sweep it into a commit/)
  })
})

describe("lfg step 10 CI-disposition gate (U7 / R17)", () => {
  function step10Region(lfg: string): string {
    return sliceBetween(lfg, "10. **Learn seam**", "11. Output")
  }

  test("reads the recorded step-9 ci_disposition as the machine gate", async () => {
    const lfg = await readRepoFile(LFG)
    const step10 = step10Region(lfg)

    // The recorded disposition — not the PR body — is the machine gate
    expect(step10).toContain("ci_disposition")
    expect(step10).toContain("machine gate")
    // The disposition read is primary; the PR-body section is demoted to fallback/record
    const dispIdx = step10.indexOf("ci_disposition")
    const bodyIdx = step10.indexOf("## CI Failures Unresolved")
    expect(dispIdx).toBeGreaterThanOrEqual(0)
    expect(bodyIdx).toBeGreaterThanOrEqual(0)
    expect(dispIdx).toBeLessThan(bodyIdx)
  })

  test("keeps the PR-body substring only as the explicit interactive fallback / human record", async () => {
    const lfg = await readRepoFile(LFG)
    const step10 = step10Region(lfg)

    // Fallback is explicitly the no-progress-file (interactive) path
    expect(step10).toContain("With no progress file (interactive invocation), fall back to the documented signal")
    // The PR section is the human-facing record, not the machine gate
    expect(step10).toContain("human-facing record of the outcome, not the machine gate")
  })

  test("forwards the progress marker when loading sl-learn", async () => {
    const lfg = await readRepoFile(LFG)
    const step10 = step10Region(lfg)

    expect(step10).toContain("forwarding the `progress:<path>` marker")
  })
})

describe("sl-learn CI-disposition gate (U7 / R17)", () => {
  function gateRegion(learn: string): string {
    return sliceBetween(learn, "**Step 9 ended red", "**Otherwise")
  }

  test("reads the recorded step-9 ci_disposition as the machine gate", async () => {
    const learn = await readRepoFile(SL_LEARN)
    const gate = gateRegion(learn)

    expect(gate).toContain("ci_disposition")
    expect(gate).toContain("machine gate")
    // Disposition read is primary; the PR-body section comes after as fallback
    const dispIdx = gate.indexOf("ci_disposition")
    const bodyIdx = gate.indexOf("## CI Failures Unresolved")
    expect(dispIdx).toBeGreaterThanOrEqual(0)
    expect(bodyIdx).toBeGreaterThanOrEqual(0)
    expect(dispIdx).toBeLessThan(bodyIdx)
  })

  test("keeps the PR-body substring only as the explicit interactive fallback / human record", async () => {
    const learn = await readRepoFile(SL_LEARN)
    const gate = gateRegion(learn)

    expect(gate).toContain("With no progress marker (interactive invocation), fall back to the documented signal")
    expect(gate).toContain("human-facing record, not the machine gate")
  })
})

describe("run-progress reference schema (U7 / R14)", () => {
  const FIELDS = [
    "schema_version",
    "run_id",
    "attempt",
    "step",
    "plan_path",
    "branch",
    "base_ref",
    "head_sha",
    "fix_iterations",
    "flaky_dispositions",
    "ci_disposition",
    "residuals_pointer",
    "goal_fidelity",
    "updated_at",
  ]

  test("documents every schema field", async () => {
    const ref = await readRepoFile(PROGRESS_REF)
    for (const field of FIELDS) {
      expect(ref).toContain(field)
    }
  })

  test("documents the atomic tmp+rename rule and loop.sh-owned lifecycle", async () => {
    const ref = await readRepoFile(PROGRESS_REF)

    // Atomic write: temp file in the same directory, then rename over target
    expect(ref).toContain("in the same directory as the target")
    expect(ref).toMatch(/rename` the temp file over the target/)
    // loop.sh-owned, never committed, scrubbed at terminals
    expect(ref).toContain("loop.sh owns the path")
    expect(ref).toContain("Never committed")
    expect(ref).toContain("Scrubbed by loop.sh at terminals")
  })

  test("documents the goal_fidelity verdict shape and step-5 write (U9)", async () => {
    const ref = await readRepoFile(PROGRESS_REF)
    // The null-for-now placeholder is gone; the field now carries the real shape.
    expect(ref).not.toContain("`null` for now — U9 populates it")
    // The three verdict values and the uncovered list.
    expect(ref).toContain('"verdict": "met"')
    expect(ref).toContain("partial")
    expect(ref).toContain("drifted")
    expect(ref).toContain("uncovered")
    // Written at the step-5 boundary; emit_record lifts it into the run-record.
    expect(ref).toContain("step-5 boundary")
    expect(ref).toContain("emit_record")
  })
})

// U9 (R6): lfg step 5 distills the step-4 requirements-completeness result into a
// goal_fidelity verdict written to the progress file. Grep the step-5 region for the
// distillation instruction so a rewrite that drops it fails loudly.
describe("lfg step 5 goal-fidelity distillation (U9 / R6)", () => {
  function step5Region(lfg: string): string {
    return sliceBetween(lfg, "5. **Apply and persist review fixes**", "6. **Autonomous residual handoff**")
  }

  test("carries the verdict-distillation instruction and the met/partial/drifted shape", async () => {
    const lfg = await readRepoFile(LFG)
    const step5 = step5Region(lfg)

    expect(step5).toContain("goal_fidelity")
    expect(step5).toContain("requirements_completeness")
    // The three verdict values plus the uncovered list, and the null-when-no-review case.
    expect(step5).toContain('"verdict": "met|partial|drifted"')
    expect(step5).toContain("uncovered")
    expect(step5).toContain("no requirements check")
    // Semi-automated: gated on the progress marker, no new review pass.
    expect(step5).toContain("progress:<path>")
    expect(step5).toContain("no new review pass")
  })

  test("review-followup reference carries the same derivation", async () => {
    const ref = await readRepoFile("plugins/super-looper/skills/lfg/references/review-followup.md")
    expect(ref).toContain("goal_fidelity")
    expect(ref).toContain("Goal-fidelity verdict")
    expect(ref).toContain("drifted")
    expect(ref).toContain("emit_record")
  })
})

// U9 (R6): sl-product-pulse maps goal_fidelity to the run-record ledger source
// (it leaves pulse_pending_metrics). Grep the ledger worked-instances section.
describe("pulse goal_fidelity ledger mapping (U9 / R6)", () => {
  const PULSE_TEMPLATE = "plugins/super-looper/skills/sl-product-pulse/references/report-template.md"

  test("maps goal_fidelity to the local JSONL ledger source", async () => {
    const tmpl = await readRepoFile(PULSE_TEMPLATE)
    // The worked instance lives under the Local JSONL ledger sources section.
    const ledgerSection = sliceBetween(tmpl, "## Local JSONL ledger sources", "## Git-derived proxy metrics")
    expect(ledgerSection).toContain("goal_fidelity")
    expect(ledgerSection).toContain("verdict")
  })
})
