import { describe, expect, it } from 'vitest'
import { buildLossyCandidates, buildStandardCandidates } from './sizeStrategy'
import { mapColorsToGifskiQuality, mapRetryCandidateToGifskiQuality } from './gifskiQuality'

describe('gifski quality mapping', () => {
  it('maps defined color breakpoints deterministically', () => {
    expect(mapColorsToGifskiQuality(256)).toBe(100)
    expect(mapColorsToGifskiQuality(224)).toBe(92)
    expect(mapColorsToGifskiQuality(192)).toBe(84)
    expect(mapColorsToGifskiQuality(160)).toBe(76)
    expect(mapColorsToGifskiQuality(128)).toBe(68)
    expect(mapColorsToGifskiQuality(96)).toBe(58)
    expect(mapColorsToGifskiQuality(64)).toBe(48)
    expect(mapColorsToGifskiQuality(48)).toBe(40)
    expect(mapColorsToGifskiQuality(32)).toBe(32)
    expect(mapColorsToGifskiQuality(24)).toBe(24)
    expect(mapColorsToGifskiQuality(16)).toBe(16)
    expect(mapColorsToGifskiQuality(12)).toBe(12)
  })

  it('clamps and scales non-breakpoint values', () => {
    expect(mapColorsToGifskiQuality(0)).toBe(12)
    expect(mapColorsToGifskiQuality(999)).toBe(100)
    expect(mapColorsToGifskiQuality(200)).toBe(78)
  })
})

describe('retry candidate to gifski quality', () => {
  it('maps all standard retry candidates to valid quality values', () => {
    const candidates = buildStandardCandidates(15, 10, {
      allowFpsDrop: true,
      allowColorDrop: true,
    })
    expect(candidates.length).toBeGreaterThan(0)
    for (const candidate of candidates) {
      const quality = mapRetryCandidateToGifskiQuality(candidate)
      expect(quality).toBeGreaterThanOrEqual(1)
      expect(quality).toBeLessThanOrEqual(100)
    }
  })

  it('maps all lossy retry candidates to valid quality values', () => {
    const candidates = buildLossyCandidates(15, 10, 2, 12, { allowFpsDrop: true })
    expect(candidates.length).toBeGreaterThan(0)
    for (const candidate of candidates) {
      const quality = mapRetryCandidateToGifskiQuality(candidate)
      expect(quality).toBeGreaterThanOrEqual(1)
      expect(quality).toBeLessThanOrEqual(100)
    }
  })
})
