import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"

// ---------------------------------------------------------------------------
// loop-driver.test.ts — covers scripts/loop.sh argument parsing, command
// construction, isolation guard, DONE-routing (not success), target-scoped
// verification, clean-base-per-retry cap, and --dry-run. (R1-R6, R9, R10, R11;
// KTD3/KTD4/KTD7/KTD8.)
//
// All `claude`, `gh`, `timeout`, and `--verify-cmd` calls are stubbed via the
// LOOP_*_BIN seams, so no live Claude or GitHub call is made and the suite
// passes on any branch.
// ---------------------------------------------------------------------------

const SCRIPT = path.join(__dirname, "../scripts/loop.sh")
const SENTINEL = "<promise>DONE</promise>"

let work: string

beforeEach(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), "loop-driver-"))
})
afterEach(() => {
  fs.rmSync(work, { recursive: true, force: true })
})

function writeExec(p: string, content: string): string {
  fs.writeFileSync(p, content)
  fs.chmodSync(p, 0o755)
  return p
}

// A claude stub with baked-in behavior. It runs under `env -i`, so it cannot
// read custom env vars — every behavior is interpolated at write time. Each
// invocation appends a line to `marker` so tests can count re-launches.
function claudeStub(name: string, transcript: string, exitCode: number, marker: string): string {
  return writeExec(
    path.join(work, name),
    `#!/usr/bin/env bash\nprintf 'RUN\\n' >> '${marker}'\ncat <<'__T__'\n${transcript}\n__T__\nexit ${exitCode}\n`,
  )
}

// Generic gh stub. Runs outside `env -i`, so it reads STUB_GH_* from the test env.
function ghStub(): string {
  return writeExec(
    path.join(work, "gh"),
    `#!/usr/bin/env bash
sub="\${1:-}"; act="\${2:-}"
if [ "$sub" = "pr" ] && [ "$act" = "view" ]; then
  if [ -z "\${STUB_GH_PR_STATE:-}" ]; then exit 1; fi
  want=state
  for a in "$@"; do
    if [ "$a" = ".url" ]; then want=url; fi
  done
  if [ "$want" = url ]; then echo "\${STUB_GH_PR_URL:-}"; else echo "\${STUB_GH_PR_STATE}"; fi
  exit 0
fi
if [ "$sub" = "pr" ] && [ "$act" = "checks" ]; then
  # Emit one bucket per line (STUB_GH_CHECK_BUCKETS, comma-separated); empty =>
  # a PR with no checks at all, mirroring real \`gh pr checks --json bucket\`.
  if [ -n "\${STUB_GH_CHECK_BUCKETS:-}" ]; then printf '%s\\n' \${STUB_GH_CHECK_BUCKETS//,/ }; fi
  exit 0
fi
exit 0
`,
  )
}

// Stub `timeout`: strip leading options + the DURATION token, exec the rest.
// Keeps execution tests independent of a host `timeout` binary.
function timeoutStub(): string {
  return writeExec(
    path.join(work, "timeout"),
    `#!/usr/bin/env bash
while [ $# -gt 0 ]; do
  case "$1" in -*) shift ;; *) break ;; esac
done
shift || true
exec "$@"
`,
  )
}

// Stub `timeout` that simulates a fired timeout: ignore everything, exit 124.
function timeoutKillStub(): string {
  return writeExec(path.join(work, "timeout-kill"), `#!/usr/bin/env bash\nexit 124\n`)
}

// A verify-cmd stub that records each received argv token on its own line (to
// prove args pass as a vector, metacharacters preserved, not eval'd) and writes
// its working directory to cwdMarker (to prove it runs inside the target).
function printargsStub(argsMarker: string, cwdMarker: string): string {
  return writeExec(
    path.join(work, "verify"),
    `#!/usr/bin/env bash\npwd -P > '${cwdMarker}'\n: > '${argsMarker}'\nfor a in "$@"; do printf '%s\\n' "$a" >> '${argsMarker}'; done\nexit "\${VERIFY_EXIT:-0}"\n`,
  )
}

function mkdirInWork(name: string): string {
  const p = path.join(work, name)
  fs.mkdirSync(p, { recursive: true })
  return p
}

function gitInit(dir: string, withRemote: boolean) {
  const run = (cmd: string) =>
    Bun.spawnSync(["bash", "-c", cmd], { cwd: dir, stdout: "pipe", stderr: "pipe" })
  run("git init -q")
  run("git config user.email t@t.t && git config user.name t")
  run("touch base && git add -A && git commit -q -m base")
  if (withRemote) run("git remote add origin https://example.invalid/throwaway.git")
}

interface RunOpts {
  env?: Record<string, string>
}
async function runLoop(args: string[], opts: RunOpts = {}) {
  const proc = Bun.spawn(["bash", SCRIPT, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...(opts.env ?? {}) },
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  return { stdout, stderr, exitCode }
}

// Common stub bundle for execution-path tests.
function stubs(extra: Record<string, string> = {}) {
  const marker = path.join(work, "claude-runs.log")
  return {
    marker,
    env: {
      LOOP_GH_BIN: ghStub(),
      LOOP_TIMEOUT_BIN: timeoutStub(),
      ...extra,
    },
  }
}

// ---------------------------------------------------------------------------
// Missing required input
// ---------------------------------------------------------------------------
describe("required input", () => {
  test("no args exits non-zero and names --target", async () => {
    const { exitCode, stderr } = await runLoop([])
    expect(exitCode).not.toBe(0)
    expect(stderr).toContain("--target")
  })

  test("--target without a seed exits non-zero and names the seed flag", async () => {
    const t = mkdirInWork("target")
    const { exitCode, stderr } = await runLoop(["--target", t])
    expect(exitCode).not.toBe(0)
    expect(stderr).toContain("--seed")
  })
})

// ---------------------------------------------------------------------------
// Isolation guard (R10) — target must not be the plugin dir nor overlap it
// ---------------------------------------------------------------------------
describe("isolation guard", () => {
  test("target == plugin-dir is refused with a self-edit error", async () => {
    const dir = mkdirInWork("plugin")
    const { exitCode, stderr } = await runLoop([
      "--target", dir, "--plugin-dir", dir, "--seed", "x",
    ])
    expect(exitCode).toBe(3)
    expect(stderr).toContain("self-edit")
  })

  test("target as a descendant of plugin-dir is refused", async () => {
    const plugin = mkdirInWork("plugin")
    const target = mkdirInWork("plugin/inner")
    const { exitCode, stderr } = await runLoop([
      "--target", target, "--plugin-dir", plugin, "--seed", "x",
    ])
    expect(exitCode).toBe(3)
    expect(stderr).toContain("self-edit")
  })

  test("target as an ancestor of plugin-dir is refused", async () => {
    const target = mkdirInWork("outer")
    const plugin = mkdirInWork("outer/plugin")
    const { exitCode, stderr } = await runLoop([
      "--target", target, "--plugin-dir", plugin, "--seed", "x",
    ])
    expect(exitCode).toBe(3)
    expect(stderr).toContain("self-edit")
  })
})

// ---------------------------------------------------------------------------
// No verification mode available (R4 / KTD4) — never success on DONE alone
// ---------------------------------------------------------------------------
describe("verification mode required", () => {
  test("github mode with no remote and no --verify-cmd fails fast", async () => {
    const target = mkdirInWork("target")
    gitInit(target, false) // repo, but no remote
    const plugin = mkdirInWork("plugin")
    const { exitCode, stderr } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x"],
      stubs(),
    )
    expect(exitCode).toBe(4)
    expect(stderr.toLowerCase()).toContain("no verification mode")
  })
})

// ---------------------------------------------------------------------------
// --dry-run command construction (R10 env allowlist, R2 plugin/model wiring)
// ---------------------------------------------------------------------------
describe("--dry-run", () => {
  test("prints a command with env -i allowlist, plugin-dir, model, bypass flag, and target", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    const { exitCode, stdout } = await runLoop([
      "--target", target, "--plugin-dir", plugin,
      "--model", "opus", "--seed", "do the thing", "--dry-run",
    ])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("env -i")
    expect(stdout).toContain("HOME=")
    expect(stdout).toContain("PATH=")
    expect(stdout).toContain("--plugin-dir")
    expect(stdout).toContain(plugin)
    expect(stdout).toContain("--model opus")
    expect(stdout).toContain("--dangerously-skip-permissions")
    expect(stdout).toContain(target)
  })

  test("redacts token values rather than printing them", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    const { stdout } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--dry-run"],
      { env: { GH_TOKEN: "supersecret-token-value" } },
    )
    expect(stdout).not.toContain("supersecret-token-value")
    expect(stdout).toContain("GH_TOKEN=REDACTED")
  })

  test("the constructed verification targets the target, never this repo's gate scripts", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    const { stdout } = await runLoop([
      "--target", target, "--plugin-dir", plugin, "--seed", "x", "--dry-run",
    ])
    expect(stdout).not.toContain("solutions:validate")
    expect(stdout).not.toContain("plugin:validate")
    expect(stdout).not.toContain("release:validate")
    expect(stdout).toContain("gh pr checks")
  })

  test("wires the wall-clock flag into a process-group-signalling timeout wrapper", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    const { stdout } = await runLoop(
      [
        "--target", target, "--plugin-dir", plugin, "--seed", "x",
        "--timeout", "1234", "--kill-after", "30", "--dry-run",
      ],
      { env: { LOOP_TIMEOUT_BIN: "timeout" } },
    )
    expect(stdout).toContain("timeout")
    expect(stdout).toContain("--signal=TERM")
    expect(stdout).toContain("--kill-after=30s")
    expect(stdout).toContain("1234s")
  })

  test("--verify-cmd selects command-mode verification and prints the command", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    const { stdout } = await runLoop([
      "--target", target, "--plugin-dir", plugin, "--seed", "x",
      "--dry-run", "--verify-cmd", "make", "test",
    ])
    expect(stdout).toContain("verify-mode: command")
    expect(stdout).toContain("make test")
    expect(stdout).not.toContain("gh pr checks")
  })
})

// ---------------------------------------------------------------------------
// Source-level stop-predicate scoping (KTD3) — the driver never references
// this repo's own validators anywhere.
// ---------------------------------------------------------------------------
describe("stop predicate is target-scoped", () => {
  test("loop.sh contains no super-looper gate-script invocation", () => {
    const src = fs.readFileSync(SCRIPT, "utf8")
    expect(src).not.toContain("solutions:validate")
    expect(src).not.toContain("plugin:validate")
    expect(src).not.toContain("release:validate")
  })
})

// ---------------------------------------------------------------------------
// DONE is routing, not success (R4 / KTD7)
// ---------------------------------------------------------------------------
describe("DONE routing vs success", () => {
  test("DONE present AND target CI green => success with PR URL", async () => {
    const target = mkdirInWork("target")
    gitInit(target, true)
    const plugin = mkdirInWork("plugin")
    const { marker, env } = stubs()
    const claude = claudeStub("claude", `working...\n${SENTINEL}`, 0, marker)
    const { exitCode, stdout } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x"],
      {
        env: {
          ...env,
          LOOP_CLAUDE_BIN: claude,
          STUB_GH_PR_STATE: "OPEN",
          STUB_GH_PR_URL: "https://github.com/x/throwaway/pull/7",
          STUB_GH_CHECK_BUCKETS: "pass",
        },
      },
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain("SUCCESS")
    expect(stdout).toContain("https://github.com/x/throwaway/pull/7")
  })

  test("DONE present BUT target CI red => DONE-but-red failure, not success", async () => {
    const target = mkdirInWork("target")
    gitInit(target, true)
    const plugin = mkdirInWork("plugin")
    const { marker, env } = stubs()
    const claude = claudeStub("claude", `working...\n${SENTINEL}`, 0, marker)
    const { exitCode, stderr } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x"],
      {
        env: {
          ...env,
          LOOP_CLAUDE_BIN: claude,
          STUB_GH_PR_STATE: "OPEN",
          STUB_GH_CHECK_BUCKETS: "fail",
        },
      },
    )
    expect(exitCode).toBe(7)
    expect(stderr).toContain("DONE-but-red")
  })

  test("DONE absent => failure (no success on a crashed run)", async () => {
    const target = mkdirInWork("target")
    gitInit(target, true)
    const plugin = mkdirInWork("plugin")
    const { marker, env } = stubs()
    const claude = claudeStub("claude", "partial work, then died", 1, marker)
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--max-retries", "0"],
      { env: { ...env, LOOP_CLAUDE_BIN: claude } }, // no PR (STUB_GH_PR_STATE unset)
    )
    expect(exitCode).toBe(5)
    expect(fs.readFileSync(marker, "utf8").trim().split("\n").length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Sentinel robustness (KTD7) — a mid-transcript echo must not count
// ---------------------------------------------------------------------------
describe("sentinel robustness", () => {
  test("DONE echoed mid-transcript (not at end) does not trigger success", async () => {
    const target = mkdirInWork("target")
    gitInit(target, true)
    const plugin = mkdirInWork("plugin")
    const { marker, env } = stubs()
    // sentinel appears, but the LAST non-empty line is something else.
    const claude = claudeStub("claude", `${SENTINEL}\nactually still working, no real finish`, 0, marker)
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--max-retries", "0"],
      { env: { ...env, LOOP_CLAUDE_BIN: claude } }, // no PR
    )
    expect(exitCode).not.toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Retry reconciliation (R3 / R11 / KTD8)
// ---------------------------------------------------------------------------
describe("retry reconciliation", () => {
  test("crash-without-DONE but an open PR exists routes to verification, no re-launch", async () => {
    const target = mkdirInWork("target")
    gitInit(target, true)
    const plugin = mkdirInWork("plugin")
    const { marker, env } = stubs()
    const claude = claudeStub("claude", "crashed before DONE", 1, marker)
    const { exitCode, stdout } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--max-retries", "3"],
      {
        env: {
          ...env,
          LOOP_CLAUDE_BIN: claude,
          STUB_GH_PR_STATE: "OPEN", // a PR already exists for the target branch
          STUB_GH_PR_URL: "https://github.com/x/throwaway/pull/9",
          STUB_GH_CHECK_BUCKETS: "pass",
        },
      },
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain("SUCCESS")
    // routed to verification on the first crash — claude launched exactly once
    expect(fs.readFileSync(marker, "utf8").trim().split("\n").length).toBe(1)
  })

  test("repeated crash with no PR resets to clean base and exhausts the cap", async () => {
    const target = mkdirInWork("target")
    gitInit(target, true)
    const plugin = mkdirInWork("plugin")
    const { marker, env } = stubs()
    const claude = claudeStub("claude", "crash, no DONE", 1, marker)
    const { exitCode, stderr } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--max-retries", "2"],
      { env: { ...env, LOOP_CLAUDE_BIN: claude } }, // never an open PR
    )
    expect(exitCode).toBe(5)
    expect(stderr.toLowerCase()).toContain("cap-exhausted")
    // max-retries=2 => 3 total attempts
    expect(fs.readFileSync(marker, "utf8").trim().split("\n").length).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// --verify-cmd is an argv vector, never eval'd (R10) + command-mode selection
// ---------------------------------------------------------------------------
describe("--verify-cmd argv vector", () => {
  test("metacharacter args are passed verbatim as separate argv tokens (not shell-split)", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    const argsMarker = path.join(work, "verify-args.log")
    const cwdMarker = path.join(work, "verify-cwd.log")
    const verify = printargsStub(argsMarker, cwdMarker)
    const { marker, env } = stubs()
    const claude = claudeStub("claude", `done now\n${SENTINEL}`, 0, marker)
    const { exitCode, stdout } = await runLoop(
      [
        "--target", target, "--plugin-dir", plugin, "--seed", "x",
        "--verify-cmd", verify, "a;b", "c d",
      ],
      { env: { ...env, LOOP_CLAUDE_BIN: claude } },
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain("SUCCESS")
    const argLines = fs.readFileSync(argsMarker, "utf8").split("\n").filter((l) => l.length > 0)
    expect(argLines).toEqual(["a;b", "c d"])
    // verify ran inside the target, not loop.sh's CWD
    expect(fs.readFileSync(cwdMarker, "utf8").trim()).toBe(fs.realpathSync(target))
  })

  test("command-mode verification red => DONE-but-red failure", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    const argsMarker = path.join(work, "verify-args.log")
    const cwdMarker = path.join(work, "verify-cwd.log")
    const verify = printargsStub(argsMarker, cwdMarker)
    const { marker, env } = stubs()
    const claude = claudeStub("claude", `done now\n${SENTINEL}`, 0, marker)
    const { exitCode, stderr } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--verify-cmd", verify],
      { env: { ...env, LOOP_CLAUDE_BIN: claude, VERIFY_EXIT: "1" } },
    )
    expect(exitCode).toBe(7)
    expect(stderr).toContain("DONE-but-red")
  })
})

// ---------------------------------------------------------------------------
// Cap / numeric-input validation (R3 — never loop unbounded)
// ---------------------------------------------------------------------------
describe("numeric-cap validation", () => {
  test("non-numeric --max-retries exits non-zero with a usage error (no unbounded loop)", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    const { exitCode, stderr } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--max-retries", "abc"],
      stubs(),
    )
    expect(exitCode).toBe(2)
    expect(stderr).toContain("--max-retries")
    expect(stderr.toLowerCase()).toContain("integer")
  })

  test("empty --max-retries is rejected", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--max-retries", ""],
      stubs(),
    )
    expect(exitCode).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Timeout routing (R3 / KTD via exit codes) — EX_TIMEOUT vs EX_CAP
// ---------------------------------------------------------------------------
describe("timeout routing", () => {
  test("a fired timeout (exit 124) with no DONE => EX_TIMEOUT (6), not cap-exhausted", async () => {
    const target = mkdirInWork("target")
    gitInit(target, true)
    const plugin = mkdirInWork("plugin")
    const { marker } = stubs()
    // claude never runs (the kill-stub exits 124 before exec'ing it).
    const claude = claudeStub("claude", `${SENTINEL}`, 0, marker)
    const { exitCode, stderr } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--max-retries", "0"],
      { env: { LOOP_GH_BIN: ghStub(), LOOP_TIMEOUT_BIN: timeoutKillStub(), LOOP_CLAUDE_BIN: claude } },
    )
    expect(exitCode).toBe(6)
    expect(stderr.toLowerCase()).toContain("timeout")
  })
})

// ---------------------------------------------------------------------------
// --verify-cmd input validation (R10 — no silent footguns)
// ---------------------------------------------------------------------------
describe("--verify-cmd validation", () => {
  test("--verify-cmd with no command exits non-zero with a usage error", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    const { exitCode, stderr } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--verify-cmd"],
      stubs(),
    )
    expect(exitCode).toBe(2)
    expect(stderr).toContain("--verify-cmd")
  })

  test("a verify command starting with '-' (e.g. a swallowed --dry-run) is rejected", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    const { exitCode, stderr } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--verify-cmd", "--dry-run"],
      stubs(),
    )
    expect(exitCode).toBe(2)
    expect(stderr).toContain("--dry-run")
  })
})

// ---------------------------------------------------------------------------
// Zero-checks false-green guard (KTD4 — no unverified success)
// ---------------------------------------------------------------------------
describe("zero-checks is not green", () => {
  test("DONE + open PR but the PR has NO checks => DONE-but-red, not success", async () => {
    const target = mkdirInWork("target")
    gitInit(target, true)
    const plugin = mkdirInWork("plugin")
    const { marker, env } = stubs()
    const claude = claudeStub("claude", `done\n${SENTINEL}`, 0, marker)
    const { exitCode, stderr } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x"],
      {
        env: {
          ...env,
          LOOP_CLAUDE_BIN: claude,
          STUB_GH_PR_STATE: "OPEN",
          STUB_GH_CHECK_BUCKETS: "", // a PR with zero checks
        },
      },
    )
    expect(exitCode).toBe(7)
    expect(stderr).toContain("DONE-but-red")
  })
})

// ---------------------------------------------------------------------------
// Flag-value + mutual-exclusion validation (consistent usage errors)
// ---------------------------------------------------------------------------
describe("flag input validation", () => {
  test("a value-taking flag with no value gives a usage error, not a shift crash", async () => {
    // --target is the last token, so the old `shift 2` would crash under set -e.
    const { exitCode, stderr } = await runLoop(["--seed", "x", "--target"])
    expect(exitCode).toBe(2)
    expect(stderr).toContain("--target requires a value")
  })

  test("--seed and --seed-file together are rejected", async () => {
    const target = mkdirInWork("target")
    const seedFile = path.join(work, "seed.md")
    fs.writeFileSync(seedFile, "task")
    const { exitCode, stderr } = await runLoop([
      "--target", target, "--seed", "x", "--seed-file", seedFile,
    ])
    expect(exitCode).toBe(2)
    expect(stderr).toContain("mutually exclusive")
  })
})

// ---------------------------------------------------------------------------
// Timeout is required for a real run (R3 — the cap must be enforceable)
// ---------------------------------------------------------------------------
describe("timeout required", () => {
  test("a real run with no timeout binary fails fast with an install hint", async () => {
    const target = mkdirInWork("target")
    gitInit(target, true)
    const plugin = mkdirInWork("plugin")
    // Explicitly-empty LOOP_TIMEOUT_BIN => "no timeout binary available".
    const { exitCode, stderr } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x"],
      { env: { LOOP_GH_BIN: ghStub(), LOOP_TIMEOUT_BIN: "" } },
    )
    expect(exitCode).toBe(2)
    expect(stderr).toContain("timeout")
  })

  test("--dry-run is exempt: it only warns when no timeout binary is present", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    const { exitCode, stdout } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--dry-run"],
      { env: { LOOP_TIMEOUT_BIN: "" } },
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain("not be wall-clock capped")
  })
})

// ---------------------------------------------------------------------------
// Plan-input mode (--plan-file / --handoff-file) — names the plan for lfg's
// plan-input branch (literal `plan:<path>` marker) instead of inlining a seed
// task, and carries a handoff doc as orienting context.
// ---------------------------------------------------------------------------
describe("plan-input mode", () => {
  function writePlan(targetDir: string, rel: string, body: string): string {
    const p = path.join(targetDir, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, body)
    return rel
  }

  test("--plan-file --dry-run names the plan via the plan: marker and never inlines its body", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    const planRel = writePlan(
      target,
      "docs/plans/feat-x-plan.md",
      "PLAN_BODY_SENTINEL_DO_NOT_INLINE\n## Implementation Units\n",
    )
    const { exitCode, stdout } = await runLoop([
      "--target", target, "--plugin-dir", plugin, "--plan-file", planRel, "--dry-run",
    ])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("mode: plan-input")
    expect(stdout).toContain(`plan-file: ${planRel}`)
    // the constructed prompt names the plan with the literal marker lfg detects
    expect(stdout).toContain(`plan:${planRel}`)
    // the plan body is NEVER read or inlined — only the path is named
    expect(stdout).not.toContain("PLAN_BODY_SENTINEL_DO_NOT_INLINE")
  })

  test("--handoff-file content rides into the prompt as orienting context", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    const planRel = writePlan(target, "docs/plans/p.md", "## Implementation Units\n")
    const handoff = path.join(work, "handoff.md")
    fs.writeFileSync(handoff, "HANDOFF_SENTINEL_XYZ rationale and rejected alternatives")
    const { exitCode, stdout } = await runLoop([
      "--target", target, "--plugin-dir", plugin,
      "--plan-file", planRel, "--handoff-file", handoff, "--dry-run",
    ])
    expect(exitCode).toBe(0)
    expect(stdout).toContain(`handoff-file: ${handoff}`)
    expect(stdout).toContain("HANDOFF_SENTINEL_XYZ")
  })

  test("--plan-file with no value is a usage error, not a crash", async () => {
    const target = mkdirInWork("target")
    const { exitCode, stderr } = await runLoop(["--target", target, "--plan-file"])
    expect(exitCode).toBe(2)
    expect(stderr).toContain("--plan-file requires a value")
  })

  test("--plan-file and --seed together are rejected as mutually exclusive", async () => {
    const target = mkdirInWork("target")
    const { exitCode, stderr } = await runLoop([
      "--target", target, "--plan-file", "docs/plans/p.md", "--seed", "x",
    ])
    expect(exitCode).toBe(2)
    expect(stderr).toContain("mutually exclusive")
  })

  test("--plan-file and --seed-file together are rejected as mutually exclusive", async () => {
    const target = mkdirInWork("target")
    const seedFile = path.join(work, "seed.md")
    fs.writeFileSync(seedFile, "task")
    const { exitCode, stderr } = await runLoop([
      "--target", target, "--plan-file", "docs/plans/p.md", "--seed-file", seedFile,
    ])
    expect(exitCode).toBe(2)
    expect(stderr).toContain("mutually exclusive")
  })

  test("--handoff-file without --plan-file is rejected", async () => {
    const target = mkdirInWork("target")
    const handoff = path.join(work, "handoff.md")
    fs.writeFileSync(handoff, "ctx")
    const { exitCode, stderr } = await runLoop([
      "--target", target, "--seed", "x", "--handoff-file", handoff,
    ])
    expect(exitCode).toBe(2)
    expect(stderr).toContain("only valid with --plan-file")
  })

  test("--plan-file pointing at a missing path in the target fails fast (R10)", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    const { exitCode, stderr } = await runLoop([
      "--target", target, "--plugin-dir", plugin,
      "--plan-file", "docs/plans/does-not-exist.md", "--dry-run",
    ])
    expect(exitCode).toBe(2)
    expect(stderr).toContain("plan file not found")
  })

  test("--plan-file with an absolute path is accepted and named verbatim in the prompt", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    writePlan(target, "docs/plans/abs.md", "## Implementation Units\n")
    const absPlan = path.join(target, "docs/plans/abs.md")
    const { exitCode, stdout } = await runLoop([
      "--target", target, "--plugin-dir", plugin, "--plan-file", absPlan, "--dry-run",
    ])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("mode: plan-input")
    expect(stdout).toContain(`plan:${absPlan}`)
  })

  test("plan mode uses the plan-routing prefix (do not re-plan), not the seed prefix", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    const planRel = writePlan(target, "docs/plans/p.md", "## Implementation Units\n")
    const { exitCode, stdout } = await runLoop([
      "--target", target, "--plugin-dir", plugin, "--plan-file", planRel, "--dry-run",
    ])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("do not re-plan")
  })

  test("--handoff-file pointing at a missing path fails fast", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    const planRel = writePlan(target, "docs/plans/p.md", "## Implementation Units\n")
    const { exitCode, stderr } = await runLoop([
      "--target", target, "--plugin-dir", plugin,
      "--plan-file", planRel, "--handoff-file", path.join(work, "nope.md"), "--dry-run",
    ])
    expect(exitCode).toBe(2)
    expect(stderr).toContain("handoff file not found")
  })

  test("--handoff-file with no value is a usage error", async () => {
    const target = mkdirInWork("target")
    const { exitCode, stderr } = await runLoop([
      "--target", target, "--plan-file", "docs/plans/p.md", "--handoff-file",
    ])
    expect(exitCode).toBe(2)
    expect(stderr).toContain("--handoff-file requires a value")
  })

  test("--help documents the plan-input flags", async () => {
    const { exitCode, stderr } = await runLoop(["--help"])
    expect(exitCode).toBe(0)
    expect(stderr).toContain("--plan-file")
    expect(stderr).toContain("--handoff-file")
  })
})

// ---------------------------------------------------------------------------
// Structured run-record (R9) — loop.sh writes one machine-readable JSON record
// per run, paired with the transcript log under --log-dir, on every operational
// terminal path (exit 0/3/4/5/6/7) and never for pre-flight usage errors,
// --help, or --dry-run. Every assertion here JSON.parse's the record, so a
// malformed record fails the test on any path (the "valid JSON on every path"
// scenario is covered implicitly by readRecord).
// ---------------------------------------------------------------------------
describe("run-record (R9)", () => {
  function recordsDir(): string {
    return path.join(work, "records")
  }
  function readRecord(dir: string): any {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"))
    expect(files.length).toBe(1)
    return JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf8"))
  }
  function expectNoRecord(dir: string) {
    if (!fs.existsSync(dir)) return // dir never created => no record written
    expect(fs.readdirSync(dir).filter((f) => f.endsWith(".json"))).toEqual([])
  }

  test("Covers AE1: success + green CI records route DONE, green, and the PR url", async () => {
    const target = mkdirInWork("target")
    gitInit(target, true)
    const plugin = mkdirInWork("plugin")
    const dir = recordsDir()
    const { marker, env } = stubs()
    const claude = claudeStub("claude", `working...\n${SENTINEL}`, 0, marker)
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--log-dir", dir],
      {
        env: {
          ...env,
          LOOP_CLAUDE_BIN: claude,
          STUB_GH_PR_STATE: "OPEN",
          STUB_GH_PR_URL: "https://github.com/x/throwaway/pull/7",
          STUB_GH_CHECK_BUCKETS: "pass",
        },
      },
    )
    expect(exitCode).toBe(0)
    const rec = readRecord(dir)
    expect(rec.outcome).toBe("success")
    expect(rec.exit_code).toBe(0)
    expect(rec.typed_failure).toBeNull()
    expect(rec.route).toBe("DONE")
    expect(rec.verification.result).toBe("green")
    expect(rec.pointers.pr_url).toBe("https://github.com/x/throwaway/pull/7")
    expect(rec.pointers.transcript_log).toContain("loop-")
  })

  test("Covers AE2: DONE but red CI records done-but-red and red verification", async () => {
    const target = mkdirInWork("target")
    gitInit(target, true)
    const plugin = mkdirInWork("plugin")
    const dir = recordsDir()
    const { marker, env } = stubs()
    const claude = claudeStub("claude", `working...\n${SENTINEL}`, 0, marker)
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--log-dir", dir],
      {
        env: {
          ...env,
          LOOP_CLAUDE_BIN: claude,
          STUB_GH_PR_STATE: "OPEN",
          STUB_GH_PR_URL: "https://github.com/x/throwaway/pull/8",
          STUB_GH_CHECK_BUCKETS: "fail",
        },
      },
    )
    expect(exitCode).toBe(7)
    const rec = readRecord(dir)
    expect(rec.outcome).toBe("failure")
    expect(rec.exit_code).toBe(7)
    expect(rec.typed_failure).toBe("done-but-red")
    expect(rec.verification.result).toBe("red")
    expect(rec.pointers.pr_url).toBe("https://github.com/x/throwaway/pull/8")
    expect(rec.pointers.transcript_log).toContain("loop-")
  })

  test("Covers AE3: cap-exhausted records each attempt outcome", async () => {
    const target = mkdirInWork("target")
    gitInit(target, true)
    const plugin = mkdirInWork("plugin")
    const dir = recordsDir()
    const { marker, env } = stubs()
    const claude = claudeStub("claude", "crash, no DONE", 1, marker)
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--max-retries", "2", "--log-dir", dir],
      { env: { ...env, LOOP_CLAUDE_BIN: claude } }, // never an open PR
    )
    expect(exitCode).toBe(5)
    const rec = readRecord(dir)
    expect(rec.typed_failure).toBe("cap-exhausted")
    expect(rec.attempts.count).toBe(3)
    expect(rec.attempts.results).toEqual(["crash", "crash", "crash"])
  })

  test("Covers AE4: every record declares schema_version and coverage_boundary", async () => {
    // isolation-refusal is the simplest terminal path — pre-launch, no stubs.
    const same = mkdirInWork("same")
    const dir = recordsDir()
    const { exitCode } = await runLoop(
      ["--target", same, "--plugin-dir", same, "--seed", "x", "--log-dir", dir],
      stubs(),
    )
    expect(exitCode).toBe(3)
    const rec = readRecord(dir)
    expect(rec.schema_version).toBe(1)
    expect(rec.typed_failure).toBe("isolation-refusal")
    expect(rec.coverage_boundary.indexed_by_pointer).toContain("transcript_log")
    expect(Array.isArray(rec.coverage_boundary.not_contained)).toBe(true)
    expect(rec.coverage_boundary.not_contained.length).toBeGreaterThan(0)
  })

  test("timeout records typed_failure timeout, timed_out true, not-run verification", async () => {
    const target = mkdirInWork("target")
    gitInit(target, true)
    const plugin = mkdirInWork("plugin")
    const dir = recordsDir()
    const { marker } = stubs()
    const claude = claudeStub("claude", `${SENTINEL}`, 0, marker) // never runs (kill stub exits 124)
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--max-retries", "0", "--log-dir", dir],
      { env: { LOOP_GH_BIN: ghStub(), LOOP_TIMEOUT_BIN: timeoutKillStub(), LOOP_CLAUDE_BIN: claude } },
    )
    expect(exitCode).toBe(6)
    const rec = readRecord(dir)
    expect(rec.typed_failure).toBe("timeout")
    expect(rec.attempts.timed_out).toBe(true)
    expect(rec.verification.result).toBe("not-run")
    expect(rec.attempts.results).toEqual(["timeout"])
  })

  test("no-verify records typed_failure no-verify and not-run verification", async () => {
    const target = mkdirInWork("target")
    gitInit(target, false) // repo, but no remote
    const plugin = mkdirInWork("plugin")
    const dir = recordsDir()
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--log-dir", dir],
      stubs(),
    )
    expect(exitCode).toBe(4)
    const rec = readRecord(dir)
    expect(rec.typed_failure).toBe("no-verify")
    expect(rec.verification.result).toBe("not-run")
  })

  test("command-mode success records verification.mode command and null pr_url", async () => {
    const target = mkdirInWork("target")
    gitInit(target, false)
    const plugin = mkdirInWork("plugin")
    const dir = recordsDir()
    const { marker, env } = stubs()
    const claude = claudeStub("claude", `done\n${SENTINEL}`, 0, marker)
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--log-dir", dir, "--verify-cmd", "true"],
      { env: { ...env, LOOP_CLAUDE_BIN: claude } },
    )
    expect(exitCode).toBe(0)
    const rec = readRecord(dir)
    expect(rec.verification.mode).toBe("command")
    expect(rec.verification.result).toBe("green")
    expect(rec.pointers.pr_url).toBeNull()
  })

  test("crash-reconciled open-PR success records routed_via_pr and the open-PR route", async () => {
    const target = mkdirInWork("target")
    gitInit(target, true)
    const plugin = mkdirInWork("plugin")
    const dir = recordsDir()
    const { marker, env } = stubs()
    const claude = claudeStub("claude", "crashed before DONE", 1, marker)
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--max-retries", "3", "--log-dir", dir],
      {
        env: {
          ...env,
          LOOP_CLAUDE_BIN: claude,
          STUB_GH_PR_STATE: "OPEN",
          STUB_GH_PR_URL: "https://github.com/x/throwaway/pull/9",
          STUB_GH_CHECK_BUCKETS: "pass",
        },
      },
    )
    expect(exitCode).toBe(0)
    const rec = readRecord(dir)
    expect(rec.route).toBe("open-PR (crash-reconciled)")
    expect(rec.attempts.routed_via_pr).toBe(true)
    expect(rec.attempts.results).toEqual(["open-PR-reconciled"])
  })

  test("a pre-launch record's transcript_log pointer resolves to a real file", async () => {
    // isolation-refusal never opens the transcript; emit_record creates it empty
    // so the pointer is not dangling.
    const same = mkdirInWork("same")
    const dir = recordsDir()
    const { exitCode } = await runLoop(
      ["--target", same, "--plugin-dir", same, "--seed", "x", "--log-dir", dir],
      stubs(),
    )
    expect(exitCode).toBe(3)
    const rec = readRecord(dir)
    expect(fs.existsSync(rec.pointers.transcript_log)).toBe(true)
  })

  test("a usage error (exit 2) writes no record", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    const dir = recordsDir()
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--max-retries", "abc", "--log-dir", dir],
      stubs(),
    )
    expect(exitCode).toBe(2)
    expectNoRecord(dir)
  })

  test("--dry-run writes no record", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    const dir = recordsDir()
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--dry-run", "--log-dir", dir],
      stubs(),
    )
    expect(exitCode).toBe(0)
    expectNoRecord(dir)
  })

  test("--help writes no record", async () => {
    const dir = recordsDir()
    const { exitCode } = await runLoop(["--log-dir", dir, "--help"])
    expect(exitCode).toBe(0)
    expectNoRecord(dir)
  })
})

// ---------------------------------------------------------------------------
// Goal-drift guard (R1-R3, KTD3, D1) — exit 8 / typed_failure "goal-drift".
// A run that reaches a finish (the DONE sentinel OR the crash-reconciled open-PR
// route) with a mutated STRATEGY.md or plan file is completed-but-untrustworthy:
// the guard snapshots sha256(STRATEGY.md, plan) per attempt after any reset, then
// re-hashes on every done_reached path BEFORE verification and refuses success on
// a mismatch. Drift is terminal, not retryable. All paths stub the LOOP_*_BIN
// seams so no live Claude/GitHub call is made.
// ---------------------------------------------------------------------------
describe("goal-drift guard (R1-R3)", () => {
  const APPEND_SCRIPT = path.join(__dirname, "../scripts/append-run-record.sh")

  // A claude stub that runs a mutation snippet (CWD = target, under `env -i`)
  // before emitting its transcript, simulating the agent editing a goal file.
  function claudeMutateStub(
    name: string,
    mutate: string,
    transcript: string,
    exitCode: number,
    marker: string,
  ): string {
    return writeExec(
      path.join(work, name),
      `#!/usr/bin/env bash\nprintf 'RUN\\n' >> '${marker}'\n${mutate}\ncat <<'__T__'\n${transcript}\n__T__\nexit ${exitCode}\n`,
    )
  }

  function readRecord(dir: string): any {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"))
    expect(files.length).toBe(1)
    return JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf8"))
  }

  function commitAll(dir: string, msg: string) {
    Bun.spawnSync(["bash", "-c", `git add -A && git commit -q -m ${msg}`], { cwd: dir })
  }

  // Commit a plan doc in the target so a retry's reset would preserve it, and
  // return its target-relative path for --plan-file.
  function writeCommittedPlan(target: string): string {
    const rel = "docs/plans/p.md"
    const p = path.join(target, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, "## Implementation Units\noriginal plan body\n")
    commitAll(target, "plan")
    return rel
  }

  // Scenario 1: plan mutated then DONE => exit 8, record goal-drift + not-run.
  test("plan mutated then DONE => exit 8, goal drift, verification not-run", async () => {
    const target = mkdirInWork("target")
    gitInit(target, true)
    const planRel = writeCommittedPlan(target)
    const plugin = mkdirInWork("plugin")
    const dir = path.join(work, "records")
    const { marker, env } = stubs()
    const claude = claudeMutateStub(
      "claude",
      "printf 'DRIFT\\n' >> docs/plans/p.md",
      `working...\n${SENTINEL}`,
      0,
      marker,
    )
    const { exitCode, stderr } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--plan-file", planRel, "--log-dir", dir],
      { env: { ...env, LOOP_CLAUDE_BIN: claude, STUB_GH_PR_STATE: "OPEN", STUB_GH_CHECK_BUCKETS: "pass" } },
    )
    expect(exitCode).toBe(8)
    expect(stderr.toLowerCase()).toContain("goal drift")
    expect(stderr).toContain(planRel) // names the drifted file
    const rec = readRecord(dir)
    expect(rec.typed_failure).toBe("goal-drift")
    expect(rec.verification.result).toBe("not-run")
    expect(rec.goal_drift.change).toBe("modified")
  })

  // Scenario 2: plan deleted => exit 8 with "deleted" wording, distinct from modified.
  test("plan deleted then DONE => exit 8 with 'deleted' wording", async () => {
    const target = mkdirInWork("target")
    gitInit(target, true)
    const planRel = writeCommittedPlan(target)
    const plugin = mkdirInWork("plugin")
    const dir = path.join(work, "records")
    const { marker, env } = stubs()
    const claude = claudeMutateStub("claude", "rm -f docs/plans/p.md", `done\n${SENTINEL}`, 0, marker)
    const { exitCode, stderr } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--plan-file", planRel, "--log-dir", dir],
      { env: { ...env, LOOP_CLAUDE_BIN: claude, STUB_GH_PR_STATE: "OPEN", STUB_GH_CHECK_BUCKETS: "pass" } },
    )
    expect(exitCode).toBe(8)
    expect(stderr).toContain("deleted")
    expect(stderr).not.toContain("modified") // the three kinds are distinguished
    const rec = readRecord(dir)
    expect(rec.typed_failure).toBe("goal-drift")
    expect(rec.goal_drift.change).toBe("deleted")
  })

  // Scenario 3: no STRATEGY.md at start or end => guard passes (sentinel equality).
  test("no STRATEGY.md at start or end => guard passes, run reaches verification", async () => {
    const target = mkdirInWork("target")
    gitInit(target, true)
    const plugin = mkdirInWork("plugin")
    const dir = path.join(work, "records")
    const { marker, env } = stubs()
    const claude = claudeStub("claude", `working...\n${SENTINEL}`, 0, marker)
    const { exitCode, stdout } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--log-dir", dir],
      {
        env: {
          ...env,
          LOOP_CLAUDE_BIN: claude,
          STUB_GH_PR_STATE: "OPEN",
          STUB_GH_PR_URL: "https://github.com/x/y/pull/1",
          STUB_GH_CHECK_BUCKETS: "pass",
        },
      },
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain("SUCCESS")
    const rec = readRecord(dir)
    expect(rec.typed_failure).toBeNull()
    expect(rec.goal_drift).toBeNull()
  })

  // Scenario 4: STRATEGY.md created mid-run => exit 8 with "created" wording.
  test("STRATEGY.md created mid-run => exit 8 with 'created' wording", async () => {
    const target = mkdirInWork("target")
    gitInit(target, true)
    const plugin = mkdirInWork("plugin")
    const dir = path.join(work, "records")
    const { marker, env } = stubs()
    const claude = claudeMutateStub("claude", "printf 'new goal\\n' > STRATEGY.md", `done\n${SENTINEL}`, 0, marker)
    const { exitCode, stderr } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--log-dir", dir],
      { env: { ...env, LOOP_CLAUDE_BIN: claude, STUB_GH_PR_STATE: "OPEN", STUB_GH_CHECK_BUCKETS: "pass" } },
    )
    expect(exitCode).toBe(8)
    expect(stderr).toContain("created")
    expect(stderr).toContain("STRATEGY.md")
    const rec = readRecord(dir)
    expect(rec.typed_failure).toBe("goal-drift")
    expect(rec.goal_drift.change).toBe("created")
  })

  // Scenario 5: crash without DONE, open PR exists, plan mutated => the
  // crash-reconciled open-PR route still passes through the guard and exits 8.
  test("crash without DONE + open PR + plan mutated => reconciled route exits 8", async () => {
    const target = mkdirInWork("target")
    gitInit(target, true)
    const planRel = writeCommittedPlan(target)
    const plugin = mkdirInWork("plugin")
    const dir = path.join(work, "records")
    const { marker, env } = stubs()
    const claude = claudeMutateStub(
      "claude",
      "printf 'DRIFT\\n' >> docs/plans/p.md",
      "crashed before DONE",
      1,
      marker,
    )
    const { exitCode, stderr } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--plan-file", planRel, "--max-retries", "2", "--log-dir", dir],
      {
        env: {
          ...env,
          LOOP_CLAUDE_BIN: claude,
          STUB_GH_PR_STATE: "OPEN",
          STUB_GH_PR_URL: "https://github.com/x/y/pull/9",
          STUB_GH_CHECK_BUCKETS: "pass",
        },
      },
    )
    expect(exitCode).toBe(8)
    expect(stderr.toLowerCase()).toContain("goal drift")
    const rec = readRecord(dir)
    expect(rec.typed_failure).toBe("goal-drift")
    expect(rec.attempts.routed_via_pr).toBe(true)
    // reconciled on the first crash — claude launched exactly once (no retry loop)
    expect(fs.readFileSync(marker, "utf8").trim().split("\n").length).toBe(1)
  })

  // Scenario 6: a usage error (exit 2) still writes no record — the guard does
  // not perturb the pre-flight usage family's no-record symmetry.
  test("a usage error (exit 2) still writes no record with the guard present", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    const dir = path.join(work, "records")
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--max-retries", "abc", "--log-dir", dir],
      stubs(),
    )
    expect(exitCode).toBe(2)
    if (fs.existsSync(dir)) {
      expect(fs.readdirSync(dir).filter((f) => f.endsWith(".json"))).toEqual([])
    }
  })

  // Scenario 7: the operator wrapper captures a real exit-8 run into the ledger.
  test("operator wrapper (append-run-record.sh) captures the exit-8 run", async () => {
    const target = mkdirInWork("target")
    gitInit(target, true)
    const planRel = writeCommittedPlan(target)
    const plugin = mkdirInWork("plugin")
    const dir = path.join(work, "records")
    const ledger = path.join(work, "ledger.jsonl")
    const { marker, env } = stubs()
    const claude = claudeMutateStub("claude", "printf 'DRIFT\\n' >> docs/plans/p.md", `done\n${SENTINEL}`, 0, marker)
    const loop = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--plan-file", planRel, "--log-dir", dir],
      { env: { ...env, LOOP_CLAUDE_BIN: claude, STUB_GH_PR_STATE: "OPEN", STUB_GH_CHECK_BUCKETS: "pass" } },
    )
    expect(loop.exitCode).toBe(8)
    const proc = Bun.spawn(["bash", APPEND_SCRIPT, "--log-dir", dir, "--ledger", ledger], {
      stdout: "pipe",
      stderr: "pipe",
    })
    await proc.exited
    const lines = fs.readFileSync(ledger, "utf8").split("\n").filter((l) => l.length > 0)
    expect(lines.length).toBe(1)
    const rec = JSON.parse(lines[lines.length - 1])
    expect(rec.exit_code).toBe(8)
    expect(rec.typed_failure).toBe("goal-drift")
  })
})

// ---------------------------------------------------------------------------
// Resume consumption (U8 / R15, R16, R18) — on a no-PR retry, loop.sh validates
// the run-progress file (jq -e shape + binding fields) and, when it ties to THIS
// run, skips reset_target, checks out the recorded branch, and relaunches with a
// resume:<path> marker. ANY validation failure scrubs the file and cold-restarts
// (fail toward cold restart, never toward trusting a stale/poisoned file). The
// file is scrubbed at every terminal. Resume never fires once a PR exists
// (reconciliation precedence, KTD6) and never extends the give-up floor (exit 5).
// All paths stub the LOOP_*_BIN seams; the progress file is written by the claude
// stub (parsing the progress: path from its own args, since it runs under env -i).
// ---------------------------------------------------------------------------
describe("resume consumption (U8 / R15,R16,R18)", () => {
  // A claude stub that models a headless lfg crashing mid-run after writing a
  // run-progress file. On its FIRST launch (no resume: marker) it creates a
  // working branch + commit, drops an UNTRACKED canary (which reset_target's
  // `git clean -fd` would delete — the reset detector), writes the progress file
  // per `poison`, and crashes without DONE. On a RESUME launch (resume: marker
  // present) it records whether the canary survived, then either finishes with
  // DONE or crashes again (alwaysCrash, for the give-up-floor scenario).
  function resumeStub(opts: {
    name?: string
    marker: string
    promptLog: string
    canaryLog: string
    branch?: string
    poison?: "corrupt" | "wrong-run-id" | "missing-branch"
    alwaysCrash?: boolean
  }): string {
    const branch = opts.branch ?? "feat/resume-branch"
    const name = opts.name ?? "claude"

    // The progress-file body, keyed by poison mode. run_id/base/head are shell
    // vars the stub computes at runtime; branch is baked in.
    let writeProgress: string
    if (opts.poison === "corrupt") {
      writeProgress = `printf 'not json {{{ %s\\n' "$run_id" > "$progress_path"`
    } else {
      const runIdExpr = opts.poison === "wrong-run-id" ? "WRONG-RUN-ID-abc" : "$run_id"
      const branchField = opts.poison === "missing-branch" ? "feat/does-not-exist" : branch
      writeProgress = `cat > "$progress_path" <<PJSON
{
  "schema_version": 1,
  "run_id": "${runIdExpr}",
  "attempt": 1,
  "step": 5,
  "plan_path": "docs/plans/p.md",
  "branch": "${branchField}",
  "base_ref": "$base",
  "head_sha": "$head",
  "fix_iterations": 0,
  "flaky_dispositions": {},
  "ci_disposition": null,
  "residuals_pointer": null,
  "goal_fidelity": null,
  "updated_at": "2026-07-04T00:00:00Z"
}
PJSON`
    }

    const resumeTail = opts.alwaysCrash
      ? `printf 'resumed but crashed again\\n'\nexit 1`
      : `printf 'resumed and finished\\n${SENTINEL}\\n'\nexit 0`

    return writeExec(
      path.join(work, name),
      `#!/usr/bin/env bash
prompt=""
for a in "$@"; do
  case "$a" in *progress:*) prompt="$a" ;; esac
done
printf -- '----\\n' >> '${opts.promptLog}'
printf '%s\\n' "$prompt" >> '${opts.promptLog}'
printf 'RUN\\n' >> '${opts.marker}'

progress_path="$(printf '%s\\n' "$prompt" | grep -oE 'progress:[^[:space:]]+' | head -1)"
progress_path="\${progress_path#progress:}"
run_id="$(basename "$progress_path" .progress.json)"

is_resume=0
case "$prompt" in *resume:*) is_resume=1 ;; esac

if [ "$is_resume" = "1" ]; then
  if [ -f resume-canary.txt ]; then printf 'CANARY_PRESENT\\n' >> '${opts.canaryLog}'; else printf 'CANARY_ABSENT\\n' >> '${opts.canaryLog}'; fi
  ${resumeTail}
fi

base="$(git rev-parse HEAD)"
git checkout -q -b ${branch} 2>/dev/null || git checkout -q ${branch}
printf 'work\\n' > work.txt
git add work.txt
git -c user.email=t@t.t -c user.name=t commit -q -m work
head="$(git rev-parse HEAD)"
printf 'canary\\n' > resume-canary.txt

${writeProgress}

printf 'crashed before DONE\\n'
exit 1
`,
    )
  }

  function progressFilesIn(dir: string): string[] {
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir).filter((f) => f.endsWith(".progress.json"))
  }
  function readRecord(dir: string): any {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".progress.json"))
    expect(files.length).toBe(1)
    return JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf8"))
  }

  // Scenario (a): crash at step 5 with a valid progress file → second attempt
  // skips reset (canary preserved) and its prompt carries the resume marker.
  test("valid progress file → second attempt resumes (no reset, resume marker present)", async () => {
    const target = mkdirInWork("target")
    gitInit(target, false) // command-mode verify, no remote needed
    const plugin = mkdirInWork("plugin")
    const dir = path.join(work, "records")
    const promptLog = path.join(work, "prompts.log")
    const canaryLog = path.join(work, "canary.log")
    const { marker, env } = stubs()
    const claude = resumeStub({ marker, promptLog, canaryLog })
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--max-retries", "2", "--log-dir", dir, "--verify-cmd", "true"],
      { env: { ...env, LOOP_CLAUDE_BIN: claude } }, // no PR → retry path
    )
    expect(exitCode).toBe(0)
    // Two launches: the crash, then the resume.
    expect(fs.readFileSync(marker, "utf8").trim().split("\n").length).toBe(2)
    // The reset was skipped — the untracked canary survived into the resume launch.
    expect(fs.readFileSync(canaryLog, "utf8")).toContain("CANARY_PRESENT")
    // The second launch's prompt carries the resume marker; the first does not.
    const chunks = fs.readFileSync(promptLog, "utf8").split("----\n").filter((c) => c.trim().length > 0)
    expect(chunks.length).toBe(2)
    expect(chunks[0]).not.toContain("resume:")
    expect(chunks[1]).toContain("resume:")
    // Scrubbed at the success terminal.
    expect(progressFilesIn(dir)).toEqual([])
  })

  // Scenario (b): corrupt JSON → cold restart, file scrubbed, no resume marker.
  test("corrupt progress file → cold restart, scrubbed, no resume marker", async () => {
    const target = mkdirInWork("target")
    gitInit(target, false)
    const plugin = mkdirInWork("plugin")
    const dir = path.join(work, "records")
    const promptLog = path.join(work, "prompts.log")
    const canaryLog = path.join(work, "canary.log")
    const { marker, env } = stubs()
    const claude = resumeStub({ marker, promptLog, canaryLog, poison: "corrupt" })
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--max-retries", "1", "--log-dir", dir, "--verify-cmd", "true"],
      { env: { ...env, LOOP_CLAUDE_BIN: claude } },
    )
    // Never resumes → both attempts crash → cap exhausted.
    expect(exitCode).toBe(5)
    expect(fs.readFileSync(promptLog, "utf8")).not.toContain("resume:")
    expect(progressFilesIn(dir)).toEqual([])
  })

  // Scenario (b'): wrong run_id → the poisoned-file guard rejects it (a stale
  // file from another run must never fake a resume point).
  test("wrong run_id → cold restart, no resume marker", async () => {
    const target = mkdirInWork("target")
    gitInit(target, false)
    const plugin = mkdirInWork("plugin")
    const dir = path.join(work, "records")
    const promptLog = path.join(work, "prompts.log")
    const canaryLog = path.join(work, "canary.log")
    const { marker, env } = stubs()
    const claude = resumeStub({ marker, promptLog, canaryLog, poison: "wrong-run-id" })
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--max-retries", "1", "--log-dir", dir, "--verify-cmd", "true"],
      { env: { ...env, LOOP_CLAUDE_BIN: claude } },
    )
    expect(exitCode).toBe(5)
    expect(fs.readFileSync(promptLog, "utf8")).not.toContain("resume:")
    expect(progressFilesIn(dir)).toEqual([])
  })

  // Scenario (b''): recorded branch does not exist → cold restart.
  test("missing recorded branch → cold restart, no resume marker", async () => {
    const target = mkdirInWork("target")
    gitInit(target, false)
    const plugin = mkdirInWork("plugin")
    const dir = path.join(work, "records")
    const promptLog = path.join(work, "prompts.log")
    const canaryLog = path.join(work, "canary.log")
    const { marker, env } = stubs()
    const claude = resumeStub({ marker, promptLog, canaryLog, poison: "missing-branch" })
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--max-retries", "1", "--log-dir", dir, "--verify-cmd", "true"],
      { env: { ...env, LOOP_CLAUDE_BIN: claude } },
    )
    expect(exitCode).toBe(5)
    expect(fs.readFileSync(promptLog, "utf8")).not.toContain("resume:")
    expect(progressFilesIn(dir)).toEqual([])
  })

  // Scenario (c): open PR + valid progress file → verification-only reconciliation
  // route; resume does NOT fire (reconciliation precedence, KTD6).
  test("open PR + valid progress file → reconcile only, resume never fires", async () => {
    const target = mkdirInWork("target")
    gitInit(target, true) // remote → github verify mode
    const plugin = mkdirInWork("plugin")
    const dir = path.join(work, "records")
    const promptLog = path.join(work, "prompts.log")
    const canaryLog = path.join(work, "canary.log")
    const { marker, env } = stubs()
    const claude = resumeStub({ marker, promptLog, canaryLog })
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--max-retries", "3", "--log-dir", dir],
      {
        env: {
          ...env,
          LOOP_CLAUDE_BIN: claude,
          STUB_GH_PR_STATE: "OPEN",
          STUB_GH_PR_URL: "https://github.com/x/throwaway/pull/9",
          STUB_GH_CHECK_BUCKETS: "pass",
        },
      },
    )
    expect(exitCode).toBe(0)
    // Reconciled on the first crash — exactly one launch, no resume relaunch.
    expect(fs.readFileSync(marker, "utf8").trim().split("\n").length).toBe(1)
    expect(fs.readFileSync(promptLog, "utf8")).not.toContain("resume:")
    // Scrubbed at the success terminal.
    expect(progressFilesIn(dir)).toEqual([])
  })

  // Scenario (d): a successful run leaves no progress file behind (scrub-at-terminal).
  test("successful run → progress file gone at exit", async () => {
    const target = mkdirInWork("target")
    gitInit(target, false)
    const plugin = mkdirInWork("plugin")
    const dir = path.join(work, "records")
    // A stub that writes a progress file then finishes with DONE on its first launch.
    const claude = writeExec(
      path.join(work, "claude"),
      `#!/usr/bin/env bash
prompt=""
for a in "$@"; do
  case "$a" in *progress:*) prompt="$a" ;; esac
done
progress_path="$(printf '%s\\n' "$prompt" | grep -oE 'progress:[^[:space:]]+' | head -1)"
progress_path="\${progress_path#progress:}"
printf '{ "schema_version": 1, "step": 7 }\\n' > "$progress_path"
printf 'done\\n${SENTINEL}\\n'
exit 0
`,
    )
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--log-dir", dir, "--verify-cmd", "true"],
      { env: { LOOP_GH_BIN: ghStub(), LOOP_TIMEOUT_BIN: timeoutStub(), LOOP_CLAUDE_BIN: claude } },
    )
    expect(exitCode).toBe(0)
    expect(progressFilesIn(dir)).toEqual([])
  })

  // Scenario (e): retries exhausted while the file stays valid → exit 5 (the
  // give-up floor is NOT extended by resume), file scrubbed, run-record emitted.
  test("retries exhausted with a valid file → exit 5, scrubbed, record emitted", async () => {
    const target = mkdirInWork("target")
    gitInit(target, false)
    const plugin = mkdirInWork("plugin")
    const dir = path.join(work, "records")
    const promptLog = path.join(work, "prompts.log")
    const canaryLog = path.join(work, "canary.log")
    const { marker, env } = stubs()
    const claude = resumeStub({ marker, promptLog, canaryLog, alwaysCrash: true })
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--max-retries", "1", "--log-dir", dir, "--verify-cmd", "true"],
      { env: { ...env, LOOP_CLAUDE_BIN: claude } },
    )
    expect(exitCode).toBe(5)
    // max-retries=1 → one cold attempt + one resume attempt, then the cap: 2 launches.
    expect(fs.readFileSync(marker, "utf8").trim().split("\n").length).toBe(2)
    // The second attempt DID resume (the give-up floor still caps it at exit 5).
    expect(fs.readFileSync(canaryLog, "utf8")).toContain("CANARY_PRESENT")
    // Scrubbed at the cap terminal; the run-record is still emitted.
    expect(progressFilesIn(dir)).toEqual([])
    const rec = readRecord(dir)
    expect(rec.exit_code).toBe(5)
    expect(rec.typed_failure).toBe("cap-exhausted")
  })
})

// ---------------------------------------------------------------------------
// Goal-fidelity in the run-record (R6, U9) — emit_record lifts the lfg step-5
// verdict from the run-progress file VERBATIM, read BEFORE the file is scrubbed at
// the terminal. When no verdict was recorded (null / absent field / no progress
// file), the run-record field is null — nothing is fabricated, "no data" stays
// honest. All paths stub the LOOP_*_BIN seams; jq is real (as in resume tests).
// ---------------------------------------------------------------------------
describe("goal-fidelity run-record (U9 / R6)", () => {
  function readRecord(dir: string): any {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".progress.json"))
    expect(files.length).toBe(1)
    return JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf8"))
  }

  // A claude stub that writes the given progress-file body (a JSON literal) then
  // finishes with DONE — modeling a headless lfg that recorded step-5 fidelity.
  function fidelityStub(progressBody: string): string {
    return writeExec(
      path.join(work, "claude"),
      `#!/usr/bin/env bash
prompt=""
for a in "$@"; do
  case "$a" in *progress:*) prompt="$a" ;; esac
done
progress_path="$(printf '%s\\n' "$prompt" | grep -oE 'progress:[^[:space:]]+' | head -1)"
progress_path="\${progress_path#progress:}"
cat > "$progress_path" <<'PJSON'
${progressBody}
PJSON
printf 'done\\n${SENTINEL}\\n'
exit 0
`,
    )
  }

  function runWith(claude: string) {
    const target = mkdirInWork("target")
    gitInit(target, false)
    const plugin = mkdirInWork("plugin")
    const dir = path.join(work, "records")
    return { target, plugin, dir, claude }
  }

  const envFor = (claude: string) => ({
    LOOP_GH_BIN: ghStub(),
    LOOP_TIMEOUT_BIN: timeoutStub(),
    LOOP_CLAUDE_BIN: claude,
  })

  // Scenario (a): progress file carries a verdict → run-record includes it verbatim.
  // learning_rejection (R9) rides the same lift, so the same run covers it.
  test("verdict in progress file → run-record includes it verbatim", async () => {
    const claude = fidelityStub(
      `{ "schema_version": 1, "step": 5, "goal_fidelity": { "verdict": "partial", "uncovered": ["R2", "R4"] }, "learning_rejection": { "claim": "cache was the root cause", "reason": "diff shows the cache path untouched" } }`,
    )
    const { target, plugin, dir } = runWith(claude)
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--log-dir", dir, "--verify-cmd", "true"],
      { env: envFor(claude) },
    )
    expect(exitCode).toBe(0)
    expect(readRecord(dir).goal_fidelity).toEqual({ verdict: "partial", uncovered: ["R2", "R4"] })
    expect(readRecord(dir).learning_rejection).toEqual({
      claim: "cache was the root cause",
      reason: "diff shows the cache path untouched",
    })
  })

  // Scenario (b-i): explicit null verdict → record field is null.
  test("explicit null verdict → run-record field is null", async () => {
    const claude = fidelityStub(`{ "schema_version": 1, "step": 5, "goal_fidelity": null }`)
    const { target, plugin, dir } = runWith(claude)
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--log-dir", dir, "--verify-cmd", "true"],
      { env: envFor(claude) },
    )
    expect(exitCode).toBe(0)
    expect(readRecord(dir).goal_fidelity).toBeNull()
  })

  // Scenario (b-ii): the field is absent from the progress file → record null.
  test("absent verdict field → run-record field is null", async () => {
    const claude = fidelityStub(`{ "schema_version": 1, "step": 5 }`)
    const { target, plugin, dir } = runWith(claude)
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--log-dir", dir, "--verify-cmd", "true"],
      { env: envFor(claude) },
    )
    expect(exitCode).toBe(0)
    expect(readRecord(dir).goal_fidelity).toBeNull()
    expect(readRecord(dir).learning_rejection).toBeNull()
  })

  // Scenario (b-iii): no progress file written at all → record null (nothing fabricated).
  test("no progress file → run-record field is null (nothing fabricated)", async () => {
    const claude = claudeStub("claude", `done\n${SENTINEL}`, 0, path.join(work, "fidelity-runs.log"))
    const { target, plugin, dir } = runWith(claude)
    const { exitCode } = await runLoop(
      ["--target", target, "--plugin-dir", plugin, "--seed", "x", "--log-dir", dir, "--verify-cmd", "true"],
      { env: envFor(claude) },
    )
    expect(exitCode).toBe(0)
    expect(readRecord(dir).goal_fidelity).toBeNull()
  })
})
