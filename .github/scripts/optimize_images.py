"""Shrink photos uploaded through Pages CMS so the site stays fast.

- Resizes photos larger than MAX_SIDE pixels and re-saves them compressed.
- Fixes phone rotation (EXIF orientation).
- Converts iPhone HEIC photos to JPG and updates the references in _data/*.json.

Usage: python optimize_images.py <file> [<file> ...]
"""
import os
import sys
from pathlib import Path

from PIL import Image, ImageOps

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:  # HEIC support is optional
    pass

MAX_SIDE = 1800
MAX_BYTES = 450_000
UPLOADS = Path("images/uploads")
DATA_DIR = Path("_data")


def replace_reference(old: Path, new: Path) -> None:
    for yml in DATA_DIR.glob("*.json"):
        text = yml.read_text(encoding="utf-8")
        updated = text.replace(old.as_posix(), new.as_posix())
        if updated != text:
            yml.write_text(updated, encoding="utf-8")


def optimize(path: Path) -> None:
    ext = path.suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".heic"} or not path.exists():
        return
    size_before = path.stat().st_size
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        too_big = max(im.size) > MAX_SIDE or size_before > MAX_BYTES
        if ext != ".heic" and not too_big:
            print(f"ok      {path} ({size_before // 1024} KB)")
            return
        im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
        target = path
        if ext == ".heic":
            target = path.with_suffix(".jpg")
        if target.suffix.lower() in {".jpg", ".jpeg"}:
            im.convert("RGB").save(target, "JPEG", quality=82, optimize=True, progressive=True)
        elif target.suffix.lower() == ".webp":
            im.save(target, "WEBP", quality=82, method=6)
        else:
            im.save(target, "PNG", optimize=True)
    if target != path:
        path.unlink()
        replace_reference(path, target)
    print(f"resized {path} -> {target} ({size_before // 1024} KB -> {target.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    files = [Path(f) for f in sys.argv[1:]] or sorted(UPLOADS.glob("*"))
    for f in files:
        if UPLOADS in f.parents:
            optimize(f)
