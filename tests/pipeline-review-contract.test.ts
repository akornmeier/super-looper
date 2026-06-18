import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("sl-work review contract", () => {
  test("requires code review before shipping", async () => {
    const content = await readRepoFile("plugins/super-looper/skills/sl-work/SKILL.md")
    // Review content extracted to references/shipping-workflow.md
    const shipping = await readRepoFile("plugins/super-looper/skills/sl-work/references/shipping-workflow.md")

    // SKILL.md should not contain extracted content
    expect(content).not.toContain("3. **Code Review**")
    expect(content).not.toContain("Consider Code Review")
    expect(content).not.toContain("Code Review** (Optional)")

    // Phase 3 has a conditional Simplify step at position 2 (sl-simplify-code, gated on >=30 LOC)
    // and code review at position 3 (Tier 1 when available; Tier 2 on criteria only)
    expect(shipping).toContain("2. **Simplify**")
    expect(shipping).toContain("sl-simplify-code")
    expect(shipping).toContain("3. **Code Review**")

    // Two-tier rubric in reference file: Tier 1 when harness has built-in review,
    // Tier 2 is sl-code-review (risk-based escalation only — not when Tier 1 missing)
    expect(shipping).toContain("**Tier 1 -- harness-native review")
    expect(shipping).toContain("**Tier 2 -- `sl-code-review` (escalation only).**")
    expect(shipping).toContain("not** because Tier 1 is missing")
    expect(shipping).toContain("sl-code-review")
    expect(shipping).toContain("review-findings-followup.md")
    expect(shipping).toMatch(/review is not fix|2a\. Review|2b\. Apply/i)
    expect(shipping).toContain("mode:agent")

    // Quality checklist includes review
    expect(shipping).toContain("Code review: Tier 1 completed, or Tier 2 when escalated")
  })

  test("delegates commit and PR to dedicated skills", async () => {
    const content = await readRepoFile("plugins/super-looper/skills/sl-work/SKILL.md")
    // Commit/PR delegation content extracted to references/shipping-workflow.md
    const shipping = await readRepoFile("plugins/super-looper/skills/sl-work/references/shipping-workflow.md")

    expect(shipping).toContain("`sl-commit-push-pr` skill")
    expect(shipping).toContain("`sl-commit` skill")

    // Should not contain inline PR templates or attribution placeholders
    expect(content).not.toContain("gh pr create")
    expect(content).not.toContain("[HARNESS_URL]")
  })

  test("sl-work-beta mirrors review and commit delegation", async () => {
    const beta = await readRepoFile("plugins/super-looper/skills/sl-work-beta/SKILL.md")
    // Review/commit content extracted to references/shipping-workflow.md
    const shipping = await readRepoFile("plugins/super-looper/skills/sl-work-beta/references/shipping-workflow.md")

    // Extracted content in reference file: Simplify step at position 2,
    // Code Review at position 3
    expect(shipping).toContain("2. **Simplify**")
    expect(shipping).toContain("3. **Code Review**")
    expect(shipping).toContain("`sl-commit-push-pr` skill")
    expect(shipping).toContain("`sl-commit` skill")

    // Negative assertions stay on SKILL.md
    expect(beta).not.toContain("Consider Code Review")
    expect(beta).not.toContain("gh pr create")
  })

  test("sl-work-beta mirrors residual work gate sentinel with sl-work", async () => {
    const workShipping = await readRepoFile(
      "plugins/super-looper/skills/sl-work/references/shipping-workflow.md",
    )
    const betaShipping = await readRepoFile(
      "plugins/super-looper/skills/sl-work-beta/references/shipping-workflow.md",
    )

    expect(workShipping).toContain("Actionable findings: none.")
    expect(betaShipping).toContain("Actionable findings: none.")
    expect(betaShipping).not.toContain("Residual actionable work: none.")
    expect(betaShipping).toContain("not yet fixed")
    expect(betaShipping).not.toContain("skill did not auto-fix")
  })

  test("includes per-task testing deliberation in execution loop", async () => {
    const content = await readRepoFile("plugins/super-looper/skills/sl-work/SKILL.md")

    // Testing deliberation exists in the execution loop
    expect(content).toContain("Assess testing coverage")

    // Deliberation is between "Run tests after changes" and "Mark task as completed"
    const runTestsIdx = content.indexOf("Run tests after changes")
    const assessIdx = content.indexOf("Assess testing coverage")
    const markDoneIdx = content.indexOf("Mark task as completed")
    expect(runTestsIdx).toBeLessThan(assessIdx)
    expect(assessIdx).toBeLessThan(markDoneIdx)
  })

  test("quality checklist says 'Testing addressed' not 'Tests pass'", async () => {
    const content = await readRepoFile("plugins/super-looper/skills/sl-work/SKILL.md")
    // Quality checklist extracted to references/shipping-workflow.md
    const shipping = await readRepoFile("plugins/super-looper/skills/sl-work/references/shipping-workflow.md")

    // New language present in reference file
    expect(shipping).toContain("Testing addressed")

    // Old language fully removed from both
    expect(content).not.toContain("Tests pass (run project's test command)")
    expect(content).not.toContain("- All tests pass")
    expect(shipping).not.toContain("Tests pass (run project's test command)")
  })

  test("sl-work-beta mirrors testing deliberation and checklist changes", async () => {
    const beta = await readRepoFile("plugins/super-looper/skills/sl-work-beta/SKILL.md")
    // Checklist extracted to references/shipping-workflow.md
    const shipping = await readRepoFile("plugins/super-looper/skills/sl-work-beta/references/shipping-workflow.md")

    // Testing deliberation stays in SKILL.md (Phase 2 content)
    expect(beta).toContain("Assess testing coverage")

    // New checklist language in reference file
    expect(shipping).toContain("Testing addressed")

    // Old language removed from both
    expect(beta).not.toContain("Tests pass (run project's test command)")
    expect(beta).not.toContain("- All tests pass")
    expect(shipping).not.toContain("Tests pass (run project's test command)")
  })

  test("SKILL.md stub points to shipping-workflow reference", async () => {
    const content = await readRepoFile("plugins/super-looper/skills/sl-work/SKILL.md")

    // Stub references the shipping-workflow file
    expect(content).toContain("`references/shipping-workflow.md`")

    // Extracted content is not in SKILL.md
    expect(content).not.toContain("3. **Code Review**")
    expect(content).not.toContain("## Quality Checklist")
    expect(content).not.toContain("## Code Review Tiers")
  })

  test("sl:work-beta SKILL.md stub points to shipping-workflow reference", async () => {
    const content = await readRepoFile("plugins/super-looper/skills/sl-work-beta/SKILL.md")

    // Stub references the shipping-workflow file
    expect(content).toContain("`references/shipping-workflow.md`")

    // Extracted content is not in SKILL.md
    expect(content).not.toContain("3. **Code Review**")
    expect(content).not.toContain("## Quality Checklist")
    expect(content).not.toContain("## Code Review Tiers")
  })

  test("sl:work remains the stable non-delegating surface", async () => {
    const content = await readRepoFile("plugins/super-looper/skills/sl-work/SKILL.md")

    expect(content).not.toContain("## Argument Parsing")
  })
})

describe("sl:work-beta contract", () => {
  test("remains manual-invocation beta during rollout", async () => {
    const content = await readRepoFile("plugins/super-looper/skills/sl-work-beta/SKILL.md")

    expect(content).toContain("disable-model-invocation: true")
    expect(content).toContain("Invoke `sl-work-beta` manually")
    expect(content).toContain("planning and workflow handoffs remain pointed at stable `sl-work`")
  })

  test("has frontend design guidance ported from beta", async () => {
    const content = await readRepoFile("plugins/super-looper/skills/sl-work-beta/SKILL.md")

    expect(content).toContain("**Frontend Design Guidance**")
    expect(content).toContain("`sl-frontend-design` skill")
  })
})

describe("sl:plan remains neutral during sl:work-beta rollout", () => {
  test("removes delegation-specific execution posture guidance", async () => {
    const content = await readRepoFile("plugins/super-looper/skills/sl-plan/SKILL.md")

    // Old tag removed from execution posture signals
    expect(content).not.toContain("add `Execution target: external-delegate`")

    // Old tag removed from execution note examples
    expect(content).not.toContain("Execution note: Execution target: external-delegate")
  })
})

describe("sl-brainstorm review contract", () => {
  test("exposes document review as an opt-in handoff option", async () => {
    const content = await readRepoFile("plugins/super-looper/skills/sl-brainstorm/SKILL.md")
    const handoff = await readRepoFile("plugins/super-looper/skills/sl-brainstorm/references/handoff.md")

    // Document review is no longer a forced Phase 3.5 step. Users opt in from the Phase 4 menu.
    expect(content).not.toContain("Phase 3.5")

    // Phase 3 and Phase 4 are extracted to references for token optimization.
    // Phase 3 now points at brainstorm-sections.md (content contract) plus a
    // format-rendering ref; Phase 4 points at handoff.md.
    expect(content).toContain("`references/brainstorm-sections.md`")
    expect(content).toContain("`references/handoff.md`")

    // Phase 4 menu exposes agent review as a first-class option and routes to sl-doc-review
    expect(handoff).toContain("Agent review of requirements doc with `sl-doc-review`")
    expect(handoff).toContain("Load the `sl-doc-review` skill")

    // Subsequent-round residual findings are surfaced as a prose nudge, not a separate menu option
    expect(handoff).toContain("Post-review nudge")
    expect(handoff).not.toContain("**Review and refine**")
  })
})

describe("sl-plan testing contract", () => {
  test("flags blank test scenarios on feature-bearing units as incomplete", async () => {
    const content = await readRepoFile("plugins/super-looper/skills/sl-plan/SKILL.md")

    // Phase 5.1 review checklist addresses blank test scenarios
    expect(content).toContain("blank or missing test scenarios")
    expect(content).toContain("Test expectation: none")

    // Template comment mentions the annotation convention
    expect(content).toContain("Test expectation: none -- [reason]")
  })
})

describe("sl-plan review contract", () => {
  test("requires document review after confidence check", async () => {
    // Document review instructions extracted to references/plan-handoff.md
    const content = await readRepoFile("plugins/super-looper/skills/sl-plan/references/plan-handoff.md")

    // Phase 5.3.8 runs document-review before final checks (5.3.9)
    expect(content).toContain("## 5.3.8 Document Review")
    expect(content).toContain("`sl-doc-review` skill")

    // Document review must come before final checks so auto-applied edits are validated
    const docReviewIdx = content.indexOf("5.3.8 Document Review")
    const finalChecksIdx = content.indexOf("5.3.9 Final Checks")
    expect(docReviewIdx).toBeLessThan(finalChecksIdx)
  })

  test("SKILL.md stub points to plan-handoff reference", async () => {
    const content = await readRepoFile("plugins/super-looper/skills/sl-plan/SKILL.md")

    // Stub references the handoff file and marks document review as mandatory
    expect(content).toContain("`references/plan-handoff.md`")
    expect(content).toContain("Document review is mandatory")
  })

  test("uses headless mode by default and in pipeline context", async () => {
    const content = await readRepoFile("plugins/super-looper/skills/sl-plan/references/plan-handoff.md")

    // Default at Phase 5.3.8 is `mode:headless` so users opt into deeper interactive review
    // explicitly from the post-generation menu rather than being forced through it.
    expect(content).toContain("sl-doc-review` with `mode:headless`")
    expect(content).not.toContain("skip document-review and return control")

    // The interactive walkthrough is opt-in via the post-generation menu, not automatic
    expect(content).toContain("Run deeper doc review")
  })

  test("handoff options expose deeper-review opt-in alongside sl-work", async () => {
    const content = await readRepoFile("plugins/super-looper/skills/sl-plan/references/plan-handoff.md")

    // sl-work remains the recommended next-stage action (planning is done; review already ran)
    expect(content).toContain("**Start `/sl-work`** (recommended) - Begin implementing this plan in the current session")

    // The work loop (lfg) is a first-class peer option: it produces a clean handoff via
    // sl-handoff and surfaces a ready-to-run loop.sh command, but never auto-spawns a run.
    expect(content).toContain("**Start the work loop (`lfg`)**")
    expect(content).toContain("`sl-handoff`")
    expect(content).toContain("loop.sh --target")
    expect(content).toContain("do not auto-spawn")

    // Deeper review is a first-class menu fixture so users can engage with surfaced findings
    // without relying on free-form prompting; routed through sl-doc-review without headless mode.
    expect(content).toContain("**Run deeper doc review**")
    expect(content).toContain("`sl-doc-review`")
    expect(content).toContain("without** `mode:headless`")

    // Deeper-review menu fixture is hidden when no actionable findings remain; the menu then
    // collapses from 6 to 5 options (still a numbered list — above the 4-option AskUserQuestion
    // cap). FYI-only state also hides the option since sl-doc-review's walkthrough is gated to
    // actionable findings (anchor 75/100, gated_auto/manual) and FYIs (anchor 50) bypass it.
    expect(content).toContain("Hide `Run deeper doc review` when no actionable findings remain")
    expect(content).toContain("proposed_fixes_count + decisions_count > 0")

    // Summary line above the menu surfaces autofix counts and remaining-bucket counts
    expect(content).toContain("Summary line above the menu")

    // No conditional ordering based on plan depth (review already ran)
    expect(content).not.toContain("**Options when sl-doc-review is recommended:**")
    expect(content).not.toContain("**Options for Standard or Lightweight plans:**")
  })
})

describe("sl-doc-review contract", () => {
  test("findings-schema autofix_class enum uses sl-code-review-aligned tier names", async () => {
    const schema = JSON.parse(
      await readRepoFile("plugins/super-looper/skills/sl-doc-review/references/findings-schema.json")
    )
    const enumValues = schema.properties.findings.items.properties.autofix_class.enum

    // Three-tier system aligned with sl-code-review's first three tier names
    expect(enumValues).toEqual(["safe_auto", "gated_auto", "manual"])

    // No advisory tier — advisory-style findings surface as an FYI subsection at presentation layer
    expect(enumValues).not.toContain("advisory")

    // Old tier names must be gone after the rename
    expect(enumValues).not.toContain("auto")
    expect(enumValues).not.toContain("present")
  })

  test("findings schema enforces discrete confidence anchors", async () => {
    const schema = JSON.parse(
      await readRepoFile("plugins/super-looper/skills/sl-doc-review/references/findings-schema.json")
    )
    const confidence = schema.properties.findings.items.properties.confidence

    // Anchored integer enum, not continuous float
    expect(confidence.type).toBe("integer")
    expect(confidence.enum).toEqual([0, 25, 50, 75, 100])

    // No stale continuous-range properties
    expect(confidence.minimum).toBeUndefined()
    expect(confidence.maximum).toBeUndefined()

    // Rubric text embedded in the description so persona agents see it
    expect(confidence.description).toContain("Absolutely certain")
    expect(confidence.description).toContain("Highly confident")
    expect(confidence.description).toContain("Moderately confident")
    expect(confidence.description).toContain("double-checked")
    expect(confidence.description).toContain("evidence directly confirms")
  })

  test("subagent template embeds anchor rubric and bans float confidence", async () => {
    const template = await readRepoFile(
      "plugins/super-looper/skills/sl-doc-review/references/subagent-template.md"
    )

    // Rubric section embedded verbatim in the persona-facing template
    expect(template).toContain("Confidence rubric")
    expect(template).toContain("`0`")
    expect(template).toContain("`25`")
    expect(template).toContain("`50`")
    expect(template).toContain("`75`")
    expect(template).toContain("`100`")

    // Example finding uses anchor, not float
    expect(template).toContain('"confidence": 100')
    expect(template).not.toMatch(/"confidence":\s*0\.\d+/)

    // Advisory observations route to anchor 50, not to a 0.40-0.59 band
    expect(template).toContain("`confidence: 50`")
    expect(template).not.toContain("0.40–0.59 LOW/Advisory band")
    expect(template).not.toContain("0.40-0.59 LOW/Advisory band")
  })

  test("subagent template carries framing guidance and strawman rule", async () => {
    const template = await readRepoFile(
      "plugins/super-looper/skills/sl-doc-review/references/subagent-template.md"
    )

    // Framing guidance block present
    expect(template).toContain("observable consequence")
    expect(template).toContain("2-4 sentences")

    // Strawman-aware classification rule
    expect(template).toContain("Strawman-aware classification rule")
    expect(template).toContain("is NOT a real alternative")

    // Strawman safeguard on safe_auto
    expect(template).toContain("Strawman safeguard")

    // Persona exclusion of Open Questions section (prevents round-2 feedback loop)
    expect(template).toContain("Exclude prior-round deferred entries")
    expect(template).toContain("Deferred / Open Questions")

    // Decision primer slot and rules
    expect(template).toContain("{decision_primer}")
    expect(template).toContain("<decision-primer-rules>")
  })

  test("synthesis pipeline routes three tiers with anchor-based gating and FYI subsection", async () => {
    const synthesis = await readRepoFile(
      "plugins/super-looper/skills/sl-doc-review/references/synthesis-and-presentation.md"
    )

    // Anchor-based confidence gate
    expect(synthesis).toContain("Anchor-Based")
    expect(synthesis).toMatch(/`0`\s*\|/)
    expect(synthesis).toMatch(/`25`\s*\|/)
    expect(synthesis).toMatch(/`50`\s*\|/)
    expect(synthesis).toMatch(/`75`\s*\|/)
    expect(synthesis).toMatch(/`100`\s*\|/)

    // Anchor 50 routes to FYI, anchors 75/100 enter actionable tier
    expect(synthesis).toContain("FYI subsection")

    // Three-tier routing table present (autofix_class)
    expect(synthesis).toContain("`safe_auto`")
    expect(synthesis).toContain("`gated_auto`")
    expect(synthesis).toContain("`manual`")

    // Cross-persona agreement promotion (replaces +0.10 boost)
    expect(synthesis).toContain("Cross-Persona Agreement Promotion")
    expect(synthesis).toContain("one anchor step")

    // R29 and R30 round-2 rules
    expect(synthesis).toContain("R29 Rejected-Finding Suppression")
    expect(synthesis).toContain("R30 Fix-Landed Matching Predicate")
  })

  test("headless envelope surfaces new tiers distinctly", async () => {
    const synthesis = await readRepoFile(
      "plugins/super-looper/skills/sl-doc-review/references/synthesis-and-presentation.md"
    )

    // Bucket headers for the new tiers appear in the headless envelope template.
    // User-facing vocabulary: fixes / Proposed fixes / Decisions / FYI observations
    // maps to the safe_auto / gated_auto / manual / FYI internal enum values.
    expect(synthesis).toContain("Applied N fixes")
    expect(synthesis).toContain("Proposed fixes")
    expect(synthesis).toContain("Decisions")
    expect(synthesis).toContain("FYI observations")

    // Terminal signal preserved for programmatic callers
    expect(synthesis).toContain("Review complete")
  })

  test("terminal question is three-option by default with label adaptation", async () => {
    const synthesis = await readRepoFile(
      "plugins/super-looper/skills/sl-doc-review/references/synthesis-and-presentation.md"
    )

    // Three options when fixes are queued
    expect(synthesis).toContain("Apply decisions and proceed to <next stage>")
    expect(synthesis).toContain("Apply decisions and re-review")
    expect(synthesis).toContain("Exit without further action")

    // Two options in the zero-actionable case with the adapted label
    expect(synthesis).toContain("fixes_applied_count == 0")
    expect(synthesis).toContain("zero-actionable case")

    // Next-stage substitution rules documented
    expect(synthesis).toContain("Requirements document")
    expect(synthesis).toContain("Plan document")
    expect(synthesis).toContain("sl-plan")
    expect(synthesis).toContain("sl-work")
  })

  test("SKILL.md has Interactive mode rules with AskUserQuestion pre-load", async () => {
    const content = await readRepoFile(
      "plugins/super-looper/skills/sl-doc-review/SKILL.md"
    )

    // Interactive mode rules section at top
    expect(content).toContain("## Interactive mode rules")
    expect(content).toContain("AskUserQuestion")
    expect(content).toContain("ToolSearch")
    expect(content).toContain("numbered-list fallback")
    expect(content).toContain("bounded parallelism")
    expect(content).toContain("active-subagent limit")
    expect(content).toContain("spawn errors as backpressure, not reviewer failure")
    expect(content).toContain("queue the remainder")

    // Decision primer variable in the dispatch table
    expect(content).toContain("{decision_primer}")
    expect(content).toContain("<prior-decisions>")

    // References loaded lazily via backtick paths for walk-through and bulk-preview
    expect(content).toContain("`references/walkthrough.md`")
    expect(content).toContain("`references/bulk-preview.md`")
  })

  test("walkthrough and bulk-preview reference files exist with required mechanics", async () => {
    const walkthrough = await readRepoFile(
      "plugins/super-looper/skills/sl-doc-review/references/walkthrough.md"
    )
    const bulkPreview = await readRepoFile(
      "plugins/super-looper/skills/sl-doc-review/references/bulk-preview.md"
    )

    // Routing question distinguishing words present (front-loaded per AGENTS.md Interactive Question Tool Design)
    expect(walkthrough).toContain("Review each finding one by one")
    expect(walkthrough).toContain("Auto-resolve with best judgment")
    expect(walkthrough).toContain("Append findings to the doc's Open Questions section")
    expect(walkthrough).toContain("Report only")

    // Four per-finding options
    expect(walkthrough).toContain("Apply the proposed fix")
    expect(walkthrough).toContain("Defer — append to the doc's Open Questions section")
    expect(walkthrough).toContain("Skip — don't apply, don't append")
    expect(walkthrough).toContain("Auto-resolve with best judgment on the rest")

    // Recommended marker mandatory
    expect(walkthrough).toContain("(recommended)")

    // No advisory variant (advisory is a presentation-layer concept, not a walkthrough option)
    expect(walkthrough).not.toContain("Acknowledge — mark as reviewed")

    // No tracker-detection machinery (sl-doc-review has no external tracker)
    expect(walkthrough).not.toContain("named_sink_available")
    expect(walkthrough).not.toContain("any_sink_available")
    expect(walkthrough).not.toContain("[TRACKER]")

    // Bulk preview has Proceed/Cancel options and the four bucket labels
    expect(bulkPreview).toContain("Proceed")
    expect(bulkPreview).toContain("Cancel")
    expect(bulkPreview).toContain("Applying (N):")
    expect(bulkPreview).toContain("Appending to Open Questions (N):")
    expect(bulkPreview).toContain("Skipping (N):")

    // No Acknowledge bucket in bulk preview either
    expect(bulkPreview).not.toContain("Acknowledging (N):")
  })

  test("open-questions-defer reference implements append mechanic with failure path", async () => {
    const defer = await readRepoFile(
      "plugins/super-looper/skills/sl-doc-review/references/open-questions-defer.md"
    )

    // Append mechanic steps
    expect(defer).toContain("## Deferred / Open Questions")
    expect(defer).toContain("### From YYYY-MM-DD review")

    // Entry format includes required fields but excludes suggested_fix and evidence
    expect(defer).toContain("{title}")
    expect(defer).toContain("{severity}")
    expect(defer).toContain("{reviewer}")
    expect(defer).toContain("{confidence}")
    expect(defer).toContain("{why_it_matters}")

    // Failure-path sub-question with three options
    expect(defer).toContain("Retry")
    expect(defer).toContain("Record the deferral in the completion report only")
    expect(defer).toContain("Convert this finding to Skip")

    // No tracker-detection logic (this is the in-doc defer path, not tracker-defer)
    expect(defer).not.toContain("named_sink_available")
    expect(defer).not.toContain("[TRACKER]")
  })
})

describe("sl-compound frontmatter schema expansion contract", () => {
  test("problem_type enum includes the four new knowledge-track values", async () => {
    const schema = await readRepoFile(
      "plugins/super-looper/skills/sl-compound/references/schema.yaml"
    )

    // Four new knowledge-track values present in the enum
    expect(schema).toContain("architecture_pattern")
    expect(schema).toContain("design_pattern")
    expect(schema).toContain("tooling_decision")
    expect(schema).toContain("convention")

    // best_practice remains valid as fallback
    expect(schema).toContain("best_practice")
  })

  test("sl-compound-refresh schema stays in sync with canonical sl-compound schema", async () => {
    const canonical = await readRepoFile(
      "plugins/super-looper/skills/sl-compound/references/schema.yaml"
    )
    const refresh = await readRepoFile(
      "plugins/super-looper/skills/sl-compound-refresh/references/schema.yaml"
    )

    // Duplicate schemas must be identical (kept in sync intentionally per AGENTS.md)
    expect(refresh).toEqual(canonical)
  })

  test("yaml-schema.md documents category mappings for the four new values", async () => {
    const mapping = await readRepoFile(
      "plugins/super-looper/skills/sl-compound/references/yaml-schema.md"
    )

    expect(mapping).toContain("architecture_pattern` -> `docs/solutions/architecture-patterns/")
    expect(mapping).toContain("design_pattern` -> `docs/solutions/design-patterns/")
    expect(mapping).toContain("tooling_decision` -> `docs/solutions/tooling-decisions/")
    expect(mapping).toContain("convention` -> `docs/solutions/conventions/")
  })
})

describe("sl-learnings-researcher domain-agnostic contract", () => {
  test("agent prompt frames as domain-agnostic not bug-focused", async () => {
    const agent = await readRepoFile(
      "plugins/super-looper/agents/sl-learnings-researcher.md"
    )

    // Domain-agnostic identity framing
    expect(agent).toContain("domain-agnostic institutional knowledge researcher")

    // Multiple learning shapes named as first-class
    expect(agent).toContain("Architecture patterns")
    expect(agent).toContain("Design patterns")
    expect(agent).toContain("Tooling decisions")
    expect(agent).toContain("Conventions")

    // Structured <work-context> input accepted
    expect(agent).toContain("<work-context>")
    expect(agent).toContain("Activity:")
    expect(agent).toContain("Concepts:")
    expect(agent).toContain("Decisions:")
    expect(agent).toContain("Domains:")

    // Dynamic subdirectory probe replaces hardcoded category table
    expect(agent).toContain("Probe")
    expect(agent).toContain("discover which subdirectories actually exist")

    // Critical-patterns.md read is conditional, not assumed
    expect(agent).toMatch(/critical-patterns.md.*exists/i)

    // Integration Points list no longer includes sl-doc-review (agent is sl-plan-owned)
    const integration = agent.substring(agent.indexOf("Integration Points"))
    expect(integration).not.toContain("sl-doc-review")
  })
})
