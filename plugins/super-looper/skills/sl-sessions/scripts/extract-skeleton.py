#!/usr/bin/env python3
"""Extract the conversation skeleton from a Claude Code JSONL session file.

Usage:
  cat <session.jsonl> | python3 extract-skeleton.py
  cat <session.jsonl> | python3 extract-skeleton.py --output PATH

Extracts:
  - User messages (text only, no tool results)
  - Assistant text (no thinking blocks)
  - Collapsed tool call summaries (consecutive same-tool calls grouped)

Consecutive tool calls of the same type are collapsed:
  3+ Read calls -> "[tools] 3x Read (file1, file2, +1 more) -> all ok"

When --output PATH is given, the extracted skeleton is written to PATH and
stdout receives only a one-line JSON status (_meta with wrote/bytes/stats).
This lets callers route bulk content to a scratch file without round-tripping
extraction bytes through orchestrator tool results.

Without --output, extracted content goes to stdout and ends with a _meta line.
"""
import argparse
import io
import os
import sys
import json
import re

parser = argparse.ArgumentParser(add_help=True)
parser.add_argument(
    "--output",
    metavar="PATH",
    help="Write extracted skeleton to PATH instead of stdout. Stdout receives a one-line _meta status.",
)
args = parser.parse_args()

# Capture-and-redirect when --output is set: prints in the rest of the script
# go to the buffer; at the end the buffer is written to PATH and a status
# line is emitted to the real stdout.
_original_stdout = sys.stdout
if args.output:
    sys.stdout = io.StringIO()

stats = {"lines": 0, "parse_errors": 0, "user": 0, "assistant": 0, "tool": 0}

# Claude Code wrapper tags to strip from user message content.
# Strip entirely (tag + content): framework noise and raw command output.
# Strip tags only (keep content): command-message, command-name, command-args, user_query.
_STRIP_BLOCK = re.compile(
    r"<(?:task-notification|local-command-caveat|local-command-stdout|local-command-stderr|system-reminder)[^>]*>.*?</(?:task-notification|local-command-caveat|local-command-stdout|local-command-stderr|system-reminder)>",
    re.DOTALL,
)
_STRIP_TAG = re.compile(
    r"</?(?:command-message|command-name|command-args|user_query)[^>]*>"
)


def clean_text(text):
    """Strip framework wrapper tags from message text."""
    text = _STRIP_BLOCK.sub("", text)
    text = _STRIP_TAG.sub("", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text

# Buffer for pending tool entries: [{"ts", "name", "target", "status"}]
pending_tools = []


def flush_tools():
    """Print buffered tool entries, collapsing consecutive same-name groups."""
    if not pending_tools:
        return

    # Group consecutive entries by tool name
    groups = []
    for entry in pending_tools:
        if groups and groups[-1][0]["name"] == entry["name"]:
            groups[-1].append(entry)
        else:
            groups.append([entry])

    for group in groups:
        name = group[0]["name"]
        if len(group) <= 2:
            # Print individually
            for e in group:
                status = f" -> {e['status']}" if e.get("status") else ""
                ts_prefix = f"[{e['ts']}] " if e.get("ts") else ""
                print(f"{ts_prefix}[tool] {name} {e['target']}{status}")
                stats["tool"] += 1
        else:
            # Collapse
            ts = group[0].get("ts", "")
            targets = [e["target"] for e in group if e.get("target")]
            ok = sum(1 for e in group if e.get("status") == "ok")
            err = sum(1 for e in group if e.get("status") and e["status"] != "ok")
            no_status = len(group) - ok - err

            # Show first 2 targets, then "+N more"
            if len(targets) > 2:
                target_str = ", ".join(targets[:2]) + f", +{len(targets) - 2} more"
            elif targets:
                target_str = ", ".join(targets)
            else:
                target_str = ""

            if no_status == len(group):
                status_str = ""
            elif err == 0:
                status_str = " -> all ok"
            else:
                status_str = f" -> {ok} ok, {err} error"

            ts_prefix = f"[{ts}] " if ts else ""
            print(f"{ts_prefix}[tools] {len(group)}x {name} ({target_str}){status_str}")
            stats["tool"] += len(group)

    pending_tools.clear()


def _safe_slice(value, n):
    """Slice value if it is a string; otherwise return ''.

    Some Claude Code / MCP tool inputs put structured data (dicts, lists) in
    fields like `query` or `prompt`. `dict[:N]` raises TypeError, so guard
    every slice with an isinstance check.
    """
    return value[:n] if isinstance(value, str) else ""


def summarize_claude_tool(block):
    """Extract name and target from a Claude Code tool_use block."""
    name = block.get("name", "unknown")
    inp = block.get("input", {})
    fp = inp.get("file_path")
    p = inp.get("path")
    target = (
        (fp if isinstance(fp, str) else None)
        or (p if isinstance(p, str) else None)
        or _safe_slice(inp.get("command"), 120)
        or _safe_slice(inp.get("pattern"), 200)
        or _safe_slice(inp.get("query"), 80)
        or _safe_slice(inp.get("prompt"), 80)
        or ""
    )
    if isinstance(target, str) and len(target) > 120:
        target = target[:120]
    return name, target


def handle_claude(obj):
    msg_type = obj.get("type")
    ts = obj.get("timestamp", "")[:19]

    if msg_type == "user":
        msg = obj.get("message", {})
        content = msg.get("content", "")

        if isinstance(content, list):
            for block in content:
                if block.get("type") == "tool_result":
                    is_error = block.get("is_error", False)
                    status = "error" if is_error else "ok"
                    tool_use_id = block.get("tool_use_id")
                    matched = False
                    if tool_use_id:
                        for entry in pending_tools:
                            if entry.get("id") == tool_use_id:
                                entry["status"] = status
                                matched = True
                                break
                    if not matched:
                        # Fallback: assign to earliest pending entry without a status
                        for entry in pending_tools:
                            if not entry.get("status"):
                                entry["status"] = status
                                break

            texts = [
                c.get("text", "")
                for c in content
                if c.get("type") == "text" and len(c.get("text", "")) > 10
            ]
            content = " ".join(texts)

        if isinstance(content, str):
            content = clean_text(content)
            if len(content) > 15:
                flush_tools()
                print(f"[{ts}] [user] {content[:800]}")
                print("---")
                stats["user"] += 1

    elif msg_type == "assistant":
        msg = obj.get("message", {})
        content = msg.get("content", [])
        if isinstance(content, list):
            has_text = False
            for block in content:
                if block.get("type") == "text":
                    text = clean_text(block.get("text", ""))
                    if len(text) > 20:
                        if not has_text:
                            flush_tools()
                            has_text = True
                        print(f"[{ts}] [assistant] {text[:800]}")
                        print("---")
                        stats["assistant"] += 1
                elif block.get("type") == "tool_use":
                    name, target = summarize_claude_tool(block)
                    entry = {"ts": ts, "name": name, "target": target}
                    tool_id = block.get("id")
                    if tool_id:
                        entry["id"] = tool_id
                    pending_tools.append(entry)


# Read all lines, then process them.
buffer = []

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    buffer.append(line)
    stats["lines"] += 1

for line in buffer:
    try:
        handle_claude(json.loads(line))
    except (json.JSONDecodeError, KeyError):
        stats["parse_errors"] += 1

# Flush any remaining buffered tools
flush_tools()

print(json.dumps({"_meta": True, **stats}))

if args.output:
    body = sys.stdout.getvalue()
    sys.stdout = _original_stdout
    with open(args.output, "w") as f:
        f.write(body)
    bytes_written = os.path.getsize(args.output)
    print(json.dumps({"_meta": True, "wrote": args.output, "bytes": bytes_written, **stats}))
