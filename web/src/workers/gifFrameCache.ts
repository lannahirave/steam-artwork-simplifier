export interface DecodedGifFrames {
  frames: Uint8Array[]
  width: number
  height: number
  count: number
}

export type GifFrameCache = Map<string, DecodedGifFrames>

export interface GifFrameCacheKeyInput {
  inputName: string
  sourceCacheKey?: string
  vf: string
  fps: number
  startOffsetSec?: number
}

export function createGifFrameCache(): GifFrameCache {
  return new Map()
}

export function buildGifFrameCacheKey(input: GifFrameCacheKeyInput): string {
  return JSON.stringify([
    input.sourceCacheKey ?? input.inputName,
    input.vf,
    input.fps,
    (input.startOffsetSec ?? 0).toFixed(3),
  ])
}

export function rememberDecodedGifFrames(
  cache: GifFrameCache,
  key: string,
  frames: DecodedGifFrames,
  maxEntries: number,
): void {
  if (cache.has(key)) {
    cache.delete(key)
  }
  cache.set(key, frames)

  while (cache.size > maxEntries) {
    const oldest = cache.keys().next().value as string | undefined
    if (oldest === undefined) {
      return
    }
    cache.delete(oldest)
  }
}
