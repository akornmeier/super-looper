import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { captureCoreLoopBaseline, CORE_LOOP_SKILLS } from "../src/core-loop/baseline"

describe("core-loop baseline capture", () => {
  test("captures every declared core skill and distinguishes proxy metrics from tokens", async () => {
    const baseline = await captureCoreLoopBaseline(path.join(import.meta.dir, ".."))
    expect(baseline.schema_version).toBe(1)
    expect(baseline.components.map((component) => path.basename(path.dirname(component.path)))).toEqual(
      [...CORE_LOOP_SKILLS],
    )
    expect(baseline.totals.main_instruction_bytes).toBeGreaterThan(0)
    expect(baseline.totals.markdown_bytes_in_core_skill_trees).toBeGreaterThan(
      baseline.totals.main_instruction_bytes,
    )

    const snapshot = JSON.parse(
      await readFile(path.join(import.meta.dir, "../docs/evals/core-loop-baseline.json"), "utf8"),
    ) as { coverage: string; behavioral_measurement: { status: string } }
    expect(snapshot.coverage).toContain("not fabricated token counts")
    expect(snapshot.behavioral_measurement.status).toBe("pending-two-host-harness")
  })
})
