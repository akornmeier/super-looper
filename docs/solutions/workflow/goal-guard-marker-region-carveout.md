---
title: "The goal guard's marker-region carve-out: hashing goal content, not progress state"
date: 2026-07-11
category: docs/solutions/workflow/
module: loop
problem_type: architecture_pattern
component: build_tooling
severity: high
applies_when:
  - "a change touches the per-attempt plan sha256 in `scripts/loop.sh`"
  - "a change touches the PreToolUse goal-guard hook"
  - "an unattended run exits 8 (`goal-drift`) and the only plan edit was a status marker"
  - "a new field or region is proposed for exemption from the goal hash"
related_components:
  - development_workflow
  - tooling
root_cause: logic_error
resolution_type: code_fix
tags:
  - goal-guard
  - goal-drift
  - loop-driver
  - status-markers
  - plan-hash
  - invariant-audit
---

# The goal guard's marker-region carve-out

## The problem this solves

The goal guard exists so autopilot cannot rewrite its own goals mid-run. It does that by
hashing the plan file at attempt start and re-hashing it at `done_reached`: any change
means the goal moved under the run, and the run exits 8 (`typed_failure: "goal-drift"`)
rather than reporting a success it cannot vouch for.

The hash is over **raw bytes**. That is a blunt instrument, and it conflates two things
that are not the same:

- **Goal content** — requirements, units, decisions, scope. If this changes mid-run, the
  run's success is meaningless. This is what the guard is for.
- **Progress state** — the status markers (`[]`, `[wip]`, `[x]`, `[f]`) that record which
  unit is in flight. This is *output* of the run, not input to it. A marker moving from
  `[]` to `[x]` is the guard's own system working, not an attack on it.

Because a byte is a byte, marking a unit complete reads identically to deleting a
requirement. So `sl-work` suppresses all marker writes under an unattended run, and
markdown plans never got markers at all. **The guard's bluntness, not any design
decision about markdown, is why markdown plans have no progress tracking.**

## The audit: every consumer of the per-attempt plan hash

Before changing a safety-critical guard, enumerate what depends on it. This is that
enumeration — re-verify it before any future change to this surface.

| # | Consumer | Where | What it depends on |
|---|---|---|---|
| C1 | `plan_hash_start` cold-attempt snapshot | `loop.sh`, attempt top | `hash_file` over `GUARD_PLAN_PATH` |
| C2 | Resume baseline inheritance | `loop.sh`, same block | A resumed attempt does **not** re-snapshot. Re-baselining would launder a mutation made by the crashed attempt into the resumed attempt's clean baseline (KTD3/R1) |
| C3 | `plan_hash_end` re-hash | `loop.sh`, `done_reached` path | Same hash function as C1 — the two must stay symmetric |
| C4 | Start/end equality test | `loop.sh`, drift block | Byte equality of C1 and C3 |
| C5 | `drift_kind_of` → created / deleted / modified | `loop.sh` | The absent-file sentinel; an absent-at-start and absent-at-end file must compare equal |
| C6 | `goal_drift` JSON in the run record | `loop.sh`, `emit_record` | `file` + `change` strings |
| C7 | Exit 8, terminal (not retryable) | `loop.sh` | Drift is completed-but-untrustworthy, mirroring exit 7 |
| C8 | **`STRATEGY.md` shares `hash_file`** | `loop.sh` | STRATEGY.md has no markers and must keep a **raw byte hash**. Any normalization applied to it would widen the guard for the one file the guard most exists to protect |
| C9 | **PreToolUse path-deny** | `hooks/goal-guard.sh` | Denies *any* `Write`/`Edit` whose target canonicalizes to a guarded path — **independent of the hash** |
| C10 | `sl-work` write-suppression gate | `sl-work` SKILL.md Phase 2 | Currently suppresses every plan write when unattended |
| C11 | Absent / unreadable sentinels | `loop.sh`, `hash_file` | An unreadable file must still surface as a mismatch, not abort under `set -euo pipefail` |

### The finding that shapes the design

**C9 means a hash-scope carve-out alone accomplishes nothing.** The PreToolUse hook denies
the marker write on *path*, before any hash is ever computed. Loosening the checksum while
leaving the hook intact produces a run that still cannot write a marker — it just fails
earlier and more confusingly.

**Both layers must learn the carve-out, and they must learn the same one.** They are not
redundant: the hook is defense-in-depth (it cannot see bash writes or worktree merges),
and `loop.sh` is authoritative. If the two disagree about what a marker is, the hook
allows a write that the checksum then kills at `done_reached` — the worst outcome, because
the run does all its work and then throws it away.

## The design: normalize, then hash

Hash the plan's **goal content**, not its bytes. Before hashing, rewrite every status
marker to its canonical idle form, then hash the normalized stream:

```
<code class="status">[x]</code>    ->  <code class="status">[]</code>     (HTML)
`[wip]`                            ->  `[]`                               (markdown)
```

A marker-only change now normalizes to the identical stream and the hash does not move.
Any other change — a word of prose, a deleted requirement, a renumbered unit — still moves
it, and still exits 8.

`STRATEGY.md` keeps the raw `hash_file` (C8). Only the plan is normalized.

### Why this is safe: the freedom it grants is exactly 1–3 characters

The normalization patterns are anchored on the **complete marker token**, including its
surrounding element or code-span delimiters. They rewrite only the value *inside* an
already-present, exactly-shaped marker. The consequence is worth stating precisely,
because it is the whole safety argument:

**The only bytes an agent gains freedom over are the characters `wip` / `x` / `f` inside a
marker token that already exists in the plan.**

- It cannot **add** a marker — the surrounding `<code class="status">` or backticks are
  new bytes, and they survive normalization, so the hash moves.
- It cannot **delete** a marker — removing those bytes moves the hash.
- It cannot **smuggle prose into a marker** — the pattern matches only the literal
  alternatives `wip|x|f`; anything else is not a marker and is not masked.
- It cannot touch a requirement, a unit, a decision, or a scope boundary. All of it
  hashes exactly as before.

Goal-drift detection is preserved in full for everything that constitutes a goal. What is
given up is the guard's ability to detect a *lie about progress* — an agent marking a unit
`[x]` that it did not finish. That was never the guard's job, and it is already covered:
**markers are advisory; git is the authoritative record of what shipped.** A plan full of
`[x]` with failing tests does not ship.

### The markdown marker vocabulary

Markdown plans use the **same four-state vocabulary as HTML**, carried in an inline code
span on the unit line:

```markdown
- U1. **Add parser coverage** `[x]`
- U2. **Wire the reporter** `[wip]`
- U3. **Backfill fixtures** `[]`
- U4. **Flaky integration test** `[f]`
```

Not GFM checkboxes (`- [ ]` / `- [x]`). GFM has two states; the marker contract has four,
and `[wip]` and `[f]` are the two that carry the most information to someone reading a
half-finished run. Sharing one vocabulary across both formats also means one normalization
rule family rather than two — and the guard is exactly the place where a second, subtly
different rule becomes a hole.

Legacy plans carrying bare `- [ ]` / `- [x]` marks are still **ignored as state**, as
before. They are not markers; per-unit completion is read from the code.

## The hook's half of the carve-out

`Edit` tool calls carry `old_string` and `new_string` in the PreToolUse payload. The hook
allows the edit iff both sides **normalize to the same string** — i.e. the edit changes
nothing but marker values — and denies otherwise.

`Write` (whole-file `content`) is **always denied** on a guarded path. `sl-work` writes
markers with `Edit`; a whole-file rewrite of a plan under an unattended run is never a
marker update, and treating it as one would hand back all the freedom the carve-out was
carefully scoped to withhold.

The hook stays fail-open (C9): if it cannot evaluate a payload, it allows, because
`loop.sh` remains authoritative and will catch a real mutation at `done_reached`.

## What did NOT change

- **Multi-writer suppression stands.** `sl-work` still writes no markers under parallel
  subagents or worktree-isolated batches. That suppression has nothing to do with the
  guard — concurrent writers to one file lose each other's edits — and the carve-out does
  not touch it.
- **Drift is still terminal.** Exit 8 is not retryable.
- **The resume baseline still spans the attempt lineage** (C2). A resumed attempt does not
  re-snapshot.
- **`STRATEGY.md` is still a raw byte hash** (C8).

## If you are here because a run exited 8

Check whether the only plan change was a marker. Run the normalization over the
attempt-start and attempt-end versions of the plan and compare: if the normalized streams
differ, a real goal edit happened and the guard is correct — find it and route it through
interactive `sl-strategy` or a human-approved plan revision. If they are identical, the
normalization has a hole. Fix the pattern; do not widen the carve-out to make the symptom
go away.
