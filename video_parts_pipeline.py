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
import concurrent.futures
import json
import os
import subprocess
from pathlib import Path
from typing import Sequence

DEFAULT_MAX_GIF_KB = 5000
DEFAULT_TARGET_GIF_KB = 4500
DEFAULT_FEATURED_MAX_GIF_KB = 4500
DEFAULT_FEATURED_TARGET_GIF_KB = 4500
DEFAULT_FFMPEG_BIN = r"D:\ffmpeg\bin"
DEFAULT_PRESET = "workshop"
DEFAULT_FEATURED_WIDTH = 630
DEFAULT_MIN_GIF_FPS = 15
DEFAULT_PRECHECK_BPPF = 0.10
DEFAULT_PRECHECK_MARGIN_PCT = 10.0
DEFAULT_MAX_WORKERS = 0
DEFAULT_FFMPEG_THREADS = 0
DEFAULT_USE_NVIDIA = False


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


def env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return float(raw.strip())


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
    ffmpeg_threads: int,
    use_nvidia: bool,
) -> None:
    palette = output_gif.with_name(f"_{output_gif.stem}_palette.png")
    hwaccel_args = []
    if use_nvidia:
        hwaccel_args = [
            "-hwaccel",
            "cuda",
        ]
    run(
        [
            str(ffmpeg),
            "-y",
            "-threads",
            str(ffmpeg_threads),
            *hwaccel_args,
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
            "-threads",
            str(ffmpeg_threads),
            *hwaccel_args,
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
    min_gif_fps: int,
    max_gif_kb: int,
    target_gif_kb: int,
    ffmpeg_threads: int,
    use_nvidia: bool,
) -> tuple[float, bool, bool]:
    current_kb = file_kb(gif_path)
    if current_kb <= max_gif_kb:
        return current_kb, False, True

    changed = False
    reached_target = False
    tmp_gif = gif_path.with_name(f"_{gif_path.stem}_recompress.gif")

    fps_floor = max(1, min_gif_fps)
    fps_candidates = list(range(base_fps, fps_floor - 1, -1))
    if not fps_candidates:
        fps_candidates = [base_fps]
    colors_candidates = [224, 192, 160, 128, 96, 64, 48, 32]

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
            ffmpeg_threads=ffmpeg_threads,
            use_nvidia=use_nvidia,
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


def compute_target_height(src_w: int, src_h: int, total_target_w: int) -> int:
    return max(1, round(src_h * (total_target_w / src_w)))


def resolve_parallel_settings(
    parts: int,
    max_workers: int,
    ffmpeg_threads: int,
) -> tuple[int, int]:
    cpu_count = os.cpu_count() or 1
    if max_workers <= 0:
        workers = min(parts, cpu_count)
    else:
        workers = min(parts, max_workers)
    workers = max(1, workers)

    if ffmpeg_threads <= 0:
        threads = max(1, cpu_count // workers)
    else:
        threads = max(1, ffmpeg_threads)
    return workers, threads


def estimate_gif_kb(
    width: int,
    height: int,
    fps: int,
    duration: float,
    bppf: float,
) -> float:
    # bppf = bytes per pixel-frame in an optimistic compression scenario.
    pixel_frames = width * height * fps * duration
    return (pixel_frames * bppf) / 1024.0


def run_size_precheck(
    input_video: Path,
    src_w: int,
    src_h: int,
    duration: float,
    parts: int,
    part_width: int,
    min_gif_fps: int,
    max_gif_kb: int,
    precheck_bppf: float,
    precheck_margin_pct: float,
) -> None:
    total_target_w = parts * part_width
    target_h = compute_target_height(src_w, src_h, total_target_w)
    est_kb = estimate_gif_kb(
        width=part_width,
        height=target_h,
        fps=min_gif_fps,
        duration=duration,
        bppf=precheck_bppf,
    )
    allowed_kb = max_gif_kb * (1.0 + (precheck_margin_pct / 100.0))
    src_kb = input_video.stat().st_size / 1024.0

    print(
        "Precheck: "
        f"source={src_kb:.1f}KB, "
        f"estimated_min_output={est_kb:.1f}KB per GIF "
        f"(at {min_gif_fps}fps, bppf={precheck_bppf:.3f}), "
        f"allowed={allowed_kb:.1f}KB"
    )

    if est_kb > allowed_kb:
        raise RuntimeError(
            "Precheck failed: source video is likely too heavy for configured GIF limit. "
            f"Estimated minimum is {est_kb:.1f}KB per GIF, while limit is {max_gif_kb}KB "
            f"(margin {precheck_margin_pct:.1f}%). "
            f"Current FPS floor is GIF_MIN_FPS={min_gif_fps}. "
            "Use --skip-precheck to bypass."
        )


def make_gif_parts(
    ffmpeg: Path,
    input_video: Path,
    out_dir: Path,
    preset: str,
    src_w: int,
    src_h: int,
    duration: float,
    parts: int,
    part_width: int,
    gif_fps: int,
    min_gif_fps: int,
    apply_hex_patch: bool,
    hex_byte: int,
    max_gif_kb: int,
    target_gif_kb: int,
    max_workers: int,
    ffmpeg_threads: int,
    use_nvidia: bool,
) -> None:
    total_target_w = parts * part_width
    target_h = compute_target_height(src_w, src_h, total_target_w)
    workers, threads = resolve_parallel_settings(
        parts=parts,
        max_workers=max_workers,
        ffmpeg_threads=ffmpeg_threads,
    )

    out_dir.mkdir(parents=True, exist_ok=True)

    print(
        f"Input: {input_video.name} | {src_w}x{src_h} | {duration:.3f}s\n"
        f"Preset: {preset}\n"
        f"Rescale for slicing: {src_w}x{src_h} -> {total_target_w}x{target_h}\n"
        f"Output: {parts} GIFs, each {part_width}x{target_h}\n"
        f"Parallel: workers={workers}, ffmpeg_threads_per_job={threads}"
    )

    def build_one_part(i: int) -> tuple[int, str]:
        idx = i + 1
        x = i * part_width
        if parts == 1:
            gif_path = out_dir / "featured.gif"
        else:
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
            ffmpeg_threads=threads,
            use_nvidia=use_nvidia,
        )

        final_kb, recompressed, reached_target = enforce_gif_size_limit(
            ffmpeg=ffmpeg,
            input_video=input_video,
            gif_path=gif_path,
            base_filter=base_filter,
            base_fps=gif_fps,
            min_gif_fps=min_gif_fps,
            max_gif_kb=max_gif_kb,
            target_gif_kb=target_gif_kb,
            ffmpeg_threads=threads,
            use_nvidia=use_nvidia,
        )

        if final_kb > max_gif_kb:
            raise RuntimeError(
                f"Output GIF exceeds limit: {gif_path} is {final_kb:.1f}KB "
                f"(max {max_gif_kb}KB). "
                f"Current FPS floor is GIF_MIN_FPS={min_gif_fps}; "
                "lowering FPS below this floor is blocked. "
                "Adjust .env limits/FPS floor or reduce content."
            )

        if apply_hex_patch:
            old_byte, new_byte = patch_last_byte(gif_path, hex_byte)
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
            msg = (
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
            msg = f"  GIF: {gif_path} | {final_kb:.1f}KB | {status} | {limit_status}"
        return idx, msg

    if workers <= 1:
        for i in range(parts):
            _, msg = build_one_part(i)
            print(msg)
        return

    results: dict[int, str] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(build_one_part, i) for i in range(parts)]
        for fut in concurrent.futures.as_completed(futures):
            idx, msg = fut.result()
            results[idx] = msg
    for idx in sorted(results):
        print(results[idx])


def main() -> int:
    load_dotenv()
    default_parts = env_int("GIF_PARTS", 5)
    default_part_width = env_int("GIF_PART_WIDTH", 150)
    default_min_gif_fps = env_int("GIF_MIN_FPS", DEFAULT_MIN_GIF_FPS)
    default_precheck_enabled = env_bool("GIF_PRECHECK_ENABLED", True)
    default_precheck_bppf = env_float("GIF_PRECHECK_BPPF", DEFAULT_PRECHECK_BPPF)
    default_precheck_margin_pct = env_float(
        "GIF_PRECHECK_MARGIN_PCT", DEFAULT_PRECHECK_MARGIN_PCT
    )
    default_max_workers = env_int("GIF_MAX_WORKERS", DEFAULT_MAX_WORKERS)
    default_ffmpeg_threads = env_int("FFMPEG_THREADS", DEFAULT_FFMPEG_THREADS)
    default_use_nvidia = env_bool("USE_NVIDIA", DEFAULT_USE_NVIDIA)
    default_preset = os.getenv("GIF_PRESET", DEFAULT_PRESET).strip().lower()
    default_featured_width = env_int("FEATURED_ARTWORK_WIDTH", DEFAULT_FEATURED_WIDTH)
    default_gif_fps = env_int("GIF_FPS", 15)
    default_ffmpeg_bin = os.getenv("FFMPEG_BIN", DEFAULT_FFMPEG_BIN)
    default_workshop_max_gif_kb = env_int(
        "WORKSHOP_MAX_KB", env_int("GIF_MAX_KB", DEFAULT_MAX_GIF_KB)
    )
    default_workshop_target_gif_kb = env_int(
        "WORKSHOP_TARGET_KB", env_int("GIF_TARGET_KB", DEFAULT_TARGET_GIF_KB)
    )
    default_featured_max_gif_kb = env_int("FEATURED_MAX_KB", DEFAULT_FEATURED_MAX_GIF_KB)
    default_featured_target_gif_kb = env_int(
        "FEATURED_TARGET_KB", DEFAULT_FEATURED_TARGET_GIF_KB
    )
    default_hex_patch = env_bool("GIF_HEX_PATCH_ENABLED", True)
    default_hex_byte = parse_hex_byte(os.getenv("GIF_HEX_BYTE", "21"))

    parser = argparse.ArgumentParser(
        description="Create fixed-width GIF slices from one video."
    )
    parser.add_argument("--input", required=True, help="Input video path.")
    parser.add_argument(
        "--preset",
        choices=["workshop", "featured"],
        default=default_preset if default_preset in {"workshop", "featured"} else "workshop",
        help=(
            "Output preset: workshop=5x150 slices, featured=single 630px output "
            f"(default from .env GIF_PRESET={default_preset})."
        ),
    )
    parser.add_argument(
        "--parts",
        type=int,
        default=None,
        help=(
            "Number of GIF parts. If omitted, preset default is used "
            f"(workshop->{default_parts}, featured->1)."
        ),
    )
    parser.add_argument(
        "--part-width",
        type=int,
        default=None,
        help=(
            "Width of each GIF part (px). If omitted, preset default is used "
            f"(workshop->{default_part_width}, featured->{default_featured_width})."
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
        default=None,
        help=(
            "Hard upper GIF size limit in KB. If omitted, preset default is used "
            f"(workshop->{default_workshop_max_gif_kb}, featured->{default_featured_max_gif_kb})."
        ),
    )
    parser.add_argument(
        "--target-gif-kb",
        type=int,
        default=None,
        help=(
            "Compression target in KB if over limit. If omitted, preset default is used "
            f"(workshop->{default_workshop_target_gif_kb}, "
            f"featured->{default_featured_target_gif_kb})."
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
    parser.add_argument(
        "--max-workers",
        type=int,
        default=default_max_workers,
        help=(
            "Parallel jobs for part generation. 0 means auto "
            f"(default from .env GIF_MAX_WORKERS={default_max_workers})."
        ),
    )
    parser.add_argument(
        "--ffmpeg-threads",
        type=int,
        default=default_ffmpeg_threads,
        help=(
            "Threads per ffmpeg job. 0 means auto split across workers "
            f"(default from .env FFMPEG_THREADS={default_ffmpeg_threads})."
        ),
    )
    nvidia_group = parser.add_mutually_exclusive_group()
    nvidia_group.add_argument(
        "--use-nvidia",
        dest="use_nvidia",
        action="store_true",
        help=(
            "Enable NVIDIA CUDA hardware decode for ffmpeg input (optional; "
            "palette filters still run on CPU)."
        ),
    )
    nvidia_group.add_argument(
        "--no-use-nvidia",
        dest="use_nvidia",
        action="store_false",
        help="Disable NVIDIA CUDA hardware decode.",
    )
    parser.set_defaults(use_nvidia=default_use_nvidia)
    parser.add_argument(
        "--skip-precheck",
        action="store_true",
        help=(
            "Bypass early feasibility precheck. "
            "By default precheck is enabled (unless disabled via .env)."
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

    if args.preset == "featured":
        parts = args.parts if args.parts is not None else 1
        part_width = args.part_width if args.part_width is not None else default_featured_width
        max_gif_kb = (
            args.max_gif_kb
            if args.max_gif_kb is not None
            else default_featured_max_gif_kb
        )
        target_gif_kb = (
            args.target_gif_kb
            if args.target_gif_kb is not None
            else default_featured_target_gif_kb
        )
    else:
        parts = args.parts if args.parts is not None else default_parts
        part_width = args.part_width if args.part_width is not None else default_part_width
        max_gif_kb = (
            args.max_gif_kb
            if args.max_gif_kb is not None
            else default_workshop_max_gif_kb
        )
        target_gif_kb = (
            args.target_gif_kb
            if args.target_gif_kb is not None
            else default_workshop_target_gif_kb
        )

    if parts < 1:
        raise ValueError("--parts must be >= 1")
    if part_width < 1:
        raise ValueError("--part-width must be >= 1")
    if args.gif_fps < 1:
        raise ValueError("--gif-fps must be >= 1")
    if default_min_gif_fps < 1:
        raise ValueError("GIF_MIN_FPS in .env must be >= 1")
    if default_precheck_bppf <= 0:
        raise ValueError("GIF_PRECHECK_BPPF in .env must be > 0")
    if default_precheck_margin_pct < 0:
        raise ValueError("GIF_PRECHECK_MARGIN_PCT in .env must be >= 0")
    if args.max_workers < 0:
        raise ValueError("--max-workers must be >= 0")
    if args.ffmpeg_threads < 0:
        raise ValueError("--ffmpeg-threads must be >= 0")
    if args.gif_fps < default_min_gif_fps:
        raise ValueError(
            f"--gif-fps must be >= {default_min_gif_fps} (from .env GIF_MIN_FPS)"
        )
    if max_gif_kb < 1:
        raise ValueError("--max-gif-kb must be >= 1")
    if target_gif_kb < 1:
        raise ValueError("--target-gif-kb must be >= 1")
    if target_gif_kb > max_gif_kb:
        raise ValueError("--target-gif-kb must be <= --max-gif-kb")
    hex_byte = parse_hex_byte(args.hex_byte)
    src_w, src_h, duration = probe(ffprobe, input_video)

    precheck_enabled = default_precheck_enabled and not args.skip_precheck
    if precheck_enabled:
        run_size_precheck(
            input_video=input_video,
            src_w=src_w,
            src_h=src_h,
            duration=duration,
            parts=parts,
            part_width=part_width,
            min_gif_fps=default_min_gif_fps,
            max_gif_kb=max_gif_kb,
            precheck_bppf=default_precheck_bppf,
            precheck_margin_pct=default_precheck_margin_pct,
        )
    else:
        reason = "--skip-precheck" if args.skip_precheck else ".env GIF_PRECHECK_ENABLED=false"
        print(f"Precheck: skipped ({reason})")

    if args.out_dir:
        out_dir = Path(args.out_dir).resolve()
    else:
        out_dir = (input_video.parent / input_video.stem / "output").resolve()

    make_gif_parts(
        ffmpeg=ffmpeg,
        input_video=input_video,
        out_dir=out_dir,
        preset=args.preset,
        src_w=src_w,
        src_h=src_h,
        duration=duration,
        parts=parts,
        part_width=part_width,
        gif_fps=args.gif_fps,
        min_gif_fps=default_min_gif_fps,
        apply_hex_patch=args.hex_patch,
        hex_byte=hex_byte,
        max_gif_kb=max_gif_kb,
        target_gif_kb=target_gif_kb,
        max_workers=args.max_workers,
        ffmpeg_threads=args.ffmpeg_threads,
        use_nvidia=args.use_nvidia,
    )
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
