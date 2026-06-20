# Pulse Report Template

Loaded by `SKILL.md` at Phase 2.3 after queries have returned. Fill the template using the query results. Target total length: 30-40 lines.

## Rules for filling in

- Use real numbers, not ranges or hedges. If a number is uncertain, note the source inline.
- Percent deltas compare the current window to the previous equal-length window (e.g., for `24h`, compare to the prior `24h`). If no comparison is possible, omit the delta rather than inventing one.
- No hardcoded thresholds. Do not label things "high" or "low" or color anything red unless the reader asked for threshold-based annotation at setup.
- No PII. No emails, no account IDs, no message content.
- Headlines are the top of the page. If a reader only reads the first 3 lines, they should know the most important thing that happened.
- If `STRATEGY.md` exists, re-read its `## Key metrics` section before assembling the report. For each strategy metric, decide what to render:
  - If the metric name appears in `pulse_excluded_metrics`, omit it from the report.
  - If the metric name appears in `pulse_pending_metrics`, include it in the Usage section marked `no data (instrumentation pending)`.
  - Otherwise, resolve the source for this metric: look it up in `pulse_metric_sources` (CSV of `metric=source` pairs); if present, use that source. If absent, fall back to `pulse_analytics_source` and append `(default source)` to the metric line so the implicit routing is visible. If the resolved source is a `ledger` token (`ledger` or `ledger:<path>`), render it via the **Local JSONL ledger sources** procedure below instead of a provider query. Otherwise query the provider and render the metric with its current value and delta. If the query returns no value, include it anyway and mark it `no data`.

## Local JSONL ledger sources

A metric's source in `pulse_metric_sources` may be a **local JSONL ledger** instead of a provider. The token is `ledger`, optionally `ledger:<repo-relative-path>`; the path defaults to `docs/run-records/ledger.jsonl`. This source kind is generic — "read a local JSONL ledger and aggregate one field over the window" — and reusable by any product; the metric-specific part (which timestamp field, which predicate) comes from the metric's own definition, not from this source kind.

To resolve a ledger-sourced metric:

1. Resolve the path: the part after `ledger:`, or `docs/run-records/ledger.jsonl` by default. Resolve it against the repo root (`git rev-parse --show-toplevel`).
2. If the file is **absent or empty**, render the metric `no data` — never an error, never a fabricated `0` / `0%`. (The directory is tracked via `.gitkeep`, so an absent `ledger.jsonl` is the valid "no runs yet" state, not a missing-path config error.)
3. Read the file as JSONL: one JSON object per line. **Skip any line that does not parse as JSON** — a malformed line is not fatal; aggregate over the rest.
4. **Window-filter** by the metric's timestamp field: keep records whose timestamp falls within the pulse window (the same `[now - window - 15m, now - 15m]` bound used elsewhere).
5. Aggregate the field the metric defines and render the value. If zero records fall in the window, render `no data`.

**Worked instance — `unattended_completion_rate`** (super-looper's loop-driver ledger): window-filter by `timing.started_at`; the rate is `success / total` where `success` is a record with `outcome == "success"`. Records with any other outcome (timeout, cap-exhausted, done-but-red, the give-up floor) count in the denominator only — so a clean-exit give-up cannot be counted as a win. With records in the window, render the rate (e.g., `3/4 = 75%`); with none in the window, or no ledger at all, render `no data`.

## Git-derived proxy metrics

Some strategy metrics have no true instrumentation but can be approximated from git/GitHub history. Render these as a **labeled proxy** rather than `no data`, sourced from the git/GitHub source (`metric=github`). Always mark the value `(proxy)` so the reader knows it approximates the metric — it is not the metric itself.

**Worked instance — `learning_reuse`** (super-looper strategy metric): there is no "prevented-a-repeat" signal, so render the count of commits and PRs in the window that reference a `docs/solutions/` path or a `[[backlink]]` citation, marked `(proxy)`. The count approximates reuse by counting citations; it is not a measure of repeats prevented. With no citations in the window, render `0 (proxy)` — never an error. True reuse semantics stay deferred.

## Template

The block below is the literal content to write. Replace every `{{placeholder}}` with query output. Delete lines whose data isn't available for this run.

~~~markdown
# {{product_name}} Pulse - {{window}} - {{YYYY-MM-DD HH:MM}} {{TZ}}

## Headlines

- {{one-line headline capturing the most notable thing in the window}}
- {{optional second headline}}
- {{optional third headline}}

## Usage

- **Primary engagement:** {{N events}} ({{delta vs prior window}})
- **Value realization:** {{N events}} ({{delta}}) - {{ratio vs engagement}}
- **Completions / conversions:**
  - {{conversion event 1}}: {{N}} ({{delta}})
  - {{conversion event 2}}: {{N}} ({{delta}})
- **Strategy metrics (if carried forward):**
  - {{metric name}}: {{value}} ({{delta}})
- **Quality sample (if configured):** {{distribution e.g. "8x 5, 1x 4, 1x 2"}}

## System performance

- **Latency:** p50 {{ms}}, p95 {{ms}}, p99 {{ms}} ({{delta vs prior window}})
- **Top errors** (top 5 by count, descending):
  1. **{{error signature}}** - {{N occurrences}} - {{one-line context, no PII}}
  2. **{{error signature}}** - {{N occurrences}} - {{one-line context}}
  3. **{{error signature}}** - {{N occurrences}} - {{one-line context}}
  4. **{{error signature}}** - {{N occurrences}} - {{one-line context}}
  5. **{{error signature}}** - {{N occurrences}} - {{one-line context}}

## Followups

- {{One thing worth investigating next - specific enough to act on}}
- {{Another thing worth investigating}}
- {{3-5 items max; trim if thin}}

---
_Source windows: analytics [{{start}} -> {{end}}], tracing [{{start}} -> {{end}}], payments [{{start}} -> {{end}}]. Trailing buffer: 15m. Saved to `docs/pulse-reports/{{YYYY-MM-DD}}_{{HH-MM}}.md`._
~~~

## Variations

- **No system performance tool configured:** omit the entire `## System performance` section. The report stays Headlines / Usage / Followups.
- **Quality scoring not opted in:** omit the quality sample line.
- **Single-source setup (analytics only):** omit the tracing and payments source windows from the footer.
- **Error count customized at setup** (e.g., top 3 instead of top 5): follow the configured count. Do not pad or trim beyond what the query returned.

## Post-write checklist

Before saving and surfacing to chat:

- [ ] Total length is 30-40 lines (give or take 5).
- [ ] Headlines exist and lead with the most notable item.
- [ ] No hardcoded thresholds ("high error rate", "low conversion").
- [ ] No PII. Scan error signatures and followups for user emails, IDs, or message snippets.
- [ ] Top 5 errors (or the configured count), not top 10. Trim if the query returned more.
- [ ] Strategy metrics carried forward from config are rendered in Usage, or marked `no data`.
- [ ] Followups are specific - each one should be actionable as a sentence.
- [ ] Filename and in-file timestamp use the same wall-clock time.

## What to surface in chat

After writing the file, post back:

- The Headlines section verbatim
- The top Followup, if action looks urgent
- The saved file path so the user can open the full report

Do not paste the full report into chat - the file is the artifact.
