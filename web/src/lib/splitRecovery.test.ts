import { describe, expect, it } from 'vitest'
import { recoverSplitBatchQuality } from './splitRecovery'
import type { WorkerArtifactData } from './types'

function artifact(part: number, sizeKb: number, finalQuality: number, finalFps = 10): WorkerArtifactData {
  return {
    name: `dice_part_${String(part).padStart(2, '0')}.gif`,
    fileBytes: new Uint8Array([part]),
    sizeKb,
    width: 150,
    height: 987,
    status: 'recompressed',
    finalFps,
    finalQuality,
  }
}

describe('split batch quality recovery', () => {
  it('recovers under-budget split parts to higher quality values', async () => {
    const attempts: Array<{ partIndex: number; fps: number; quality: number }> = []
    const result = await recoverSplitBatchQuality({
      items: [
        artifact(1, 4181.8, 92),
        artifact(2, 2537.7, 68),
        artifact(3, 3354.5, 68),
        artifact(4, 2738.0, 68),
        artifact(5, 4160.3, 100),
      ],
      partOrder: [1, 2, 3, 0, 4],
      label: 'Workshop',
      targetGifKb: 4500,
      maxGifKb: 5000,
      originalFps: 10,
      retryAllowFpsDrop: true,
      retryAllowQualityDrop: true,
      emit: () => undefined,
      runFixedSplitPart: async (partIndex, fps, quality) => {
        attempts.push({ partIndex, fps, quality })
        const base = [4181.8, 2537.7, 3354.5, 2738.0, 4160.3][partIndex]
        const sizeGrowthKbByQuality = [48, 36, 32, 40, 24][partIndex]
        const sizeKb = base + (quality - 68) * sizeGrowthKbByQuality
        return artifact(partIndex + 1, sizeKb, quality, fps)
      },
    })

    expect(result[1].finalQuality).toBeGreaterThan(68)
    expect(result[2].finalQuality).toBeGreaterThan(68)
    expect(result[3].finalQuality).toBeGreaterThan(68)
    expect(result.every((item) => item.sizeKb <= 4500)).toBe(true)
    expect(attempts.filter((attempt) => attempt.quality > 68).length).toBeGreaterThanOrEqual(3)
  })

  it('keeps best accepted intermediate quality when the coarse ladder overshoots', async () => {
    const result = await recoverSplitBatchQuality({
      items: [artifact(1, 3354.5, 68)],
      partOrder: [0],
      label: 'Workshop',
      targetGifKb: 4500,
      maxGifKb: 5000,
      originalFps: 10,
      retryAllowFpsDrop: true,
      retryAllowQualityDrop: true,
      emit: () => undefined,
      runFixedSplitPart: async (partIndex, fps, quality) => {
        const sizeKb = quality === 76 ? 4700 : 3354.5 + (quality - 68) * 140
        return artifact(partIndex + 1, sizeKb, quality, fps)
      },
    })

    expect(result[0].finalQuality).toBeGreaterThan(68)
    expect(result[0].finalQuality).toBeLessThan(76)
    expect(result[0].finalQuality).toBe(75)
    expect(result[0].sizeKb).toBeLessThanOrEqual(4500)
  })

  it('recovers shared fps only when all parts still fit', async () => {
    const result = await recoverSplitBatchQuality({
      items: [artifact(1, 4300, 100, 10), artifact(2, 4400, 100, 10)],
      partOrder: [0, 1],
      label: 'Workshop',
      targetGifKb: 4500,
      maxGifKb: 5000,
      originalFps: 12,
      retryAllowFpsDrop: true,
      retryAllowQualityDrop: true,
      emit: () => undefined,
      runFixedSplitPart: async (partIndex, fps, quality) => {
        const sizeKb = partIndex === 0 ? 4400 : 4600
        return artifact(partIndex + 1, sizeKb, quality, fps)
      },
    })

    expect(result.every((item) => item.finalFps === 10)).toBe(true)
  })
})
