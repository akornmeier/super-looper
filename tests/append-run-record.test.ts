import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"

// ---------------------------------------------------------------------------
// append-run-record.test.ts — covers scripts/append-run-record.sh: the
// operator-side promotion of the newest loop.sh run-record into the committed
// JSONL ledger. (U2; R1, R3, R4.)
//
// TS-harness-over-shell pattern mirrors tests/loop-driver.test.ts: temp dirs,
// real filesystem, no live loop run. Records are synthesized to match loop.sh's
// emit_record shape (pretty-printed JSON, one file per run named loop-*.json).
// ---------------------------------------------------------------------------

const SCRIPT = path.join(__dirname, "../scripts/append-run-record.sh")

let work: string

beforeEach(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), "append-run-record-"))
})
afterEach(() => {
  fs.rmSync(work, { recursive: true, force: true })
})

function mkLogDir(): string {
  const d = path.join(work, "logdir")
  fs.mkdirSync(d, { recursive: true })
  return d
}

// Write a record file in loop.sh's shape: pretty-printed JSON (multi-line),
// named loop-*.json, with an explicit mtime so "newest by mtime" is deterministic.
function writeRecord(dir: string, name: string, obj: unknown, mtimeEpochSec: number): string {
  const p = path.join(dir, name)
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n")
  fs.utimesSync(p, mtimeEpochSec, mtimeEpochSec)
  return p
}

async function runAppend(args: string[]) {
  const proc = Bun.spawn(["bash", SCRIPT, ...args], { stdout: "pipe", stderr: "pipe" })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  return { stdout, stderr, exitCode }
}

// ---------------------------------------------------------------------------
// Edge: empty LOG_DIR (no records) → exits 0, appends nothing, no error.
// Written first per the U2 execution note: a no-op on no records is the
// behavior that keeps the wrapper safe to run unconditionally.
// ---------------------------------------------------------------------------
describe("empty LOG_DIR guard", () => {
  test("no records: exits 0, appends nothing, no error", async () => {
    const logDir = mkLogDir() // exists but empty
    const ledger = path.join(work, "ledger.jsonl")
    const { exitCode } = await runAppend(["--log-dir", logDir, "--ledger", ledger])
    expect(exitCode).toBe(0)
    expect(fs.existsSync(ledger)).toBe(false)
  })

  test("missing LOG_DIR: exits 0, appends nothing, no error", async () => {
    const logDir = path.join(work, "does-not-exist")
    const ledger = path.join(work, "ledger.jsonl")
    const { exitCode } = await runAppend(["--log-dir", logDir, "--ledger", ledger])
    expect(exitCode).toBe(0)
    expect(fs.existsSync(ledger)).toBe(false)
  })
})

// A run-record fixture matching loop.sh's emit_record key shape.
function record(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    run_id: "loop-20260620-090000-12345",
    outcome: "success",
    exit_code: 0,
    typed_failure: null,
    route: "DONE",
    verification: { mode: "github", result: "green" },
    attempts: { count: 1, done_reached: true, timed_out: false, routed_via_pr: false, results: ["done"] },
    timing: {
      started_at: "2026-06-20T09:00:00Z",
      ended_at: "2026-06-20T09:10:00Z",
      duration_seconds: 600,
    },
    pointers: {
      transcript_log: "/tmp/super-looper/loop/loop-20260620-090000-12345.log",
      pr_url: "https://github.com/o/r/pull/1",
      residual_findings: null,
    },
    coverage_boundary: {
      indexed_by_pointer: ["transcript_log", "pr_url", "residual_findings"],
      not_contained: ["per-phase agent trace (reserved for the run_id join key)"],
    },
    ...overrides,
  }
}

function ledgerLines(ledger: string): string[] {
  return fs
    .readFileSync(ledger, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
}

// ---------------------------------------------------------------------------
// Happy: a LOG_DIR with several loop-*.json of differing mtimes → only the
// newest is appended, as one valid compact JSON line.
// ---------------------------------------------------------------------------
describe("newest-by-mtime selection", () => {
  test("appends only the newest record, as one valid JSON line", async () => {
    const logDir = mkLogDir()
    const ledger = path.join(work, "ledger.jsonl")
    const oldest = record({ run_id: "loop-oldest" })
    const middle = record({ run_id: "loop-middle" })
    const newest = record({ run_id: "loop-newest" })
    writeRecord(logDir, "loop-a.json", oldest, 1000)
    writeRecord(logDir, "loop-b.json", middle, 2000)
    writeRecord(logDir, "loop-c.json", newest, 3000)

    const { exitCode } = await runAppend(["--log-dir", logDir, "--ledger", ledger])
    expect(exitCode).toBe(0)

    const lines = ledgerLines(ledger)
    expect(lines.length).toBe(1)
    expect(JSON.parse(lines[0])).toEqual(newest)
  })
})

// ---------------------------------------------------------------------------
// Append-only: a second invocation appends a second line; prior lines are
// byte-preserved.
// ---------------------------------------------------------------------------
describe("append-only", () => {
  test("second run appends a second line; the first line is byte-preserved", async () => {
    const logDir = mkLogDir()
    const ledger = path.join(work, "ledger.jsonl")
    const first = record({ run_id: "loop-first" })
    writeRecord(logDir, "loop-1.json", first, 1000)
    await runAppend(["--log-dir", logDir, "--ledger", ledger])
    const firstLineBytes = fs.readFileSync(ledger)

    // A newer record lands; the second invocation must pick it up.
    const second = record({ run_id: "loop-second", outcome: "failure", exit_code: 7 })
    writeRecord(logDir, "loop-2.json", second, 2000)
    const { exitCode } = await runAppend(["--log-dir", logDir, "--ledger", ledger])
    expect(exitCode).toBe(0)

    const lines = ledgerLines(ledger)
    expect(lines.length).toBe(2)
    expect(JSON.parse(lines[0])).toEqual(first)
    expect(JSON.parse(lines[1])).toEqual(second)
    // The first line's bytes are a prefix of the grown ledger (untouched).
    const grown = fs.readFileSync(ledger)
    expect(grown.subarray(0, firstLineBytes.length)).toEqual(firstLineBytes)
  })
})

// ---------------------------------------------------------------------------
// Integrity: the appended line round-trips as JSON with the expected
// run-record keys and no fields added by the wrapper.
// ---------------------------------------------------------------------------
describe("integrity", () => {
  test("appended line deep-equals the source record (no fields added/altered)", async () => {
    const logDir = mkLogDir()
    const ledger = path.join(work, "ledger.jsonl")
    const rec = record()
    writeRecord(logDir, "loop-only.json", rec, 1000)

    await runAppend(["--log-dir", logDir, "--ledger", ledger])

    const parsed = JSON.parse(ledgerLines(ledger)[0]) as Record<string, unknown>
    expect(parsed).toEqual(rec)
    // Exactly the source key set — the wrapper adds nothing.
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(rec).sort())
  })
})

// ---------------------------------------------------------------------------
// Edge cases: a zero-byte record (loop.sh killed mid-emit) must not corrupt the
// ledger with a blank line; the ledger's parent dir is created on demand.
// ---------------------------------------------------------------------------
describe("edge cases", () => {
  test("zero-byte record: no-op, appends nothing", async () => {
    const logDir = mkLogDir()
    const ledger = path.join(work, "ledger.jsonl")
    const p = path.join(logDir, "loop-empty.json")
    fs.writeFileSync(p, "") // zero bytes — a truncated/crashed emit
    fs.utimesSync(p, 1000, 1000)
    const { exitCode } = await runAppend(["--log-dir", logDir, "--ledger", ledger])
    expect(exitCode).toBe(0)
    expect(fs.existsSync(ledger)).toBe(false)
  })

  test("creates the ledger's parent directory when absent", async () => {
    const logDir = mkLogDir()
    const ledger = path.join(work, "nested", "deeper", "ledger.jsonl") // parents do not exist
    const rec = record()
    writeRecord(logDir, "loop-1.json", rec, 1000)
    const { exitCode } = await runAppend(["--log-dir", logDir, "--ledger", ledger])
    expect(exitCode).toBe(0)
    expect(JSON.parse(ledgerLines(ledger)[0])).toEqual(rec)
  })
})

// ---------------------------------------------------------------------------
// Argument validation: value-taking flags require a value; unknown flags fail.
// ---------------------------------------------------------------------------
describe("argument validation", () => {
  test("--log-dir with no value exits 2", async () => {
    const { exitCode, stderr } = await runAppend(["--log-dir"])
    expect(exitCode).toBe(2)
    expect(stderr).toContain("--log-dir requires a value")
  })

  test("--ledger with no value exits 2", async () => {
    const { exitCode, stderr } = await runAppend(["--ledger"])
    expect(exitCode).toBe(2)
    expect(stderr).toContain("--ledger requires a value")
  })

  test("unknown flag exits 2", async () => {
    const { exitCode, stderr } = await runAppend(["--nope"])
    expect(exitCode).toBe(2)
    expect(stderr).toContain("unknown argument")
  })
})
