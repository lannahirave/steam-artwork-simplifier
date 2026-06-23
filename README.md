# Steam Artwork Toolkit

Browser-only Steam artwork workflow tool built with React, TypeScript, Vite,
Web Workers, `ffmpeg.wasm`, and `gifski.wasm`.

The primary app lives in `web/`. It converts source media into Steam-ready GIF
layouts, patches finished files, previews outputs, exports ZIP archives, and
provides Steam upload helper snippets without sending source media to a server.

## What This Demonstrates

- Browser-side media processing with no backend upload pipeline.
- Worker-pool orchestration for CPU-heavy WASM conversion jobs.
- Typed main-thread/worker message contracts for safer async boundaries.
- Cross-origin isolation requirements for deploying WASM-heavy browser tools.
- Testable TypeScript modules for validation, sizing, patching, quality
  strategy, and worker scheduling.

## Features

- Steam presets:
  - `Workshop Showcase`: 5 horizontal GIF slices by default.
  - `Featured Showcase`: single wide GIF output.
  - `Artwork Showcase`: fixed `506 + 100` split outputs.
  - `Guide`: fixed `195x195` square GIF output.
- Video and image input support, including common video files, GIF, PNG, WebP,
  JPG/JPEG, and BMP.
- Live progress, conversion logs, elapsed time, output previews, metadata,
  per-file downloads, and ZIP export.
- FPS estimate workflow, retry controls, FPS/color reduction options, and lossy
  oversize fallback.
- Optional GIF EOF byte patching and GIF header width/height patching during
  conversion.
- Standalone patch tools for existing files.
- Steam helper snippets and upload links for artwork workflows.
- Language support for English, Ukrainian, and Czech with saved in-browser preference.

## Architecture

The browser app is organized as a client-side media pipeline:

```text
React UI
  -> conversion orchestrator
  -> worker pool
  -> ffmpeg.wasm frame extraction
  -> gifski.wasm GIF encoding
  -> patching, preview, download, and ZIP output
```

Split presets can run conversion jobs in parallel through dedicated Web
Workers. The worker count is capped for browser stability because each worker
loads its own WASM runtime and processes an independent conversion task.

## Run Locally

```bash
cd web
npm ci
npm run dev
```

Build the production bundle:

```bash
cd web
npm run build
```

## Quality Checks

```bash
cd web
npm run lint
npm run test
npm run build
```

Current local baseline:

- ESLint passes.
- Vitest passes with 30 tests across validation, sizing, patching, GIF quality,
  defaults, and worker-pool behavior.

## Deployment

### Netlify

The root `netlify.toml` builds from `web/` and publishes `web/dist`:

```toml
[build]
  base = "web"
  command = "npm run build"
  publish = "dist"
```

Production deploys are intended to run from pushes to `main`.

### Cloudflare Workers

Optional Cloudflare deployment is configured with `web/wrangler.toml` and
`web/cloudflare/worker.ts`.

Deploy command:

```bash
cd web
npm run deploy
```

### Cross-Origin Isolation

Conversion requires these response headers:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

Local Vite dev and preview servers already set these headers in
`web/vite.config.ts`. Production hosting must provide the same headers.

## Legacy CLI Tools

The browser app is the main workflow. Legacy local scripts are retained for
compatibility with older ffmpeg-based workflows:

- `legacy/video_parts_pipeline.py`: local video-to-GIF pipeline.
- `legacy/steam_hex_patch.py`: EOF byte patch utility.
- `legacy/steam_hex_edit_header.py`: GIF header width/height editor.

Example:

```bash
python .\legacy\video_parts_pipeline.py --input .\media\my_video.mp4 --preset workshop
```

## Documentation

- Web app usage: `web/README.md`
- Documentation index: `docs/README.md`
- Technical architecture: `docs/TECHNICAL_ARCHITECTURE.md`
- Conversion pipeline: `docs/CONVERSION_PIPELINE.md`

## License

AGPL-3.0-or-later. See `LICENSE`.

If you interact with a network deployment of this project, the corresponding
source is available at:

`https://github.com/lannahirave/steam-artwork-simplifier`

## Trademark Notice

Steam and the Steam logo are trademarks and/or registered trademarks of Valve
Corporation in the United States and/or other countries.

This project is an independent, unofficial tool and is not affiliated with,
endorsed by, sponsored by, or approved by Valve Corporation.
