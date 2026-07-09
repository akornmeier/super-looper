import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

// html-plan-template.md is the canonical template every HTML-format plan is
// stamped from (plan U1/R1). Unlike html-rendering.md — which states format
// *rules* and is byte-duplicated across sl-brainstorm/sl-ideate — this file
// is sl-plan-local and states plan *shape*. Its structure is a public API:
// sl-work greps section headings, flips status markers, and appends to the
// metadata <dl>; the bundled image script rewrites slot comment pairs. The
// assertions below pin the surfaces those consumers depend on. Each one
// names the downstream breakage its absence would cause.
const TEMPLATE_PATH = path.join(
  process.cwd(),
  "plugins/super-looper/skills/sl-plan/references/html-plan-template.md",
)
const REFERENCE = readFileSync(TEMPLATE_PATH, "utf8")

const PLAN_SECTIONS_PATH = path.join(
  process.cwd(),
  "plugins/super-looper/skills/sl-plan/references/plan-sections.md",
)
const PLAN_SECTIONS = readFileSync(PLAN_SECTIONS_PATH, "utf8")

// The reference is prose + one literal template. Everything downstream stamps
// comes from the fenced block under `## Template`; prose above it states the
// authoring rules. Several invariants must hold in one region and not the
// other (e.g. the marker legend renders as a markdown table in prose and as
// `<code class="status">` spans in the template), so split them once here.
const TEMPLATE_HEADING = "\n## Template\n"
const templateHeadingIndex = REFERENCE.indexOf(TEMPLATE_HEADING)

const PROSE = templateHeadingIndex > -1 ? REFERENCE.slice(0, templateHeadingIndex) : ""
const TEMPLATE_SECTION =
  templateHeadingIndex > -1 ? REFERENCE.slice(templateHeadingIndex) : ""

/** Fenced ```html blocks inside the given region. */
function htmlBlocks(region: string): string[] {
  return [...region.matchAll(/```html\n([\s\S]*?)```/g)].map((m) => m[1])
}

const TEMPLATE_BLOCKS = htmlBlocks(TEMPLATE_SECTION)
const TEMPLATE = TEMPLATE_BLOCKS[0] ?? ""

// Section-heading vocabulary from the section contract (plan-sections.md).
// sl-work and sl-doc-review locate sections by these exact names — an
// editorial re-title silently orphans a downstream consumer.
const CONTRACT_HEADINGS = [
  "Summary",
  "Problem Frame",
  "Requirements",
  "Key Technical Decisions",
  "High-Level Technical Design",
  "Implementation Units",
  "Validation Commands",
  "Open Questions",
  "Notes",
  "Amendments",
]

// The four advisory execution states sl-work writes during interactive runs.
const STATUS_MARKERS = ["[]", "[wip]", "[x]", "[f]"]

// Append-only metadata list fields added by this plan (R3). Names are frozen:
// the contract forbids renaming, and sl-work appends to them by <dt> label.
const APPEND_ONLY_FIELDS = [
  "modified",
  "commits",
  "agent",
  "session",
  "back refs",
  "forward refs",
]

const SINGLE_FIELDS = ["title", "type", "date", "origin"]

describe("html-plan-template.md structure", () => {
  test("reference exists and is non-empty", () => {
    expect(REFERENCE.length).toBeGreaterThan(0)
  })

  test("carries exactly one fenced html block under `## Template`", () => {
    // The template is stamped verbatim. A second fenced block under the
    // heading would make "copy the block below" ambiguous — the agent would
    // have to guess which one is canonical. (Prose above the heading may
    // contain illustrative html blocks; those are scoped out deliberately.)
    expect(
      templateHeadingIndex,
      "html-plan-template.md must contain a `## Template` heading — the authoring rules point at 'the `## Template` block below'.",
    ).toBeGreaterThan(-1)
    expect(
      TEMPLATE_BLOCKS.length,
      `The \`## Template\` section must contain exactly one fenced \`\`\`html block (found ${TEMPLATE_BLOCKS.length}). More than one makes "copy the template block" ambiguous.`,
    ).toBe(1)
  })

  test("template block is a complete standalone HTML document", () => {
    expect(/^<!DOCTYPE html>/i.test(TEMPLATE.trim())).toBe(true)
    expect(/<\/html>\s*$/i.test(TEMPLATE.trim())).toBe(true)
  })
})

describe("html-plan-template.md section-heading vocabulary", () => {
  // sl-work greps for section names to locate units and validation commands;
  // sl-doc-review keys on the same vocabulary. Renaming a heading for
  // editorial flavor breaks those consumers with no error — they just find
  // nothing. Pin each contract heading as a literal <h2>.
  for (const heading of CONTRACT_HEADINGS) {
    test(`template stamps '${heading}' as an <h2>`, () => {
      expect(
        TEMPLATE.includes(`<h2>${heading}</h2>`),
        `Template must stamp '${heading}' as a literal <h2> — the section-heading vocabulary is the grep contract downstream agents rely on. Editorial re-titles belong in eyebrow labels, never in <h2>.`,
      ).toBe(true)
    })
  }

  test("authoring rules declare the headings are the grep contract", () => {
    expect(
      /grep contract|verbatim/i.test(PROSE),
      "Prose must state that section headings are a verbatim grep contract, so a future author does not re-title them.",
    ).toBe(true)
  })
})

describe("html-plan-template.md status markers", () => {
  // R7/R8: sl-work flips these four states during interactive execution.
  // All four must exist in the template's inline legend (so the executing
  // agent sees them without loading this reference) and in the prose legend
  // table (so a plan author reading the reference learns the semantics).
  for (const marker of STATUS_MARKERS) {
    test(`template legend carries '${marker}' inside <code class="status">`, () => {
      expect(
        TEMPLATE.includes(`<code class="status">${marker}</code>`),
        `Template must carry '${marker}' inside <code class="status"> — sl-work's Edit anchors target that element. A marker missing from the legend has no defined rendering.`,
      ).toBe(true)
    })

    test(`prose legend table documents '${marker}'`, () => {
      expect(
        new RegExp(
          `\\|\\s*\`${marker.replace(/[[\]]/g, "\\$&")}\`\\s*\\|`,
        ).test(PROSE),
        `Prose must document '${marker}' in the status-marker legend table so the four-state machine is discoverable from the reference alone.`,
      ).toBe(true)
    })
  }

  test("template states all markers start as [] at create time", () => {
    expect(
      /All start as <code class="status">\[\]<\/code>/.test(TEMPLATE),
      "Template must state that every marker starts as `[]` — a stamped plan with pre-set markers would lie about execution state.",
    ).toBe(true)
  })

  test("markers are declared advisory, git authoritative (K6)", () => {
    // A marker treated as resume state would let a crash-orphaned `[wip]`
    // skip real work. Both the prose and the template's inline legend must
    // say git wins, because the executing agent may only see the template.
    expect(
      /advisory[\s\S]{0,80}git is (the )?authoritative|Markers are advisory/i.test(PROSE),
      "Prose must state markers are advisory and git is authoritative.",
    ).toBe(true)
    expect(
      /advisory[\s\S]{0,40}git is authoritative/i.test(TEMPLATE),
      "The template's inline legend must state markers are advisory and git is authoritative — the executing agent reads the plan, not this reference.",
    ).toBe(true)
  })
})

describe("html-plan-template.md metadata field contract", () => {
  for (const field of [...SINGLE_FIELDS, ...APPEND_ONLY_FIELDS]) {
    test(`metadata <dl> carries a <dt>${field}</dt> entry`, () => {
      expect(
        TEMPLATE.includes(`<dt>${field}</dt>`),
        `Template's metadata <dl> must carry '${field}' as a <dt> — sl-work and sl-plan revision flows locate append targets by <dt> label. A renamed or missing field silently drops its appends.`,
      ).toBe(true)
    })
  }

  test("prose states list fields are append-only and idempotent", () => {
    expect(
      /append-only/i.test(PROSE),
      "Prose must declare the list metadata fields append-only — overwriting an entry destroys the living-artifact history (R3).",
    ).toBe(true)
    expect(
      /idempotent|already present is not added twice|never (added|appended) twice/i.test(PROSE),
      "Prose must state appends are idempotent — a re-run of ship-time metadata writes must not duplicate entries (R9).",
    ).toBe(true)
  })

  test("prose forbids planf3's `created` field name", () => {
    // R3: field names are additive, never renamed. planf3 calls the creation
    // date `created`; super-looper's field contract already fixed it as
    // `date`. Without an explicit statement, an author adapting planf3's
    // template would carry `created` over and break `date`-keyed consumers.
    expect(
      /`created`[\s\S]{0,60}(not used|is not)|`date`[\s\S]{0,40}creation date/i.test(PROSE),
      "Prose must state that `date` is the creation-date field and planf3's `created` name is not used — the field contract forbids renaming.",
    ).toBe(true)
  })

  test("metadata lives only in the visible <dl> (no hidden mirror)", () => {
    expect(
      /No `<meta name=|no `data-\*` attributes|no JSON block/i.test(PROSE),
      "Prose must forbid a hidden machine-readable metadata mirror — two sources of truth drift (html-rendering.md hard invariant).",
    ).toBe(true)
  })
})

describe("html-plan-template.md image slot grammar", () => {
  // K5: the comment pair is what makes a filled slot detectable, skippable on
  // re-run, and regenerable by name. The opening comment carries the prompt
  // authored by sl-plan at write time (R6); the script never invents one.
  test("template contains at least one opening image-slot comment with a prompt attribute", () => {
    const openers = [...TEMPLATE.matchAll(/<!--\s*image-slot:([\w{}-]+)\s+prompt="/g)]
    expect(
      openers.length,
      'Template must contain at least one `<!-- image-slot:<name> prompt="..." -->` opener — the prompt attribute is how sl-plan hands authored prompts to the fill script (R6).',
    ).toBeGreaterThan(0)
  })

  test("every opening image-slot has a matching closing comment", () => {
    const opened = [...TEMPLATE.matchAll(/<!--\s*image-slot:([\w{}-]+)\s/g)].map((m) => m[1])
    const closed = [...TEMPLATE.matchAll(/<!--\s*\/image-slot:([\w{}-]+)\s*-->/g)].map((m) => m[1])
    for (const name of opened) {
      expect(
        closed.includes(name),
        `Image slot '${name}' has an opening comment but no matching \`<!-- /image-slot:${name} -->\` closer. The pair is what lets the fill script skip filled slots and regenerate a named one (K5); an unterminated slot swallows the rest of the document.`,
      ).toBe(true)
    }
    expect(opened.length).toBe(closed.length)
  })

  test("prose pins the single-line data URI rule (K9)", () => {
    // sl-work reads image-laden plans with scoped offset reads and skips
    // data-URI lines by line number. A wrapped URI defeats that and blows up
    // the executing agent's context with hundreds of KB of base64.
    expect(
      /occupies exactly one line/i.test(PROSE),
      "Prose must state the injected <img> element occupies exactly one line, data URI included — downstream agents skip data-URI lines by line number (K9).",
    ).toBe(true)
    expect(
      /data:image\/webp;base64/.test(PROSE),
      "Prose must show the `data:image/webp;base64,...` shape so the single-line rule is concrete.",
    ).toBe(true)
  })

  test("prose states the plan agent never writes image bytes", () => {
    expect(
      /never writes image\s+bytes/i.test(PROSE),
      "Prose must state the plan agent authors the prompt but never writes image bytes — routing base64 through model Read/Edit burns tokens for nothing (K4).",
    ).toBe(true)
  })

  test("prose states an unfilled slot is a complete plan, not a broken one (R5)", () => {
    expect(
      /never a broken one|complete plan with empty figures/i.test(PROSE),
      "Prose must state that a plan whose slots were never filled is complete, not broken — image failure must never block the plan (R5).",
    ).toBe(true)
  })
})

describe("html-plan-template.md placeholder convention", () => {
  test("template contains {{...}} placeholder tokens", () => {
    expect(
      /\{\{[^}]+\}\}/.test(TEMPLATE),
      "Template must use `{{PLACEHOLDER}}` tokens — the stamped-template idiom depends on them (R1).",
    ).toBe(true)
  })

  test("template contains <!-- repeat --> markers", () => {
    expect(
      /<!--\s*repeat/.test(TEMPLATE),
      "Template must mark repeatable blocks with `<!-- repeat` comments so the agent knows what to duplicate per unit/task/file.",
    ).toBe(true)
  })

  test("prose forbids any {{...}} token surviving into a written plan", () => {
    expect(
      /No `\{\{\}\}` token may\s*\n?\s*survive|No `\{\{\.\.\.\}\}` token remains|Replace EVERY `\{\{\.\.\.\}\}` token/i.test(
        PROSE,
      ),
      "Prose must instruct that no `{{...}}` token may survive into the written plan — a leaked placeholder is the most visible stamped-template failure.",
    ).toBe(true)
  })

  test("prose instructs deleting the <!-- repeat --> markers after duplication", () => {
    expect(
      /delete the `<!-- repeat -->` comment markers|No `<!-- repeat -->` marker remains/i.test(PROSE),
      "Prose must instruct deleting the `<!-- repeat -->` markers themselves after duplication — leftover markers are process exhaust in a user-facing artifact.",
    ).toBe(true)
  })
})

describe("html-plan-template.md preserved HTML contracts (R2)", () => {
  test("composition-signal footer is present in the template", () => {
    expect(
      /<footer class="composition-signal">/.test(TEMPLATE),
      "Template must stamp the `composition-signal` footer — html-rendering.md makes the source/staleness signal a hard invariant, and a stamped template that omits it guarantees every plan omits it.",
    ).toBe(true)
  })

  test("every <details> in the template is default-closed", () => {
    // html-rendering.md hard invariant: collapsibles ship closed so the
    // reader sees the section list at a glance. `details[open]{...}` in the
    // <style> block is a CSS rule, not an open attribute — it is fine.
    const openDetails = [...TEMPLATE.matchAll(/<details\b[^>]*\bopen\b[^>]*>/g)]
    expect(
      openDetails.length,
      `Template must not stamp any <details> with an \`open\` attribute (found ${openDetails.length}: ${openDetails.map((m) => m[0]).join(", ")}). Default-closed collapsibles are a hard invariant of html-rendering.md.`,
    ).toBe(0)
  })

  test("stable IDs appear as both anchor id and visible text", () => {
    expect(
      /id="r\{\{R_NUMBER\}\}">R\{\{R_NUMBER\}\}\./.test(TEMPLATE),
      'Requirement <li> must carry `id="r{{R_NUMBER}}"` AND render `R{{R_NUMBER}}.` as visible text — an id alone is invisible to an agent reading rendered text.',
    ).toBe(true)
    expect(
      /id="u\{\{U_NUMBER\}\}"/.test(TEMPLATE) && /<span class="idchip">U\{\{U_NUMBER\}\}<\/span>/.test(TEMPLATE),
      'Unit <article> must carry `id="u{{U_NUMBER}}"` AND render `U{{U_NUMBER}}` as visible text in the id chip.',
    ).toBe(true)
  })

  test("template is self-contained (single <style> block, no external assets)", () => {
    const styleBlocks = [...TEMPLATE.matchAll(/<style>/g)]
    expect(
      styleBlocks.length,
      "Template must carry exactly one <style> block — the single-self-contained-file invariant.",
    ).toBe(1)
    expect(
      /<link\s+rel="stylesheet"|<script\s+src=/i.test(TEMPLATE),
      "Template must not reference external stylesheets or scripts — HTML plans are single self-contained files.",
    ).toBe(false)
    expect(
      /self-contained/i.test(PROSE),
      "Prose must restate the self-contained invariant.",
    ).toBe(true)
  })

  test("reference carries no absolute filesystem paths", () => {
    // Skill content ships to arbitrary user environments; an absolute path
    // baked at authoring time resolves to nothing there. This also catches
    // a `/Users/<name>/Code/planf3` leak from the source template.
    const matches = [...REFERENCE.matchAll(/\/Users\/|\/home\//g)]
    expect(
      matches.length,
      `html-plan-template.md must contain no absolute filesystem paths (found ${matches.length}). Skill content runs from the user's project, where an authoring-machine path resolves to nothing.`,
    ).toBe(0)
  })
})

describe("html-plan-template.md / plan-sections.md cross-file consistency", () => {
  // U5 amends plan-sections.md (the format-independent contract) to declare
  // the same six append-only fields the template stamps. If the two drift, an
  // agent that loads only the contract writes different <dt> labels than the
  // ones sl-work appends to — a silent, unlogged data loss.
  for (const field of APPEND_ONLY_FIELDS) {
    test(`plan-sections.md names the '${field}' metadata field`, () => {
      expect(
        new RegExp(`\`${field}\``).test(PLAN_SECTIONS),
        `plan-sections.md must name the '${field}' field exactly as the template's <dt> label. The section contract and the canonical template must not drift on field names — sl-work locates append targets by <dt> label.`,
      ).toBe(true)
    })
  }

  test("plan-sections.md declares the append-only semantics for those fields", () => {
    expect(
      /append-only|appended/i.test(PLAN_SECTIONS),
      "plan-sections.md must state the append-only semantics of the new list fields, not just their names.",
    ).toBe(true)
  })
})
