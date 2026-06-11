import { describe, expect, it } from 'vitest'
import {
  createQualityBinarySearch,
  nextQualityBinaryProbe,
  recordQualityBinaryProbe,
} from './gifskiQuality'
import { recoverSplitBatchQuality } from './splitRecovery'
import type { FixedQualitySearch, WorkerArtifactData } from './types'

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

function fakeBinaryQualitySearch(input: {
  partIndex: number
  fps: number
  search: FixedQualitySearch
  budgetKb: number
  sizeFor: (partIndex: number, quality: number) => number
  attempts?: Array<{ partIndex: number; fps: number; quality: number }>
  onAttempt?: (attempt: { partIndex: number; fps: number; quality: number }) => void
}): WorkerArtifactData {
  let state = createQualityBinarySearch(input.search.lowExclusive, input.search.highInclusive)
  let probe = nextQualityBinaryProbe(state)
  let best: WorkerArtifactData | null = null
  let last: WorkerArtifactData | null = null

  while (probe !== null) {
    const attemptRecord = { partIndex: input.partIndex, fps: input.fps, quality: probe }
    input.attempts?.push(attemptRecord)
    input.onAttempt?.(attemptRecord)
    const sizeKb = input.sizeFor(input.partIndex, probe)
    const attempt = artifact(input.partIndex + 1, sizeKb, probe, input.fps)
    const accepted = sizeKb <= input.budgetKb
    if (accepted && (!best || attempt.finalQuality > best.finalQuality)) {
      best = attempt
    }
    last = attempt
    state = recordQualityBinaryProbe(state, probe, accepted)
    probe = nextQualityBinaryProbe(state)
  }

  if (!best && !last) {
    throw new Error('No fake binary search probes were produced.')
  }

  return best ?? last!
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
      runFixedSplitPartQualitySearch: async (partIndex, fps, search, budgetKb) =>
        fakeBinaryQualitySearch({
          partIndex,
          fps,
          search,
          budgetKb,
          attempts,
          sizeFor: (index, quality) => {
            const base = [4181.8, 2537.7, 3354.5, 2738.0, 4160.3][index]
            const sizeGrowthKbByQuality = [48, 36, 32, 40, 24][index]
            return base + (quality - 68) * sizeGrowthKbByQuality
          },
        }),
    })

    expect(result[1].finalQuality).toBeGreaterThan(68)
    expect(result[2].finalQuality).toBeGreaterThan(68)
    expect(result[3].finalQuality).toBeGreaterThan(68)
    expect(result.every((item) => item.sizeKb <= 4500)).toBe(true)
    expect(attempts.filter((attempt) => attempt.quality > 68).length).toBeGreaterThanOrEqual(3)
  })

  it('keeps best accepted intermediate quality when the coarse ladder overshoots', async () => {
    const attempts: number[] = []
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
      runFixedSplitPartQualitySearch: async (partIndex, fps, search, budgetKb) =>
        fakeBinaryQualitySearch({
          partIndex,
          fps,
          search,
          budgetKb,
          onAttempt: (attempt) => attempts.push(attempt.quality),
          sizeFor: (_index, quality) => quality === 76 ? 4700 : 3354.5 + (quality - 68) * 140,
        }),
    })

    expect(result[0].finalQuality).toBeGreaterThan(68)
    expect(result[0].finalQuality).toBeLessThan(76)
    expect(result[0].finalQuality).toBe(75)
    expect(result[0].sizeKb).toBeLessThanOrEqual(4500)
    expect(attempts).toEqual([72, 74, 75, 76])
  })

  it('logs quality recovery details', async () => {
    const logs: string[] = []
    await recoverSplitBatchQuality({
      items: [artifact(1, 3354.5, 68)],
      partOrder: [0],
      label: 'Workshop',
      targetGifKb: 4500,
      maxGifKb: 5000,
      originalFps: 10,
      retryAllowFpsDrop: true,
      retryAllowQualityDrop: true,
      emit: (_stage, message) => logs.push(message),
      runFixedSplitPart: async (partIndex, fps, quality) => artifact(partIndex + 1, 4200, quality, fps),
      runFixedSplitPartQualitySearch: async (partIndex, fps, search) => artifact(partIndex + 1, 4200, search.highInclusive, fps),
    })

    expect(logs.some((message) => message.includes('quality='))).toBe(true)
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
      runFixedSplitPartQualitySearch: async (partIndex, fps, search) => artifact(partIndex + 1, 4300, search.highInclusive, fps),
    })

    expect(result.every((item) => item.finalFps === 10)).toBe(true)
  })

  it('stops shared fps recovery after the limiting part fails', async () => {
    const fpsAttempts: number[] = []
    const result = await recoverSplitBatchQuality({
      items: [artifact(1, 4300, 100, 10), artifact(2, 3000, 100, 10), artifact(3, 3000, 100, 10)],
      partOrder: [0, 1, 2],
      label: 'Workshop',
      targetGifKb: 4500,
      maxGifKb: 5000,
      originalFps: 11,
      retryAllowFpsDrop: true,
      retryAllowQualityDrop: false,
      emit: () => undefined,
      runFixedSplitPart: async (partIndex, fps, quality) => {
        fpsAttempts.push(partIndex)
        return artifact(partIndex + 1, partIndex === 0 ? 4600 : 3200, quality, fps)
      },
      runFixedSplitPartQualitySearch: async (partIndex, fps, search) => artifact(partIndex + 1, 3200, search.highInclusive, fps),
    })

    expect(result.every((item) => item.finalFps === 10)).toBe(true)
    expect(fpsAttempts).toEqual([0])
  })
})
