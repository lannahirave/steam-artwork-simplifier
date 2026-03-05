export interface GifskiEncodeOptions {
  frames: Uint8Array[]
  width: number
  height: number
  fps: number
  quality: number
  repeat?: number
}

interface GifskiRuntimeModule {
  default: (moduleOrPath?: string | URL | Request | Response | BufferSource | WebAssembly.Module) => Promise<unknown>
  encode: (
    frames: Uint8Array,
    numOfFrames: number,
    width: number,
    height: number,
    fps?: number,
    frameDurations?: Uint32Array,
    quality?: number,
    repeat?: number,
    resizeWidth?: number,
    resizeHeight?: number,
  ) => Uint8Array
}

const GIFSKI_VERSION = '2.2.0'
const GIFSKI_BASE = `/vendor/gifski/${GIFSKI_VERSION}`
const GIFSKI_MODULE_PATH = `${GIFSKI_BASE}/gifski_wasm.js`
const GIFSKI_WASM_PATH = `${GIFSKI_BASE}/gifski_wasm_bg.wasm`

let initPromise: Promise<GifskiRuntimeModule> | null = null

function flattenFrames(frames: Uint8Array[]): Uint8Array {
  const totalLength = frames.reduce((acc, frame) => acc + frame.byteLength, 0)
  const out = new Uint8Array(totalLength)
  let offset = 0
  for (const frame of frames) {
    out.set(frame, offset)
    offset += frame.byteLength
  }
  return out
}

async function getRuntime(): Promise<GifskiRuntimeModule> {
  if (!initPromise) {
    initPromise = (async () => {
      const runtime = (await import(/* @vite-ignore */ GIFSKI_MODULE_PATH)) as GifskiRuntimeModule
      await runtime.default(GIFSKI_WASM_PATH)
      return runtime
    })()
  }
  return initPromise
}

export async function ensureGifskiRuntimeLoaded(): Promise<void> {
  await getRuntime()
}

export async function encodeWithGifski(options: GifskiEncodeOptions): Promise<Uint8Array> {
  const runtime = await getRuntime()
  const requestedFrames = options.frames
  if (requestedFrames.length === 0) {
    throw new Error('gifski encode requires at least one frame.')
  }

  // gifski-wasm requires 2+ frames; duplicate still frame for static sources.
  const frames = requestedFrames.length === 1 ? [requestedFrames[0], requestedFrames[0]] : requestedFrames
  const packed = flattenFrames(frames)
  const clampedQuality = Math.max(1, Math.min(100, Math.round(options.quality)))
  const encoded = runtime.encode(
    packed,
    frames.length,
    options.width,
    options.height,
    options.fps,
    undefined,
    clampedQuality,
    options.repeat,
  )

  const out = new Uint8Array(encoded.byteLength)
  out.set(encoded)
  return out
}

export const GIFSKI_RUNTIME_VERSION = GIFSKI_VERSION
export const GIFSKI_RUNTIME_BASE_PATH = GIFSKI_BASE
