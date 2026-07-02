# Steam Artwork Toolkit

Steam Artwork Toolkit is a browser-only tool for preparing animated Steam
artwork. It converts local video or image files into Steam-ready GIF layouts,
patches GIF metadata when needed, previews the generated files, and exports
downloads without uploading source media to a server.

The main app lives in `web/` and is built with React, TypeScript, Vite,
Web Workers, `ffmpeg.wasm`, and `gifski.wasm`. Legacy Python and JavaScript
helpers are kept for older local workflows.

## Current Capabilities

- Convert videos and images to GIF outputs for Steam artwork workflows.
- Run conversion entirely in the browser with dedicated Web Workers.
- Probe source media for dimensions, duration, FPS, and dark-intro offset.
- Preview generated GIFs with size, dimensions, final FPS, quality reduction,
  and status metadata.
- Download individual GIFs or a ZIP archive.
- Cancel a conversion or finish the currently running outputs.
- Copy progress logs and browser support diagnostics.
- Run standalone EOF-byte and GIF header patch tools on existing files.
- Use Steam upload helper snippets and direct upload links.
- Follow built-in workflow guides for conversion, tuning, patching, and upload.
- Switch between English, Ukrainian, and Czech. The selected language is stored
  locally and reflected in the route.
- Reopen the onboarding tour from the app header.

## Steam Presets

| Preset | Output |
| --- | --- |
| Workshop Showcase | Configurable horizontal GIF slices. Defaults to 5 parts, 150 px per part, 1 row. Supports 1-3 rows. |
| Artwork Showcase | Fixed two-part split: 506 px + 100 px from a 606 px layout. |
| Featured Showcase | Single wide GIF. Defaults to 630 px width. |
| Guide | Fixed centered square GIF at 195 x 195 px. |

Supported input sources:

- Browser-recognized video files (`video/*` and common video extensions).
- GIF, PNG, WebP, JPG/JPEG, and BMP images.

Output names use the source file base name:

- Workshop/artwork parts: `<source>_part_01.gif`, `<source>_part_02.gif`, ...
- Featured: `<source>_featured.gif`
- Guide: `<source>_guide.gif`
- Conversion ZIP: `<source>.zip`
- EOF patch ZIP: `eof-patch-output.zip`
- Header patch ZIP: `header-patch-output.zip`

## Conversion Controls

Default conversion settings are speed-conscious but still size-aware:

- Starting GIF FPS: `15`
- Minimum retry FPS: `10`
- Optimization mode: `hybrid`
- Standard retries: enabled
- FPS reduction during retries: enabled
- Quality reduction during retries: enabled
- Lossy oversize fallback: enabled
- EOF patch during conversion: enabled, default byte `0x21`
- GIF header patch during conversion: disabled by default
- Worker count: automatically chosen from hardware concurrency and capped at 3

The app also exposes:

- Raw mode, which disables optimization checks and retry ladders.
- Optimization modes: `hybrid`, `quality-first`, and `fast-fit`.
- Optional precheck to estimate whether a file is likely to exceed the target
  size before doing the full encode.
- Configurable max and target GIF size budgets.
- Configurable lossy fallback level and maximum attempts.
- Configurable EOF byte and optional GIF logical width/height header patching.

If a GIF still exceeds the configured max size after retries, the app keeps the
output and reports a warning instead of discarding the result.

## Architecture

```text
React UI
  -> conversion session state
  -> typed conversion orchestrator
  -> worker pool
  -> ffmpeg.wasm source probing and frame extraction
  -> gifski.wasm GIF encoding
  -> optional patching
  -> preview, download, and ZIP export
```

Important implementation areas:

- `web/src/App.tsx`: app shell, tabs, onboarding entry point, header actions.
- `web/src/AppRoot.tsx`: locale routing and saved language preference.
- `web/src/components/panels/`: Convert, Patch Tools, Steam Helpers, and Guides.
- `web/src/contexts/conversionSession.ts`: conversion UI/session state.
- `web/src/lib/conversion.ts`: conversion orchestration.
- `web/src/lib/conversionWorkerPool.ts`: worker lifecycle, scheduling,
  cancellation, and progress forwarding.
- `web/src/lib/ffmpegProtocol.ts`: typed worker message validation.
- `web/src/workers/ffmpeg.worker.ts`: ffmpeg/gifski runtime, probing,
  geometry transforms, retry ladders, and artifact creation.
- `web/src/lib/patch.ts`: EOF and GIF header patching.
- `web/src/lib/zip.ts`: ZIP archive export.

Split presets can run jobs in parallel. The worker count is capped because each
worker loads a WASM runtime and holds media/frame data in memory.

## Browser Requirements

The converter is designed for desktop Chromium-class browsers such as Chrome
and Edge. The app checks for the required runtime features and shows a
diagnostic report when the environment is unsupported.

Required browser/runtime features:

- secure context (`https`, `localhost`, or equivalent)
- cross-origin isolation
- Web Workers
- WebAssembly
- `createImageBitmap`
- `OffscreenCanvas`

iOS/iPadOS WebKit and Android browser runtimes are treated as unsupported
because this ffmpeg/gifski worker pipeline is memory- and API-sensitive.

## Cross-Origin Isolation

The WASM media pipeline requires these response headers:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Local Vite dev and preview servers set these headers in `web/vite.config.ts`.
Production hosting must provide the same headers or conversion will not run.

## Run Locally

Requirements:

- Node.js 20+
- npm

Install and start the app:

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

Preview a production build:

```bash
cd web
npm run preview
```

## Quality Checks

```bash
cd web
npm run lint
npm run test
npm run test:e2e
npm run build
```

Available benchmark scripts:

```bash
cd web
npm run bench:workshop
npm run bench:memory
npm run bench:memory:cleanup
```

## Deployment

### Netlify

The root `netlify.toml` builds from `web/` and publishes `web/dist`:

```toml
[build]
  base = "web"
  command = "npm run build"
  publish = "dist"
```

### Cloudflare Workers

Cloudflare deployment is configured with:

- `web/wrangler.toml`
- `web/cloudflare/worker.ts`

Deploy with:

```bash
cd web
npm run deploy
```

The Cloudflare worker is responsible for serving the static app with the
required COOP/COEP headers.

## Repository Map

- `web/`: primary browser app.
- `web/public/vendor/gifski/2.2.0/`: pinned, self-hosted gifski WASM runtime.
- `web/e2e/`: Playwright smoke tests.
- `web/src/**/*.test.ts`: Vitest coverage for conversion helpers, worker pool,
  patching, i18n messages, defaults, browser support, and sizing logic.
- `legacy/`: older Python CLI media and patching tools.
- `autofill/`: older Steam upload autofill snippets.
- `media/test-fixtures/`: local media fixtures for manual and automated testing.
- `docs/`: project overview, architecture, conversion pipeline, deployment, and
  troubleshooting notes.

## Legacy CLI Tools

The browser app is the main workflow. These scripts remain available for older
local workflows:

- `legacy/video_parts_pipeline.py`: local video-to-GIF pipeline.
- `legacy/steam_hex_patch.py`: EOF byte patch utility.
- `legacy/steam_hex_edit_header.py`: GIF header width/height editor.

Example:

```bash
python .\legacy\video_parts_pipeline.py --input .\media\my_video.mp4 --preset workshop
```

## Documentation

- `web/README.md`
- `docs/README.md`
- `docs/PROJECT_OVERVIEW.md`
- `docs/TECHNICAL_ARCHITECTURE.md`
- `docs/CONVERSION_PIPELINE.md`
- `docs/DEPLOYMENT_RUNBOOK.md`
- `docs/TROUBLESHOOTING.md`
- `docs/CHROME_MCP_TESTING.md`

## License and Source

License: AGPL-3.0-or-later. See `LICENSE`.

When deployed, the app exposes:

- `/LICENSE.txt`
- `/THIRD_PARTY_NOTICES.txt`
- `/SOURCE.txt`

Canonical source:

```text
https://github.com/lannahirave/steam-artwork-simplifier
```

## Trademark Notice

Steam and the Steam logo are trademarks and/or registered trademarks of Valve
Corporation in the United States and/or other countries.

This project is an independent, unofficial tool and is not affiliated with,
endorsed by, sponsored by, or approved by Valve Corporation.
