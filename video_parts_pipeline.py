#!/usr/bin/env python3
"""
Create N GIF slices from one video for Steam workshop layout.

Behavior:
- Each GIF has exact width (--part-width, default 150)
- Video is rescaled to total width (parts * part-width) with aspect ratio preserved
- Output is a single directory containing only final GIF files
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Sequence


def run(cmd: Sequence[str]) -> str:
    try:
        proc = subprocess.run(cmd, check=True, capture_output=True, text=True)
        return proc.stdout
    except subprocess.CalledProcessError as exc:
        msg = (exc.stderr or exc.stdout or "").strip()
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{msg}") from exc


def patch_last_byte(path: Path, byte_value: int = 0x21) -> tuple[int, int]:
    data = path.read_bytes()
    if not data:
        raise ValueError(f"Cannot patch empty file: {path}")
    old = data[-1]
    if old == byte_value:
        return old, old
    patched = bytearray(data)
    patched[-1] = byte_value
    path.write_bytes(patched)
    return old, byte_value


def probe(ffprobe: Path, input_video: Path) -> tuple[int, int, float]:
    cmd = [
        str(ffprobe),
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,duration",
        "-of",
        "json",
        str(input_video),
    ]
    data = json.loads(run(cmd))
    stream = data["streams"][0]
    width = int(stream["width"])
    height = int(stream["height"])
    duration = float(stream.get("duration", 0.0))
    return width, height, duration


def make_gif_parts(
    ffmpeg: Path,
    input_video: Path,
    out_dir: Path,
    parts: int,
    part_width: int,
    gif_fps: int,
    apply_hex_patch: bool,
) -> None:
    src_w, src_h, duration = probe(ffmpeg.parent / "ffprobe.exe", input_video)
    total_target_w = parts * part_width
    target_h = max(1, round(src_h * (total_target_w / src_w)))

    out_dir.mkdir(parents=True, exist_ok=True)

    print(
        f"Input: {input_video.name} | {src_w}x{src_h} | {duration:.3f}s\n"
        f"Rescale for slicing: {src_w}x{src_h} -> {total_target_w}x{target_h}\n"
        f"Output: {parts} GIFs, each {part_width}x{target_h}"
    )

    for i in range(parts):
        idx = i + 1
        x = i * part_width
        gif_path = out_dir / f"part_{idx:02d}.gif"
        pal_path = out_dir / f"_palette_{idx:02d}.png"

        vf_base = (
            f"fps={gif_fps},"
            f"scale={total_target_w}:{target_h}:flags=lanczos,"
            f"crop={part_width}:{target_h}:{x}:0"
        )

        run(
            [
                str(ffmpeg),
                "-y",
                "-i",
                str(input_video),
                "-vf",
                f"{vf_base},palettegen=stats_mode=single",
                "-frames:v",
                "1",
                str(pal_path),
            ]
        )

        run(
            [
                str(ffmpeg),
                "-y",
                "-i",
                str(input_video),
                "-i",
                str(pal_path),
                "-lavfi",
                f"{vf_base}[x];[x][1:v]paletteuse=dither=sierra2_4a",
                str(gif_path),
            ]
        )

        if pal_path.exists():
            pal_path.unlink()

        if apply_hex_patch:
            old_byte, new_byte = patch_last_byte(gif_path, 0x21)
            print(f"  GIF: {gif_path} | hex: {old_byte:02X}->{new_byte:02X}")
        else:
            print(f"  GIF: {gif_path}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create fixed-width GIF slices from one video."
    )
    parser.add_argument("--input", required=True, help="Input video path.")
    parser.add_argument("--parts", type=int, default=5, help="Number of GIF parts.")
    parser.add_argument(
        "--part-width", type=int, default=150, help="Width of each GIF part (px)."
    )
    parser.add_argument("--gif-fps", type=int, default=15, help="GIF FPS.")
    parser.add_argument(
        "--no-hex-patch",
        action="store_true",
        help="Disable automatic last-byte hex patch (default is enabled).",
    )
    parser.add_argument(
        "--ffmpeg-bin",
        default=r"D:\ffmpeg\bin",
        help=r"Directory with ffmpeg.exe and ffprobe.exe (default: D:\ffmpeg\bin).",
    )
    parser.add_argument(
        "--out-dir",
        default=None,
        help=(
            "Single output directory for final GIFs only. "
            "Default: <input_stem>/output"
        ),
    )
    args = parser.parse_args()

    input_video = Path(args.input).resolve()
    ffmpeg = Path(args.ffmpeg_bin) / "ffmpeg.exe"
    ffprobe = Path(args.ffmpeg_bin) / "ffprobe.exe"

    if not input_video.exists():
        raise FileNotFoundError(f"Input file not found: {input_video}")
    if not ffmpeg.exists():
        raise FileNotFoundError(f"ffmpeg not found: {ffmpeg}")
    if not ffprobe.exists():
        raise FileNotFoundError(f"ffprobe not found: {ffprobe}")
    if args.parts < 2:
        raise ValueError("--parts must be >= 2")
    if args.part_width < 1:
        raise ValueError("--part-width must be >= 1")
    if args.gif_fps < 1:
        raise ValueError("--gif-fps must be >= 1")

    if args.out_dir:
        out_dir = Path(args.out_dir).resolve()
    else:
        out_dir = (input_video.parent / input_video.stem / "output").resolve()

    make_gif_parts(
        ffmpeg=ffmpeg,
        input_video=input_video,
        out_dir=out_dir,
        parts=args.parts,
        part_width=args.part_width,
        gif_fps=args.gif_fps,
        apply_hex_patch=not args.no_hex_patch,
    )
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
