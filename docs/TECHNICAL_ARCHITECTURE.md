# Technical Architecture

## Stack

- UI: React 19
- Language: TypeScript
- Build/dev: Vite 7
- Media engines:
  - `@ffmpeg/ffmpeg` (probe + scaling/cropping + frame extraction)
  - `gifski-wasm` (GIF encoding)
- Packaging: `jszip`
- Unit tests: Vitest
- E2E smoke tests: Playwright
- Hosting: Netlify (auto deploy on `main`) or Cloudflare Worker assets

## High-Level Components

1. App shell and UI state: `web/src/App.tsx`
2. Styling and theme system: `web/src/App.css`, `web/src/index.css`
3. Panel components:
   - `web/src/components/panels/ConvertPanel.tsx`
   - `web/src/components/panels/PatchToolsPanel.tsx`
   - `web/src/components/panels/SteamHelpersPanel.tsx`
   - `web/src/components/panels/GuidesPanel.tsx`
4. Domain/config:
   - `web/src/lib/types.ts`
   - `web/src/lib/defaults.ts`
   - `web/src/agents/appAgents.ts`
5. Conversion orchestration: `web/src/lib/conversion.ts`
6. Worker pool + protocol:
   - `web/src/lib/workerPool.ts`
   - `web/src/lib/ffmpegProtocol.ts`
7. Worker runtime: `web/src/workers/ffmpeg.worker.ts`
8. Helpers:
   - `web/src/lib/precheck.ts`
   - `web/src/lib/sizeStrategy.ts`
   - `web/src/lib/validation.ts`
   - `web/src/lib/patch.ts`
   - `web/src/lib/zip.ts`

## UI Architecture

`App.tsx` owns feature-level state and routes rendering across 4 tabs:

1. Convert
2. Patch Tools
3. Steam Helpers
4. Guides

Primary state domains:

- conversion config and source file
- worker progress + logs
- elapsed timing and completion summary
- artifact previews and downloads
- patch tool inputs/results
- theme mode (`auto`, `light`, `dark`)

A reusable worker pool is held in `useRef` so runs can be cancelled and workers reused between conversions.

## Typed Contract

`web/src/lib/types.ts` defines end-to-end contracts across UI, orchestrator, and workers:

- `Preset` (`workshop`, `featured`, `guide`, `showcase`)
- `ConversionConfig`
- `ConversionArtifact`, `ConversionResult`
- patch request/response types
- worker request/response payload maps

This prevents drift between main thread and worker message payloads.

## Worker System

### Pool (`FFmpegWorkerPool`)

Responsibilities:

- worker lifecycle and warmup
- queued task scheduling
- in-flight request tracking
- timeout and cancellation handling
- worker replacement after cancellation/errors
- progress forwarding to UI

### Protocol

Commands:

- `init`
- `probe`
- `convertPart`
- `convertFeatured`
- `convertGuide`

Events:

- `progress`
- `result`
- `error`

`ffmpegProtocol.ts` validates message payload shape.

## Conversion Engine

`convertVideo` (`web/src/lib/conversion.ts`) orchestrates:

1. worker warmup
2. source load + probe
3. still-image detection
4. optional precheck
5. preset-specific conversion tasks
6. deterministic artifact sort
7. optional header/EOF patching
8. oversize warning emission (outputs are still kept)

Notable behavior:

- split presets (`workshop` and `showcase`) can use a shared-FPS two-pass strategy
- worker count is clamped for stability (`MAX_SAFE_WASM_WORKERS = 3`)

## ffmpeg Worker Runtime

`web/src/workers/ffmpeg.worker.ts` handles:

- lazy ffmpeg core loading
- lazy gifski runtime loading
- source probing (dimensions/duration/fps)
- dark-intro start offset detection
- geometry transforms per preset
- retry ladders (standard, FPS-fit, FPS-priority, lossy)
- progress stage events and artifact metadata

Encoding path:

1. ffmpeg extracts PNG frame sequence for the selected filter/FPS profile
2. worker decodes frames to RGBA buffers
3. gifski encodes final GIF bytes using mapped quality profile

## Naming and Export

Naming is generated in worker runtime using source base name:

- `<source>_part_XX.gif`
- `<source>_featured.gif`
- `<source>_guide.gif`

Conversion ZIP name is generated in app shell as `<source>.zip`.

## Deployment Architecture

Netlify path (automatic):

- root `netlify.toml`
- `base = "web"`, `command = "npm run build"`, `publish = "dist"`
- production deploy on push to `main`

Cloudflare path (optional):

- `web/wrangler.toml`
- `web/cloudflare/worker.ts` injects required COOP/COEP headers for assets

Required headers for conversion runtime:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`
