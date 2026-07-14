import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"

// ---------------------------------------------------------------------------
// hooks-goal-guard.test.ts — covers the plugin's first hook surface (U5, R4):
//   plugins/super-looper/hooks/goal-guard.sh (PreToolUse deny on Write|Edit)
//   plugins/super-looper/hooks/hooks.json    (event/matcher contract)
//   scripts/loop.sh                          (forwards LOOP_GOAL_GUARD_PATHS)
//
// The hook is DEFENSE-IN-DEPTH (KTD1): the authoritative guard is the loop.sh
// checksum (exit 8). The hook is env-gated (KTD2): a no-op unless
// LOOP_GOAL_GUARD_PATHS is set, which only loop.sh does.
// ---------------------------------------------------------------------------

const PLUGIN_ROOT = path.join(__dirname, "../plugins/super-looper")
const HOOK = path.join(PLUGIN_ROOT, "hooks/goal-guard.sh")
const HOOKS_JSON = path.join(PLUGIN_ROOT, "hooks/hooks.json")
const LOOP = path.join(__dirname, "../scripts/loop.sh")
const SENTINEL = "<promise>DONE</promise>"

let work: string

beforeEach(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), "goal-guard-"))
})
afterEach(() => {
  fs.rmSync(work, { recursive: true, force: true })
})

function writeExec(p: string, content: string): string {
  fs.writeFileSync(p, content)
  fs.chmodSync(p, 0o755)
  return p
}

// Run the hook with a JSON payload on stdin and an optional env override. When
// `guardPaths` is undefined the variable is left UNSET (dormant hook); when a
// string, it is passed as LOOP_GOAL_GUARD_PATHS.
async function runHook(payload: unknown, guardPaths?: string) {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) }
  delete env.LOOP_GOAL_GUARD_PATHS
  if (guardPaths !== undefined) env.LOOP_GOAL_GUARD_PATHS = guardPaths
  const proc = Bun.spawn(["bash", HOOK], {
    stdin: new TextEncoder().encode(JSON.stringify(payload)),
    stdout: "pipe",
    stderr: "pipe",
    env,
  })
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  return { exitCode, stderr }
}

// A target dir with a STRATEGY.md and a docs/plans/ plan + sibling. Returns the
// resolved (physical) paths so guard/target comparisons are symlink-stable.
function scaffold() {
  const root = fs.realpathSync(work)
  fs.mkdirSync(path.join(root, "docs/plans"), { recursive: true })
  const strategy = path.join(root, "STRATEGY.md")
  const plan = path.join(root, "docs/plans/plan.md")
  const sibling = path.join(root, "docs/plans/other.md")
  fs.writeFileSync(strategy, "strategy\n")
  fs.writeFileSync(plan, "plan\n")
  fs.writeFileSync(sibling, "sibling\n")
  const guard = `${strategy}\n${plan}`
  return { root, strategy, plan, sibling, guard }
}

// ---------------------------------------------------------------------------
// (a) Dormant hook: env unset => never blocks, whatever the tool input.
// ---------------------------------------------------------------------------
describe("dormant when LOOP_GOAL_GUARD_PATHS is unset (KTD2)", () => {
  test("Write to a would-be goal file exits 0 when the var is unset", async () => {
    const { plan } = scaffold()
    const { exitCode } = await runHook({ tool_input: { file_path: plan }, cwd: work })
    expect(exitCode).toBe(0)
  })

  test("empty LOOP_GOAL_GUARD_PATHS is also dormant", async () => {
    const { plan } = scaffold()
    const { exitCode } = await runHook({ tool_input: { file_path: plan }, cwd: work }, "")
    expect(exitCode).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// (b) Armed hook: a Write/Edit that resolves to a listed path is denied (exit 2)
// with the protocol message — including relative-path and symlinked variants.
// ---------------------------------------------------------------------------
describe("denies writes to a listed goal path (R4)", () => {
  test("absolute listed plan path => exit 2 with the protocol message", async () => {
    const { root, plan, guard } = scaffold()
    const { exitCode, stderr } = await runHook(
      { tool_input: { file_path: plan }, cwd: root },
      guard,
    )
    expect(exitCode).toBe(2)
    expect(stderr).toContain("sl-strategy")
    expect(stderr).toContain("human-approved plan revision")
  })

  test("listed STRATEGY.md path => exit 2", async () => {
    const { root, strategy, guard } = scaffold()
    const { exitCode, stderr } = await runHook(
      { tool_input: { file_path: strategy }, cwd: root },
      guard,
    )
    expect(exitCode).toBe(2)
    expect(stderr).toContain("goal file")
  })

  test("Edit (not just Write) is guarded — payload carries file_path either way", async () => {
    const { root, strategy, guard } = scaffold()
    const { exitCode } = await runHook(
      { tool_input: { file_path: strategy, old_string: "a", new_string: "b" }, cwd: root },
      guard,
    )
    expect(exitCode).toBe(2)
  })

  test("relative file_path resolved against payload cwd => exit 2", async () => {
    const { root, guard } = scaffold()
    const { exitCode } = await runHook(
      { tool_input: { file_path: "docs/plans/plan.md" }, cwd: root },
      guard,
    )
    expect(exitCode).toBe(2)
  })

  test("symlinked-directory variant of a listed path => exit 2", async () => {
    const { root, guard } = scaffold()
    const linkDir = path.join(root, "linkdir")
    fs.symlinkSync(root, linkDir)
    const { exitCode } = await runHook(
      { tool_input: { file_path: path.join(linkDir, "docs/plans/plan.md") }, cwd: root },
      guard,
    )
    expect(exitCode).toBe(2)
  })

  test("symlink FILE pointing at a listed path => exit 2", async () => {
    const { root, plan, guard } = scaffold()
    const alias = path.join(root, "GOALS.md")
    fs.symlinkSync(plan, alias)
    const { exitCode } = await runHook(
      { tool_input: { file_path: alias }, cwd: root },
      guard,
    )
    expect(exitCode).toBe(2)
  })

  test("guarded-but-absent STRATEGY.md: creating it mid-run is denied", async () => {
    const { root, strategy, guard } = scaffold()
    fs.rmSync(strategy)
    const { exitCode } = await runHook(
      { tool_input: { file_path: strategy }, cwd: root },
      guard,
    )
    expect(exitCode).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// (c) Exact-path scope: a docs/plans/ sibling is NOT the active plan and passes.
// ---------------------------------------------------------------------------
describe("exact-path scope (KTD2 — never a glob)", () => {
  test("sibling docs/plans/ file is not guarded => exit 0", async () => {
    const { root, sibling, guard } = scaffold()
    const { exitCode } = await runHook(
      { tool_input: { file_path: sibling }, cwd: root },
      guard,
    )
    expect(exitCode).toBe(0)
  })

  test("armed hook with no file_path on the tool call => exit 0", async () => {
    const { root, guard } = scaffold()
    const { exitCode } = await runHook({ tool_input: { content: "x" }, cwd: root }, guard)
    expect(exitCode).toBe(0)
  })

  test("armed hook with an unparseable payload fails open => exit 0", async () => {
    const proc = Bun.spawn(["bash", HOOK], {
      stdin: new TextEncoder().encode("not json"),
      stdout: "pipe",
      stderr: "pipe",
      env: { ...(process.env as Record<string, string>), LOOP_GOAL_GUARD_PATHS: "/x/STRATEGY.md" },
    })
    const exitCode = await proc.exited
    expect(exitCode).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// (d) hooks.json contract: event, matcher, and command shape.
// ---------------------------------------------------------------------------
describe("hooks.json contract (R4)", () => {
  test("declares a PreToolUse command hook matching Write|Edit -> goal-guard.sh", () => {
    const raw = fs.readFileSync(HOOKS_JSON, "utf8")
    const parsed = JSON.parse(raw) as {
      hooks: Record<string, Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>>
    }
    const pre = parsed.hooks?.PreToolUse
    expect(Array.isArray(pre)).toBe(true)
    const entry = pre.find((e) => e.matcher === "Write|Edit")
    expect(entry).toBeDefined()
    const cmd = entry!.hooks[0]
    expect(cmd.type).toBe("command")
    expect(cmd.command).toContain("${CLAUDE_PLUGIN_ROOT}")
    expect(cmd.command).toContain("hooks/goal-guard.sh")
  })

  test("the referenced hook script exists and is executable", () => {
    const st = fs.statSync(HOOK)
    // owner-execute bit set
    expect(st.mode & 0o100).toBe(0o100)
  })
})

// ---------------------------------------------------------------------------
// (e) `claude plugin validate` accepts the plugin with the new hooks dir.
// CI pins the validator (@2.1.175) and runs `plugin:validate` in the same job,
// so `claude` is on PATH there. Locally it runs against whatever `claude` is
// installed; skipped when the CLI is absent.
// ---------------------------------------------------------------------------
const claudeBin = Bun.which("claude")
describe("claude plugin validate accepts the hooks dir (R4)", () => {
  test.skipIf(!claudeBin)("plugin validate exits 0 with the hooks/ directory present", async () => {
    const proc = Bun.spawn([claudeBin as string, "plugin", "validate", PLUGIN_ROOT], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const exitCode = await proc.exited
    expect(exitCode).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// loop.sh wiring: the driver forwards the exact resolved goal paths through its
// `env -i` allowlist so the hook is armed in unattended runs (and only those).
// STRATEGY.md is always carried; the plan file is added in plan mode only.
// ---------------------------------------------------------------------------
describe("loop.sh forwards LOOP_GOAL_GUARD_PATHS through env -i", () => {
  function mkTarget(): string {
    const target = path.join(work, "target")
    fs.mkdirSync(target, { recursive: true })
    const run = (cmd: string) =>
      Bun.spawnSync(["bash", "-c", cmd], { cwd: target, stdout: "pipe", stderr: "pipe" })
    run("git init -q")
    run("git config user.email t@t.t && git config user.name t")
    run("touch base && git add -A && git commit -q -m base")
    return target
  }

  // A claude stub that dumps the forwarded goal-guard env into a marker, then
  // emits DONE. It runs under `env -i`, so it only sees allowlisted variables.
  function dumpEnvClaude(marker: string): string {
    return writeExec(
      path.join(work, "claude"),
      `#!/usr/bin/env bash\nprintf '%s' "\${LOOP_GOAL_GUARD_PATHS-<<UNSET>>}" > '${marker}'\nprintf 'done\\n${SENTINEL}\\n'\n`,
    )
  }

  function timeoutStub(): string {
    return writeExec(
      path.join(work, "timeout"),
      `#!/usr/bin/env bash\nwhile [ $# -gt 0 ]; do case "$1" in -*) shift ;; *) break ;; esac; done\nshift || true\nexec "$@"\n`,
    )
  }

  async function runLoop(args: string[], extraEnv: Record<string, string>) {
    const proc = Bun.spawn(["bash", LOOP, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...(process.env as Record<string, string>), ...extraEnv },
    })
    const exitCode = await proc.exited
    await new Response(proc.stdout).text()
    await new Response(proc.stderr).text()
    return { exitCode }
  }

  test("seed mode forwards STRATEGY.md only (never the plan)", async () => {
    const target = mkTarget()
    const plugin = path.join(work, "plugin")
    fs.mkdirSync(plugin, { recursive: true })
    const marker = path.join(work, "env-marker")
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--verify-cmd", "true"],
      { LOOP_CLAUDE_BIN: dumpEnvClaude(marker), LOOP_TIMEOUT_BIN: timeoutStub() },
    )
    expect(exitCode).toBe(0)
    const forwarded = fs.readFileSync(marker, "utf8")
    const ct = fs.realpathSync(target)
    expect(forwarded).toBe(`${ct}/STRATEGY.md`)
  })

  test("plan mode forwards STRATEGY.md AND the resolved plan path", async () => {
    const target = mkTarget()
    fs.mkdirSync(path.join(target, "docs/plans"), { recursive: true })
    fs.writeFileSync(path.join(target, "docs/plans/p.md"), "## Implementation Units\n")
    const plugin = path.join(work, "plugin")
    fs.mkdirSync(plugin, { recursive: true })
    const marker = path.join(work, "env-marker")
    const { exitCode } = await runLoop(
      [
        "--target", target, "--plugin-dir", plugin,
        "--plan-file", "docs/plans/p.md", "--max-retries", "0", "--verify-cmd", "true",
      ],
      { LOOP_CLAUDE_BIN: dumpEnvClaude(marker), LOOP_TIMEOUT_BIN: timeoutStub() },
    )
    // The stub intentionally does not create sl-run's durable completed state,
    // so the supervisor refuses its DONE signal after forwarding the guard.
    expect(exitCode).toBe(5)
    const forwarded = fs.readFileSync(marker, "utf8")
    const ct = fs.realpathSync(target)
    expect(forwarded).toBe(`${ct}/STRATEGY.md\n${ct}/docs/plans/p.md`)
  })
})

// ---------------------------------------------------------------------------
// (f) Marker carve-out. A status-marker update is progress state the run itself
// produced, not a goal edit, so the hook lets it through. The carve-out is scoped
// two ways, and both scopes are load-bearing:
//   - to Edit (not Write) — a whole-file rewrite is never a marker update
//   - to the PLAN (not STRATEGY.md) — loop.sh hashes STRATEGY.md raw, so blessing
//     a marker-shaped edit there would let the hook allow a write the authoritative
//     checksum then kills at done_reached, throwing away the whole run's work.
// See docs/solutions/workflow/goal-guard-marker-region-carveout.md.
// ---------------------------------------------------------------------------
async function runHookMarker(payload: unknown, guardPaths: string, markerPath: string) {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) }
  env.LOOP_GOAL_GUARD_PATHS = guardPaths
  env.LOOP_GOAL_GUARD_MARKER_PATH = markerPath
  const proc = Bun.spawn(["bash", HOOK], {
    stdin: new TextEncoder().encode(JSON.stringify(payload)),
    stdout: "pipe",
    stderr: "pipe",
    env,
  })
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  return { exitCode, stderr }
}

describe("marker carve-out on the plan", () => {
  test("an Edit that flips only a marker is allowed", async () => {
    const { plan, guard, root } = scaffold()
    const { exitCode } = await runHookMarker(
      {
        cwd: root,
        tool_input: {
          file_path: plan,
          old_string: "### U1. Parse the thing `[]`",
          new_string: "### U1. Parse the thing `[x]`",
        },
      },
      guard,
      plan,
    )
    expect(exitCode).toBe(0)
  })

  test("the HTML marker form is allowed too", async () => {
    const { plan, guard, root } = scaffold()
    const { exitCode } = await runHookMarker(
      {
        cwd: root,
        tool_input: {
          file_path: plan,
          old_string: '<li>U1. Parse <code class="status">[wip]</code></li>',
          new_string: '<li>U1. Parse <code class="status">[x]</code></li>',
        },
      },
      guard,
      plan,
    )
    expect(exitCode).toBe(0)
  })

  test("prose smuggled in alongside a marker flip is denied", async () => {
    const { plan, guard, root } = scaffold()
    // The marker normalizes away; the changed unit title does not.
    const { exitCode, stderr } = await runHookMarker(
      {
        cwd: root,
        tool_input: {
          file_path: plan,
          old_string: "### U1. Parse the thing `[]`",
          new_string: "### U1. Rewrite everything `[x]`",
        },
      },
      guard,
      plan,
    )
    expect(exitCode).toBe(2)
    expect(stderr).toContain("BLOCKED")
  })

  test("a plain goal edit with no marker involved is denied", async () => {
    const { plan, guard, root } = scaffold()
    const { exitCode } = await runHookMarker(
      {
        cwd: root,
        tool_input: {
          file_path: plan,
          old_string: "R1. The system must validate input.",
          new_string: "R1. The system must not validate input.",
        },
      },
      guard,
      plan,
    )
    expect(exitCode).toBe(2)
  })

  test("a whole-file Write to the plan is denied even when its content is marker-shaped", async () => {
    const { plan, guard, root } = scaffold()
    // A Write carries no old_string, so there is nothing to prove marker-only
    // against. Treating it as a marker update would hand back every byte of the
    // file — exactly the freedom the carve-out is scoped to withhold.
    const { exitCode } = await runHookMarker(
      { cwd: root, tool_input: { file_path: plan, content: "### U1. Parse the thing `[x]`\n" } },
      guard,
      plan,
    )
    expect(exitCode).toBe(2)
  })

  test("a marker-shaped Edit to STRATEGY.md is denied — it is hashed raw", async () => {
    const { strategy, plan, guard, root } = scaffold()
    const { exitCode } = await runHookMarker(
      {
        cwd: root,
        tool_input: {
          file_path: strategy,
          old_string: "Goal: ship the thing `[]`",
          new_string: "Goal: ship the thing `[x]`",
        },
      },
      guard,
      plan, // the carve-out names the PLAN, not STRATEGY.md
    )
    expect(exitCode).toBe(2)
  })

  test("a marker flip that also changes trailing newlines is denied", async () => {
    const { plan, guard, root } = scaffold()
    // The marker normalizes away, but the added newline does not: loop.sh hashes
    // the normalized stream with its newlines intact, so allowing this here would
    // hand the run a write the authoritative checksum kills at done_reached.
    const { exitCode, stderr } = await runHookMarker(
      {
        cwd: root,
        tool_input: {
          file_path: plan,
          old_string: "### U1. Parse the thing `[]`\n",
          new_string: "### U1. Parse the thing `[x]`\n\n",
        },
      },
      guard,
      plan,
    )
    expect(exitCode).toBe(2)
    expect(stderr).toContain("BLOCKED")
  })

  test("a trailing-newline-only edit is denied", async () => {
    const { plan, guard, root } = scaffold()
    // No marker involved at all -- the only change is a newline at the end. It
    // must not read as a no-op (which would deny for the wrong reason) nor as a
    // marker-only edit; either way the hook denies, matching loop.sh's hash.
    const { exitCode } = await runHookMarker(
      {
        cwd: root,
        tool_input: {
          file_path: plan,
          old_string: "### U1. Parse the thing `[x]`\n",
          new_string: "### U1. Parse the thing `[x]`\n\n",
        },
      },
      guard,
      plan,
    )
    expect(exitCode).toBe(2)
  })

  test("a marker flip with matching trailing newlines is still allowed", async () => {
    const { plan, guard, root } = scaffold()
    // The carve-out survives the newline fix: newline-preserving capture must not
    // turn every marker Edit that happens to end in a newline into a denial.
    const { exitCode } = await runHookMarker(
      {
        cwd: root,
        tool_input: {
          file_path: plan,
          old_string: "### U1. Parse the thing `[]`\n",
          new_string: "### U1. Parse the thing `[x]`\n",
        },
      },
      guard,
      plan,
    )
    expect(exitCode).toBe(0)
  })

  // Arm the marker path explicitly-empty rather than leaving it unset: runHook
  // inherits process.env, so an ambient LOOP_GOAL_GUARD_MARKER_PATH in a dev or
  // CI shell would arm the carve-out and flip this to allow — a green-to-red
  // that says nothing about the hook's behavior.
  test("with no marker path armed, a marker Edit on the plan is denied (backward compatible)", async () => {
    const { plan, guard, root } = scaffold()
    const { exitCode } = await runHookMarker(
      {
        cwd: root,
        tool_input: {
          file_path: plan,
          old_string: "### U1. Parse the thing `[]`",
          new_string: "### U1. Parse the thing `[x]`",
        },
      },
      guard,
      "",
    )
    expect(exitCode).toBe(2)
  })
})

// The two normalizers — loop.sh's normalize_markers and the hook's — MUST agree.
// If they drift, the hook allows an edit the authoritative checksum then kills at
// done_reached: the run does all its work and throws it away. Pin the sed program
// itself rather than trusting prose to keep them in sync.
describe("the two marker normalizers agree", () => {
  test("loop.sh and goal-guard.sh carry byte-identical sed patterns", () => {
    const loopSrc = fs.readFileSync(LOOP, "utf8")
    const hookSrc = fs.readFileSync(HOOK, "utf8")
    const patterns = [
      `-e 's@<code class="status">\\[(wip|x|f)\\]</code>@<code class="status">[]</code>@g' \\`,
      "-e 's@`\\[(wip|x|f)\\]`@`[]`@g'",
    ]
    for (const p of patterns) {
      expect(loopSrc).toContain(p)
      expect(hookSrc).toContain(p)
    }
  })
})
