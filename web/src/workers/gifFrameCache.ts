export interface DecodedGifFrames {
  frames: Uint8Array[]
  width: number
  height: number
  count: number
}

export type GifFrameCache = Map<string, DecodedGifFrames>

export interface GifFrameCacheKeyInput {
  inputName: string
  vf: string
  fps: number
  startOffsetSec?: number
}

export function createGifFrameCache(): GifFrameCache {
  return new Map()
}

export function buildGifFrameCacheKey(input: GifFrameCacheKeyInput): string {
  return JSON.stringify([
    input.inputName,
    input.vf,
    input.fps,
    (input.startOffsetSec ?? 0).toFixed(3),
  ])
}
