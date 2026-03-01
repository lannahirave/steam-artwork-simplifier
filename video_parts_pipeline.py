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
import os
import subprocess
from pathlib import Path
from typing import Sequence

DEFAULT_MAX_GIF_KB = 5000
DEFAULT_TARGET_GIF_KB = 4500
DEFAULT_FFMPEG_BIN = r"D:\ffmpeg\bin"


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
    val = raw.strip().lower()
    return val in {"1", "true", "yes", "on"}


def parse_hex_byte(value: str) -> int:
    raw = value.strip().lower()
    if raw.startswith("0x"):
        raw = raw[2:]
    num = int(raw, 16)
    if not 0 <= num <= 0xFF:
        raise ValueError("Hex byte must be between 00 and FF")
    return num


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


def file_kb(path: Path) -> float:
    return path.stat().st_size / 1024.0


def encode_gif_from_video(
    ffmpeg: Path,
    input_video: Path,
    output_gif: Path,
    vf: str,
    max_colors: int,
) -> None:
    palette = output_gif.with_name(f"_{output_gif.stem}_palette.png")
    run(
        [
            str(ffmpeg),
            "-y",
            "-i",
            str(input_video),
            "-vf",
            f"{vf},palettegen=max_colors={max_colors}:stats_mode=single",
            "-frames:v",
            "1",
            str(palette),
        ]
    )
    run(
        [
            str(ffmpeg),
            "-y",
            "-i",
            str(input_video),
            "-i",
            str(palette),
            "-lavfi",
            f"{vf}[x];[x][1:v]paletteuse=dither=sierra2_4a",
            str(output_gif),
        ]
    )
    if palette.exists():
        palette.unlink()


def enforce_gif_size_limit(
    ffmpeg: Path,
    input_video: Path,
    gif_path: Path,
    base_filter: str,
    base_fps: int,
    max_gif_kb: int,
    target_gif_kb: int,
) -> tuple[float, bool, bool]:
    current_kb = file_kb(gif_path)
    if current_kb <= max_gif_kb:
        return current_kb, False, True

    changed = False
    reached_target = False
    tmp_gif = gif_path.with_name(f"_{gif_path.stem}_recompress.gif")

    fps_candidates = [
        max(1, base_fps - 1),
        max(1, base_fps - 2),
        max(1, base_fps - 3),
        max(1, base_fps - 4),
        max(1, base_fps - 5),
        max(1, base_fps - 6),
        8,
        6,
    ]
    colors_candidates = [224, 192, 160, 128, 96, 64]

    seen: set[tuple[int, int]] = set()
    candidates: list[tuple[int, int]] = []
    for fps in fps_candidates:
        for colors in colors_candidates:
            pair = (fps, colors)
            if pair not in seen:
                seen.add(pair)
                candidates.append(pair)

    for fps, colors in candidates:
        vf = f"fps={fps},{base_filter}"
        encode_gif_from_video(
            ffmpeg=ffmpeg,
            input_video=input_video,
            output_gif=tmp_gif,
            vf=vf,
            max_colors=colors,
        )
        tmp_kb = file_kb(tmp_gif)
        if tmp_kb < current_kb:
            tmp_gif.replace(gif_path)
            current_kb = tmp_kb
            changed = True
            if current_kb <= target_gif_kb:
                reached_target = True
                break
        else:
            tmp_gif.unlink(missing_ok=True)

    tmp_gif.unlink(missing_ok=True)
    if not reached_target and current_kb <= target_gif_kb:
        reached_target = True
    return current_kb, changed, reached_target


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
    hex_byte: int,
    max_gif_kb: int,
    target_gif_kb: int,
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
        base_filter = (
            f"scale={total_target_w}:{target_h}:flags=lanczos,"
            f"crop={part_width}:{target_h}:{x}:0"
        )
        vf_initial = f"fps={gif_fps},{base_filter}"
        encode_gif_from_video(
            ffmpeg=ffmpeg,
            input_video=input_video,
            output_gif=gif_path,
            vf=vf_initial,
            max_colors=256,
        )

        final_kb, recompressed, reached_target = enforce_gif_size_limit(
            ffmpeg=ffmpeg,
            input_video=input_video,
            gif_path=gif_path,
            base_filter=base_filter,
            base_fps=gif_fps,
            max_gif_kb=max_gif_kb,
            target_gif_kb=target_gif_kb,
        )

        if apply_hex_patch:
            old_byte, new_byte = patch_last_byte(gif_path, hex_byte)
            status = (
                "recompressed" if recompressed else "original"
            )
            limit_status = (
                f"ok<={target_gif_kb}KB"
                if reached_target
                else (
                    f"ok<={max_gif_kb}KB"
                    if final_kb <= max_gif_kb
                    else f"still>{max_gif_kb}KB"
                )
            )
            print(
                f"  GIF: {gif_path} | {final_kb:.1f}KB | {status} | "
                f"{limit_status} | hex: {old_byte:02X}->{new_byte:02X}"
            )
        else:
            status = "recompressed" if recompressed else "original"
            limit_status = (
                f"ok<={target_gif_kb}KB"
                if reached_target
                else (
                    f"ok<={max_gif_kb}KB"
                    if final_kb <= max_gif_kb
                    else f"still>{max_gif_kb}KB"
                )
            )
            print(f"  GIF: {gif_path} | {final_kb:.1f}KB | {status} | {limit_status}")


def main() -> int:
    load_dotenv()
    default_parts = env_int("GIF_PARTS", 5)
    default_part_width = env_int("GIF_PART_WIDTH", 150)
    default_gif_fps = env_int("GIF_FPS", 15)
    default_ffmpeg_bin = os.getenv("FFMPEG_BIN", DEFAULT_FFMPEG_BIN)
    default_max_gif_kb = env_int("GIF_MAX_KB", DEFAULT_MAX_GIF_KB)
    default_target_gif_kb = env_int("GIF_TARGET_KB", DEFAULT_TARGET_GIF_KB)
    default_hex_patch = env_bool("GIF_HEX_PATCH_ENABLED", True)
    default_hex_byte = parse_hex_byte(os.getenv("GIF_HEX_BYTE", "21"))

    parser = argparse.ArgumentParser(
        description="Create fixed-width GIF slices from one video."
    )
    parser.add_argument("--input", required=True, help="Input video path.")
    parser.add_argument(
        "--parts",
        type=int,
        default=default_parts,
        help=f"Number of GIF parts (default from .env GIF_PARTS={default_parts}).",
    )
    parser.add_argument(
        "--part-width",
        type=int,
        default=default_part_width,
        help=(
            "Width of each GIF part (px) "
            f"(default from .env GIF_PART_WIDTH={default_part_width})."
        ),
    )
    parser.add_argument(
        "--gif-fps",
        type=int,
        default=default_gif_fps,
        help=f"GIF FPS (default from .env GIF_FPS={default_gif_fps}).",
    )
    hex_group = parser.add_mutually_exclusive_group()
    hex_group.add_argument(
        "--hex-patch",
        dest="hex_patch",
        action="store_true",
        help="Enable automatic last-byte hex patch.",
    )
    hex_group.add_argument(
        "--no-hex-patch",
        dest="hex_patch",
        action="store_false",
        help="Disable automatic last-byte hex patch.",
    )
    parser.set_defaults(hex_patch=default_hex_patch)
    parser.add_argument(
        "--hex-byte",
        default=f"{default_hex_byte:02X}",
        help="Hex byte for patching final GIF EOF (default from .env GIF_HEX_BYTE).",
    )
    parser.add_argument(
        "--max-gif-kb",
        type=int,
        default=default_max_gif_kb,
        help=(
            "Hard upper GIF size limit in KB "
            f"(default from .env GIF_MAX_KB={default_max_gif_kb})."
        ),
    )
    parser.add_argument(
        "--target-gif-kb",
        type=int,
        default=default_target_gif_kb,
        help=(
            "Compression target in KB if over limit "
            f"(default from .env GIF_TARGET_KB={default_target_gif_kb})."
        ),
    )
    parser.add_argument(
        "--ffmpeg-bin",
        default=default_ffmpeg_bin,
        help="Directory with ffmpeg.exe and ffprobe.exe (default from .env FFMPEG_BIN).",
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
    if args.max_gif_kb < 1:
        raise ValueError("--max-gif-kb must be >= 1")
    if args.target_gif_kb < 1:
        raise ValueError("--target-gif-kb must be >= 1")
    if args.target_gif_kb > args.max_gif_kb:
        raise ValueError("--target-gif-kb must be <= --max-gif-kb")
    hex_byte = parse_hex_byte(args.hex_byte)

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
        apply_hex_patch=args.hex_patch,
        hex_byte=hex_byte,
        max_gif_kb=args.max_gif_kb,
        target_gif_kb=args.target_gif_kb,
    )
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
