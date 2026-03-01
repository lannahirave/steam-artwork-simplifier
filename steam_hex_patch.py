#!/usr/bin/env python3
"""
Patch the last byte of artwork files (guide "hex thing" for Steam workshop uploads).

Default behavior:
- Sets the final byte to 0x21
- Creates a .bak backup before modifying each file
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable, List


DEFAULT_EXTENSIONS = {".gif", ".png", ".jpg", ".jpeg", ".webm", ".mp4"}


def parse_hex_byte(value: str) -> int:
    value = value.strip().lower().removeprefix("0x")
    if len(value) == 0 or len(value) > 2:
        raise argparse.ArgumentTypeError("Hex byte must be 1-2 hex chars, e.g. 21")
    try:
        num = int(value, 16)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"Invalid hex byte: {value}") from exc
    if not 0 <= num <= 0xFF:
        raise argparse.ArgumentTypeError("Hex byte must be between 00 and FF")
    return num


def iter_targets(
    inputs: Iterable[Path], recursive: bool, extensions: set[str]
) -> Iterable[Path]:
    for p in inputs:
        if p.is_file():
            if not extensions or p.suffix.lower() in extensions:
                yield p
            continue

        if p.is_dir():
            walker = p.rglob("*") if recursive else p.glob("*")
            for item in walker:
                if item.is_file() and (not extensions or item.suffix.lower() in extensions):
                    yield item
            continue

        print(f"[skip] not found: {p}")


def patch_last_byte(path: Path, new_byte: int, backup: bool, dry_run: bool) -> str:
    raw = path.read_bytes()
    if not raw:
        return f"[skip] empty file: {path}"

    old = raw[-1]
    if old == new_byte:
        return f"[ok] unchanged (already {new_byte:02X}): {path}"

    if dry_run:
        return f"[dry] {path} : {old:02X} -> {new_byte:02X}"

    if backup:
        backup_path = path.with_suffix(path.suffix + ".bak")
        if not backup_path.exists():
            backup_path.write_bytes(raw)

    patched = bytearray(raw)
    patched[-1] = new_byte
    path.write_bytes(patched)
    return f"[patched] {path} : {old:02X} -> {new_byte:02X}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Patch the last byte of image/video files (default: 0x21)."
    )
    parser.add_argument(
        "paths",
        nargs="+",
        help="Files and/or directories to process.",
    )
    parser.add_argument(
        "--recursive",
        action="store_true",
        help="Recurse into directories.",
    )
    parser.add_argument(
        "--ext",
        default=",".join(sorted(DEFAULT_EXTENSIONS)),
        help=(
            "Comma-separated extensions filter (example: .gif,.png). "
            "Use '*' to process any extension."
        ),
    )
    parser.add_argument(
        "--byte",
        type=parse_hex_byte,
        default=parse_hex_byte("21"),
        help="Hex byte to write at EOF (default: 21).",
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="Do not create .bak backups.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would change without writing files.",
    )
    return parser.parse_args()


def parse_extensions(raw: str) -> set[str]:
    raw = raw.strip()
    if raw == "*":
        return set()
    exts = set()
    for part in raw.split(","):
        part = part.strip().lower()
        if not part:
            continue
        if not part.startswith("."):
            part = "." + part
        exts.add(part)
    return exts


def main() -> int:
    args = parse_args()
    extensions = parse_extensions(args.ext)
    paths: List[Path] = [Path(p) for p in args.paths]
    files = list(iter_targets(paths, recursive=args.recursive, extensions=extensions))

    if not files:
        print("No matching files found.")
        return 1

    patched_count = 0
    for f in files:
        try:
            message = patch_last_byte(
                f,
                new_byte=args.byte,
                backup=not args.no_backup,
                dry_run=args.dry_run,
            )
            print(message)
            if message.startswith("[patched]"):
                patched_count += 1
        except Exception as exc:  # noqa: BLE001
            print(f"[error] {f}: {exc}")

    print(f"\nProcessed: {len(files)} file(s). Patched: {patched_count}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
