import { describe, expect, it } from 'vitest'
import { buildGifFrameCacheKey, createGifFrameCache, rememberDecodedGifFrames } from './gifFrameCache'

describe('GIF frame cache', () => {
  it('uses the frame-producing inputs as the cache key', () => {
    const first = buildGifFrameCacheKey({
      inputName: 'source.mp4',
      vf: 'fps=10,scale=150:-1',
      fps: 10,
      startOffsetSec: 1.2344,
    })
    const second = buildGifFrameCacheKey({
      inputName: 'source.mp4',
      vf: 'fps=10,scale=150:-1',
      fps: 10,
      startOffsetSec: 1.2344,
    })

    expect(first).toBe(second)
  })

  it('separates different fps/filter extractions', () => {
    const base = {
      inputName: 'source.mp4',
      startOffsetSec: 0,
    }

    expect(buildGifFrameCacheKey({ ...base, vf: 'fps=10,scale=150:-1', fps: 10 }))
      .not.toBe(buildGifFrameCacheKey({ ...base, vf: 'fps=11,scale=150:-1', fps: 11 }))
  })

  it('normalizes seek offsets to ffmpeg argument precision', () => {
    expect(buildGifFrameCacheKey({
      inputName: 'source.mp4',
      vf: 'fps=10,scale=150:-1',
      fps: 10,
      startOffsetSec: 1.2344,
    })).toBe(buildGifFrameCacheKey({
      inputName: 'source.mp4',
      vf: 'fps=10,scale=150:-1',
      fps: 10,
      startOffsetSec: 1.23449,
    }))
  })

  it('uses stable source cache keys across request-specific input names', () => {
    const first = buildGifFrameCacheKey({
      inputName: 'request-a.mp4',
      sourceCacheKey: 'conversion-1',
      vf: 'fps=10,scale=150:-1',
      fps: 10,
    })
    const second = buildGifFrameCacheKey({
      inputName: 'request-b.mp4',
      sourceCacheKey: 'conversion-1',
      vf: 'fps=10,scale=150:-1',
      fps: 10,
    })

    expect(first).toBe(second)
  })

  it('evicts oldest decoded frame entries when bounded', () => {
    const cache = createGifFrameCache()
    const frames = { frames: [new Uint8Array([1])], width: 1, height: 1, count: 1 }

    rememberDecodedGifFrames(cache, 'first', frames, 2)
    rememberDecodedGifFrames(cache, 'second', frames, 2)
    rememberDecodedGifFrames(cache, 'third', frames, 2)

    expect(cache.has('first')).toBe(false)
    expect(cache.has('second')).toBe(true)
    expect(cache.has('third')).toBe(true)
  })
})
