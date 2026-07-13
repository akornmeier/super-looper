# Optional HTML renderer

This renderer preserves the existing Claude Code HTML plan surface without putting its cost in the canonical planning path. `output:html` must resolve explicitly through the main workflow or an active repository preference. Pipeline mode still forces Markdown.

## Composition

1. Read `references/plan-sections.md`, `references/html-rendering.md`, and `references/html-plan-template.md`.
2. Stamp the literal `## Template` block from `html-plan-template.md`; never compose free-form HTML.
3. Replace every `{{PLACEHOLDER}}`, duplicate and then remove every `<!-- repeat -->` block, preserve the required heading vocabulary and metadata fields, and run the template post-stamp checklist.
4. Preserve existing append-only metadata lists, unit IDs, status markers, filled image slots, and Amendments entries when revising. New units start at `[]`; append one Amendments entry for a substantive revision.
5. HTML and Markdown are alternative renderings of the same phase/unit semantics. Do not produce a sibling artifact.

`sl-doc-review` currently mutates Markdown only. Do not run it against HTML; report that limitation in the validation summary.

## Images are separately opt-in

`output:html` does not authorize paid image generation. Run the image script only when the user also supplies the literal `images:on` flag or explicitly asks to fill/regenerate images.

At authoring time, write the slot's `prompt="..."` and caption, never image bytes, base64, a data URI, or a hand-authored `<img>`. Follow the template prompt rules and keep the image count small.

Before executing, state that the command can call a paid API and report the configured/default cap. Use the selected runtime adapter's pinned command. Missing credentials, network/API failure, invalid output, or an over-cap slot never blocks the plan; keep placeholder slots, report a compact skip reason, and continue.

## Reciprocal references are separately opt-in

Run reciprocal reference wiring only when the user explicitly asks. Never run it in pipeline/headless mode because it writes an upstream plan and could trigger goal-drift protection. Use the selected runtime adapter's pinned command and accept benign skips without hand-editing targets.
