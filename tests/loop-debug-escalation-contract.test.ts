import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

const SL_DEBUG = "plugins/super-looper/skills/sl-debug/SKILL.md"
const LFG = "plugins/super-looper/skills/lfg/SKILL.md"

// Guarded slice: asserts BOTH markers are present so a renamed/removed marker fails
// loudly instead of silently over-slicing (a slice that passes on the wrong content).
function sliceBetween(content: string, start: string, end: string): string {
  const startIdx = content.indexOf(start)
  expect(startIdx).toBeGreaterThanOrEqual(0)
  const rest = content.slice(startIdx + start.length)
  const endIdx = rest.indexOf(end)
  expect(endIdx).toBeGreaterThanOrEqual(0)
  return rest.slice(0, endIdx)
}

function nonInteractiveSection(content: string): string {
  return sliceBetween(content, "## Non-Interactive Mode", "## Core Principles")
}

describe("sl-debug non-interactive mode (U1)", () => {
  test("declares the mode:unattended token in its argument convention", async () => {
    const content = await readRepoFile(SL_DEBUG)
    expect(content).toContain("## Non-Interactive Mode (`mode:unattended`)")

    const section = nonInteractiveSection(content)
    // Token parsed from $ARGUMENTS and stripped before triage, mirroring other skills' mode tokens
    expect(section).toContain("parsed from `$ARGUMENTS`")
    expect(section).toContain("Strip it from `<bug_description>`")
  })

  test("suppresses the present-findings / fix-vs-diagnose gate in unattended mode", async () => {
    const content = await readRepoFile(SL_DEBUG)
    // Conditioned at the Phase 2 gate itself, not only declared in the mode block
    expect(content).toContain(
      "In `mode:unattended`, skip this present-findings / fix-vs-diagnose gate",
    )
    expect(content).toContain('auto-select "Fix it now"')
  })

  test("suppresses BOTH Phase 3 workspace prompts in unattended mode", async () => {
    const content = await readRepoFile(SL_DEBUG)
    const section = nonInteractiveSection(content)
    // Both prompts enumerated in the mode block so the contract covers each, not just the branch half
    expect(section).toContain("uncommitted-work confirmation")
    expect(section).toContain("default-branch branch-creation prompt")

    // And restated at the Phase 3 workspace check at its point of action
    const phase3 = sliceBetween(content, "**Workspace and branch check:**", "### Phase 4")
    expect(phase3).toContain("In `mode:unattended`, skip both checks below")
    expect(phase3).toContain(
      "uncommitted-work confirmation **and** the default-branch branch-creation prompt",
    )
  })

  test("preserves the no-weaken-the-assertion discipline in the unattended path", async () => {
    const content = await readRepoFile(SL_DEBUG)
    const section = nonInteractiveSection(content)
    // The prohibition lives inside the mode block — the mode does not gate it away
    expect(section).toContain("Suppressing the prompts does not relax the method")
    expect(section).toContain("never weaken, skip, or mock an assertion to make a check pass")
  })

  test("returns without committing and leaves the tree untouched on every no-fix path", async () => {
    const content = await readRepoFile(SL_DEBUG)
    const section = nonInteractiveSection(content)
    expect(section).toContain("without committing or pushing")
    expect(section).toContain("no working-tree change")
    expect(section).toContain("cannot reproduce in this environment")
    // Documented mode precondition: caller guarantees a clean tree on a branch
    expect(section).toContain("clean, intended working tree on a branch")
    // A no-fix path must revert the test-first reproduction test so the tree is genuinely
    // untouched — otherwise the caller's git-status signal misreads it as a fix.
    expect(section).toContain("revert or discard any reproduction test")
  })

  test("suppresses the Phase 0 trivial-bug fast-path gate at its point of action", async () => {
    const content = await readRepoFile(SL_DEBUG)
    const fastPath = sliceBetween(content, "**Trivial-bug fast-path:**", "**Otherwise**")
    expect(fastPath).toContain("mode:unattended")
    // Unattended resolves the fast-path's user-choice gate to "Fix it now" (no ambiguity)
    expect(fastPath).toContain('treat the fast-path as "Fix it now"')
  })

  test("Phase 4 handoff returns without committing in unattended mode, at its point of action", async () => {
    const content = await readRepoFile(SL_DEBUG)
    const phase4 = sliceBetween(content, "### Phase 4: Handoff", "**If Phase 3 was skipped**")
    expect(phase4).toContain("In `mode:unattended`, the structured summary above is the return value")
    expect(phase4).toContain("do not run `/sl-commit-push-pr`")
    expect(phase4).toContain("do not commit or push")
    // The Phase 4 no-fix list is aligned to the mode block's canonical terms (no "diagnosis only")
    expect(phase4).not.toContain("diagnosis only, cannot reproduce")
  })

  test("preserves the interactive default path (gates still present for non-unattended)", async () => {
    const content = await readRepoFile(SL_DEBUG)
    // Negative assertion: interactive gates remain for the default case
    expect(content).toContain("AskUserQuestion")
    expect(content).toContain("Diagnosis only")
    expect(content).toContain("The interactive path is the default and is unchanged")
  })
})

// Step 9 is the only step with a region between the CI-watch header and the step-10
// learn-seam marker; these slices isolate the give-up region and the rung itself.
function step9Region(lfg: string): string {
  return sliceBetween(lfg, "**CI watch and autofix loop**", "10. **Learn seam**")
}

function rungRegion(lfg: string): string {
  return sliceBetween(lfg, "**Debug-escalation rung**", "**Floor")
}

describe("lfg debug-escalation rung (U2)", () => {
  test("AE1: rung invokes sl-debug with the non-interactive mode token, after the 3-attempt GATE", async () => {
    const lfg = await readRepoFile(LFG)
    const step9 = step9Region(lfg)

    expect(step9).toContain("**Debug-escalation rung**")
    expect(step9).toContain("Load the `sl-debug` skill with `mode:unattended`")

    // Positioned after the give-up GATE, not before it
    expect(step9.indexOf("STOP iterating after 3 failed attempts")).toBeGreaterThanOrEqual(0)
    expect(step9.indexOf("STOP iterating after 3 failed attempts")).toBeLessThan(
      step9.indexOf("**Debug-escalation rung**"),
    )

    // The iteration step records the disposition the GATE reads
    expect(step9).toContain("record a flaky-no-fix-path disposition for this run")
  })

  test("AE2 / R6: the floor is preserved after the escalation and enriched with debug findings on red", async () => {
    const lfg = await readRepoFile(LFG)
    const step9 = step9Region(lfg)

    // Floor marker still exists and is reachable after the rung (not replaced by it)
    expect(lfg).toContain("## CI Failures Unresolved")
    expect(step9.indexOf("**Debug-escalation rung**")).toBeLessThan(
      step9.indexOf("**Floor — compose"),
    )

    // Red path enriches the floor with the pass's findings — not just the bare marker
    expect(step9).toContain("enrich it with the debug pass's findings")
    expect(step9).toContain("could not reproduce in the CI environment")
  })

  test("AE3 / R2: the flaky-no-fix-path disposition routes to the floor without invoking the rung", async () => {
    const lfg = await readRepoFile(LFG)
    const step9 = step9Region(lfg)

    expect(step9).toContain("Flaky-no-fix-path disposition recorded")
    expect(step9).toContain("skip the escalation and go straight to the floor")

    // The flaky branch does not invoke sl-debug — slice the flaky bullet and assert no escalation there
    const flakyBullet = sliceBetween(step9, "Flaky-no-fix-path disposition recorded", "Genuine exhaustion")
    expect(flakyBullet).not.toContain("sl-debug")
  })

  test("the rung restates the no-weaken/skip/mock prohibition for the unattended pass", async () => {
    const lfg = await readRepoFile(LFG)
    const rung = rungRegion(lfg)
    expect(rung).toContain("do NOT weaken, skip, or mock the failing assertion to make it pass")
  })

  test("AE4 / R4: the rung re-checks CI once and contains no return-to-iteration edge", async () => {
    const lfg = await readRepoFile(LFG)
    const rung = rungRegion(lfg)

    expect(rung).toContain("not a loop")
    expect(rung).toContain("exactly once")
    expect(rung).toContain("at most once")

    // Negative: the loop-back instruction from the fix-iteration loop must not appear in the rung
    expect(rung).not.toMatch(/Return to iteration/i)
  })

  test("R5: the green-after-escalation path joins break-to-step-10 without composing the floor marker", async () => {
    const lfg = await readRepoFile(LFG)
    const rung = rungRegion(lfg)

    expect(rung).toContain("break out of the loop and proceed to step 10")
    expect(rung).toContain("Do NOT compose the `## CI Failures Unresolved` floor marker")

    // Open Question resolved: a failed escalation reverts its commit before the floor
    expect(rung).toContain("git revert --no-edit HEAD")
  })

  test("the rung's no-change branch falls through to the floor (detected via git status --porcelain)", async () => {
    const lfg = await readRepoFile(LFG)
    const rung = rungRegion(lfg)

    expect(rung).toContain("git status --porcelain")
    expect(rung).toContain("No change")
    expect(rung).toContain("fall through to the floor")
    // No-change enrichment names the no-finding disposition, not just "findings"
    expect(rung).toContain("no-finding disposition")
  })

  test("step ordering preserved — no renumbering of steps 10 and 11", async () => {
    const lfg = await readRepoFile(LFG)

    expect(lfg.indexOf("**CI watch and autofix loop**")).toBeLessThan(
      lfg.indexOf("**Debug-escalation rung**"),
    )
    expect(lfg.indexOf("**Debug-escalation rung**")).toBeLessThan(lfg.indexOf("10. **Learn seam**"))
    expect(lfg.indexOf("10. **Learn seam**")).toBeLessThan(lfg.indexOf("11. Output"))

    expect(lfg).toContain("10. **Learn seam**")
    expect(lfg).toContain("11. Output `<promise>DONE</promise>`")
  })
})
