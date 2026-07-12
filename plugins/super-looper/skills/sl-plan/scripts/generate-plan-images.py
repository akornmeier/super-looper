#!/usr/bin/env python3
"""
generate-plan-images.py — Fill an HTML plan's image slots with generated images.

Parses the slot comment grammar defined in
`references/html-plan-template.md`, calls OpenAI's images API once per empty
slot, and rewrites the slot interior in place with a single-line
`<img src="data:image/webp;base64,...">` element followed by the slot's
existing `<figcaption>`. The comment pair always survives, so filled slots are
detectable, skippable on re-run, and regenerable by name.

Usage:
  python3 generate-plan-images.py <plan.html> [options]
  python3 generate-plan-images.py <plan.html> --edit NAME --instruction "..."
  python3 generate-plan-images.py --self-test

Options:
  --slot NAME         Fill only this slot (skipped when already filled).
  --regenerate NAME   Re-generate this slot even if it is already filled.
  --edit NAME         Refine this slot's existing image in place: its embedded
                      bytes are sent to the images *edit* endpoint along with
                      --instruction, and the result replaces them. Requires the
                      slot to be already filled. The slot's authored
                      `prompt="..."` attribute is left untouched, so a later
                      --regenerate still reproduces the original image from the
                      plan's own prompt rather than from an edit instruction.
  --instruction TEXT  The refinement to apply. Required with --edit, and only
                      valid with it.
  --size WxH          Image size (default: 1536x1024).
  --quality TIER      auto | low | medium | high (default: high).
  --compression N     webp compression 0-100 (default: 80).
  --max-images N      Hard cap on API calls this run (default: 8). Slots past
                      the cap are reported as skips and cost nothing. `0`
                      dispatches nothing, which makes it a dry run: the report
                      names every slot the run *would* have paid for.
  --model ID          Override the pinned model id.
  --self-test         Run offline parser checks and exit. No network.

Environment:
  OPENAI_API_KEY  Required to generate or edit. When unset the script reports
                  every targeted slot as skipped, writes nothing, and exits 0.

Output:
  A single JSON object on stdout:
    {"slots_found": N,
     "filled": ["hero", ...],
     "edited": ["design", ...],
     "skipped": [{"slot": "problem", "reason": "..."}],
     "warnings": ["..."]}
  `edited` lists slots refined by --edit; `filled` lists slots written by
  generation. Human-readable progress goes to stderr. Image failure never
  blocks the plan: every failure mode degrades to a per-slot skip and exit 0.

Write safety:
  Before the first modification of a run the original is copied once to
  <plan-name>.bak in the OS temp directory (overwriting any stale backup), and
  that path is printed to stderr. The backup is never written as a sibling of
  the plan, so the plans directory is not dirtied. Each fill is written
  atomically (temp file in the same directory + os.replace), so a mid-batch
  failure leaves earlier fills intact and the plan valid.
"""

import argparse
import base64
import html
import json
import os
import re
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
import uuid
from pathlib import Path

# Single override point for the pinned model id (K10). An unknown-model API
# error degrades identically to key-absent.
MODEL = "gpt-image-2"

API_URL = "https://api.openai.com/v1/images/generations"
EDIT_API_URL = "https://api.openai.com/v1/images/edits"
TIMEOUT_SECS = 180

DEFAULT_SIZE = "1536x1024"
DEFAULT_QUALITY = "high"
DEFAULT_COMPRESSION = 80
OUTPUT_FORMAT = "webp"

# Spend cap, counted in API calls rather than estimated dollars. A USD cap would
# need a local price table keyed by model x size x quality, and a stale table
# does not fail loudly — it silently enforces the wrong cap while still looking
# authoritative. An image count is exactly verifiable and maps onto the only
# thing this script controls: how many paid calls it dispatches. The cap sits
# above the template's own guidance (hero + one per major section), so it binds
# on runaway plans, not on well-formed ones.
DEFAULT_MAX_IMAGES = 8

VALID_QUALITY = ["auto", "low", "medium", "high"]

OPEN_RE = re.compile(r'<!--\s*image-slot:([a-z0-9][a-z0-9-]*)\s+prompt="([^"]*)"\s*-->')
FIGCAPTION_RE = re.compile(r"<figcaption\b[^>]*>.*?</figcaption>", re.DOTALL)
IMG_RE = re.compile(r"<img\b", re.IGNORECASE)
DATA_URI_RE = re.compile(
    r'src="data:image/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]*)"', re.IGNORECASE
)


# ---------------------------------------------------------------- parsing


def _closer_re(name):
    return re.compile(r"<!--\s*/image-slot:" + re.escape(name) + r"\s*-->")


def _indent_of(content, offset):
    """Leading whitespace on the line containing `offset`, or ""."""
    line_start = content.rfind("\n", 0, offset) + 1
    prefix = content[line_start:offset]
    return prefix if prefix.strip() == "" else ""


def parse_slots(content):
    """Return (slots, warnings). Each slot is a dict describing one comment pair."""
    slots = []
    warnings = []
    seen = set()

    for match in OPEN_RE.finditer(content):
        name, prompt = match.group(1), match.group(2)
        if "--" in prompt:
            # A literal `--` is invalid inside an HTML comment: the browser
            # terminates the comment at the first `-->` even though this
            # parser would read straight across it. Refuse rather than fill
            # a slot the browser and the script disagree about.
            warnings.append(
                "slot '" + name + "' prompt contains '--', which is invalid inside an HTML comment"
                " (escape quotes as &quot; and avoid double hyphens); skipped"
            )
            continue
        closer = _closer_re(name).search(content, match.end())
        if not closer:
            warnings.append(
                "slot '" + name + "' has no closing <!-- /image-slot:" + name + " --> comment; skipped"
            )
            continue
        if name in seen:
            warnings.append("slot '" + name + "' is declared more than once; only the first is used")
            continue
        seen.add(name)

        interior = content[match.end():closer.start()]
        if OPEN_RE.search(interior):
            # Another opener before this slot's closer (a missing closer
            # upstream, or interleaved slots). Filling would rewrite the
            # interior and destroy the inner opener outright.
            warnings.append(
                "slot '" + name + "' contains another image-slot opener before its closer"
                " (missing closer?); refusing to fill it"
            )
            continue
        caption = FIGCAPTION_RE.search(interior)
        slots.append(
            {
                "name": name,
                "prompt": html.unescape(prompt),
                "interior_start": match.end(),
                "interior_end": closer.start(),
                "indent": _indent_of(content, match.start()),
                "filled": bool(IMG_RE.search(interior)),
                "figcaption": caption.group(0) if caption else None,
                "interior": interior,
            }
        )

    return slots, warnings


def embedded_image(slot):
    """Return (raw_bytes, subtype, None) for a filled slot, or (None, None, reason)."""
    match = DATA_URI_RE.search(slot["interior"])
    if not match:
        # A slot can be "filled" (it has an <img>) yet carry an external src or
        # an SVG someone hand-wrote. Editing needs bytes we can send; refuse
        # rather than guess at fetching them.
        return None, None, "slot has no embedded base64 image to edit"
    subtype = match.group(1).lower()
    try:
        raw = base64.b64decode(re.sub(r"\s+", "", match.group(2)), validate=True)
    except Exception:
        return None, None, "slot's embedded image data is not valid base64"
    if not raw:
        return None, None, "slot's embedded image data is empty"
    return raw, subtype, None


def select_targets(slots, slot_name, regenerate_name):
    """Return (target_names, skipped, warnings) for this run's selection flags."""
    by_name = {s["name"]: s for s in slots}
    skipped = []
    warnings = []

    if regenerate_name:
        if regenerate_name not in by_name:
            warnings.append("--regenerate named slot '" + regenerate_name + "' which does not exist in the plan")
            return [], skipped, warnings
        return [regenerate_name], skipped, warnings

    if slot_name:
        if slot_name not in by_name:
            warnings.append("--slot named slot '" + slot_name + "' which does not exist in the plan")
            return [], skipped, warnings
        if by_name[slot_name]["filled"]:
            skipped.append({"slot": slot_name, "reason": "already filled; pass --regenerate to replace it"})
            return [], skipped, warnings
        return [slot_name], skipped, warnings

    targets = []
    for slot in slots:
        if slot["filled"]:
            skipped.append({"slot": slot["name"], "reason": "already filled; pass --regenerate to replace it"})
        else:
            targets.append(slot["name"])
    return targets, skipped, warnings


def select_edit_target(slots, edit_name):
    """Return (target_names, skipped, warnings) for an --edit run."""
    by_name = {s["name"]: s for s in slots}
    if edit_name not in by_name:
        return [], [], ["--edit named slot '" + edit_name + "' which does not exist in the plan"]
    if not by_name[edit_name]["filled"]:
        # Editing needs something to edit. Filling it is a different call with
        # different semantics (the authored prompt, not an instruction), so
        # point at that rather than silently generating.
        return [], [{
            "slot": edit_name,
            "reason": "slot is empty; run without --edit to fill it before refining it",
        }], []
    return [edit_name], [], []


def apply_cap(targets, max_images):
    """Trim `targets` to the spend cap. Returns (allowed, skipped_over_cap)."""
    if len(targets) <= max_images:
        return targets, []
    over = [
        {
            "slot": name,
            "reason": "over the run cap of " + str(max_images) + " image(s); nothing was charged for it"
            " (raise --max-images, or fill it in a later run)",
        }
        for name in targets[max_images:]
    ]
    return targets[:max_images], over


def alt_text(slot):
    """Attribute-safe alt text, taken from the slot's figcaption."""
    if not slot["figcaption"]:
        return html.escape(slot["name"], quote=True)
    inner = re.sub(r"^<figcaption\b[^>]*>|</figcaption>$", "", slot["figcaption"].strip())
    text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", inner)).strip()
    return html.escape(html.unescape(text), quote=True) or html.escape(slot["name"], quote=True)


def fill_slot(content, slot, b64):
    """Rewrite the slot interior: one-line <img>, then the existing figcaption."""
    indent = slot["indent"]
    img = '<img src="data:image/' + OUTPUT_FORMAT + ";base64," + b64 + '" alt="' + alt_text(slot) + '">'
    lines = [img]
    if slot["figcaption"]:
        lines.append(slot["figcaption"])
    interior = "\n" + "".join(indent + line + "\n" for line in lines) + indent
    return content[: slot["interior_start"]] + interior + content[slot["interior_end"]:]


# ---------------------------------------------------------------- api


def _error_reason(status, body):
    message = ""
    try:
        message = (json.loads(body).get("error") or {}).get("message") or ""
    except Exception:
        message = ""
    reason = "HTTP " + str(status)
    if status == 401:
        reason += " (invalid or unauthorized OPENAI_API_KEY)"
    elif status == 429:
        reason += " (rate limited or quota exhausted)"
    if message:
        reason += ": " + message
    return reason


def _call_api(request):
    """Send `request` and return (b64_string, None) or (None, reason)."""
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECS) as response:
            body = response.read()
    except urllib.error.HTTPError as e:
        return None, _error_reason(e.code, e.read())
    except urllib.error.URLError as e:
        return None, "network error: " + str(e.reason)
    except TimeoutError:
        return None, "request timed out after " + str(TIMEOUT_SECS) + "s"
    except Exception as e:
        return None, "unexpected " + type(e).__name__ + ": " + str(e)

    try:
        data = json.loads(body).get("data") or []
        b64 = data[0]["b64_json"]
    except (json.JSONDecodeError, IndexError, KeyError, TypeError):
        return None, "unexpected API response shape"

    if not b64:
        return None, "API returned empty image data"

    try:
        raw = base64.b64decode(b64, validate=True)
    except Exception:
        return None, "API returned malformed base64 image data"

    return base64.b64encode(raw).decode("ascii"), None


def generate_image(api_key, prompt, model, size, quality, compression):
    """Return (b64_string, None) on success or (None, reason) on any failure."""
    payload = {
        "model": model,
        "prompt": prompt,
        "size": size,
        "quality": quality,
        "n": 1,
        "output_format": OUTPUT_FORMAT,
        "output_compression": compression,
    }
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": "Bearer " + api_key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    return _call_api(request)


def multipart_body(boundary, fields, image_bytes, image_subtype):
    """Encode `fields` plus one `image` part as multipart/form-data bytes."""
    marker = ("--" + boundary).encode("ascii")
    chunks = []
    for name, value in fields.items():
        chunks.append(
            marker
            + b"\r\nContent-Disposition: form-data; name=\""
            + name.encode("utf-8")
            + b"\"\r\n\r\n"
            + str(value).encode("utf-8")
            + b"\r\n"
        )
    chunks.append(
        marker
        + b"\r\nContent-Disposition: form-data; name=\"image\"; filename=\"slot."
        + image_subtype.encode("ascii")
        + b"\"\r\nContent-Type: image/"
        + image_subtype.encode("ascii")
        + b"\r\n\r\n"
        + image_bytes
        + b"\r\n"
    )
    chunks.append(marker + b"--\r\n")
    return b"".join(chunks)


def edit_image(api_key, image_bytes, image_subtype, instruction, model, size, quality, compression):
    """Refine an existing image. Same (b64, reason) contract as generate_image."""
    boundary = "----slotedit" + uuid.uuid4().hex
    fields = {
        "model": model,
        "prompt": instruction,
        "size": size,
        "quality": quality,
        "n": 1,
        "output_format": OUTPUT_FORMAT,
        "output_compression": compression,
    }
    request = urllib.request.Request(
        EDIT_API_URL,
        data=multipart_body(boundary, fields, image_bytes, image_subtype),
        headers={
            "Authorization": "Bearer " + api_key,
            "Content-Type": "multipart/form-data; boundary=" + boundary,
        },
        method="POST",
    )
    return _call_api(request)


# ---------------------------------------------------------------- writing


def backup_once(plan, state):
    """One-time backup to OS temp — never a sibling in the (tracked) plans dir."""
    if state["backed_up"]:
        return
    backup = Path(tempfile.gettempdir()) / (plan.name + ".bak")
    shutil.copy2(plan, backup)
    state["backed_up"] = True
    sys.stderr.write("Backup of the original plan: " + str(backup) + "\n")


def atomic_write(plan, content):
    fd, tmp = tempfile.mkstemp(dir=str(plan.parent), prefix=".generate-plan-images-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
        os.chmod(tmp, os.stat(plan).st_mode & 0o777)
        os.replace(tmp, plan)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


# ---------------------------------------------------------------- self-test


SAMPLE = """<figure>
  <!-- image-slot:hero prompt="Wide minimal diagram of a plan artifact" -->
  <figcaption>The plan &mdash; <code>hero</code> shot.</figcaption>
  <!-- /image-slot:hero -->
</figure>
<figure>
  <!-- image-slot:problem prompt="Two flows diverging" -->
  <img src="data:image/webp;base64,AAAA" alt="old">
  <figcaption>Problem framing.</figcaption>
  <!-- /image-slot:problem -->
</figure>
<figure>
  <!-- image-slot:unit-3 prompt="A script filling slots" -->
  <figcaption>Unit 3.</figcaption>
  <!-- /image-slot:unit-3 -->
</figure>
<figure>
  <!-- image-slot:orphan prompt="No closer" -->
  <figcaption>Broken.</figcaption>
</figure>
<figure>
  <!-- image-slot:hyphens prompt="a --> b" -->
  <figcaption>Comment-breaking prompt.</figcaption>
  <!-- /image-slot:hyphens -->
</figure>
"""

INTERLEAVED = """<figure>
  <!-- image-slot:outer prompt="Outer" -->
  <!-- image-slot:inner prompt="Inner" -->
  <figcaption>Inner caption.</figcaption>
  <!-- /image-slot:inner -->
  <!-- /image-slot:outer -->
</figure>
"""


def self_test():
    slots, warnings = parse_slots(SAMPLE)

    assert [s["name"] for s in slots] == ["hero", "problem", "unit-3"], [s["name"] for s in slots]
    assert slots[0]["prompt"] == "Wide minimal diagram of a plan artifact"
    assert [s["filled"] for s in slots] == [False, True, False]
    assert len(warnings) == 2, warnings
    assert any("orphan" in w for w in warnings), warnings
    # A prompt containing `--` breaks the HTML comment in the browser even
    # though this parser reads across it — the slot must be refused.
    assert any("hyphens" in w and "--" in w for w in warnings), warnings

    # An opener nested before a slot's closer would be destroyed by a fill —
    # the outer slot is refused; the inner one still parses.
    islots, iwarnings = parse_slots(INTERLEAVED)
    assert [s["name"] for s in islots] == ["inner"], [s["name"] for s in islots]
    assert any("outer" in w and "refusing" in w for w in iwarnings), iwarnings

    # Default run targets only empty slots; filled ones are reported, not silent.
    targets, skipped, warns = select_targets(slots, None, None)
    assert targets == ["hero", "unit-3"], targets
    assert [s["slot"] for s in skipped] == ["problem"], skipped
    assert warns == []

    # --regenerate targets a filled slot.
    targets, skipped, warns = select_targets(slots, None, "problem")
    assert targets == ["problem"] and skipped == [] and warns == []

    # --slot on a filled slot skips rather than overwrites.
    targets, skipped, _ = select_targets(slots, "problem", None)
    assert targets == [] and skipped[0]["reason"].startswith("already filled")

    # Unknown slot names warn, never fail silently.
    _, _, warns = select_targets(slots, "nope", None)
    assert len(warns) == 1 and "nope" in warns[0]
    _, _, warns = select_targets(slots, None, "nope")
    assert len(warns) == 1 and "nope" in warns[0]

    # alt comes from the figcaption text, tags stripped, entities resolved.
    assert alt_text(slots[0]) == "The plan — hero shot.", alt_text(slots[0])

    # Filling an empty slot: one-line img, caption preserved, comment pair survives.
    filled = fill_slot(SAMPLE, slots[0], "QUJD")
    assert '<img src="data:image/webp;base64,QUJD" alt="The plan — hero shot.">' in filled
    assert "<!-- image-slot:hero" in filled and "<!-- /image-slot:hero -->" in filled
    assert "<figcaption>The plan &mdash; <code>hero</code> shot.</figcaption>" in filled
    img_lines = [ln for ln in filled.split("\n") if "base64,QUJD" in ln]
    assert len(img_lines) == 1, img_lines
    reparsed, _ = parse_slots(filled)
    assert reparsed[0]["filled"] is True

    # Regenerating a filled slot replaces the img, keeps exactly one.
    regen = fill_slot(SAMPLE, slots[1], "WllY")
    assert "base64,AAAA" not in regen
    assert regen.count("<img") == 1, regen.count("<img")
    assert "<figcaption>Problem framing.</figcaption>" in regen

    # --edit targets a filled slot; an empty one is skipped, not generated.
    targets, skipped, warns = select_edit_target(slots, "problem")
    assert targets == ["problem"] and skipped == [] and warns == []
    targets, skipped, _ = select_edit_target(slots, "hero")
    assert targets == [] and "empty" in skipped[0]["reason"], skipped
    _, _, warns = select_edit_target(slots, "nope")
    assert len(warns) == 1 and "nope" in warns[0]

    # A filled slot yields its embedded bytes; an empty one has none to edit.
    raw, subtype, reason = embedded_image(slots[1])
    assert raw == base64.b64decode("AAAA") and subtype == "webp" and reason is None
    _, _, reason = embedded_image(slots[0])
    assert reason and "no embedded" in reason, reason

    # An <img> pointing somewhere other than a data URI is not editable.
    external, _ = parse_slots(SAMPLE.replace('src="data:image/webp;base64,AAAA"', 'src="hero.webp"'))
    _, _, reason = embedded_image(external[1])
    assert reason and "no embedded" in reason, reason

    # An edit round-trips through fill_slot like any other write: one <img>,
    # caption and comment pair intact.
    edited = fill_slot(SAMPLE, slots[1], "RURJVA==")
    assert "base64,RURJVA==" in edited and edited.count("<img") == 1
    assert "<!-- /image-slot:problem -->" in edited
    reparsed_edit, _ = parse_slots(edited)
    assert embedded_image(reparsed_edit[1])[0] == base64.b64decode("RURJVA==")

    # The spend cap trims targets in order and accounts for every dropped slot.
    allowed, over = apply_cap(["a", "b", "c"], 2)
    assert allowed == ["a", "b"], allowed
    assert [o["slot"] for o in over] == ["c"], over
    assert "nothing was charged" in over[0]["reason"]

    # A cap at or above the target count is a no-op — no phantom skips.
    allowed, over = apply_cap(["a", "b"], 2)
    assert allowed == ["a", "b"] and over == []
    allowed, over = apply_cap(["a"], 8)
    assert allowed == ["a"] and over == []

    # Cap 0 dispatches nothing: a dry run that still names what it would cost.
    allowed, over = apply_cap(["a", "b"], 0)
    assert allowed == [] and [o["slot"] for o in over] == ["a", "b"], over

    # Multipart: every field is its own part, the image carries its subtype,
    # and the body is terminated by the closing boundary.
    body = multipart_body("BOUND", {"model": "gpt-image-2", "n": 1}, b"\x89PNGbytes", "webp")
    assert body.count(b"--BOUND") == 4, body  # 2 fields + 1 image + closer
    assert b'name="model"\r\n\r\ngpt-image-2\r\n' in body
    assert b'name="n"\r\n\r\n1\r\n' in body
    assert b'name="image"; filename="slot.webp"' in body
    assert b"Content-Type: image/webp" in body
    assert b"\x89PNGbytes" in body
    assert body.endswith(b"--BOUND--\r\n")

    print("self-test ok")
    return 0


# ---------------------------------------------------------------- main


def main():
    parser = argparse.ArgumentParser(
        description="Generate and embed an HTML plan's images.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("plan", nargs="?", type=Path, help="Path to the HTML plan file")
    parser.add_argument("--slot", help="Fill only this slot")
    parser.add_argument("--regenerate", help="Re-generate this slot even if already filled")
    parser.add_argument("--edit", help="Refine this slot's existing image in place (needs --instruction)")
    parser.add_argument("--instruction", help="The refinement to apply; required with --edit")
    parser.add_argument("--size", default=DEFAULT_SIZE, help="Image size WxH (default: %(default)s)")
    parser.add_argument("--quality", default=DEFAULT_QUALITY, choices=VALID_QUALITY, help="Quality tier (default: %(default)s)")
    parser.add_argument("--compression", type=int, default=DEFAULT_COMPRESSION, help="webp compression 0-100 (default: %(default)s)")
    parser.add_argument("--max-images", type=int, default=DEFAULT_MAX_IMAGES, help="Hard cap on paid API calls this run; 0 is a dry run (default: %(default)s)")
    parser.add_argument("--model", default=MODEL, help="Model id (default: %(default)s)")
    parser.add_argument("--self-test", action="store_true", help="Run offline parser checks and exit")
    args = parser.parse_args()

    if args.self_test:
        return self_test()

    if args.plan is None:
        parser.error("plan file is required (or pass --self-test)")
    selectors = [name for name, value in (("--slot", args.slot), ("--regenerate", args.regenerate), ("--edit", args.edit)) if value]
    if len(selectors) > 1:
        parser.error(" and ".join(selectors) + " are mutually exclusive; pass one")
    if args.edit and not args.instruction:
        parser.error("--edit requires --instruction describing the refinement to apply")
    if args.instruction and not args.edit:
        parser.error("--instruction is only valid with --edit")
    if not 0 <= args.compression <= 100:
        parser.error("--compression must be between 0 and 100")
    if args.max_images < 0:
        parser.error("--max-images must be 0 or greater (0 dispatches nothing)")
    plan = args.plan.expanduser()
    if not plan.is_file():
        sys.stderr.write("generate-plan-images: plan file not found: " + str(plan) + "\n")
        return 2

    content = plan.read_text(encoding="utf-8")
    slots, warnings = parse_slots(content)

    if args.edit:
        targets, skipped, select_warnings = select_edit_target(slots, args.edit)
    else:
        targets, skipped, select_warnings = select_targets(slots, args.slot, args.regenerate)
    warnings.extend(select_warnings)
    # The cap is enforced here, before the key check and before any request is
    # built, so an over-cap slot is never one bug away from being dispatched.
    targets, over_cap = apply_cap(targets, args.max_images)
    skipped.extend(over_cap)
    filled = []
    edited = []
    verb = "editing" if args.edit else "generating"

    def report():
        print(json.dumps({
            "slots_found": len(slots),
            "filled": filled,
            "edited": edited,
            "skipped": skipped,
            "warnings": warnings,
        }))
        return 0

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key and targets:
        action = "refine" if args.edit else "fill"
        for name in targets:
            skipped.append({"slot": name, "reason": "OPENAI_API_KEY is not set; re-run with the key to " + action + " this slot"})
        sys.stderr.write("OPENAI_API_KEY is not set - leaving " + str(len(targets)) + " slot(s) as placeholders.\n")
        return report()

    if over_cap:
        sys.stderr.write(
            "Run cap of " + str(args.max_images) + " image(s) reached - "
            + str(len(over_cap)) + " slot(s) left unfilled and uncharged.\n"
        )

    if targets:
        sys.stderr.write(
            verb.capitalize() + " " + str(len(targets)) + " image(s) with " + args.model + " at " + args.size + "...\n"
        )

    state = {"backed_up": False}
    for index, name in enumerate(targets, start=1):
        # Re-parse each pass: a prior fill shifted every later slot's offsets.
        slots_now, _ = parse_slots(content)
        slot = next((s for s in slots_now if s["name"] == name), None)
        if slot is None:
            warnings.append("slot '" + name + "' disappeared mid-run; skipped")
            continue

        sys.stderr.write("[" + str(index) + "/" + str(len(targets)) + "] " + name + ": " + verb + "...\n")
        if args.edit:
            image_bytes, subtype, reason = embedded_image(slot)
            if reason:
                b64 = None
            else:
                b64, reason = edit_image(
                    api_key, image_bytes, subtype, args.instruction,
                    args.model, args.size, args.quality, args.compression,
                )
        else:
            b64, reason = generate_image(api_key, slot["prompt"], args.model, args.size, args.quality, args.compression)
        if reason:
            sys.stderr.write("[" + str(index) + "/" + str(len(targets)) + "] " + name + ": skipped - " + reason + "\n")
            skipped.append({"slot": name, "reason": reason})
            continue

        new_content = fill_slot(content, slot, b64)
        try:
            backup_once(plan, state)
            atomic_write(plan, new_content)
        except OSError as e:
            # Read-only directory, full disk, permissions — degrade to a
            # per-slot skip like every other failure. Earlier successful
            # writes are already on disk; this fill is discarded.
            sys.stderr.write("[" + str(index) + "/" + str(len(targets)) + "] " + name + ": skipped - write failed: " + str(e) + "\n")
            skipped.append({"slot": name, "reason": "write failed: " + str(e)})
            continue
        content = new_content
        (edited if args.edit else filled).append(name)
        kib = (len(b64) * 3 // 4) // 1024
        sys.stderr.write("[" + str(index) + "/" + str(len(targets)) + "] " + name + ": embedded (~" + str(kib) + " KiB)\n")

    if not slots:
        warnings.append("no image slots found in " + str(plan))
    elif not targets and not args.slot and not args.regenerate and not args.edit:
        sys.stderr.write("Nothing to do - every slot is already filled.\n")

    return report()


if __name__ == "__main__":
    sys.exit(main())
