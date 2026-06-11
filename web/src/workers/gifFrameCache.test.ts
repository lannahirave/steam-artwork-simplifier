import { describe, expect, it } from 'vitest'
import { buildGifFrameCacheKey } from './gifFrameCache'

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
})
