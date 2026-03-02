# Steam Artwork Toolkit

Utility scripts and docs for preparing Steam profile artwork assets:
- workshop showcase slices (multi-part GIFs)
- featured artwork (single wide GIF)
- optional hex patching workflows used in this repo

This repository now includes two paths:
- Legacy CLI tooling (Python scripts in repo root)
- New browser app (`web/`) built with TypeScript + React 19 + FFmpeg WASM

## What is included

- `web/`: browser-only toolkit (React 19 + TypeScript + ffmpeg.wasm) with conversion UI, patch tools, preview, and ZIP export.
- `video_parts_pipeline.py`: builds GIFs from a source video using `ffmpeg`/`ffprobe`, with size checks and optional EOF-byte patching.
- `steam_hex_patch.py`: patches the last byte of target files (default `0x21`), with backup and dry-run support.
- `steam_hex_edit_header.py`: edits GIF header width/height bytes (`6-9`) and optional EOF byte.
- `autofill/*.js`: browser console helpers for Steam upload forms.
- `information/*.md`: workflow docs for workshop, featured artwork, and header hex-edit.

## New Web App (`web/`)

```bash
cd .\web
npm install
npm run dev
```

Notes:
- Requires cross-origin isolation headers for fast ffmpeg.wasm mode.
- The Vite dev/preview config in `web/vite.config.ts` already sets:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
- Full web app docs: `web/README.md`

## Requirements

- Python `3.9+`
- `ffmpeg.exe` and `ffprobe.exe`
- Windows PowerShell (examples here use Windows paths)

Download links:
- Python (Windows): https://www.python.org/downloads/windows/
- FFmpeg builds (Windows): https://www.gyan.dev/ffmpeg/builds/
- FFmpeg official site: https://ffmpeg.org/download.html

No third-party Python packages are required.

## Quick start

```bash
# Workshop preset (default: 5 parts, 150px each)
python video_parts_pipeline.py --input .\media\my_video.mp4 --preset workshop

# Featured preset (default: single 630px GIF)
python video_parts_pipeline.py --input .\media\my_video.mp4 --preset featured
```

Optional tools:

```bash
# Patch EOF byte on matching files
python steam_hex_patch.py .\media\my_video\output --recursive

# Patch GIF header dimensions for featured upload workflow
python steam_hex_edit_header.py .\media\my_video\output\featured.gif --width 1000 --height 1
```

## Configuration (`.env`)

Scripts load `.env` from the current directory (or script directory). Common keys:

```env
FFMPEG_BIN=<path-to-ffmpeg-bin>
GIF_PRESET=workshop
GIF_FPS=15
GIF_MIN_FPS=15
GIF_PRECHECK_ENABLED=true
GIF_HEX_PATCH_ENABLED=true
GIF_HEX_BYTE=21
GIF_MAX_WORKERS=0
FFMPEG_THREADS=0
USE_NVIDIA=false
GIF_LOSSY_OVERSIZE_ENABLED=true
GIF_LOSSY_LEVEL=2
GIF_LOSSY_MAX_ATTEMPTS=24
```

`CLI` arguments override `.env` values.

Performance notes:
- `GIF_MAX_WORKERS=0` means auto parallel jobs (up to CPU core count / part count).
- `FFMPEG_THREADS=0` means auto thread split per job to keep CPU close to full utilization.
- `USE_NVIDIA=false` keeps CPU-only mode by default; set `true` or pass `--use-nvidia` to enable CUDA decode.
- `GIF_LOSSY_OVERSIZE_ENABLED=true` enables an extra lossy fallback only when GIF is still above `MAX_KB`.
- `GIF_LOSSY_LEVEL` controls fallback strength (`1..3`), `GIF_LOSSY_MAX_ATTEMPTS` caps extra encode attempts.
- CLI override example:
  - `python video_parts_pipeline.py --input .\media\my_video.mp4 --preset workshop --max-workers 0 --ffmpeg-threads 0`
  - `python video_parts_pipeline.py --input .\media\my_video.mp4 --preset workshop --use-nvidia`
  - `python video_parts_pipeline.py --input .\media\my_video.mp4 --preset workshop --lossy-oversize --lossy-level 2 --lossy-max-attempts 24`

## Documentation

- `information/information.md`
- `information/workshop_showcase.md`
- `information/featured_artwork.md`
- `information/hex_edit_header.md`

## License

MIT. See `LICENSE`.
