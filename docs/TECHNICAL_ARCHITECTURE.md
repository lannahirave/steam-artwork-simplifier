# Technical Architecture

## Stack

- UI: React 19
- Language: TypeScript
- Build: Vite 7
- Media engine: `@ffmpeg/ffmpeg` (WASM core loaded in Web Workers)
- Packaging: `jszip`
- Tests: Vitest + Playwright smoke tests
- Hosting: Netlify static hosting (auto deploy on push to `main`)

## High-Level Components

1. UI layer (`web/src/App.tsx`, `web/src/App.css`)
2. Domain/config modules (`web/src/lib/defaults.ts`, `web/src/lib/types.ts`)
3. Validation and precheck modules (`web/src/lib/validation.ts`, `web/src/lib/precheck.ts`)
4. Conversion orchestration (`web/src/lib/conversion.ts`)
5. Worker pool / protocol (`web/src/lib/workerPool.ts`, `web/src/lib/ffmpegProtocol.ts`)
6. ffmpeg worker runtime (`web/src/workers/ffmpeg.worker.ts`)
7. Patch utilities (`web/src/lib/patch.ts`)
8. Zip export utility (`web/src/lib/zip.ts`)
9. Deployment config and headers (`netlify.toml`, `web/public/_headers`)

## UI Architecture

`App.tsx` is a feature-shell with four sections:

1. Convert
2. Patch Tools
3. Steam Helpers
4. Guides

Primary state domains:

- conversion config and source file
- progress/log state
- elapsed timing state for active/last conversion
- artifact preview/download state
- patch tool inputs/results
- UI mode state (tab + theme mode)

The conversion section maintains a worker pool instance via `useRef`, allowing cancellation and reuse.

## Typed Domain Contract

Core types are defined in `web/src/lib/types.ts`:

- `Preset`
- `ConversionConfig`
- `ConversionInput`
- `ConversionArtifact`
- `ConversionResult`
- `EofPatchRequest`
- `HeaderPatchRequest`
- Worker request/response maps and event payloads

This typed contract enforces consistent payload shape across UI, orchestrator, and workers.

## Worker System

### Pool

`FFmpegWorkerPool` manages:

- a fixed number of worker slots
- task queue + dispatch
- in-flight tracking per request id
- progress forwarding
- timeout handling
- cancellation and worker replacement

### Protocol

Worker commands:

- `init`
- `probe`
- `convertPart`
- `convertFeatured`
- `convertGuide`

Worker response events:

- `progress`
- `result`
- `error`

`ffmpegProtocol.ts` validates message shapes before consumption.

## Conversion Engine

`convertVideo` in `web/src/lib/conversion.ts` orchestrates:

1. pool warmup
2. source load
3. source probe
4. still-image detection (for static image inputs)
5. optional precheck
6. parallel conversion jobs
7. deterministic artifact sort
8. optional post-patching
9. max-size enforcement

## ffmpeg Worker Runtime

`web/src/workers/ffmpeg.worker.ts` responsibilities:

- load ffmpeg core lazily per worker
- probe dimensions/duration
- run preset geometry transforms (split vs featured resize, fast `bicubic` scale mode)
- run encode/retry ladders (standard, FPS-fit, FPS-priority sweep, lossy)
- emit stage progress lines
- return byte payloads with transferables
- return output metadata (`finalFps`, `finalColors`)

Stability hardening includes:

- log-tail capture for detailed errors
- suspicious tiny GIF detection when `Aborted()` appears
- acceptance of valid non-tiny primary outputs even when `Aborted()` noise appears in logs
- fallback encoding chain:
  1. single-pass palette graph
  2. compatibility two-pass palette
  3. direct GIF encoder fallback

## Deployment Architecture

`netlify.toml` configures Netlify build/publish:

- base: `web`
- command: `npm run build`
- publish: `dist`

`web/public/_headers` injects:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

These headers are required for cross-origin isolated execution with fast ffmpeg.wasm workflows.
