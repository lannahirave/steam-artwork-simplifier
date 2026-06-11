import { describe, expect, it } from 'vitest'
import {
  analyzeSplitPartWeights,
  allItemsFit,
  buildLossyCandidates,
  buildIntermediateColorRecoveryCandidates,
  buildOptimizationCandidates,
  buildQualityRecoveryCandidates,
  buildSharedFpsRecoveryCandidates,
  buildStandardCandidates,
  estimateFpsForKbTarget,
  selectBatchRecoveryBudget,
  shouldTryQualityRecovery,
} from './sizeStrategy'

describe('size strategy', () => {
  it('prefers fps-only reduction before color ladder', () => {
    const candidates = buildStandardCandidates(15, 13)
    expect(candidates[0]).toEqual({ fps: 14, colors: 256 })
    expect(candidates[1]).toEqual({ fps: 13, colors: 256 })
    expect(candidates.some((candidate) => candidate.fps === 15 && candidate.colors === 224)).toBe(true)
    expect(candidates.some((candidate) => candidate.fps === 13 && candidate.colors === 32)).toBe(true)
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

  it('can disable fps reduction while keeping color reduction', () => {
    const candidates = buildStandardCandidates(15, 10, {
      allowFpsDrop: false,
      allowColorDrop: true,
    })
    expect(candidates.every((candidate) => candidate.fps === 15)).toBe(true)
    expect(candidates.some((candidate) => candidate.colors === 96)).toBe(true)
  })

  it('can disable color reduction while keeping fps reduction', () => {
    const candidates = buildStandardCandidates(15, 13, {
      allowFpsDrop: true,
      allowColorDrop: false,
    })
    expect(candidates.every((candidate) => candidate.colors === 256)).toBe(true)
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
      allowColorDrop: true,
      standardRetriesEnabled: true,
    })

    expect(candidates[0]).toMatchObject({
      phase: 'fast-fit',
      fps: 16,
      colors: 256,
    })
    expect(candidates.some((candidate) => candidate.phase === 'quality-first')).toBe(true)
  })

  it('runs recovery only when output is more than ten percent under target', () => {
    expect(shouldTryQualityRecovery(4000, 4500)).toBe(true)
    expect(shouldTryQualityRecovery(4100, 4500)).toBe(false)
  })

  it('builds quality recovery candidates at the same fps with higher color quality', () => {
    const candidates = buildQualityRecoveryCandidates({
      fps: 16,
      colors: 64,
      allowColorDrop: true,
    })

    expect(candidates[0]).toMatchObject({
      phase: 'quality-recovery',
      fps: 16,
      colors: 96,
    })
    expect(candidates.every((candidate) => candidate.fps === 16)).toBe(true)
  })

  it('starts color recovery above the current color value', () => {
    const candidates = buildQualityRecoveryCandidates({
      fps: 10,
      colors: 128,
      allowColorDrop: true,
    })

    expect(candidates.map((candidate) => candidate.colors)).toEqual([160, 192, 224, 256])
  })

  it('builds intermediate color candidates between accepted and rejected values', () => {
    const candidates = buildIntermediateColorRecoveryCandidates(128, 160)

    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every((colors) => colors > 128 && colors < 160)).toBe(true)
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
      allowColorDrop: true,
      standardRetriesEnabled: true,
    })

    expect(candidates[0]).toMatchObject({ phase: 'quality-first', fps: 14, colors: 256 })
    expect(candidates[1]).toMatchObject({ phase: 'quality-first', fps: 13, colors: 256 })
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
