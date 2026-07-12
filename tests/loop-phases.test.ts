import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"

// ---------------------------------------------------------------------------
// loop-phases.test.ts — per-phase PR execution (F4).
//
// The orchestrator ships a plan as one run and one PR per phase, STACKING each
// phase's branch on the previous one. The stack is forced, not preferred: `main`
// requires `pr-reviewed` (a non-author review on the exact head) and the bypass
// actor was removed, so an unattended run cannot merge its own PR. A serial
// driver would block forever waiting for a human.
//
// loop.sh is stubbed here — these tests cover the orchestration, not the driver.
// See docs/solutions/workflow/per-phase-pr-execution.md.
// ---------------------------------------------------------------------------

const PHASES = path.join(__dirname, "../scripts/loop-phases.sh")
const SYNC = path.join(__dirname, "../scripts/sync-plan-progress.py")

let work: string

beforeEach(() => {
  work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "loop-phases-")))
})
afterEach(() => {
  fs.rmSync(work, { recursive: true, force: true })
})

function git(cwd: string, ...args: string[]) {
  const r = Bun.spawnSync(["git", ...args], { cwd })
  return new TextDecoder().decode(r.stdout).trim()
}

/** A target repo holding a two-unit plan, committed. */
function target(planBody?: string): string {
  const t = path.join(work, "target")
  fs.mkdirSync(path.join(t, "docs/plans"), { recursive: true })
  fs.writeFileSync(
    path.join(t, "docs/plans/p.md"),
    planBody ??
      "---\ntitle: P\ncommits: none\n---\n## Implementation Units\n### U1. First\n### U2. Second\n## Amendments\n\n_No amendments yet._\n",
  )
  git(t, "init", "-q")
  git(t, "config", "user.email", "t@t")
  git(t, "config", "user.name", "t")
  git(t, "add", "-A")
  git(t, "commit", "-qm", "base")
  return t
}

/**
 * A loop.sh stub that cuts a branch per phase and commits, mimicking what lfg
 * does. `failOn` makes one phase exit non-zero, so the chain-stop path is real.
 */
function stubLoop(failOn = ""): string {
  const p = path.join(work, "stub-loop.sh")
  fs.writeFileSync(
    p,
    `#!/usr/bin/env bash
set -euo pipefail
tgt=""; phase=""
while [ $# -gt 0 ]; do case "$1" in --target) tgt="$2"; shift 2;; --phase) phase="$2"; shift 2;; *) shift;; esac; done
if [ "$phase" = "${failOn}" ]; then exit 5; fi
cd "$tgt"
b="feat/$(echo "$phase" | tr 'A-Z' 'a-z' | tr ',' '-')"
git checkout -q -b "$b"
echo "$phase" >> src.txt && git add -A && git commit -qm "feat: $phase"
`,
  )
  fs.chmodSync(p, 0o755)
  return p
}

async function runPhases(t: string, extra: string[] = [], loop?: string, planFile = "docs/plans/p.md") {
  const proc = Bun.spawn(
    ["bash", PHASES, "--target", t, "--plan-file", planFile, ...extra],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, LOOP_DRIVER_BIN: loop ?? stubLoop() },
    },
  )
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  return { exitCode, stderr }
}

describe("phase derivation", () => {
  test("with no --group, each plan unit becomes its own phase in U-ID order", async () => {
    const t = target()
    const { exitCode, stderr } = await runPhases(t)

    expect(exitCode).toBe(0)
    expect(stderr).toContain("2 phase(s): U1 U2")
    // Regression pin: `GROUPS` is a bash special builtin holding the user's numeric
    // group IDs, and `GROUPS=()` does not clear it. Naming the phase array GROUPS
    // made this iterate over unix groups (16 "phases" named 20, 12, 61, ...).
    expect(stderr).not.toMatch(/phase\(s\): \d/)
  })

  test("--group overrides derivation and ships one PR per group", async () => {
    const t = target()
    const { exitCode, stderr } = await runPhases(t, ["--group", "U1,U2"])

    expect(exitCode).toBe(0)
    expect(stderr).toContain("1 phase(s): U1,U2")
  })

  test("phases are ordered by U-ID number, not by first mention in the plan", async () => {
    // A plan may reference a later unit before it declares an earlier one (a
    // dependency note, a summary table). First-seen order would ship U10 before
    // U2 — out of dependency order, and each phase stacks on the previous one, so
    // the wrong order is baked into the branch chain.
    const t = target(
      "---\ntitle: P\ncommits: none\n---\n" +
        "## Overview\nU10. depends on U2.\n" +
        "## Implementation Units\n### U1. First\n### U2. Second\n### U10. Tenth\n" +
        "## Amendments\n\n_No amendments yet._\n",
    )
    const { exitCode, stderr } = await runPhases(t)

    expect(exitCode).toBe(0)
    expect(stderr).toContain("3 phase(s): U1 U2 U10")
  })

  test("a plan with no U-IDs and no --group is a usage error, not a silent no-op", async () => {
    const t = target("---\ntitle: P\ncommits: none\n---\n# Plan with no units\n")
    const { exitCode, stderr } = await runPhases(t)

    expect(exitCode).toBe(2)
    expect(stderr).toContain("no implementation units")
  })
})

describe("branch stacking", () => {
  test("phase N+1 branches from phase N's branch, not from the run's base", async () => {
    const t = target()
    const { exitCode } = await runPhases(t)
    expect(exitCode).toBe(0)

    // The stack is the whole point: an unattended run cannot merge its own PR
    // (pr-reviewed needs a non-author review), so phase 2 must build on phase 1's
    // BRANCH rather than wait for a merge that will never come.
    const ancestor = Bun.spawnSync(["git", "merge-base", "--is-ancestor", "feat/u1", "feat/u2"], { cwd: t })
    expect(ancestor.exitCode).toBe(0)
  })

  test("an earlier phase's branch does not contain a later phase's work", async () => {
    const t = target()
    await runPhases(t)

    // If U2's work leaked into U1's branch, the PRs would not be independently
    // reviewable and the stack would be meaningless.
    expect(git(t, "show", "feat/u1:src.txt")).toBe("U1")
    expect(git(t, "show", "feat/u2:src.txt")).toBe("U1\nU2")
  })
})

describe("failure stops the chain", () => {
  test("a failing phase halts later phases and surfaces the driver's exit code", async () => {
    const t = target()
    const { exitCode, stderr } = await runPhases(t, [], stubLoop("U1"))

    expect(exitCode).toBe(5) // loop.sh's exit code, not a generic 1
    expect(stderr).toContain("stopping the chain")
    // U2 must not have been attempted: it would branch from a phase that does
    // not exist, and later phases depend on earlier ones.
    expect(stderr).not.toContain("phase 2/2")
  })

  test("phases that already landed keep their branches when a later phase fails", async () => {
    const t = target()
    const { exitCode, stderr } = await runPhases(t, [], stubLoop("U2"))

    expect(exitCode).toBe(5)
    expect(stderr).toContain("keep their PRs")
    // A partial run is reviewable work, not garbage to throw away.
    expect(git(t, "show", "feat/u1:src.txt")).toBe("U1")
  })
})

describe("between-phase plan sync", () => {
  test("each shipped phase records its commits and an Amendments entry", async () => {
    const t = target()
    await runPhases(t)

    const plan = git(t, "show", "feat/u2:docs/plans/p.md")
    expect(plan).toContain("phase U1 shipped")
    expect(plan).toContain("phase U2 shipped")
    expect(plan).not.toContain("No amendments yet")
    // Append-only: both phases' SHAs are listed, comma-joined, `none` replaced.
    const commits = plan.match(/^commits: (.*)$/m)?.[1] ?? ""
    expect(commits.split(", ").filter(Boolean)).toHaveLength(2)
  })

  test("an absolute --plan-file still records the phase's progress in the plan", async () => {
    // The sync's git pathspecs run with cwd=$TARGET. An absolute path handed
    // straight to `git diff/add --` can resolve outside the repository, and the
    // `if ! git diff --quiet` guard reads git's fatal as "nothing changed" — the
    // phase ships, the plan is rewritten, and the sync commit is silently skipped.
    const t = target()
    const { exitCode } = await runPhases(t, [], undefined, path.join(t, "docs/plans/p.md"))

    expect(exitCode).toBe(0)
    const plan = git(t, "show", "feat/u2:docs/plans/p.md")
    expect(plan).toContain("phase U1 shipped")
    expect(plan).toContain("phase U2 shipped")
  })

  test("a --plan-file outside the target is a usage error, not a partial run", async () => {
    const t = target()
    const outside = path.join(work, "elsewhere.md")
    fs.writeFileSync(outside, "### U1. First\n")
    const { exitCode, stderr } = await runPhases(t, [], undefined, outside)

    expect(exitCode).toBe(2)
    expect(stderr).toContain("must live inside --target")
    // Nothing shipped: the failure is up front, before any phase ran.
    expect(stderr).not.toContain("phase 1/")
  })

  test("commits are recorded from a detached-HEAD base, not lost to an empty range", async () => {
    // The base must be a commit SHA (what loop.sh records as BASE_REF), not a
    // branch name: `rev-parse --abbrev-ref HEAD` yields the literal "HEAD" when
    // detached, and the `HEAD..HEAD` range is empty, so the phase's SHAs would
    // silently never land in the plan's append-only `commits` metadata.
    const t = target()
    git(t, "checkout", "-q", "--detach", "HEAD")

    const { exitCode } = await runPhases(t)
    expect(exitCode).toBe(0)

    const plan = git(t, "show", "feat/u2:docs/plans/p.md")
    const commits = plan.match(/^commits: (.*)$/m)?.[1] ?? ""
    expect(commits.split(", ").filter(Boolean)).toHaveLength(2)
    expect(commits).not.toContain("none")
  })
})

describe("sync-plan-progress.py", () => {
  test("the bundled offline checks pass", async () => {
    const proc = Bun.spawn(["python3", SYNC, "--self-test"], { stdout: "pipe", stderr: "pipe" })
    expect(await proc.exited).toBe(0)
    expect(await new Response(proc.stdout).text()).toContain("self-test ok")
  })

  test("--self-test runs standalone, with no plan or phase metadata", async () => {
    // The self-test path must stay reachable without the normal-mode flags --
    // that is the whole reason they cannot be argparse `required=True`.
    const proc = Bun.spawn(["python3", SYNC, "--self-test"], { stdout: "pipe", stderr: "pipe" })
    expect(await proc.exited).toBe(0)
  })

  // Omitting a flag used to be silently tolerated: the amendment was written with
  // a placeholder ("— phase ? shipped"), corrupting the plan instead of failing.
  for (const omitted of ["--phase", "--branch", "--date"]) {
    test(`omitting ${omitted} in normal mode is a usage error`, async () => {
      const plan = path.join(target(), "docs/plans/p.md")
      const before = fs.readFileSync(plan, "utf8")
      const flags: Record<string, string> = {
        "--phase": "U1",
        "--branch": "feat/x",
        "--date": "2026-07-12",
      }
      const args = Object.entries(flags)
        .filter(([f]) => f !== omitted)
        .flat()

      const proc = Bun.spawn(["python3", SYNC, plan, ...args], { stdout: "pipe", stderr: "pipe" })
      expect(await proc.exited).toBe(2) // argparse's usage-error convention
      expect(await new Response(proc.stderr).text()).toContain(omitted)
      expect(fs.readFileSync(plan, "utf8")).toBe(before) // the plan is untouched
    })
  }

  test("all three flags present in normal mode records the phase", async () => {
    const plan = path.join(target(), "docs/plans/p.md")
    const proc = Bun.spawn(
      // prettier-ignore
      ["python3", SYNC, plan, "--phase", "U1", "--branch", "feat/x", "--date", "2026-07-12", "--commit", "abc123"],
      { stdout: "pipe", stderr: "pipe" },
    )
    expect(await proc.exited).toBe(0)
    const written = fs.readFileSync(plan, "utf8")
    expect(written).toContain("2026-07-12 — phase U1 shipped")
    expect(written).toContain("commits: abc123")
    expect(written).not.toContain("phase ? shipped")
  })
})
