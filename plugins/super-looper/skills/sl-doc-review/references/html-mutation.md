# HTML Document Mutation

How to apply a fix or a Defer entry to an **HTML** document under review.

Markdown documents are plain prose: a bad edit produces a visibly wrong line.
HTML plans are not. They carry embedded image bytes, id-anchored cross
references, and fields other agents own — so the same careless edit destroys an
image, breaks a link, or silently claims work that never shipped. The rules
below are what make an HTML mutation as safe as a markdown one.

Load this whenever the document under review has an `.html` extension, before
applying any fix or Defer entry. Everything else about the review — persona
selection, synthesis, routing, confidence anchors — is format-agnostic and
unchanged.

---

## What review may never touch

An HTML plan is a shared artifact with several writers, and each field below
belongs to someone else. Review is not that someone.

- **Status markers** (`<code class="status">[]</code>`, `[wip]`, `[x]`, `[f]`)
  belong to the executing agent. Never set, clear, or "tidy" one. A marker is a
  claim about what shipped; review has no standing to make that claim.
- **The metadata header's append-only lists** (`modified`, `commits`, `agent`,
  `session`, `back refs`, `forward refs`) belong to `sl-plan`'s revision flows
  and `sl-work`'s ship-time sync. Review appends nothing to them and removes
  nothing from them.
- **Amendments** belongs to `sl-plan`'s revision flows alone. Review does not
  append an entry there, even when a fix is substantive.
- **Filled image slots.** The `<!-- image-slot:NAME ... -->` / `<!-- /image-slot:NAME -->`
  comment pair and the `<img>` between them are never edited by hand.

## Never edit across a data-URI line

A filled image slot's `<img>` is a **single line** that can run to hundreds of
kilobytes of base64. Two rules follow, and both are absolute:

- **Never rewrite the file wholesale.** No read-all-then-write-all, no
  reformatting pass, no prettifier. Use targeted `Edit` calls that replace a
  bounded span of text.
- **Never let an edit's anchor text begin, end, or span across a data-URI
  line.** Anchor on the prose or markup immediately around the target instead.
  An anchor that crosses one of these lines has to carry the whole payload
  verbatim to match — which floods context, and truncates or corrupts the image
  the moment it doesn't match exactly.

Reading follows the same rule: locate the target with `Grep`, then read a scoped
offset range around the match. Each `<img>` occupies exactly one line, so
skipping is a line-number decision, not a parse.

## Preserve ids and their visible text

Every `id` (`r1`, `u1`, ...) is an anchor target and appears again as visible
text (`R1.`, `U1`). Both halves must survive a fix:

- **Never renumber an existing id**, even when the review's finding is that the
  numbering has a gap. Gaps are intentional and are never backfilled — U-IDs are
  referenced from commits, PRs, and conversations that a renumber silently
  invalidates.
- When a fix edits a requirement's or unit's text, edit the text **inside** the
  element and leave the `id` and its visible `R<n>.` / `U<n>` prefix alone.
- Never introduce a duplicate `id`. If a fix genuinely requires a new item, give
  it the next unused number.

## Escape interpolated text

Finding fields (`title`, `section`, `why_it_matters`, `suggested_fix`) are raw
text that may contain `&`, `<`, or `>`. Escape them as `&amp;`, `&lt;`, `&gt;`
before writing them into the document. An unescaped `<` silently swallows the
rest of the element in every browser that renders the plan.

## Keep the document self-contained

All CSS lives in the single existing `<style>` block. A fix never adds an
external stylesheet, an external script, a companion file, or a remote image —
the single-file invariant is what makes a plan portable.

---

## Defer: appending to Open Questions

The markdown flow in `references/open-questions-defer.md` appends a
`## Deferred / Open Questions` section with `### From YYYY-MM-DD review`
subsections and bullet entries. **In HTML, the same intent uses the plan
template's own markup** rather than injecting markdown into a rendered page.

Everything else in `open-questions-defer.md` — which findings defer, the field
sources, the compound-key dedup, the "no `suggested_fix` or `evidence` in the
entry" rule — applies unchanged. Only the markup differs.

### Step 1: Locate or create the Open Questions section

Scan for a section whose heading text is `Open Questions` (the plan template
stamps it as `<section id="open-questions">`).

- **Present:** append inside it, after its existing entries. Do not create a
  second one, wherever in the document it sits — its position was deliberate.
- **Absent:** create it. Insert **before** the `Notes` section if one exists,
  otherwise before `Amendments`, otherwise before the composition-signal
  `<footer>`, otherwise immediately before `</main>`. Never append after
  `</main>` or outside `<body>`.

```html
<section id="open-questions">
  <h2>Open Questions</h2>
</section>
```

### Step 2: Locate or create the review-date grouping

Within the section, scan for `<h3>From YYYY-MM-DD review</h3>` matching today's
review date. Append entries beneath it; create it as the last child of the
section when absent. This mirrors the markdown flow's `### From YYYY-MM-DD review`
subsection, and groups multiple Defer actions from one session together.

### Step 3: Append the entry

One `<details>` per deferred finding — the same element the template already
uses for an open question, so a deferred concern renders exactly like an
authored one:

```html
<details>
  <summary><strong>{title}</strong> &mdash; {section} ({severity}, {reviewer}, confidence {confidence})</summary>
  <p>{why_it_matters}</p>
</details>
```

Escape every interpolated field per the escaping rule above. Emit the entry
default-closed — no `open` attribute — per the template's collapsible contract.

### Step 4: Dedup

Unchanged from `references/open-questions-defer.md` Step 4. The compound key
(`normalize(section) + normalize(title) + why_fingerprint`) reconstructs from
the visible entry text: `{title}` is the `<strong>` leader, `{section}` is the
text between the em-dash and the opening `(`. No hidden metadata is needed, and
none is added — no HTML comments, no `data-*` attributes.
