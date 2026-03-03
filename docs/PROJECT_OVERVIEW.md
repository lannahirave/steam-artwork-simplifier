# Steam Artwork Toolkit: Project Overview

## Goal

Provide a single toolkit for creating Steam artwork GIFs with two execution paths:

1. Legacy CLI path (Python + desktop ffmpeg/ffprobe)
2. Browser SPA path (`web/`) using TypeScript + React 19 + ffmpeg.wasm

The browser app is the primary modern workflow. Legacy scripts remain available for compatibility and migration safety.

## Repository Map

- `web/`: React 19 + TypeScript app, browser-only conversion and patch tools.
- `video_parts_pipeline.py`: legacy video-to-GIF pipeline.
- `steam_hex_patch.py`: legacy EOF byte patch utility.
- `steam_hex_edit_header.py`: legacy GIF header width/height editor.
- `autofill/*.js`: Steam upload autofill snippets.
- `information/*.md` and `information/how_to_run.html`: legacy usage docs.
- `docs/`: technical and operational documentation for current architecture.

## Product Capabilities

1. Convert source media (video + images) to Steam-compatible GIF outputs.
2. Supported conversion sources:
   - Video files (`video/*` + common extensions)
   - Image files (`.gif`, `.png`, `.webp`, `.jpg`, `.jpeg`, `.bmp`)
3. Workshop preset:
   - 5 horizontal slices
   - 150px width per slice by default
   - output names `part_01.gif` to `part_05.gif`
4. Featured preset:
   - single `featured.gif`
   - 630px width by default
5. Guide preset:
   - single centered square `guide.gif`
   - fixed output size `195x195`
6. Optional output patching:
   - EOF byte patch
   - GIF header width/height patch
7. Standalone patch tools for existing files.
8. Steam helper snippet copy/paste workflow.
9. In-app previews + per-file download + ZIP export.
10. Live progress panel with worker-stage logs and progress bar.
11. Output metadata shown per GIF (size, final FPS, color reduction).
12. Run-time visibility: elapsed conversion timer and completion timing summary.
13. App header version is sourced from `web/package.json` and shown as `Steam Artwork Studio Vx.y.z`.
14. Size tuning prioritizes FPS reduction before color reduction for better visual fidelity.

## Runtime Model

- No backend required for conversion features.
- Core media processing runs in browser workers using ffmpeg.wasm.
- Production deployment currently targets Cloudflare Workers static assets + worker headers.

## Where To Read Next

- Architecture: `docs/TECHNICAL_ARCHITECTURE.md`
- Conversion internals: `docs/CONVERSION_PIPELINE.md`
- Deployment and ops: `docs/DEPLOYMENT_RUNBOOK.md`
- Debugging guide: `docs/TROUBLESHOOTING.md`
