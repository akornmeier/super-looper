---
title: Git does not track empty directories — directory-dependent tooling passes locally but fails in CI
date: 2026-06-16
category: docs/solutions/developer-experience/
module: solutions
problem_type: developer_experience
component: development_workflow
severity: low
applies_when:
  - a test or tool's behavior depends on a directory existing, not just on files within it
  - CI runs on a clean checkout while the directory was created only on local disk
  - a directory is a documented canonical location that holds no committed files yet
  - a tool distinguishes a missing directory from an empty one
related_components:
  - testing_framework
  - build_tooling
tags:
  - git
  - empty-directory
  - gitkeep
  - ci
  - local-vs-ci
  - test-fixture
  - directory-walk
---

# Git does not track empty directories — directory-dependent tooling passes locally but fails in CI

## Context

A repo-side frontmatter validator CLI (`scripts/solutions/validate-frontmatter.ts`) has a corpus mode: point it at a directory and it walks every `.md` file under it and validates each, exiting `0` when all pass — including a vacuous pass over an empty corpus (zero files). A separate guard makes a nonexistent path argument a usage error:

```ts
const stat = await fs.stat(target).catch(() => null)
if (!stat) {
  console.error(`usage: cannot read "${target}" (no such file or directory)`)
  process.exit(2)
}
```

The test `corpus mode over the (empty) docs/solutions exits 0` passed locally (full suite: 1263 pass). In CI the `test` job failed on exactly that test: `Expected: 0`, received `2`. Nothing else failed.

The trap: **git does not track empty directories.** `docs/solutions/` (and its empty subdirectories) existed on local disk but were never committed because they held no files. On a fresh CI checkout the directory therefore did not exist. The corpus test ran the CLI against the now-missing path, `fs.stat` failed, the missing-path guard fired, and the CLI exited `2`. The suite passed locally only because the directory happened to exist on the developer's disk — filesystem state git never preserved.

## Guidance

When a test or tool depends on a **directory** existing (not just on files inside it), commit a tracked placeholder so the directory survives a clean checkout:

```bash
touch docs/solutions/.gitkeep
git add docs/solutions/.gitkeep
```

Prefer `.gitkeep` over a content file (e.g. `README.md`) when the directory is scanned by a tool that selects files by extension. The validator here walks `.md` files:

```ts
const files = (await walkFiles(target)).filter((f) => f.endsWith(".md"))
```

`.gitkeep` is invisible to that filter, so it pins the directory without being ingested. A `README.md` would be picked up, fail frontmatter validation (no frontmatter), and break the very gate the directory exists for.

## Why This Matters

"Passes locally" is not evidence of correctness when a test depends on filesystem state git may not preserve. Empty directories are a *silent* omission — git emits no warning; the directory simply does not appear in the clone. The divergence stays invisible until CI runs on a clean checkout.

The failure is also indirect, which makes it slow to diagnose: the missing directory triggers a *different* code path (the missing-path guard's exit `2`) than the one under test (the empty-walk's exit `0`). The test output (`Expected 0, got 2`) points at an exit code, not at the absent directory — the root cause sits one layer removed from the symptom.

## When to Apply

- A test asserts behavior that depends on a directory existing, not merely on its contents.
- A CLI, script, or tool distinguishes "directory not found" from "directory is empty" (different exit codes or branches).
- A directory is a documented canonical location (a knowledge store, a fixtures root) before any content lands in it.
- Reach for `.gitkeep` rather than a content placeholder whenever a directory-scanning tool would otherwise ingest the placeholder.

## Examples

Correct — inert placeholder, invisible to the `.md` walk:

```bash
touch docs/solutions/.gitkeep
git add docs/solutions/.gitkeep
git commit -m "fix(solutions): track docs/solutions dir so the corpus gate runs in CI"
```

Wrong — placeholder gets ingested and fails the validator:

```bash
# A .md file here is picked up by the .endsWith(".md") walk,
# fails frontmatter validation (no frontmatter), and breaks the gate.
touch docs/solutions/README.md
```

Keep the missing-path guard — it correctly rejects typos. Committing the directory simply ensures the guard never fires on a legitimately empty corpus:

```ts
// docs/solutions/ now exists in every checkout (.gitkeep) ->
// corpus walk finds 0 .md files -> exit 0 (vacuous pass).
// A genuinely missing or typo'd path still -> exit 2 (usage).
```

## Related

- First entry in `docs/solutions/`. No related docs yet.
- Introduced alongside the single-source `docs/solutions/` schema tooling (PR #2, branch `feat/solutions-schema-single-source`).
