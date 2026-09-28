#!/usr/bin/env python3
"""
Server-side safety net for portfolio photo uploads.

Runs in CI on every push that touches assets/img/portfolio/. For each
image added or modified in that push, it resizes to fit within
1920x1920 and re-encodes as WebP (quality 82) -- mirroring (and
backstopping) the CMS's own in-browser auto-compression, which
occasionally never fires if the admin tab is holding a stale config.

Watermarking is no longer applied here -- photos are watermarked
before upload now, so this only resizes/re-encodes.

Only processes files that changed in THIS push, so previously
published photos are never touched retroactively.

Also backfills a `slug:` front-matter field (letters/digits only, no
separators) on any _portfolio post that doesn't have one yet, so every
new case post -- however it's added -- gets a URL like
/projects/gamex80주년기념식/ instead of Jekyll's default hyphenated
:slug output. This step runs on every invocation, independent of
whether any photos changed.
"""
import glob
import os
import random
import re
import string
import subprocess
import sys

from PIL import Image

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTFOLIO_DIR = os.path.join(REPO_ROOT, "assets", "img", "portfolio")
PORTFOLIO_MD_GLOB = os.path.join(REPO_ROOT, "_portfolio", "*.md")

MAX_DIM = 1920
QUALITY = 82
INPUT_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
RANDOM_NAME_LENGTH = 10


def random_filename(taken):
    """A random lowercase-alphanumeric basename (no extension), so the
    downloaded file never reveals the original upload filename."""
    while True:
        name = "".join(random.choices(string.ascii_lowercase + string.digits, k=RANDOM_NAME_LENGTH))
        if name not in taken:
            taken.add(name)
            return name


def changed_portfolio_files(before_sha, after_sha):
    """Files added/modified under assets/img/portfolio/ in this push.

    Uses -z (NUL-separated, unquoted) output -- plain --name-only wraps any
    path containing a space or non-ASCII byte in quotes with octal escapes,
    which silently breaks lookup for filenames like "ChatGPT Image ....webp".
    """
    result = subprocess.run(
        ["git", "diff", "--name-only", "-z", "--diff-filter=ACMR", before_sha, after_sha,
         "--", "assets/img/portfolio/"],
        cwd=REPO_ROOT, capture_output=True, check=True,
    )
    files = [p.decode("utf-8") for p in result.stdout.split(b"\x00") if p]
    return [f for f in files if os.path.splitext(f)[1].lower() in INPUT_EXTS]


def resize(im):
    im = im.convert("RGB")
    w, h = im.size

    scale = min(MAX_DIM / w, MAX_DIM / h, 1.0)
    if scale < 1.0:
        im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)

    return im


def process_file(rel_path, taken_names):
    abs_path = os.path.join(REPO_ROOT, rel_path)
    if not os.path.exists(abs_path):
        print(f"skip (deleted before processing): {rel_path}")
        return None

    try:
        im = Image.open(abs_path)
        im.load()
    except Exception as e:
        print(f"skip (unreadable image): {rel_path} ({e})")
        return None

    out = resize(im)

    new_name = random_filename(taken_names) + ".webp"
    new_abs_path = os.path.join(os.path.dirname(abs_path), new_name)

    out.save(new_abs_path, "WEBP", quality=QUALITY, method=6)

    if new_abs_path != abs_path:
        os.remove(abs_path)

    old_rel = "/" + os.path.relpath(abs_path, REPO_ROOT)
    new_rel = "/" + os.path.relpath(new_abs_path, REPO_ROOT)
    print(f"processed: {old_rel} -> {new_rel}")
    return (old_rel, new_rel)


def no_sep_slugify(name):
    """Strip every non-alphanumeric character (unicode-aware) instead of
    collapsing runs to a hyphen -- 'gamex-80주년-기념식' -> 'gamex80주년기념식'."""
    return re.sub(r"[\W_]+", "", name, flags=re.UNICODE).lower()


SLUG_LINE_RE = re.compile(r"^slug:[ \t]*(.*)$")


def _front_matter_slug_value(front_matter_text):
    """Returns (line_index, stripped_value) for the slug: line if present,
    else None. Strips surrounding quotes so slug: '' / slug: "" / slug:
    (nothing) are all correctly seen as empty, not as "already set"."""
    lines = front_matter_text.splitlines()
    for i, line in enumerate(lines):
        m = SLUG_LINE_RE.match(line)
        if not m:
            continue
        val = m.group(1).strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
            val = val[1:-1]
        return i, val
    return None


def _unique_slug(base_slug, taken):
    """base_slug if free, else base_slug + '2', '3', ... -- since separators
    are stripped entirely, two differently-named posts can coincidentally
    collapse to the same slug (e.g. 'some-title' and 'sometitle')."""
    if base_slug not in taken:
        return base_slug
    n = 2
    while f"{base_slug}{n}" in taken:
        n += 1
    return f"{base_slug}{n}"


def ensure_slugs():
    """Give every portfolio post a real (non-empty) slug: value. Handles
    three cases: no slug: line at all (Jekyll CMS-created posts before this
    field existed), a slug: line left blank by the CMS's hidden-field
    widget on a brand-new post, or an already-populated slug: (skipped).
    New slugs are deduplicated against every slug already in use (existing
    posts plus any assigned earlier in this same run). Idempotent."""
    entries = []
    taken = set()
    for md_path in glob.glob(PORTFOLIO_MD_GLOB):
        text = open(md_path, encoding="utf-8").read()
        parts = text.split("---", 2)
        if len(parts) < 3:
            continue
        found = _front_matter_slug_value(parts[1])
        if found is not None and found[1]:
            taken.add(found[1])
        entries.append((md_path, parts, found))

    updated = []
    for md_path, parts, found in entries:
        if found is not None and found[1]:
            continue  # already has a real value

        front = parts[1]
        raw_name = os.path.splitext(os.path.basename(md_path))[0]
        slug = _unique_slug(no_sep_slugify(raw_name), taken)
        taken.add(slug)

        front_lines = front.splitlines()
        if found is not None:
            front_lines[found[0]] = f"slug: {slug}"
        elif front_lines and front_lines[0] == "":
            # front[0] is the blank placeholder from splitting right after
            # the opening '---\n' -- fill it in instead of inserting a new
            # line before it (which would leave a stray blank line).
            front_lines[0] = f"slug: {slug}"
        else:
            front_lines.insert(0, f"slug: {slug}")
        new_front = "\n".join(front_lines)
        if not new_front.startswith("\n"):
            new_front = "\n" + new_front
        if not new_front.endswith("\n"):
            new_front += "\n"
        new_text = "---" + new_front + "---" + parts[2]

        open(md_path, "w", encoding="utf-8").write(new_text)
        updated.append(md_path)
        print(f"set slug: {slug} in {os.path.relpath(md_path, REPO_ROOT)}")
    return updated


def update_markdown_references(renames):
    if not renames:
        return
    for md_path in glob.glob(PORTFOLIO_MD_GLOB):
        text = open(md_path, encoding="utf-8").read()
        new_text = text
        for old_rel, new_rel in renames:
            if old_rel == new_rel:
                continue
            new_text = new_text.replace(old_rel, new_rel)
        if new_text != text:
            open(md_path, "w", encoding="utf-8").write(new_text)
            print(f"updated references in: {os.path.relpath(md_path, REPO_ROOT)}")


def main():
    if len(sys.argv) != 3:
        print("usage: optimize_portfolio_images.py <before_sha> <after_sha>", file=sys.stderr)
        sys.exit(1)

    before_sha, after_sha = sys.argv[1], sys.argv[2]

    slugged = ensure_slugs()

    files = changed_portfolio_files(before_sha, after_sha)
    if not files:
        print("no new/modified portfolio images in this push")
        print(f"done: 0 image(s) processed, {len(slugged)} slug(s) backfilled")
        return

    taken_names = {os.path.splitext(f)[0] for f in os.listdir(PORTFOLIO_DIR)}

    renames = []
    for rel_path in files:
        result = process_file(rel_path, taken_names)
        if result:
            renames.append(result)

    update_markdown_references(renames)

    print(f"done: {len(renames)} image(s) processed, {len(slugged)} slug(s) backfilled")


if __name__ == "__main__":
    main()
