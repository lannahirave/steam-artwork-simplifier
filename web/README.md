# Steam Artwork Toolkit Web

Browser-only Steam artwork converter built with React 19 + TypeScript + Vite + ffmpeg.wasm + gifski.wasm.

## Features

- Media/image to GIF conversion in browser workers
- Presets:
  - `Workshop Showcase` (5x150 slices by default)
  - `Featured Showcase` (single 630px default)
  - `Artwork Showcase` (fixed 506 + 100 split)
  - `Guide` (fixed 195x195)
- Supported input sources:
  - video (`video/*` + common video extensions)
  - image (`.gif`, `.png`, `.webp`, `.jpg`, `.jpeg`, `.bmp`)
- Live progress with stage logs and elapsed timer
- FPS estimate + auto-apply from probe/duration/size targets
- Worker-pool conversion with shared-FPS pass for split presets
- Encoding path: ffmpeg.wasm frame extraction + gifski.wasm GIF encode
- Optional precheck, standard retries, FPS reduction, color reduction, and lossy oversize fallback
- Output metadata per GIF: size, final FPS, color reduction
- Optional output patching during conversion:
  - EOF byte patch
  - GIF header width/height patch
- Standalone patch tools for existing files
- Steam helper snippets with copy buttons and upload links
- Built-in Guides tab
- Per-file downloads + ZIP archive export
- App header shows version from `package.json` (displayed as `Vx.y.z`)

## Naming Rules (Downloads)

Output filenames always use the source file base name:

- Workshop/Showcase parts: `<originalFileName>_part_01.gif`, `_part_02.gif`, ...
- Featured: `<originalFileName>_featured.gif`
- Guide: `<originalFileName>_guide.gif`
- Conversion ZIP: `<originalFileName>.zip`

Patch tool ZIP names are fixed:

- `eof-patch-output.zip`
- `header-patch-output.zip`

## Preset Defaults

- Workshop:
  - parts: `5`
  - part width: `150`
  - max/target: `5000KB / 4500KB`
- Featured:
  - width: `630`
  - max/target: `4500KB / 4500KB`
- Artwork Showcase:
  - split widths: `506 + 100`
  - max/target: `5000KB / 4500KB`
- Guide:
  - size: `195x195`
  - max/target: `2000KB / 2000KB`

## Size and Retry Behavior

- Default mode is speed-first with standard retries OFF.
- If standard retries are ON, retries can use FPS/color reductions depending on toggles.
- If output is still oversize and lossy fallback is ON, lossy ladder attempts run.
- If output still exceeds max size, output is kept and shown with warning (not dropped).

## Steam Helper Upload URLs

- Workshop: `https://steamcommunity.com/sharedfiles/editguide/?appid=760`
- Artwork / Featured / Screenshot: `https://steamcommunity.com/sharedfiles/edititem/767/3/#`

## Requirements

- Node.js 20+
- npm
- Chromium-class desktop browser (Chrome/Edge recommended)

## Cross-Origin Isolation (Required)

Required response headers:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

Already configured for local dev and preview in `vite.config.ts`.

## Run

```bash
npm install
npm run dev
```

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run test
npm run test:e2e
npm run deploy
npm run bench:workshop
```

## Deployment Notes

- Netlify is configured from repo root (`netlify.toml`) with `base = "web"`, `publish = "dist"`.
- Production deploy on Netlify is triggered by pushes to `main`.
- Optional Cloudflare deploy is available with `npm run deploy` (Wrangler).
- gifski runtime assets are pinned and self-hosted in `public/vendor/gifski/2.2.0/`.

## Deep Docs

- `../docs/README.md`
- `../docs/PROJECT_OVERVIEW.md`
- `../docs/TECHNICAL_ARCHITECTURE.md`
- `../docs/CONVERSION_PIPELINE.md`
- `../docs/DEPLOYMENT_RUNBOOK.md`
- `../docs/TROUBLESHOOTING.md`
- `../docs/CHROME_MCP_TESTING.md`

## Disclaimer

Steam and the Steam logo are trademarks and/or registered trademarks of Valve
Corporation in the United States and/or other countries.

This project is an independent, unofficial tool and is not affiliated with,
endorsed by, sponsored by, or approved by Valve Corporation.
