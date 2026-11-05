import { describe, expect, it } from 'vitest'
import { applyGifAlphaThreshold, GIF_ALPHA_THRESHOLD } from './gifFrameEncoder'

describe('applyGifAlphaThreshold', () => {
  it('makes every pixel fully opaque or fully transparent', () => {
    const rgba = new Uint8Array([
      10, 20, 30, 255,
      40, 50, 60, GIF_ALPHA_THRESHOLD,
      70, 80, 90, GIF_ALPHA_THRESHOLD - 1,
      100, 110, 120, 0,
    ])
    applyGifAlphaThreshold(rgba)
    expect([...rgba]).toEqual([
      10, 20, 30, 255,
      40, 50, 60, 255,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ])
  })
})
