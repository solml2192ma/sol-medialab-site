#!/usr/bin/env python3
"""
Server-side safety net for portfolio photo uploads.

Runs in CI on every push that touches assets/img/portfolio/. For each
image added or modified in that push, it resizes to fit within
1920x1920, stamps the company logo on the bottom-left corner, and
re-encodes as WebP (quality 82) -- mirroring (and backstopping) the
CMS's own in-browser auto-compression, which occasionally never fires
if the admin tab is holding a stale config.

Only processes files that changed in THIS push, so previously
published photos are never touched retroactively.
"""
import glob
import os
import random
import string
import subprocess
import sys

from PIL import Image

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTFOLIO_DIR = os.path.join(REPO_ROOT, "assets", "img", "portfolio")
LOGO_PATH = os.path.join(REPO_ROOT, "assets", "img", "watermark-logo.png")
PORTFOLIO_MD_GLOB = os.path.join(REPO_ROOT, "_portfolio", "*.md")

MAX_DIM = 1920
QUALITY = 82
LOGO_WIDTH_RATIO = 0.19
MARGIN_RATIO = 0.03
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


def watermark_and_resize(im, logo):
    im = im.convert("RGBA")
    w, h = im.size

    scale = min(MAX_DIM / w, MAX_DIM / h, 1.0)
    if scale < 1.0:
        im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
        w, h = im.size

    target_w = round(w * LOGO_WIDTH_RATIO)
    logo_scale = target_w / logo.width
    target_h = round(logo.height * logo_scale)
    logo_r = logo.resize((target_w, target_h), Image.LANCZOS)

    margin = round(w * MARGIN_RATIO)
    x = w - target_w - margin
    y = h - target_h - margin

    im.alpha_composite(logo_r, (x, y))
    return im.convert("RGB")


def process_file(rel_path, logo, taken_names):
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

    out = watermark_and_resize(im, logo)

    new_name = random_filename(taken_names) + ".webp"
    new_abs_path = os.path.join(os.path.dirname(abs_path), new_name)

    out.save(new_abs_path, "WEBP", quality=QUALITY, method=6)

    if new_abs_path != abs_path:
        os.remove(abs_path)

    old_rel = "/" + os.path.relpath(abs_path, REPO_ROOT)
    new_rel = "/" + os.path.relpath(new_abs_path, REPO_ROOT)
    print(f"processed: {old_rel} -> {new_rel}")
    return (old_rel, new_rel)


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
    files = changed_portfolio_files(before_sha, after_sha)

    if not files:
        print("no new/modified portfolio images in this push")
        return

    logo = Image.open(LOGO_PATH).convert("RGBA")
    taken_names = {os.path.splitext(f)[0] for f in os.listdir(PORTFOLIO_DIR)}

    renames = []
    for rel_path in files:
        result = process_file(rel_path, logo, taken_names)
        if result:
            renames.append(result)

    update_markdown_references(renames)

    print(f"done: {len(renames)} image(s) processed")


if __name__ == "__main__":
    main()
