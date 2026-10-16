import { describe, expect, it } from 'vitest'
import { buildPartGeometry } from '../workers/workerGeometry'
import { computeCutLayout } from './cutPreview'
import { applyPreset, getDefaultConfig } from './defaults'
import { resolvePresetPlan } from './presetPlan'
import type { ConversionConfig } from './types'

const basePayload = {
  fileName: 'clip.mp4',
  fileBytes: new Uint8Array(),
  sourceCacheKey: 'test-source',
  isStillImage: false,
  duration: 3,
  gifFps: 15,
  minGifFps: 10,
  disableOptimizations: false,
  maxGifKb: 5000,
  targetGifKb: 4500,
  optimizationMode: 'hybrid' as const,
  enableQualityRecovery: true,
  standardRetriesEnabled: false,
  retryAllowFpsDrop: true,
  retryAllowQualityDrop: true,
  lossyOversize: true,
  lossyLevel: 2,
  lossyMaxAttempts: 24,
}

/** The crop rectangle the real worker would use for each part. */
function workerCrops(config: ConversionConfig, srcWidth: number, srcHeight: number) {
  const plan = resolvePresetPlan(config)
  return Array.from({ length: plan.jobCount }, (_, partIndex) => {
    const { baseFilter } = buildPartGeometry({
      ...basePayload,
      srcWidth,
      srcHeight,
      partIndex,
      parts: plan.jobCount,
      partWidth: plan.partWidth,
      splitWidths: plan.splitWidths,
      splitColumns: plan.splitColumns,
      splitRows: plan.splitRows,
    })
    const [, width, height, x, y] = /crop=(\d+):(\d+):(\d+):(\d+)/.exec(baseFilter) ?? []
    return { index: partIndex, x: Number(x), y: Number(y), width: Number(width), height: Number(height) }
  })
}

describe('computeCutLayout', () => {
  it('matches the worker crops for a workshop grid', () => {
    const config = { ...getDefaultConfig('workshop'), workshopRows: 3 as const }
    const layout = computeCutLayout(config, 1920, 1080)

    expect(layout?.frameWidth).toBe(750)
    expect(layout?.frameHeight).toBe(422)
    expect(layout?.pieces).toEqual(workerCrops(config, 1920, 1080))
    expect(layout?.pieces).toHaveLength(15)
  })

  it('matches the worker crops for the artwork showcase split', () => {
    const config = applyPreset(getDefaultConfig('workshop'), 'showcase')
    const layout = computeCutLayout(config, 1280, 720)

    expect(layout?.pieces).toEqual(workerCrops(config, 1280, 720))
    expect(layout?.pieces.map((piece) => piece.width)).toEqual([506, 100])
  })

  it('uses a single full-frame piece for featured', () => {
    const config = getDefaultConfig('featured')

    expect(computeCutLayout(config, 1260, 500)).toEqual({
      frameWidth: 630,
      frameHeight: 250,
      pieces: [{ index: 0, x: 0, y: 0, width: 630, height: 250 }],
    })
  })

  it('crops the guide square from the center of a wide source', () => {
    const layout = computeCutLayout(getDefaultConfig('guide'), 1920, 1080)

    expect(layout).toEqual({
      frameWidth: 347,
      frameHeight: 195,
      pieces: [{ index: 0, x: 76, y: 0, width: 195, height: 195 }],
    })
  })

  it('crops the guide square from the center of a tall source', () => {
    const layout = computeCutLayout(getDefaultConfig('guide'), 400, 800)

    expect(layout?.frameWidth).toBe(195)
    expect(layout?.frameHeight).toBe(390)
    expect(layout?.pieces[0]).toMatchObject({ x: 0, y: 97, width: 195, height: 195 })
  })

  it('returns null until the source size is known', () => {
    expect(computeCutLayout(getDefaultConfig('workshop'), 0, 0)).toBeNull()
  })
})
