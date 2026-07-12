# HTML Plan Template

The canonical template every HTML-format plan is stamped from. It is a
literal document, not a sketch: copy the `## Template` block below verbatim,
replace every `{{PLACEHOLDER}}`, duplicate every `<!-- repeat -->` block as
many times as the plan needs, and delete the markers.

Load this alongside `references/html-rendering.md` (the format invariants
this template already satisfies) and `references/plan-sections.md` (what
each section must contain). This file governs *shape*; those two govern
*rules* and *content*.

## Authoring rules

- **Replace EVERY `{{...}}` token with real content.** No `{{...}}` token may
  survive into the written plan.
- **Blocks marked `<!-- repeat -->` are repeatable.** Duplicate them once per
  unit, task, checklist item, file, question, or amendment the plan needs,
  then delete the `<!-- repeat -->` comment markers themselves.
- **Delete whole sections that do not apply.** Open Questions renders only
  when genuine open questions exist. Sections from the contract that this
  template does not stamp (Scope Boundaries, Risks & Dependencies,
  System-Wide Impact, Sources / Research) are added when material, using the
  contract's heading vocabulary exactly.
- **Section headings are the grep contract.** `Summary`, `Problem Frame`,
  `Requirements`, `Key Technical Decisions`, `High-Level Technical Design`,
  `Implementation Units`, `Validation Commands`, `Open Questions`, `Notes`,
  `Amendments` are verbatim. Editorial re-titles live in eyebrow labels, never
  in `<h2>`.
- **Keep the document self-contained.** All CSS lives in the single `<style>`
  block. No external stylesheets or scripts, no companion files.
- **Structure is the public API; styling is not.** The class names, element
  types, `id` scheme, and `<dt>` field labels below are stable — downstream
  agents read them. The palette, type scale, and spacing may be re-derived per
  the precedence stack in `references/html-rendering.md` (in-session direction
  > named stylesheet > DESIGN.md > the defaults below).
- **Maintain a synced visual identity** between the page and its generated
  images. The `:root` custom properties define the palette and typography;
  every image prompt describes the *same* professional, focused, minimal
  identity, drawn from the plan's own subject matter.
- **Detail level.** Another developer or agent, reading cold, must be able to
  execute the plan. Include pseudo-code or inline `<pre>` examples where a
  unit's approach is non-obvious. Cover edge cases and failure modes.
- **Amendments is never populated during create.** Stamp the section with its
  empty-state paragraph and delete the repeat block. Revision flows append to
  it later.

## Metadata field rules

The `<details class="meta">` header is the plan's field contract, rendered as
a visible `<dl>`. Field names are fixed — never rename one.

| Field | Cardinality | Written at create | Notes |
| --- | --- | --- | --- |
| `title` | single | yes | Matches the `<h1>` verbatim |
| `type` | single | yes | Conventional-commit prefix: `feat`, `fix`, `refactor`, `chore`, `docs`, `perf`, `test` |
| `date` | single | yes | Creation date, ISO 8601 `YYYY-MM-DD`, ASCII digits |
| `origin` | single | when known | Repo-relative path to the upstream brainstorm doc. Omit the `<dt>`/`<dd>` pair entirely when there is no upstream doc |
| `modified` | list | usually `none` | ISO timestamps, one per revision |
| `commits` | list | usually `none` | Commit SHAs that implemented this plan |
| `agent` | list | yes | Agent identities that have written to this plan |
| `session` | list | yes | Session ids that have written to this plan |
| `back refs` | list | when known | Plans/docs this plan descends from |
| `forward refs` | list | usually `none` | Plans/docs that descend from this plan |

- **Every list field is comma-separated and append-only.** Add entries; never
  overwrite an entry and never remove one. Appends are idempotent — a value
  already present is not added twice.
- An empty list field renders as the literal text `none`. The first append
  replaces `none` with the entry.
- `date` is the creation date. planf3's `created` name is not used — the field
  contract forbids renaming.

## Status markers

Every task and validation checkbox carries a marker inside
`<code class="status">`:

| Marker | Meaning |
| --- | --- |
| `[]` | idle |
| `[wip]` | in progress |
| `[x]` | complete |
| `[f]` | failed |

All markers start as `[]` at create time. The executing agent updates them as
it works. Markers are advisory — git is the authoritative record of what
shipped.

## Image slot grammar

An image slot is a comment pair. The opening comment names the slot and
carries the prompt; the closing comment terminates it.

```html
<figure>
  <!-- image-slot:hero prompt="Wide minimal diagram of ..." -->
  <figcaption>{{HERO_IMAGE_CAPTION}}</figcaption>
  <!-- /image-slot:hero -->
</figure>
```

Rules:

- **Slot names are ASCII, lowercase, hyphen-separated,** and unique within the
  plan: `hero`, `problem`, `design`, `unit-3`, `notes-1`.
- **At create time the pair wraps only the `<figcaption>`.** The plan agent
  authors the `prompt="..."` attribute and the caption; it never writes image
  bytes.
- **The fill script rewrites the slot interior**, emitting the `<img>` and then
  re-emitting the existing `<figcaption>` beneath it unchanged. The comment
  pair survives, so a filled slot is detectable, skippable on re-run, and
  regenerable by name.
- **The `<img>` element occupies exactly one line**, data URI included:
  `<img src="data:image/webp;base64,AAAA..." alt="...">`. Downstream agents
  read HTML plans with scoped offset reads and skip data-URI lines by line
  number; a wrapped URI defeats that.
- The script sets `alt` from the slot's `<figcaption>` text.
- A slot the plan declares but never fills stays a comment pair — a plan with
  no API key is a complete plan with empty figures, never a broken one.
- **A filled slot can be refined in place** rather than regenerated:
  `--edit <slot> --instruction "..."` sends the slot's own embedded bytes to the
  images edit endpoint with the instruction and writes the result back. The
  authored `prompt="..."` attribute is deliberately left untouched, so it keeps
  describing the image the plan asked for — which means `--regenerate` always
  returns to that original intent rather than compounding edits. Prefer
  `--edit` for "same image, one thing changed" and `--regenerate` for "wrong
  image, start over".

Prompt authoring rules:

- **The prompt lives inside an HTML comment attribute.** Escape any double
  quote as `&quot;` and never include `--` (two hyphens) — a browser
  terminates the comment at the first `-->` regardless of quoting. The fill
  script refuses a slot whose prompt contains `--` and reports it as a
  warning.
- Wide format. Images render at the page's full container width.
- One or two core ideas per image, aimed at a professional software engineer:
  convey exactly what is being built, not decoration.
- Fewer than 10 words of text rendered *inside* the image. Text bloat is the
  most common failure.
- Match the `:root` visual identity — professional, focused, minimal — so the
  image and the page read as one artifact.
- Cap the count: a hero, one per major section, and unit images only where a
  unit's architecture genuinely needs one. Every image is embedded bytes in a
  committed file.

Inline SVG remains permitted anywhere a diagram serves better than a raster —
architecture topologies, sequence diagrams, and state machines are usually
better as hand-authored SVG in `High-Level Technical Design` than as generated
images.

## Post-stamp checklist

- No `{{...}}` token remains.
- No `<!-- repeat -->` marker remains.
- Every `id` (`r1`, `u1`, ...) also appears as visible text (`R1.`, `U1`).
- Every `<details>` is default-closed — no `open` attribute.
- Metadata lives only in the visible `<dl>`. No `<meta name="...">` mirror, no
  `data-*` attributes, no JSON block.
- The composition-signal footer is present and names the source.
- Every status marker is `[]`.
- Amendments carries its empty-state paragraph.

## Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Plan: {{PLAN_TITLE}}</title>
<style>
:root{
  --bg:#fbfaf8; --ink:#22211e; --muted:#6b675f; --line:#e4e1da;
  --accent:#0f6f5c; --accent-soft:#e8f3f0; --accent-text:#0b5546;
  --warn:#8a5a12; --warn-soft:#f7efe0;
  --card:#ffffff; --code-bg:#f1efe9;
  --sans:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.55;font-size:15px}
main{max-width:920px;margin-inline:auto;padding:2.5rem 1.5rem 4rem}
p,li{max-width:70ch}
h1{font-size:1.7rem;line-height:1.25;margin:.2rem 0 .6rem}
h2{font-size:1.25rem;margin:2.2rem 0 .8rem;padding-top:1.2rem;border-top:1px solid var(--line)}
h3{font-size:1.02rem;margin:1.4rem 0 .5rem}
h4{font-size:.95rem;margin:1rem 0 .35rem}
code{font-family:var(--mono);font-size:.86em;background:var(--code-bg);padding:.08em .35em;border-radius:4px}
pre{background:var(--code-bg);padding:.8rem 1rem;border-radius:8px;overflow-x:auto}
pre code{background:none;padding:0}
a{color:var(--accent-text)}
table{border-collapse:collapse;width:100%;margin:.8rem 0;font-size:.93rem}
th,td{border:1px solid var(--line);padding:.45rem .6rem;text-align:left;vertical-align:top}
th{background:var(--code-bg);font-weight:600}
strong{color:inherit}
.eyebrow{font-size:.72rem;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);font-weight:600}
.meta dl{display:grid;grid-template-columns:auto 1fr;gap:.15rem 1rem;margin:.6rem 0 0;font-size:.9rem}
.meta dt{color:var(--muted);font-weight:600}
.meta dd{margin:0;overflow-wrap:anywhere}
.idchip{display:inline-block;font-family:var(--mono);font-size:.78rem;font-weight:700;background:var(--accent-soft);color:var(--accent-text);border-radius:999px;padding:.1rem .55rem;margin-right:.4rem}
.tag{display:inline-block;font-family:var(--mono);font-size:.72rem;font-weight:700;border-radius:999px;padding:.05rem .45rem;margin-right:.35rem}
.tag.existing{background:var(--code-bg);color:var(--muted)}
.tag.new{background:var(--accent-soft);color:var(--accent-text)}
article.unit{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:1rem 1.2rem;margin:1rem 0}
article.unit h3{margin:.1rem 0 .55rem}
dl.strip{display:grid;grid-template-columns:auto 1fr;gap:.15rem 1rem;margin:.3rem 0 .6rem;font-size:.9rem}
dl.strip dt{color:var(--muted);font-weight:600}
dl.strip dd{margin:0}
ul.checklist{list-style:none;padding-left:0}
ul.checklist li{margin:.25rem 0}
code.status{font-weight:700;background:var(--code-bg);color:var(--muted)}
details{border:1px solid var(--line);border-radius:8px;padding:.45rem .8rem;margin:.45rem 0;background:var(--bg)}
summary{cursor:pointer;font-weight:600;font-size:.9rem}
details[open]{padding-bottom:.7rem}
.loop{background:var(--warn-soft);border:1px solid var(--line);border-radius:10px;padding:.7rem 1.1rem;margin:.9rem 0;font-size:.92rem}
.subnav{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:.7rem 1.1rem;font-size:.9rem}
.subnav ul{margin:.3rem 0;padding-left:1.2rem;columns:2;column-gap:2rem}
.empty{color:var(--muted);font-style:italic}
figure{margin:1.4rem 0;text-align:center}
figure img{max-width:100%;height:auto;border-radius:10px}
figcaption{font-size:.83rem;color:var(--muted);margin-top:.4rem}
footer.composition-signal{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--line);font-size:.8rem;color:var(--muted)}
</style>
</head>
<body>
<main>

  <!-- ===== HEADER + APPEND-ONLY METADATA ===== -->
  <header>
    <span class="eyebrow">Implementation plan &middot; {{PROJECT_NAME}}</span>
    <h1>{{PLAN_TITLE}}</h1>
    <details class="meta">
      <summary>Metadata</summary>
      <dl>
        <dt>title</dt>        <dd>{{PLAN_TITLE}}</dd>
        <dt>type</dt>         <dd>{{COMMIT_TYPE}}</dd>
        <dt>date</dt>         <dd><time datetime="{{DATE_ISO}}">{{DATE_ISO}}</time></dd>
        <dt>origin</dt>       <dd>{{ORIGIN_PATH}}</dd>
        <dt>modified</dt>     <dd>{{MODIFIED_ISO_LIST}}</dd>
        <dt>commits</dt>      <dd>{{COMMIT_SHA_LIST}}</dd>
        <dt>agent</dt>        <dd>{{AGENT_NAME_LIST}}</dd>
        <dt>session</dt>      <dd>{{SESSION_ID_LIST}}</dd>
        <dt>back refs</dt>    <dd>{{BACK_REFERENCES}}</dd>
        <dt>forward refs</dt> <dd>{{FORWARD_REFERENCES}}</dd>
      </dl>
    </details>
  </header>

  <figure>
    <!-- image-slot:hero prompt="{{HERO_IMAGE_PROMPT}}" -->
    <figcaption>{{HERO_IMAGE_CAPTION}}</figcaption>
    <!-- /image-slot:hero -->
  </figure>

  <!-- ===== SUMMARY ===== -->
  <section id="summary">
    <h2>Summary</h2>
    <p>{{SUMMARY: what the plan proposes, in 1-3 lines, forward-looking}}</p>
  </section>

  <!-- ===== PROBLEM FRAME ===== -->
  <section id="problem-frame">
    <h2>Problem Frame</h2>
    <p>{{PROBLEM_FRAME: why the work is being done, backward-looking}}</p>
    <figure>
      <!-- image-slot:problem prompt="{{PROBLEM_IMAGE_PROMPT}}" -->
      <figcaption>{{PROBLEM_IMAGE_CAPTION}}</figcaption>
      <!-- /image-slot:problem -->
    </figure>
  </section>

  <!-- ===== REQUIREMENTS ===== -->
  <!-- Group by concern when requirements span distinct logical areas.
       R-IDs stay continuous across groups; never restart at R1 per group.
       At 5+ uniform items within a group, a <table> beats a list. -->
  <section id="requirements">
    <h2>Requirements</h2>

    <!-- repeat: one <h3> + <ul> per concern group -->
    <h3>{{REQUIREMENT_GROUP_NAME}}</h3>
    <ul>
      <!-- repeat: one <li> per requirement -->
      <li id="r{{R_NUMBER}}">R{{R_NUMBER}}. {{REQUIREMENT: what must be true after the work ships}}</li>
    </ul>
  </section>

  <!-- ===== KEY TECHNICAL DECISIONS ===== -->
  <section id="ktd">
    <h2>Key Technical Decisions</h2>
    <ul>
      <!-- repeat: one <li> per decision -->
      <li><strong>K{{K_NUMBER}} &mdash; {{DECISION_TITLE}}:</strong> {{RATIONALE: the load-bearing reason, not every reason}}</li>
    </ul>
  </section>

  <!-- ===== HIGH-LEVEL TECHNICAL DESIGN ===== -->
  <!-- Include when the approach has shape prose alone doesn't carry.
       Inline SVG diagrams belong here alongside (or instead of) the image slot. -->
  <section id="htd">
    <h2>High-Level Technical Design</h2>
    <p>{{TECHNICAL_DESIGN}}</p>
    <figure>
      <!-- image-slot:design prompt="{{DESIGN_IMAGE_PROMPT}}" -->
      <figcaption>{{DESIGN_IMAGE_CAPTION}}</figcaption>
      <!-- /image-slot:design -->
    </figure>
  </section>

  <!-- ===== IMPLEMENTATION UNITS ===== -->
  <section id="units">
    <h2>Implementation Units</h2>
    <p><strong>IMPORTANT:</strong> Execute every unit and task step by step, in order, top to bottom.</p>
    <p>Status markers: <code class="status">[]</code> idle &middot; <code class="status">[wip]</code> in progress &middot; <code class="status">[x]</code> complete &middot; <code class="status">[f]</code> failed. All start as <code class="status">[]</code>; the executing agent updates them as it works. Markers are advisory &mdash; git is authoritative.</p>

    <!-- Include this sub-nav when the plan has 6+ units; delete it otherwise. -->
    <nav class="subnav">
      <span class="eyebrow">Units</span>
      <ul>
        <!-- repeat: one <li> per unit -->
        <li><a href="#u{{U_NUMBER}}">U{{U_NUMBER}}. {{UNIT_NAME}}</a></li>
      </ul>
    </nav>

    <!-- repeat: one article.unit per unit -->
    <article class="unit" id="u{{U_NUMBER}}">
      <h3><span class="idchip">U{{U_NUMBER}}</span>{{UNIT_NAME}}</h3>
      <dl class="strip">
        <dt>Goal</dt><dd>{{UNIT_GOAL}}</dd>
        <dt>Requirements</dt><dd>{{COVERED_R_IDS}}</dd>
        <dt>Dependencies</dt><dd>{{UNIT_DEPENDENCIES}}</dd>
        <dt>Files</dt>
        <dd>
          <!-- repeat: one entry per file; tag each existing or new -->
          <span class="tag existing">existing</span> <code>{{EXISTING_FILE_PATH}}</code> &mdash; {{WHY_RELEVANT}}<br>
          <!-- repeat -->
          <span class="tag new">new</span> <code>{{NEW_FILE_PATH}}</code> &mdash; {{WHY_NEEDED}}
        </dd>
      </dl>

      <!-- Optional per-unit image, synced to the :root identity. Delete when unwarranted. -->
      <figure>
        <!-- image-slot:unit-{{U_NUMBER}} prompt="{{UNIT_IMAGE_PROMPT}}" -->
        <figcaption>{{UNIT_IMAGE_CAPTION}}</figcaption>
        <!-- /image-slot:unit-{{U_NUMBER}} -->
      </figure>

      <!-- repeat: one <h4> + checklist per task -->
      <h4>{{TASK_NUMBER}}. {{TASK_NAME}}</h4>
      <ul class="checklist">
        <!-- repeat: one <li> per action -->
        <li><code class="status">[]</code> {{SPECIFIC_ACTION}}</li>
      </ul>

      <!-- Final task of every unit: Testing Strategy + validation loop -->
      <h4>{{LAST_TASK_NUMBER}}. Testing Strategy</h4>
      <p>{{TESTING_APPROACH: technology used to test/validate, including edge cases}}</p>
      <ul class="checklist">
        <!-- repeat: one <li> per validation command -->
        <li><code class="status">[]</code> <code>{{VALIDATION_COMMAND}}</code> &mdash; {{WHAT_IT_PROVES}}</li>
      </ul>
      <div class="loop">
        🔁 <strong>Do not exit this phase until every box above is checked.</strong>
        If any command fails, fix the cause and re-run &mdash; loop until all pass.
      </div>

      <details>
        <summary>Approach</summary>
        <p>{{UNIT_APPROACH: how the unit is implemented; pseudo-code or <pre> where non-obvious}}</p>
      </details>
      <details>
        <summary>Verification</summary>
        <p>{{UNIT_VERIFICATION: what proves this unit is done}}</p>
      </details>
    </article>
  </section>

  <!-- ===== GLOBAL VALIDATION ===== -->
  <section id="validation">
    <h2>Validation Commands</h2>
    <p>Execute these commands to validate the entire plan is complete:</p>
    <ul class="checklist">
      <!-- repeat: one <li> per command -->
      <li><code class="status">[]</code> <code>{{VALIDATION_COMMAND}}</code> &mdash; {{WHAT_IT_PROVES}}</li>
    </ul>
    <div class="loop">
      🔁 <strong>The plan is not complete until every box is checked and every command passes. If for some reason a step is not possible to complete, mark it with <code class="status">[f]</code> and move on if possible.</strong>
    </div>
  </section>

  <!-- ===== OPEN QUESTIONS (include only when open questions exist) ===== -->
  <section id="open-questions">
    <h2>Open Questions</h2>
    <!-- repeat: one <details> per open question / assumption / risk -->
    <details>
      <summary>{{OPEN_QUESTION}}</summary>
      <p>{{ASSUMPTION_OR_RATIONALE}}</p>
    </details>
  </section>

  <!-- ===== NOTES ===== -->
  <!-- Open canvas — the planning agent runs free here. There is no fixed shape:
       use whatever HTML best serves the plan (prose, lists, tables, code blocks,
       diagrams, callouts, decision logs, alternatives considered, open threads,
       links, anything). Embed as many image slots as the plan benefits from. -->
  <section id="notes">
    <h2>Notes</h2>
    {{NOTES: free-form. Capture anything that helps a reader understand, build,
      or extend this plan — context, dependencies, tradeoffs, rejected
      approaches, risks, future work, references. Author rich, bespoke HTML as
      needed.}}
    <!-- repeat: add as many of these image slots as the notes warrant, numbering each -->
    <figure>
      <!-- image-slot:notes-{{NOTE_IMAGE_NUMBER}} prompt="{{NOTES_IMAGE_PROMPT}}" -->
      <figcaption>{{NOTES_IMAGE_CAPTION}}</figcaption>
      <!-- /image-slot:notes-{{NOTE_IMAGE_NUMBER}} -->
    </figure>
  </section>

  <!-- ===== AMENDMENTS ===== -->
  <!-- Running history of changes made AFTER the plan was first written. Append-only,
       newest at the bottom. Populated by revision flows — never during create.
       At create, keep the empty-state <p> and delete the repeat block below. -->
  <section id="amendments">
    <h2>Amendments</h2>
    <p class="empty">No amendments yet.</p>
    <!-- repeat: one <details> per amendment, newest at the bottom -->
    <details>
      <summary>{{AMEND_ISO}} &mdash; {{AMEND_SUMMARY}}</summary>
      <p>{{AMEND_DETAIL: what changed and why}}</p>
    </details>
  </section>

  <footer class="composition-signal">Composed {{DATE_ISO}} by sl-plan from {{COMPOSITION_SOURCE}}.</footer>

</main>
</body>
</html>
```
