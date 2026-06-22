#!/usr/bin/env python3
"""
Separate header hex-edit tool for Steam artwork workflow.

What it edits in GIF files:
- Logical Screen Width  (bytes 6-7, little-endian)
- Logical Screen Height (bytes 8-9, little-endian)
- Optional EOF byte patch (default 0x21)
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Iterable, List


DEFAULT_EXTENSIONS = {".gif"}


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


def env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw.strip())


def env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def parse_hex_byte(value: str) -> int:
    raw = value.strip().lower().removeprefix("0x")
    if len(raw) == 0 or len(raw) > 2:
        raise argparse.ArgumentTypeError("Hex byte must be 1-2 hex chars (example: 21)")
    try:
        num = int(raw, 16)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"Invalid hex byte: {value}") from exc
    if not 0 <= num <= 0xFF:
        raise argparse.ArgumentTypeError("Hex byte must be between 00 and FF")
    return num


def parse_extensions(raw: str) -> set[str]:
    if raw.strip() == "*":
        return set()
    out = set()
    for part in raw.split(","):
        part = part.strip().lower()
        if not part:
            continue
        if not part.startswith("."):
            part = "." + part
        out.add(part)
    return out


def iter_targets(inputs: Iterable[Path], recursive: bool, extensions: set[str]) -> Iterable[Path]:
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


def read_gif_dims(raw: bytes) -> tuple[int, int]:
    if len(raw) < 10:
        raise ValueError("File is too small to be a valid GIF")
    sig = raw[:6]
    if sig not in (b"GIF87a", b"GIF89a"):
        raise ValueError("Not a GIF87a/GIF89a file")
    width = int.from_bytes(raw[6:8], byteorder="little")
    height = int.from_bytes(raw[8:10], byteorder="little")
    return width, height


def patch_gif_header(
    path: Path,
    width: int,
    height: int,
    eof_patch_enabled: bool,
    eof_byte: int,
    backup: bool,
    dry_run: bool,
) -> str:
    raw = path.read_bytes()
    old_w, old_h = read_gif_dims(raw)
    old_eof = raw[-1]

    if width == old_w and height == old_h and (not eof_patch_enabled or old_eof == eof_byte):
        return f"[ok] unchanged: {path} | {old_w}x{old_h} | eof={old_eof:02X}"

    if dry_run:
        eof_msg = f"{old_eof:02X}->{eof_byte:02X}" if eof_patch_enabled else f"{old_eof:02X} (no patch)"
        return f"[dry] {path} | {old_w}x{old_h}->{width}x{height} | eof {eof_msg}"

    if backup:
        backup_path = path.with_suffix(path.suffix + ".hex.bak")
        if not backup_path.exists():
            backup_path.write_bytes(raw)

    data = bytearray(raw)
    data[6:8] = width.to_bytes(2, byteorder="little", signed=False)
    data[8:10] = height.to_bytes(2, byteorder="little", signed=False)
    if eof_patch_enabled:
        data[-1] = eof_byte
    path.write_bytes(data)

    new_eof = data[-1]
    return (
        f"[patched] {path} | {old_w}x{old_h}->{width}x{height} | "
        f"eof {old_eof:02X}->{new_eof:02X}"
    )


def parse_args() -> argparse.Namespace:
    load_dotenv()
    default_width = env_int("HEX_HEADER_WIDTH", 1000)
    default_height = env_int("HEX_HEADER_HEIGHT", 1)
    default_eof_patch = env_bool("HEX_HEADER_EOF_PATCH_ENABLED", True)
    default_eof_byte = parse_hex_byte(os.getenv("HEX_HEADER_EOF_BYTE", "21"))
    default_backup = env_bool("HEX_HEADER_BACKUP_ENABLED", True)
    default_ext = os.getenv("HEX_HEADER_EXTENSIONS", ",".join(sorted(DEFAULT_EXTENSIONS)))

    parser = argparse.ArgumentParser(
        description="Patch GIF width/height header bytes + optional EOF byte."
    )
    parser.add_argument("paths", nargs="+", help="Files and/or directories to process.")
    parser.add_argument(
        "--width",
        type=int,
        default=default_width,
        help=f"Target GIF width (default from .env HEX_HEADER_WIDTH={default_width}).",
    )
    parser.add_argument(
        "--height",
        type=int,
        default=default_height,
        help=f"Target GIF height (default from .env HEX_HEADER_HEIGHT={default_height}).",
    )
    parser.add_argument(
        "--ext",
        default=default_ext,
        help=(
            "Comma-separated extension filter (example: .gif). "
            "Use '*' for all extensions."
        ),
    )
    parser.add_argument("--recursive", action="store_true", help="Recurse into directories.")

    eof_group = parser.add_mutually_exclusive_group()
    eof_group.add_argument("--eof-patch", dest="eof_patch", action="store_true")
    eof_group.add_argument("--no-eof-patch", dest="eof_patch", action="store_false")
    parser.set_defaults(eof_patch=default_eof_patch)

    parser.add_argument(
        "--byte",
        type=parse_hex_byte,
        default=default_eof_byte,
        help=f"EOF patch byte in hex (default from .env HEX_HEADER_EOF_BYTE={default_eof_byte:02X}).",
    )

    backup_group = parser.add_mutually_exclusive_group()
    backup_group.add_argument("--backup", dest="backup", action="store_true")
    backup_group.add_argument("--no-backup", dest="backup", action="store_false")
    parser.set_defaults(backup=default_backup)

    parser.add_argument("--dry-run", action="store_true", help="Show changes without writing.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not (1 <= args.width <= 65535):
        raise ValueError("--width must be in range 1..65535")
    if not (1 <= args.height <= 65535):
        raise ValueError("--height must be in range 1..65535")

    exts = parse_extensions(args.ext)
    paths: List[Path] = [Path(p) for p in args.paths]
    files = list(iter_targets(paths, recursive=args.recursive, extensions=exts))

    if not files:
        print("No matching files found.")
        return 1

    patched = 0
    for f in files:
        try:
            msg = patch_gif_header(
                path=f,
                width=args.width,
                height=args.height,
                eof_patch_enabled=args.eof_patch,
                eof_byte=args.byte,
                backup=args.backup,
                dry_run=args.dry_run,
            )
            print(msg)
            if msg.startswith("[patched]"):
                patched += 1
        except Exception as exc:  # noqa: BLE001
            print(f"[error] {f}: {exc}")

    print(f"\nProcessed: {len(files)} file(s). Patched: {patched}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
