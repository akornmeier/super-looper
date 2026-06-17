---
title: "Release-please version drift: file map, causes, and recovery"
date: 2026-06-17
category: docs/solutions/workflow/
module: release
problem_type: workflow_issue
component: build_tooling
severity: high
applies_when:
  - "`bun run release:validate` reports drift or a stale release-as pin"
  - "a release-owned version was hand-edited in a normal feature PR"
  - "a direct push or direct merge to main bypassed the release:validate + test gate"
  - "plugin.json, marketplace.json, and the release-please manifest disagree on a version"
related_components:
  - development_workflow
  - documentation
  - tooling
root_cause: missing_workflow_step
resolution_type: workflow_improvement
tags:
  - release-please
  - version-drift
  - marketplace
  - extra-files
  - release-as
  - branch-protection
  - recovery
---

# Release-please version drift: file map, causes, and recovery

## Context

Two components in this repo carry release-owned versions, tracked independently:

- **`super-looper`** — the plugin (currently `3.x`).
- **`marketplace`** — the catalog (currently `1.x`).

[release-please](https://github.com/googleapis/release-please) owns both. Hand-editing
a release-owned version, or merging without the gate, desyncs the files that are
supposed to agree — and because the validator only checks *some* of them, a bad
value can pass validation and surface later as a release-please conflict requiring
several PRs to unwind. This doc maps which file holds which version, what
`bun run release:validate` actually catches, and how to recover.

## File-relationship map

| File | Field | Owner / source | Checked by `release:validate`? |
| --- | --- | --- | --- |
| `.github/.release-please-manifest.json` | `"plugins/super-looper"`, `".claude-plugin"` | **Source of truth** for each component's released version | n/a (it *is* the truth) |
| `.github/release-please-config.json` | `packages`, `extra-files`, `release-as` | Hand-maintained config | Yes — stale `release-as` pin, bad `changelog-path` |
| `plugins/super-looper/.claude-plugin/plugin.json` | `$.version` | Written by release-please via `extra-files` from the `plugins/super-looper` manifest entry | **No** (see below) |
| `.claude-plugin/marketplace.json` | `$.metadata.version` | Synced from the `.claude-plugin` manifest entry | **Yes** — drift flagged |
| `.claude-plugin/marketplace.json` | `plugins[].description` (and `plugin.json` `description`) | Synced to fixed constants in `src/release/metadata.ts` | Yes — drift flagged |
| `CHANGELOG.md` | release sections | release-please-owned (root changelog is a pointer to GitHub Releases) | No |

**How the sync works — `extra-files`, not `linked-versions`.** Each package in
`release-please-config.json` declares `extra-files`: at release time release-please
writes the package's new manifest version into those paths
(`plugin.json $.version`, `marketplace.json $.metadata.version`). release-please
*also* offers a `linked-versions` plugin to force several packages onto one shared
version — **this repo does not use it**; `super-looper` and `marketplace` version
independently. The plugin's version lives **only** in `plugin.json` and the
manifest; it is deliberately **not** duplicated into the `marketplace.json`
`plugins[]` entry (`src/release/metadata.ts` notes this — duplicating it creates
drift release-please can't maintain).

**The asymmetry that bites:** `release:validate` runs `syncReleaseMetadata` with
only the `marketplace` version, so it flags drift on `marketplace.json`
`metadata.version` and on the descriptions — but it does **not** compare
`plugin.json $.version` against the manifest. A hand-bumped plugin version
therefore passes `release:validate` clean and only blows up when release-please
next runs.

## Recovery decision tree

Run `bun run release:validate` first; it names what drifted. Then pick one:

1. **Forward-sync** — the manifest is the intended truth and a *derived* file fell
   behind (e.g. `marketplace.json metadata.version` lags the manifest, or a
   description was edited).
   Fix: `bun run release:sync-metadata` rewrites the descriptions from the
   constants, but it does **not** read the manifest — `metadata.version` is only
   rewritten when you pass the target explicitly. To repair a `metadata.version`
   drift, feed it the manifest value:
   `bun run release:sync-metadata --version:marketplace=$(jq -r '.[".claude-plugin"]' .github/.release-please-manifest.json)`.
   Then commit, PR. (Without `--version:marketplace=...`, the description-only
   re-sync leaves the version drift in place and `release:validate` keeps failing.)

2. **Backward-revert** — a feature PR **hand-edited** a release-owned version
   (`plugin.json $.version`, `marketplace.json metadata.version`, or the manifest
   itself). The human wrote a value release-please should own.
   Fix: restore the released value from `origin/main` (or the manifest) so
   release-please owns the next bump. **Especially do this for `plugin.json
   $.version`** — `release:validate` won't flag it, so this is the case that
   silently passes and recurs.

3. **`release-as` pin** — you must force the *next* release to a specific version
   (e.g. to realign the line forward after a botched bump pushed the manifest
   ahead). Set `"release-as": "X.Y.Z"` on the package in `release-please-config.json`.
   The pin **must be strictly ahead** of the released version and **must be removed
   after that release ships** — a stale pin re-pins (freezes) every subsequent
   release.

When in doubt between (1) and (2): is the manifest value the one you want shipped?
Forward-sync. Did a human invent a version that shouldn't exist yet?
Backward-revert.

## Worked examples

**A. Stale `release-as` froze releases (incident #674).** A `release-as` left in
config at-or-below the already-released version re-pinned every release to the same
number. `release:validate` now guards this — `validateReleasePleaseConfig` compares
the pin against the `origin/main` manifest and errors:

```
Package ".claude-plugin" uses a stale release-as pin "1.0.2" that is not ahead
of the released version "1.0.2". Remove release-as after the pinned release ships
so future releases can bump normally.
```

Fix: remove the pin once its release shipped. (The staleness check intentionally
reads `origin/main`, not the working tree — a release-please PR bumps the
working-tree manifest to the proposed version, which would otherwise make a
legitimate pin look stale and block the very release it exists to create.)

**B. Hand-bumped `plugin.json $.version` in a feature PR.** `release:validate`
passes (it does not check the plugin version), the PR merges, then release-please's
next run conflicts or double-bumps. Recovery: open a follow-up PR resetting
`plugin.json $.version` to the manifest's `plugins/super-looper` value, and let
release-please own future bumps.

**C. `marketplace.json metadata.version` drifted from the manifest.**
`release:validate` reports:

```
Release metadata drift detected:
- .../.claude-plugin/marketplace.json
```

Fix (forward-sync): pass the manifest value, since `release:sync-metadata` does
not read the manifest and only rewrites `metadata.version` when given the target:
`bun run release:sync-metadata --version:marketplace=$(jq -r '.[".claude-plugin"]' .github/.release-please-manifest.json)`,
then commit, PR. A bare `bun run release:sync-metadata` re-syncs descriptions only
and leaves the version drift unresolved.

## When the rules were violated (direct merge / direct push)

A direct push or direct merge to `main` skips `release:validate`, the test suite,
and PR-title validation. That is how an unvalidated hand-bump or a stale pin lands
unnoticed and is only discovered when releases break — the "multi-PR recovery" the
contributor rules warn about. Prevention is structural: branch protection on `main`
requires the `test` status check, so every change flows through a PR that runs the
gate. If a bad value already landed, use the decision tree above and ship the
correction as its own PR — never a second direct merge.

## Why this matters

Version drift is silent until it isn't. The validator is a partial net — it catches
marketplace-version and description drift and stale pins, but not `plugin.json`
version edits — so "release:validate is green" is not proof the version line is
clean. Knowing *which file each version lives in*, and *which way to push the fix*
(forward-sync vs. backward-revert vs. a one-shot pin), is what turns a confusing
multi-PR cleanup into a single targeted correction.

## Related

- `AGENTS.md` (Merge policy) and `plugins/super-looper/AGENTS.md` (Versioning
  Requirements, Pre-Commit Checklist) — the contributor rules this doc backs.
- `src/release/metadata.ts`, `src/release/config.ts`, `scripts/release/validate.ts` —
  the tooling described here.
- `docs/solutions/developer-experience/git-untracked-empty-dirs-break-ci.md` — the other release-tooling gotcha in this repo.
