# Steam Artwork Toolkit Web

React 19 + TypeScript + Vite browser app for Steam artwork workflows.

## Features

- Video -> GIF conversion in browser via `ffmpeg.wasm` (`@ffmpeg/core-mt`)
- Presets:
  - `workshop`: 5 sliced GIFs (`part_01.gif` .. `part_05.gif`)
  - `featured`: single `featured.gif`
- Size enforcement with standard + lossy fallback ladders
- Optional EOF patch and optional GIF header patch during conversion
- Standalone patch tools:
  - EOF byte patch
  - GIF header width/height patch (+ optional EOF patch)
- Steam autofill snippets with copy buttons
- Preview grid, per-file download, and ZIP export

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
