#!/usr/bin/env python3
"""
Patch the last byte of artwork files (guide "hex thing" for Steam workshop uploads).

Default behavior:
- Sets the final byte to 0x21
- Creates a .bak backup before modifying each file
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Iterable, List


DEFAULT_EXTENSIONS = {".gif", ".png", ".jpg", ".jpeg", ".webm", ".mp4"}


def load_dotenv() -> None:
    script_dir = Path(__file__).resolve().parent
    candidates = [Path.cwd() / ".env", script_dir / ".env"]
    seen: set[Path] = set()
    for env_path in candidates:
        env_path = env_path.resolve()
        if env_path in seen or not env_path.exists():
            continue
        seen.add(env_path)
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


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
    load_dotenv()
    ext_default = os.getenv("HEX_DEFAULT_EXTENSIONS", ",".join(sorted(DEFAULT_EXTENSIONS)))
    byte_default = parse_hex_byte(os.getenv("HEX_DEFAULT_BYTE", "21"))
    backup_default = env_bool("HEX_BACKUP_ENABLED", True)

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
        default=ext_default,
        help=(
            "Comma-separated extensions filter (example: .gif,.png). "
            "Use '*' to process any extension."
        ),
    )
    parser.add_argument(
        "--byte",
        type=parse_hex_byte,
        default=byte_default,
        help="Hex byte to write at EOF (default: 21).",
    )
    backup_group = parser.add_mutually_exclusive_group()
    backup_group.add_argument(
        "--backup",
        dest="backup",
        action="store_true",
        help="Create .bak backups before patching.",
    )
    backup_group.add_argument(
        "--no-backup",
        dest="backup",
        action="store_false",
        help="Do not create .bak backups.",
    )
    parser.set_defaults(backup=backup_default)
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
                backup=args.backup,
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
