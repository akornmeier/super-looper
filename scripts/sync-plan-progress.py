#!/usr/bin/env python3
"""
sync-plan-progress.py — record a shipped phase in the plan.

Appends the phase's commit SHAs to the plan's append-only `commits` metadata and
adds one Amendments entry naming the phase and its branch.

This runs ONLY between unattended runs, never inside one. The goal guard
normalizes status markers before hashing, but it does NOT normalize these: a
mid-run write here reads as goal drift and exits 8. The guard-free gap between
loop.sh invocations is the one place it is safe. See
docs/solutions/workflow/per-phase-pr-execution.md.

Usage:
  sync-plan-progress.py <plan> --phase U1,U2 --branch <name> --date YYYY-MM-DD \
      [--commit SHA ...]
  sync-plan-progress.py --self-test

Appends are append-only and idempotent: a SHA already listed is not added twice,
and a phase already recorded in Amendments is not recorded again. Exit 0 whenever
the plan was readable -- a plan with no `commits` field is a skip, not a failure.
"""

import argparse
import html
import json
import os
import re
import sys
import tempfile
from pathlib import Path

NONE = "none"
TAG_RE = re.compile(r"<[^>]+>")


# ------------------------------------------------------------------ HTML plans

def _html_field_re(field):
    return re.compile(
        r"(<dt>\s*" + re.escape(field) + r"\s*</dt>\s*<dd>)(.*?)(</dd>)",
        re.DOTALL | re.IGNORECASE,
    )


def parse_list(raw):
    if raw is None:
        return []
    text = TAG_RE.sub("", raw).strip()
    if not text or text.lower() == NONE:
        return []
    return [e.strip() for e in text.split(",") if e.strip()]


def new_shas(shas, existing):
    """SHAs not already listed, de-duplicated within the batch, order preserved.

    Deduping against `existing` alone is not enough: a caller passing the same SHA
    twice in one invocation would append it twice, which is exactly the corruption
    the append-only `commits` list is supposed to be immune to.
    """
    fresh = []
    for s in shas:
        if s not in existing and s not in fresh:
            fresh.append(s)
    return fresh


def append_html_commits(content, shas):
    match = _html_field_re("commits").search(content)
    if not match:
        return content, False
    existing = parse_list(match.group(2))
    fresh = new_shas(shas, existing)
    if not fresh:
        return content, False
    updated = ", ".join(existing + fresh)
    return content[: match.start(2)] + updated + content[match.end(2):], True


AMEND_OPEN_RE = re.compile(r'(<section\b[^>]*id="amendments"[^>]*>)(.*?)(</section>)', re.DOTALL | re.IGNORECASE)
EMPTY_STATE_RE = re.compile(r'<p class="empty">[^<]*</p>\s*', re.IGNORECASE)


def append_html_amendment(content, summary, detail):
    match = AMEND_OPEN_RE.search(content)
    if not match:
        return content, False
    body = match.group(2)
    if html.escape(summary, quote=False) in body or summary in body:
        return content, False  # idempotent: this phase is already recorded
    entry = (
        "\n    <details>\n"
        "      <summary>" + html.escape(summary, quote=False) + "</summary>\n"
        "      <p>" + html.escape(detail, quote=False) + "</p>\n"
        "    </details>\n  "
    )
    # The first append replaces the empty-state paragraph; later ones sit after
    # the existing entries, newest at the bottom.
    body_new = EMPTY_STATE_RE.sub("", body, count=1).rstrip() + entry
    return content[: match.start(2)] + body_new + content[match.end(2):], True


# -------------------------------------------------------------- markdown plans

FM_RE = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)
MD_COMMITS_RE = re.compile(r"^(commits:)(.*)$", re.MULTILINE)


def append_md_commits(content, shas):
    fm = FM_RE.search(content)
    if not fm:
        return content, False
    block = fm.group(1)
    match = MD_COMMITS_RE.search(block)
    if not match:
        return content, False
    existing = parse_list(match.group(2))
    fresh = new_shas(shas, existing)
    if not fresh:
        return content, False
    line = "commits: " + ", ".join(existing + fresh)
    block_new = block[: match.start()] + line + block[match.end():]
    return content[: fm.start(1)] + block_new + content[fm.end(1):], True


def append_md_amendment(content, summary, detail):
    if summary in content:
        return content, False  # idempotent
    entry = "\n- **" + summary + "**\n\n  " + detail + "\n"
    match = re.search(r"^##\s+Amendments\s*$", content, re.MULTILINE)
    if not match:
        return content, False
    # Insert at the end of the Amendments section: before the next H2, or EOF.
    nxt = re.search(r"^##\s+", content[match.end():], re.MULTILINE)
    end = match.end() + (nxt.start() if nxt else len(content) - match.end())
    section = content[match.end():end]
    section = re.sub(r"^\s*_?No amendments yet\.?_?\s*$", "", section, flags=re.MULTILINE | re.IGNORECASE)
    return content[: match.end()] + section.rstrip() + "\n" + entry + "\n" + content[end:], True


# ---------------------------------------------------------------------- driver

def sync(content, is_html, shas, summary, detail):
    changed = False
    if is_html:
        content, c1 = append_html_commits(content, shas)
        content, c2 = append_html_amendment(content, summary, detail)
    else:
        content, c1 = append_md_commits(content, shas)
        content, c2 = append_md_amendment(content, summary, detail)
    changed = c1 or c2
    return content, changed


def atomic_write(path, content):
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".sync-plan-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as h:
            h.write(content)
        os.chmod(tmp, os.stat(path).st_mode & 0o777)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def self_test():
    html_plan = (
        '<dl><dt>commits</dt> <dd>none</dd></dl>\n'
        '<section id="amendments">\n  <h2>Amendments</h2>\n'
        '  <p class="empty">No amendments yet.</p>\n</section>\n'
    )
    out, changed = sync(html_plan, True, ["abc123"], "2026-07-11 — phase U1 shipped", "Branch feat/x.")
    assert changed
    assert "<dd>abc123</dd>" in out, out
    assert "No amendments yet" not in out
    assert "phase U1 shipped" in out

    # Idempotent: a second identical sync is a byte-for-byte no-op.
    again, changed = sync(out, True, ["abc123"], "2026-07-11 — phase U1 shipped", "Branch feat/x.")
    assert not changed and again == out

    # A second phase appends beside the first rather than replacing it.
    out2, changed = sync(out, True, ["def456"], "2026-07-11 — phase U2 shipped", "Branch feat/y.")
    assert changed and "abc123, def456" in out2
    assert "phase U1 shipped" in out2 and "phase U2 shipped" in out2

    md_plan = "---\ntitle: P\ncommits: none\n---\n\n## Amendments\n\n_No amendments yet._\n"
    mout, changed = sync(md_plan, False, ["abc123"], "2026-07-11 — phase U1 shipped", "Branch feat/x.")
    assert changed and "commits: abc123" in mout, mout
    assert "phase U1 shipped" in mout
    magain, changed = sync(mout, False, ["abc123"], "2026-07-11 — phase U1 shipped", "Branch feat/x.")
    assert not changed and magain == mout

    # A SHA repeated within ONE invocation is appended once. Deduping against the
    # existing list alone would let a duplicated --commit corrupt the append-only
    # list -- the one thing it is supposed to be immune to.
    dup, changed = sync(html_plan, True, ["abc123", "abc123"], "2026-07-11 — phase U1 shipped", "Branch feat/x.")
    assert changed and "<dd>abc123</dd>" in dup, dup
    mdup, changed = sync(md_plan, False, ["abc123", "abc123"], "s", "d")
    assert changed and "commits: abc123\n" in mdup, mdup

    # A plan with no commits field and no Amendments section is a skip, not a crash.
    bare, changed = sync("# Plan\n", False, ["abc"], "s", "d")
    assert not changed and bare == "# Plan\n"

    print("self-test ok")
    return 0


def main():
    p = argparse.ArgumentParser(description="Record a shipped phase in the plan.")
    p.add_argument("plan", nargs="?", type=Path)
    p.add_argument("--phase", default="")
    p.add_argument("--branch", default="")
    p.add_argument("--date", default="")
    p.add_argument("--commit", action="append", default=[])
    p.add_argument("--self-test", action="store_true")
    args = p.parse_args()

    if args.self_test:
        return self_test()
    if args.plan is None:
        p.error("plan file is required (or pass --self-test)")
    # argparse's own `required=True` cannot express "required unless --self-test",
    # so the normal-mode contract is enforced here. Without it a missing flag
    # silently writes a placeholder amendment ("phase ? shipped").
    missing = [n for n in ("phase", "branch", "date") if not getattr(args, n)]
    if missing:
        p.error("missing required argument(s): " + ", ".join("--" + n for n in missing))

    plan = args.plan.expanduser()
    if not plan.is_file():
        sys.stderr.write("sync-plan-progress: plan not found: " + str(plan) + "\n")
        return 2

    content = plan.read_text(encoding="utf-8")
    summary = args.date + " — phase " + args.phase + " shipped"
    detail = "Shipped by an unattended per-phase run on branch " + args.branch + "."

    updated, changed = sync(content, plan.suffix.lower() == ".html", args.commit, summary, detail)
    if changed:
        atomic_write(plan, updated)

    print(json.dumps({"plan": str(plan), "changed": changed, "commits": args.commit, "phase": args.phase}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
