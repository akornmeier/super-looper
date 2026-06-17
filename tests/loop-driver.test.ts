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
if [ "$sub" = "pr" ] && [ "$act" = "checks" ]; then exit "\${STUB_GH_CHECKS_EXIT:-0}"; fi
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

// A verify-cmd stub that records each received argv token on its own line, so a
// test can prove the args were passed as a vector (metacharacters preserved),
// not eval'd through a shell.
function printargsStub(argsMarker: string): string {
  return writeExec(
    path.join(work, "verify"),
    `#!/usr/bin/env bash\n: > '${argsMarker}'\nfor a in "$@"; do printf '%s\\n' "$a" >> '${argsMarker}'; done\nexit "\${VERIFY_EXIT:-0}"\n`,
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
          STUB_GH_CHECKS_EXIT: "0",
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
          STUB_GH_CHECKS_EXIT: "1",
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
          STUB_GH_CHECKS_EXIT: "0",
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
    const verify = printargsStub(argsMarker)
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
  })

  test("command-mode verification red => DONE-but-red failure", async () => {
    const target = mkdirInWork("target")
    const plugin = mkdirInWork("plugin")
    const argsMarker = path.join(work, "verify-args.log")
    const verify = printargsStub(argsMarker)
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
