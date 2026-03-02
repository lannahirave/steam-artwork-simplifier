import { describe, expect, it } from 'vitest'
import { estimateFpsForTargetKb, estimateGifKb, runPrecheck } from './precheck'

describe('precheck math', () => {
  it('estimates gif size from pixel frames', () => {
    const kb = estimateGifKb(150, 150, 15, 3.5, 0.1)
    expect(kb).toBeGreaterThan(100)
    expect(kb).toBeLessThan(130)
  })

  it('flags likely oversize outputs', () => {
    const result = runPrecheck({
      srcWidth: 1920,
      srcHeight: 1080,
      duration: 14,
      parts: 5,
      partWidth: 150,
      minGifFps: 10,
      maxGifKb: 5000,
      precheckBppf: 1.2,
      precheckMarginPct: 10,
    })

    expect(result.shouldBlock).toBe(true)
  })

  it('allows likely valid outputs', () => {
    const result = runPrecheck({
      srcWidth: 1280,
      srcHeight: 720,
      duration: 2,
      parts: 5,
      partWidth: 150,
      minGifFps: 10,
      maxGifKb: 5000,
      precheckBppf: 0.1,
      precheckMarginPct: 10,
    })

    expect(result.shouldBlock).toBe(false)
  })

  it('estimates fps from size target and dimensions', () => {
    const fps = estimateFpsForTargetKb(150, 150, 10, 4500, 0.1)
    expect(fps).toBe(204)
  })

  it('returns minimum fps of 1 for invalid denominator', () => {
    const fps = estimateFpsForTargetKb(0, 150, 10, 4500, 0.1)
    expect(fps).toBe(1)
  })
})
