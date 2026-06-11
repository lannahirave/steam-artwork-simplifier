import { describe, expect, it } from 'vitest'
import {
  analyzeSplitPartWeights,
  allItemsFit,
  buildLossyCandidates,
  buildOptimizationCandidates,
  buildQualityRecoveryCandidates,
  buildSharedFpsRecoveryCandidates,
  buildStandardCandidates,
  estimateFpsForKbTarget,
  getNextQualityRecoveryProbe,
  selectBatchRecoveryBudget,
  shouldTryQualityRecovery,
} from './sizeStrategy'

describe('size strategy', () => {
  it('prefers fps-only reduction before quality ladder', () => {
    const candidates = buildStandardCandidates(15, 13)
    expect(candidates[0]).toEqual({ fps: 14, quality: 100 })
    expect(candidates[1]).toEqual({ fps: 13, quality: 100 })
    expect(candidates.some((candidate) => candidate.fps === 15 && candidate.quality === 92)).toBe(true)
    expect(candidates.some((candidate) => candidate.fps === 13 && candidate.quality === 32)).toBe(true)
  })

  it('caps lossy candidates to max attempts', () => {
    const candidates = buildLossyCandidates(15, 10, 3, 7)
    expect(candidates.length).toBe(7)
  })

  it('uses mild profile for level 1', () => {
    const candidates = buildLossyCandidates(15, 15, 1, 20)
    expect(candidates.every((candidate) => candidate.statsMode === 'single')).toBe(true)
    expect(candidates.every((candidate) => candidate.prefilter === '')).toBe(true)
  })

  it('keeps a fixed fps in lossy candidates when fps drop is disabled', () => {
    const candidates = buildLossyCandidates(18, 10, 2, 12, { allowFpsDrop: false })
    expect(candidates.length).toBe(12)
    expect(candidates.every((candidate) => candidate.fps === 18)).toBe(true)
  })

  it('can disable fps reduction while keeping quality reduction', () => {
    const candidates = buildStandardCandidates(15, 10, {
      allowFpsDrop: false,
      allowQualityDrop: true,
    })
    expect(candidates.every((candidate) => candidate.fps === 15)).toBe(true)
    expect(candidates.some((candidate) => candidate.quality === 48)).toBe(true)
  })

  it('can disable quality reduction while keeping fps reduction', () => {
    const candidates = buildStandardCandidates(15, 13, {
      allowFpsDrop: true,
      allowQualityDrop: false,
    })
    expect(candidates.every((candidate) => candidate.quality === 100)).toBe(true)
    expect(candidates.some((candidate) => candidate.fps === 13)).toBe(true)
  })

  it('estimates fps needed to hit target size from current size', () => {
    const fps = estimateFpsForKbTarget(34, 7830.1, 5000, 10)
    expect(fps).toBe(21)
  })

  it('respects min fps while estimating fps target', () => {
    const fps = estimateFpsForKbTarget(12, 12000, 1000, 8)
    expect(fps).toBe(8)
  })

  it('tries hybrid fast-fit before the long quality ladder', () => {
    const candidates = buildOptimizationCandidates({
      mode: 'hybrid',
      currentFps: 30,
      currentSizeKb: 9000,
      targetGifKb: 4500,
      maxGifKb: 5000,
      minGifFps: 10,
      allowFpsDrop: true,
      allowQualityDrop: true,
      standardRetriesEnabled: true,
    })

    expect(candidates[0]).toMatchObject({
      phase: 'fast-fit',
      fps: 16,
      quality: 100,
    })
    expect(candidates.some((candidate) => candidate.phase === 'quality-first')).toBe(true)
  })

  it('runs recovery only when output is more than ten percent under target', () => {
    expect(shouldTryQualityRecovery(4000, 4500)).toBe(true)
    expect(shouldTryQualityRecovery(4100, 4500)).toBe(false)
  })

  it('builds quality recovery candidates at the same fps with higher quality', () => {
    const candidates = buildQualityRecoveryCandidates({
      fps: 16,
      quality: 48,
      allowQualityDrop: true,
    })

    expect(candidates[0]).toMatchObject({
      phase: 'quality-recovery',
      fps: 16,
      quality: 58,
    })
    expect(candidates.every((candidate) => candidate.fps === 16)).toBe(true)
  })

  it('starts quality recovery above the current quality value', () => {
    const candidates = buildQualityRecoveryCandidates({
      fps: 10,
      quality: 68,
      allowQualityDrop: true,
    })

    expect(candidates.map((candidate) => candidate.quality)).toEqual([76, 84, 92, 100])
  })

  it('plans the next binary quality probe between accepted and rejected values', () => {
    expect(getNextQualityRecoveryProbe(68, 76)).toBe(72)
    expect(getNextQualityRecoveryProbe(72, 76)).toBe(74)
    expect(getNextQualityRecoveryProbe(75, 76)).toBeNull()
  })

  it('preserves quality-first candidate ordering', () => {
    const candidates = buildOptimizationCandidates({
      mode: 'quality-first',
      currentFps: 15,
      currentSizeKb: 7000,
      targetGifKb: 4500,
      maxGifKb: 5000,
      minGifFps: 13,
      allowFpsDrop: true,
      allowQualityDrop: true,
      standardRetriesEnabled: true,
    })

    expect(candidates[0]).toMatchObject({ phase: 'quality-first', fps: 14, quality: 100 })
    expect(candidates[1]).toMatchObject({ phase: 'quality-first', fps: 13, quality: 100 })
  })

  it('marks split parts above average by more than ten percent as heavy', () => {
    const weights = analyzeSplitPartWeights([
      { index: 0, name: 'part-1.gif', sizeKb: 3000 },
      { index: 1, name: 'part-2.gif', sizeKb: 3000 },
      { index: 2, name: 'part-3.gif', sizeKb: 4200 },
    ])

    expect(weights[2].heavy).toBe(true)
    expect(weights[0].heavy).toBe(false)
  })

  it('starts batch recovery only after every part satisfies a budget', () => {
    expect(allItemsFit([{ sizeKb: 3200 }, { sizeKb: 4499 }], 4500)).toBe(true)
    expect(allItemsFit([{ sizeKb: 3200 }, { sizeKb: 4501 }], 4500)).toBe(false)
  })

  it('prefers target budget for recovery and falls back to max budget', () => {
    expect(selectBatchRecoveryBudget([{ sizeKb: 3354 }, { sizeKb: 4181 }], 4500, 5000)).toBe(4500)
    expect(selectBatchRecoveryBudget([{ sizeKb: 4700 }, { sizeKb: 4900 }], 4500, 5000)).toBe(5000)
    expect(selectBatchRecoveryBudget([{ sizeKb: 4700 }, { sizeKb: 5100 }], 4500, 5000)).toBeNull()
  })

  it('builds shared fps recovery candidates upward from the fitted fps', () => {
    expect(buildSharedFpsRecoveryCandidates(10, 15)).toEqual([11, 12, 13, 14, 15])
    expect(buildSharedFpsRecoveryCandidates(15, 15)).toEqual([])
  })
})
