import encode, { init as initGifskiModule } from 'gifski-wasm'

export interface GifskiEncodeOptions {
  frames: Uint8Array[]
  width: number
  height: number
  fps: number
  quality: number
  repeat?: number
}

const GIFSKI_VERSION = '2.2.0'
const GIFSKI_BASE = `/vendor/gifski/${GIFSKI_VERSION}`
const GIFSKI_WASM_PATH = `${GIFSKI_BASE}/gifski_wasm_bg.wasm`

let initPromise: Promise<unknown> | null = null
// A trap (Rust panic, out-of-bounds access) leaves the wasm instance unusable, and
// gifski-wasm keeps that instance for the worker's lifetime.
let runtimeBroken = false

function isWasmTrap(error: unknown): boolean {
  if (typeof WebAssembly !== 'undefined' && error instanceof WebAssembly.RuntimeError) {
    return true
  }
  return error instanceof Error && error.name === 'RuntimeError'
}

/** True once gifski trapped; the worker must be replaced before encoding again. */
export function isGifskiRuntimeBroken(): boolean {
  return runtimeBroken
}

/** The gifski wasm could not be downloaded or instantiated. */
export class GifskiLoadError extends Error {
  constructor(cause: unknown) {
    super(`gifski failed to load: ${cause instanceof Error ? cause.message : String(cause)}`, { cause })
    this.name = 'GifskiLoadError'
  }
}

async function ensureRuntimeInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = initGifskiModule(GIFSKI_WASM_PATH).catch((error: unknown) => {
      // Forget the failed attempt so the next call downloads again instead of replaying the rejection.
      initPromise = null
      throw new GifskiLoadError(error)
    })
  }
  await initPromise
}

export async function ensureGifskiRuntimeLoaded(): Promise<void> {
  await ensureRuntimeInitialized()
}

export async function encodeWithGifski(options: GifskiEncodeOptions): Promise<Uint8Array> {
  await ensureRuntimeInitialized()
  const requestedFrames = options.frames
  if (requestedFrames.length === 0) {
    throw new Error('gifski encode requires at least one frame.')
  }

  // gifski-wasm requires 2+ frames; duplicate still frame for static sources.
  const frames = requestedFrames.length === 1 ? [requestedFrames[0], requestedFrames[0]] : requestedFrames
  const clampedQuality = Math.max(1, Math.min(100, Math.round(options.quality)))
  let encoded: Uint8Array
  try {
    encoded = await encode({
      frames,
      width: options.width,
      height: options.height,
      fps: options.fps,
      quality: clampedQuality,
      repeat: options.repeat,
    })
  } catch (error) {
    if (isWasmTrap(error)) {
      runtimeBroken = true
    }
    throw error
  }

  const out = new Uint8Array(encoded.byteLength)
  out.set(encoded)
  return out
}

export const GIFSKI_RUNTIME_VERSION = GIFSKI_VERSION
export const GIFSKI_RUNTIME_BASE_PATH = GIFSKI_BASE
