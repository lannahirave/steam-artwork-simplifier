# Technical Architecture

## Stack

- UI: React 19
- Language: TypeScript
- Build: Vite 7
- Media engine: `@ffmpeg/ffmpeg` (WASM core loaded in Web Workers)
- Packaging: `jszip`
- Tests: Vitest + Playwright smoke tests
- Hosting: Cloudflare Workers static assets + header worker

## High-Level Components

1. UI layer (`web/src/App.tsx`, `web/src/App.css`)
2. Domain/config modules (`web/src/lib/defaults.ts`, `web/src/lib/types.ts`)
3. Conversion orchestration (`web/src/lib/conversion.ts`)
4. Worker pool / protocol (`web/src/lib/workerPool.ts`, `web/src/lib/ffmpegProtocol.ts`)
5. ffmpeg worker runtime (`web/src/workers/ffmpeg.worker.ts`)
6. Patch utilities (`web/src/lib/patch.ts`)
7. Zip export utility (`web/src/lib/zip.ts`)
8. Deployment worker (`web/cloudflare/worker.ts`)

## UI Architecture

`App.tsx` is a feature-shell with three sections:

1. Convert
2. Patch Tools
3. Steam Helpers

Primary state domains:

- conversion config and source file
- progress/log state
- artifact preview/download state
- patch tool inputs/results

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
4. optional precheck
5. parallel conversion jobs
6. deterministic artifact sort
7. optional post-patching
8. max-size enforcement

## ffmpeg Worker Runtime

`web/src/workers/ffmpeg.worker.ts` responsibilities:

- load ffmpeg core lazily per worker
- probe dimensions/duration by extracting one frame and parsing logs
- run encode/retry ladders
- emit stage progress lines
- return byte payloads with transferables

Stability hardening includes:

- log-tail capture for detailed errors
- suspicious tiny GIF detection when `Aborted()` appears
- fallback encoding chain:
  1. single-pass palette graph
  2. compatibility two-pass palette
  3. direct GIF encoder fallback

## Deployment Architecture

`web/wrangler.toml` configures static assets from `web/dist`.

`web/cloudflare/worker.ts` forwards asset responses and injects:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

These headers are required for cross-origin isolated execution with fast ffmpeg.wasm workflows.
