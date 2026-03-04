# Steam Artwork Toolkit: Project Overview

## Goal

Provide one toolkit for Steam artwork preparation with two execution paths:

1. Browser SPA (`web/`) with React + ffmpeg.wasm (primary path)
2. Legacy Python CLI scripts (compatibility path)

## Repository Map

- `web/`: browser app (conversion, patching, preview, snippets, guides).
- `web/src/lib/*`: conversion defaults, orchestration, worker pool, sizing, patch, validation.
- `web/src/workers/ffmpeg.worker.ts`: ffmpeg worker runtime.
- `web/src/components/panels/*`: tab panels (Convert, Patch Tools, Steam Helpers, Guides).
- `video_parts_pipeline.py`: legacy video->GIF pipeline.
- `steam_hex_patch.py`: legacy EOF patch utility.
- `steam_hex_edit_header.py`: legacy GIF header editor.
- `autofill/*.js`: legacy Steam autofill snippets.
- `docs/`: technical + operational docs.

## Product Capabilities

1. Convert videos/images to Steam-ready GIF outputs.
2. Presets:
   - Workshop Showcase (default 5 split outputs)
   - Featured Showcase (single wide output)
   - Artwork Showcase (fixed 506 + 100 split)
   - Guide (fixed 195x195 output)
3. Input support:
   - video (`video/*` + common extensions)
   - image (`.gif`, `.png`, `.webp`, `.jpg`, `.jpeg`, `.bmp`)
4. Worker-based conversion with progress stages and cancellation.
5. FPS estimate and auto-apply workflow.
6. Retry and quality controls:
   - standard retries (optional)
   - FPS reduction toggle
   - color reduction toggle
   - lossy oversize fallback
7. Optional output patching during conversion:
   - EOF byte patch
   - GIF header width/height patch
8. Standalone patch tools for existing files.
9. Steam upload helper snippets with copy buttons and upload links.
10. Preview cards with metadata (size, final FPS, color reduction).
11. Per-file download plus ZIP download.
12. Guide tab with workflow tips and Steam upload URLs.
13. Theme modes: auto/light/dark.
14. App version shown in UI, sourced from `web/package.json`.

## Output Naming Convention

Conversion output names are source-based:

- Workshop/Showcase parts: `<originalFileName>_part_01.gif`, `_part_02.gif`, ...
- Featured: `<originalFileName>_featured.gif`
- Guide: `<originalFileName>_guide.gif`
- Conversion ZIP: `<originalFileName>.zip`

Patch output ZIP names are fixed:

- `eof-patch-output.zip`
- `header-patch-output.zip`

## Runtime Model

- Browser app is fully client-side (no backend conversion service).
- ffmpeg.wasm runs in dedicated Web Workers.
- Cross-origin isolation (COOP/COEP) is mandatory for conversion runtime.
- Deploy targets:
  - Netlify (auto deploy on push to `main`)
  - Optional Cloudflare Worker static-assets deployment

## Where To Read Next

- `docs/TECHNICAL_ARCHITECTURE.md`
- `docs/CONVERSION_PIPELINE.md`
- `docs/DEPLOYMENT_RUNBOOK.md`
- `docs/TROUBLESHOOTING.md`
