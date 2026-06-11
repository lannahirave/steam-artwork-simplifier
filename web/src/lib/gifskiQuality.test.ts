import { describe, expect, it } from 'vitest'
import { clampGifskiQuality, getQualityReductionPercent } from './gifskiQuality'

describe('gifski quality helpers', () => {
  it('clamps quality to gifski range', () => {
    expect(clampGifskiQuality(100)).toBe(100)
    expect(clampGifskiQuality(68)).toBe(68)
    expect(clampGifskiQuality(0)).toBe(1)
    expect(clampGifskiQuality(999)).toBe(100)
    expect(clampGifskiQuality(Number.NaN)).toBe(100)
  })

  it('computes quality reduction percentage from final quality', () => {
    expect(getQualityReductionPercent(100)).toBe(0)
    expect(getQualityReductionPercent(68)).toBe(32)
    expect(getQualityReductionPercent(1)).toBe(99)
  })
})
