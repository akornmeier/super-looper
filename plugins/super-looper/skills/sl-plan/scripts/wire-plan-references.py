#!/usr/bin/env python3
"""
wire-plan-references.py — Wire an HTML plan's `back refs` into its targets'
`forward refs`, so the link is navigable from both ends.

A plan declares what it descends from (`back refs`). Nothing declares what
descends from it: `forward refs` on the upstream plan has to be written by the
downstream one, and doing that by hand is where the append-only rule quietly
breaks. This script reads one plan's `back refs` and appends that plan's own
repo-relative path to the `forward refs` list of each target, idempotently.

Usage:
  python3 wire-plan-references.py <plan.html> [--dry-run]
  python3 wire-plan-references.py --self-test

Options:
  --dry-run    Report what would be written; touch nothing.
  --self-test  Run offline parser checks and exit. No filesystem writes.

Scope — what this deliberately will not do:
  * It writes exactly one field, `forward refs`, and only in target plans. The
    source plan is never modified, and no other field in any file is touched.
  * Appends are append-only and idempotent: an entry already present is not
    added twice, and no existing entry is reordered or removed. The literal
    `none` is an empty list, and the first append replaces it.
  * A target that is not an HTML plan is skipped, not "upgraded". `forward
    refs` is an HTML-plan field; markdown artifacts (brainstorms, notes) carry
    no such field, and inventing one would break their own contract.

  It must not run unattended. A plan under an active `scripts/loop.sh` run is
  hashed per attempt, so mutating it mid-run reads as goal drift and aborts the
  run (exit 8). The calling skill gates this to interactive runs; the script
  itself has no way to see the loop, which is exactly why the gate lives there.

Output:
  A single JSON object on stdout:
    {"source": "docs/plans/b.html",
     "back_refs": ["docs/plans/a.html"],
     "wired": ["docs/plans/a.html"],
     "skipped": [{"target": "...", "reason": "..."}],
     "warnings": ["..."]}
  Exit 0 whenever the source plan was readable, even if nothing was wired —
  an unwirable target is a skip, not a failure.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

NONE_LITERAL = "none"

# The metadata header is a visible <dl>; a field is a <dt>/<dd> pair. Matching
# the <dd> interior (rather than reformatting the <dl>) is what keeps this a
# one-field, one-line edit.
FIELD_RE_TEMPLATE = r"(<dt>\s*{field}\s*</dt>\s*<dd>)(.*?)(</dd>)"
TAG_RE = re.compile(r"<[^>]+>")


def field_re(field):
    return re.compile(FIELD_RE_TEMPLATE.format(field=re.escape(field)), re.DOTALL | re.IGNORECASE)


def read_field(content, field):
    """Return the raw <dd> interior of `field`, or None when the field is absent."""
    match = field_re(field).search(content)
    return match.group(2) if match else None


def parse_list(raw):
    """Split a list field's <dd> interior into entries. `none` is the empty list."""
    if raw is None:
        return []
    text = TAG_RE.sub("", raw).strip()
    if not text or text.lower() == NONE_LITERAL:
        return []
    return [entry.strip() for entry in text.split(",") if entry.strip()]


def append_entry(content, field, entry):
    """Append `entry` to a list field. Returns (content, changed)."""
    match = field_re(field).search(content)
    if not match:
        return content, False

    existing = parse_list(match.group(2))
    if entry in existing:
        # Idempotent by contract: re-running the wiring is a no-op, so a resume
        # or a second sl-plan pass cannot duplicate a reference.
        return content, False

    updated = ", ".join(existing + [entry])
    return content[: match.start(2)] + updated + content[match.end(2):], True


def repo_relative(path, repo_root):
    """Path as the metadata fields record it: relative to the repo root."""
    try:
        return str(Path(path).resolve().relative_to(repo_root))
    except ValueError:
        # Outside the repo entirely — record what we were given rather than an
        # absolute path that means nothing on another machine.
        return str(path)


def find_repo_root(start):
    try:
        out = subprocess.run(
            ["git", "-C", str(start), "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    root = out.stdout.strip()
    return Path(root) if out.returncode == 0 and root else None


def atomic_write(path, content):
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".wire-plan-references-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
        os.chmod(tmp, os.stat(path).st_mode & 0o777)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


# ---------------------------------------------------------------- self-test


PLAN = """<header>
  <details class="meta">
    <dl>
      <dt>title</dt>        <dd>A plan</dd>
      <dt>back refs</dt>    <dd>docs/plans/a.html, docs/brainstorms/x.md</dd>
      <dt>forward refs</dt> <dd>none</dd>
    </dl>
  </details>
</header>
"""

TARGET = """<header>
  <details class="meta">
    <dl>
      <dt>title</dt>        <dd>Upstream</dd>
      <dt>back refs</dt>    <dd>none</dd>
      <dt>forward refs</dt> <dd>docs/plans/existing.html</dd>
    </dl>
  </details>
</header>
"""


def self_test():
    # A `none` list is empty; a populated one splits on commas; tags are ignored
    # for comparison so a <code>-wrapped entry still matches its plain twin.
    assert parse_list("none") == []
    assert parse_list("  NONE  ") == []
    assert parse_list(None) == []
    assert parse_list("docs/plans/a.html, docs/brainstorms/x.md") == [
        "docs/plans/a.html",
        "docs/brainstorms/x.md",
    ]
    assert parse_list("<code>docs/plans/a.html</code>") == ["docs/plans/a.html"]

    assert parse_list(read_field(PLAN, "back refs")) == ["docs/plans/a.html", "docs/brainstorms/x.md"]
    assert parse_list(read_field(PLAN, "forward refs")) == []
    assert read_field(PLAN, "nonesuch") is None

    # First append replaces the `none` literal rather than appending beside it.
    wired, changed = append_entry(PLAN, "forward refs", "docs/plans/b.html")
    assert changed
    assert "<dt>forward refs</dt> <dd>docs/plans/b.html</dd>" in wired, wired
    assert NONE_LITERAL not in read_field(wired, "forward refs")

    # Appending to a populated list preserves the existing entry and its order.
    wired, changed = append_entry(TARGET, "forward refs", "docs/plans/b.html")
    assert changed
    assert parse_list(read_field(wired, "forward refs")) == [
        "docs/plans/existing.html",
        "docs/plans/b.html",
    ]

    # Idempotent: a second pass changes nothing at all, byte for byte.
    again, changed = append_entry(wired, "forward refs", "docs/plans/b.html")
    assert not changed and again == wired

    # Only `forward refs` moves. The target's other fields are untouched — an
    # edit that widened past one field is the failure mode this guards.
    assert read_field(wired, "back refs") == read_field(TARGET, "back refs")
    assert read_field(wired, "title") == read_field(TARGET, "title")

    # A missing field is a no-op, never an invented one.
    bare = "<dl><dt>title</dt> <dd>Bare</dd></dl>"
    same, changed = append_entry(bare, "forward refs", "docs/plans/b.html")
    assert not changed and same == bare

    print("self-test ok")
    return 0


# ---------------------------------------------------------------- main


def main():
    parser = argparse.ArgumentParser(
        description="Wire an HTML plan's back refs into its targets' forward refs.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("plan", nargs="?", type=Path, help="Path to the source HTML plan")
    parser.add_argument("--dry-run", action="store_true", help="Report what would change; write nothing")
    parser.add_argument("--self-test", action="store_true", help="Run offline parser checks and exit")
    args = parser.parse_args()

    if args.self_test:
        return self_test()
    if args.plan is None:
        parser.error("plan file is required (or pass --self-test)")

    plan = args.plan.expanduser()
    if not plan.is_file():
        sys.stderr.write("wire-plan-references: plan file not found: " + str(plan) + "\n")
        return 2
    if plan.suffix.lower() != ".html":
        sys.stderr.write("wire-plan-references: not an HTML plan: " + str(plan) + "\n")
        return 2

    content = plan.read_text(encoding="utf-8")
    repo_root = find_repo_root(plan.parent) or plan.resolve().parent
    source = repo_relative(plan, repo_root)

    back_refs = parse_list(read_field(content, "back refs"))
    wired = []
    skipped = []
    warnings = []

    if read_field(content, "back refs") is None:
        warnings.append("plan has no 'back refs' field; nothing to wire")

    for ref in back_refs:
        target = (repo_root / ref) if not Path(ref).is_absolute() else Path(ref)

        if not target.is_file():
            skipped.append({"target": ref, "reason": "target file does not exist"})
            continue
        if target.suffix.lower() != ".html":
            # `forward refs` is an HTML-plan field. A markdown brainstorm has no
            # such field, and adding one would break its own contract.
            skipped.append({"target": ref, "reason": "not an HTML plan; forward refs is an HTML-plan field"})
            continue
        if target.resolve() == plan.resolve():
            skipped.append({"target": ref, "reason": "plan back-references itself"})
            continue

        target_content = target.read_text(encoding="utf-8")
        if read_field(target_content, "forward refs") is None:
            skipped.append({"target": ref, "reason": "target has no 'forward refs' field"})
            continue

        updated, changed = append_entry(target_content, "forward refs", source)
        if not changed:
            skipped.append({"target": ref, "reason": "already lists this plan in forward refs"})
            continue
        if args.dry_run:
            wired.append(ref)
            continue

        try:
            atomic_write(target, updated)
        except OSError as e:
            skipped.append({"target": ref, "reason": "write failed: " + str(e)})
            continue
        wired.append(ref)
        sys.stderr.write("wired " + source + " into " + ref + " (forward refs)\n")

    print(json.dumps({
        "source": source,
        "back_refs": back_refs,
        "wired": wired,
        "skipped": skipped,
        "warnings": warnings,
        "dry_run": args.dry_run,
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
