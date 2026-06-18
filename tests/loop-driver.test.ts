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

  test("--help documents the plan-input flags", async () => {
    const { exitCode, stderr } = await runLoop(["--help"])
    expect(exitCode).toBe(0)
    expect(stderr).toContain("--plan-file")
    expect(stderr).toContain("--handoff-file")
  })
})
