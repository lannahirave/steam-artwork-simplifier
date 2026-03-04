# Steam Artwork Toolkit Web

React 19 + TypeScript + Vite browser app for Steam artwork workflows.

## Features

- Media/Image -> GIF conversion in browser via `ffmpeg.wasm` (`@ffmpeg/core-mt`)
- Presets:
  - `workshop`: 5 sliced GIFs (`part_01.gif` .. `part_05.gif`)
  - `featured`: single `featured.gif`
  - `guide`: single centered square `guide.gif` (`195x195`)
- Source support:
  - video (`video/*` + common extensions)
  - image (`.gif`, `.png`, `.webp`, `.jpg`, `.jpeg`, `.bmp`)
- Size enforcement with configurable standard + lossy fallback ladders
- FPS estimate/apply button for quick practical FPS targeting
- FPS-priority reduction path before palette reduction when oversize
- Output metadata on cards: size, final FPS, and color reduction
- Elapsed run timing in progress panel and results summary
- Optional EOF patch and optional GIF header patch during conversion
- Standalone patch tools:
  - EOF byte patch
  - GIF header width/height patch (+ optional EOF patch)
- Steam autofill snippets with copy buttons
- Built-in Guides tab with workflow steps for convert/patch/upload use-cases
- Preview grid, per-file download, and ZIP export
- App header displays the running version from `package.json` (for example `Steam Artwork Studio V0.9.1`)

## Requirements

- Node.js 20+
- Chromium-class browser (desktop Chrome/Edge)

## Cross-Origin Isolation (Required)

Fast mode requires `SharedArrayBuffer`, so you must serve with:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

This repository already sets these headers for `vite dev` and `vite preview` in `vite.config.ts`.

For production hosting, configure the same headers in your web server/CDN.

## Run

```bash
npm install
npm run dev
```

Open the printed local URL.

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run test
npm run test:e2e
```

## Notes

- This app is intentionally browser-only: no backend required.
- Existing Python scripts in the repo remain available for side-by-side migration.
- Add `?noiso=1` to the URL to simulate the isolation-blocking screen for smoke tests.
- `Enable precheck` and `Enable standard retries` default to off.
- Workshop preview is rendered as a compact single-row strip for quick visual checks.
- With standard retries off, speed-first mode exits once outputs are below hard max size.

## Deep Docs

- `../docs/README.md`
- `../docs/PROJECT_OVERVIEW.md`
- `../docs/TECHNICAL_ARCHITECTURE.md`
- `../docs/CONVERSION_PIPELINE.md`
- `../docs/DEPLOYMENT_RUNBOOK.md`
- `../docs/TROUBLESHOOTING.md`
- `../docs/CHROME_MCP_TESTING.md`
