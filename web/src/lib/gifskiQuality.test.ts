import { describe, expect, it } from 'vitest'
import {
  clampGifskiQuality,
  createQualityBinarySearch,
  getQualityReductionPercent,
  nextQualityBinaryProbe,
  recordQualityBinaryProbe,
} from './gifskiQuality'

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

  it('probes quality ranges with binary search', () => {
    let state = createQualityBinarySearch(68, 76)
    const probes: number[] = []
    const accepted = new Set([72, 74, 75])

    let probe = nextQualityBinaryProbe(state)
    while (probe !== null) {
      probes.push(probe)
      state = recordQualityBinaryProbe(state, probe, accepted.has(probe))
      probe = nextQualityBinaryProbe(state)
    }

    expect(probes).toEqual([72, 74, 75, 76])
    expect(state.bestQuality).toBe(75)
  })

  it('does not advance best quality for rejected binary probes', () => {
    let state = createQualityBinarySearch(68, 76)
    state = recordQualityBinaryProbe(state, 72, false)

    expect(state.bestQuality).toBeNull()
    expect(nextQualityBinaryProbe(state)).toBe(70)
  })
})
