# Steam Artwork Docs (General)

Checked on March 1, 2026.

## Guides
- Run instructions: `information/how_to_run.html`
- Workshop-specific guide: `information/workshop_showcase.md`
- Featured-specific guide: `information/featured_artwork.md`
- Header hex-edit guide: `information/hex_edit_header.md`

## Scripts
- Main pipeline: `video_parts_pipeline.py`
- Standalone hex patch tool: `steam_hex_patch.py`
- Header hex-edit tool: `steam_hex_edit_header.py`
- Workshop autofill JS: `autofill/steam_upload_autofill_workshop.js`
- Featured autofill JS: `autofill/steam_upload_autofill_featured.js`
- Legacy autofill entrypoint: `autofill/steam_upload_autofill.js`

## Quick start
```bash
# Workshop output
python video_parts_pipeline.py --input .\media\my_video.mp4 --preset workshop

# Featured output
python video_parts_pipeline.py --input .\media\my_video.mp4 --preset featured
```

## Shared defaults (`.env`)
```env
FFMPEG_BIN=D:\ffmpeg\bin
GIF_PRESET=workshop
GIF_FPS=15
GIF_MIN_FPS=15
GIF_PRECHECK_ENABLED=true
GIF_PRECHECK_BPPF=0.10
GIF_PRECHECK_MARGIN_PCT=10
GIF_MAX_WORKERS=0
FFMPEG_THREADS=0
USE_NVIDIA=false
GIF_LOSSY_OVERSIZE_ENABLED=true
GIF_LOSSY_LEVEL=2
GIF_LOSSY_MAX_ATTEMPTS=24
GIF_HEX_PATCH_ENABLED=true
GIF_HEX_BYTE=21
```

## Notes
- CLI arguments override `.env` values.
- Early precheck runs by default and may fail fast for oversized sources.
- Use `--skip-precheck` to bypass early precheck.
- Use `--use-nvidia` to enable optional CUDA decode (default remains off).
- Use `--lossy-oversize` plus `--lossy-level` for extra oversize-only lossy compression.
- Script fails if output remains above configured KB limit.
- Script fails if `--gif-fps` is below `.env` `GIF_MIN_FPS`.
