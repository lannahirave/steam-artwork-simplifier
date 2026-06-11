import { describe, expect, it } from 'vitest'
import { recoverSplitBatchQuality } from './splitRecovery'
import type { WorkerArtifactData } from './types'

function artifact(part: number, sizeKb: number, finalColors: number, finalFps = 10): WorkerArtifactData {
  return {
    name: `dice_part_${String(part).padStart(2, '0')}.gif`,
    fileBytes: new Uint8Array([part]),
    sizeKb,
    width: 150,
    height: 987,
    status: 'recompressed',
    finalFps,
    finalColors,
  }
}

describe('split batch quality recovery', () => {
  it('recovers under-budget split parts to higher color values', async () => {
    const attempts: Array<{ partIndex: number; fps: number; colors: number }> = []
    const result = await recoverSplitBatchQuality({
      items: [
        artifact(1, 4181.8, 224),
        artifact(2, 2537.7, 128),
        artifact(3, 3354.5, 128),
      ],
      partOrder: [1, 2, 0],
      label: 'Workshop',
      targetGifKb: 4500,
      maxGifKb: 5000,
      originalFps: 10,
      retryAllowFpsDrop: true,
      retryAllowColorDrop: true,
      emit: () => undefined,
      runFixedSplitPart: async (partIndex, fps, colors) => {
        attempts.push({ partIndex, fps, colors })
        const base = [4181.8, 2537.7, 3354.5][partIndex]
        const sizeKb = base + (colors - 128) * 12
        return artifact(partIndex + 1, sizeKb, colors, fps)
      },
    })

    expect(result[1].finalColors).toBeGreaterThan(128)
    expect(result[2].finalColors).toBeGreaterThan(128)
    expect(result.every((item) => item.sizeKb <= 4500)).toBe(true)
    expect(attempts.some((attempt) => attempt.colors > 128)).toBe(true)
  })

  it('keeps best accepted intermediate color when the coarse ladder overshoots', async () => {
    const result = await recoverSplitBatchQuality({
      items: [artifact(1, 3354.5, 128)],
      partOrder: [0],
      label: 'Workshop',
      targetGifKb: 4500,
      maxGifKb: 5000,
      originalFps: 10,
      retryAllowFpsDrop: true,
      retryAllowColorDrop: true,
      emit: () => undefined,
      runFixedSplitPart: async (partIndex, fps, colors) => {
        const sizeKb = colors === 160 ? 4700 : 3354.5 + (colors - 128) * 18
        return artifact(partIndex + 1, sizeKb, colors, fps)
      },
    })

    expect(result[0].finalColors).toBeGreaterThan(128)
    expect(result[0].finalColors).toBeLessThan(160)
    expect(result[0].sizeKb).toBeLessThanOrEqual(4500)
  })

  it('recovers shared fps only when all parts still fit', async () => {
    const result = await recoverSplitBatchQuality({
      items: [artifact(1, 4300, 256, 10), artifact(2, 4400, 256, 10)],
      partOrder: [0, 1],
      label: 'Workshop',
      targetGifKb: 4500,
      maxGifKb: 5000,
      originalFps: 12,
      retryAllowFpsDrop: true,
      retryAllowColorDrop: true,
      emit: () => undefined,
      runFixedSplitPart: async (partIndex, fps, colors) => {
        const sizeKb = partIndex === 0 ? 4400 : 4600
        return artifact(partIndex + 1, sizeKb, colors, fps)
      },
    })

    expect(result.every((item) => item.finalFps === 10)).toBe(true)
  })
})
