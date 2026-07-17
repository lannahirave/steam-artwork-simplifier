import { describe, expect, it } from 'vitest'
import { getDefaultConfig } from './defaults'
import { convertVideo } from './conversion'
import { FinishCurrentConversionError } from './conversionWorkerPool'
import type {
  ConvertPartPayload,
  ProbePayload,
  WorkerCommand,
  WorkerRequestPayloadMap,
  WorkerResultDataMap,
} from './types'

class FakeConversionPool {
  readonly partPayloads: ConvertPartPayload[] = []
  clearFrameCacheCalls = 0
  finishAfterConvertParts: number | null = null
  sharedFpsRecoveryFixture = false

  async warmup(): Promise<void> {
    return undefined
  }

  async clearFrameCaches(): Promise<void> {
    this.clearFrameCacheCalls += 1
    return undefined
  }

  async runTask<T extends WorkerCommand>(
    command: T,
    payload: WorkerRequestPayloadMap[T],
  ): Promise<WorkerResultDataMap[T]> {
    if (command === 'probe') {
      const probePayload = payload as ProbePayload
      expect(probePayload.fileName).toBe('clip.mp4')
      return {
        width: 600,
        height: 300,
        duration: 2,
        fps: 30,
        startOffsetSec: 0,
      } as WorkerResultDataMap[T]
    }

    if (command !== 'convertPart') {
      throw new Error(`Unexpected command ${command}`)
    }

    const partPayload = payload as ConvertPartPayload
    this.partPayloads.push(partPayload)
    if (
      this.finishAfterConvertParts !== null &&
      this.partPayloads.length > this.finishAfterConvertParts
    ) {
      throw new FinishCurrentConversionError()
    }
    const rowIndex = Math.floor(partPayload.partIndex / (partPayload.splitColumns ?? 1))
    const columnIndex = partPayload.partIndex % (partPayload.splitColumns ?? 1)
    const heights = partPayload.splitRowHeights?.join('/')
    const isBalanced = heights === '60/30/60'
    const sizingSize =
      rowIndex === 1
        ? 1000
        : isBalanced
          ? 700
          : 100

    return {
      name: `clip_row_${String(rowIndex + 1).padStart(2, '0')}_part_${String(columnIndex + 1).padStart(2, '0')}.gif`,
      fileBytes: this.sharedFpsRecoveryFixture
        ? new Uint8Array([partPayload.gifFps, partPayload.disableOptimizations ? 1 : 0, partPayload.fixedQuality ?? 0])
        : new Uint8Array([partPayload.partIndex]),
      sizeKb: this.sharedFpsRecoveryFixture
        ? partPayload.disableOptimizations
          ? partPayload.fixedQuality !== undefined || partPayload.fixedQualityCandidates !== undefined
            ? partPayload.gifFps === 10
              ? 3000
              : 3200
            : 6000
          : partPayload.gifFps === 10
            ? 3000
            : 3200
        : partPayload.disableOptimizations
          ? sizingSize
          : 900,
      width: partPayload.partWidth,
      height: partPayload.splitRowHeights?.[rowIndex] ?? 50,
      status: 'recompressed',
      finalFps: partPayload.gifFps,
      finalQuality: partPayload.disableOptimizations ? 100 : 80,
    } as WorkerResultDataMap[T]
  }
}

describe('conversion orchestration', () => {
  it('applies balanced row heights to workshop multi-row final passes', async () => {
    const pool = new FakeConversionPool()
    const config = {
      ...getDefaultConfig('workshop'),
      parts: 2,
      workshopRows: 3 as const,
      partWidth: 150,
      gifFps: 10,
      minGifFps: 10,
      workerCount: 3,
    }
    const file = new File([new Uint8Array([1, 2, 3])], 'clip.mp4', { type: 'video/mp4' })

    const result = await convertVideo({ file }, config, pool as never)

    expect(result.artifacts).toHaveLength(6)
    expect(result.logs.length).toBeGreaterThan(0)
    expect(result.logs.every((line) => line.includes('[heap '))).toBe(true)
    expect(pool.partPayloads.some((payload) => payload.splitRowHeights?.join('/') === '60/30/60')).toBe(true)
    expect(
      pool.partPayloads
        .filter((payload) => !payload.disableOptimizations)
        .every((payload) => payload.splitRowHeights?.join('/') === '60/30/60'),
    ).toBe(true)
    expect(result.completionStatus).toBe('complete')
    expect(result.completedOutputs).toBe(6)
    expect(result.expectedOutputs).toBe(6)
    expect(pool.clearFrameCacheCalls).toBe(1)
  })

  it('returns completed outputs when finishing before a full output set exists', async () => {
    const pool = new FakeConversionPool()
    pool.finishAfterConvertParts = 1
    const config = {
      ...getDefaultConfig('workshop'),
      parts: 2,
      workshopRows: 1 as const,
      workerCount: 2,
    }
    const file = new File([new Uint8Array([1, 2, 3])], 'clip.mp4', { type: 'video/mp4' })

    const result = await convertVideo({ file }, config, pool as never)

    expect(result.completionStatus).toBe('finished-incomplete')
    expect(result.artifacts).toHaveLength(1)
    expect(result.completedOutputs).toBe(1)
    expect(result.expectedOutputs).toBe(2)
    expect(result.warnings).toContain(
      'Finished early with 1/2 output(s). Keeping completed outputs even if they exceed the target size.',
    )
    expect(pool.clearFrameCacheCalls).toBe(1)
  })

  it('keeps the newest accepted shared FPS output when finishing after recovery checkpoint', async () => {
    const pool = new FakeConversionPool()
    pool.sharedFpsRecoveryFixture = true
    const config = {
      ...getDefaultConfig('workshop'),
      parts: 2,
      workshopRows: 1 as const,
      partWidth: 150,
      gifFps: 13,
      minGifFps: 10,
      targetGifKb: 3500,
      maxGifKb: 4500,
      retryAllowQualityDrop: true,
      workerCount: 2,
    }
    const file = new File([new Uint8Array([1, 2, 3])], 'clip.mp4', { type: 'video/mp4' })

    const result = await convertVideo({ file }, config, pool as never, {
      shouldFinishCurrent: () =>
        pool.partPayloads.filter((payload) => payload.disableOptimizations && payload.gifFps === 13 && payload.fixedQuality !== undefined).length >= 2,
    })

    expect(result.completionStatus).toBe('finished-incomplete')
    expect(result.artifacts).toHaveLength(2)
    expect(result.artifacts.every((artifact) => artifact.finalFps === 13)).toBe(true)
    const outputBytes = await Promise.all(result.artifacts.map(async (artifact) => Array.from(new Uint8Array(await artifact.blob.arrayBuffer()))))
    expect(outputBytes.map(([fps, raw]) => [fps, raw])).toEqual([[13, 1], [13, 1]])
    expect(result.completedOutputs).toBe(2)
    expect(result.expectedOutputs).toBe(2)
  })
  it('keeps the last complete output set when finishing before quality recovery', async () => {
    const pool = new FakeConversionPool()
    const config = {
      ...getDefaultConfig('workshop'),
      parts: 2,
      workshopRows: 1 as const,
      partWidth: 150,
      gifFps: 10,
      minGifFps: 10,
      workerCount: 2,
    }
    const file = new File([new Uint8Array([1, 2, 3])], 'clip.mp4', { type: 'video/mp4' })

    const result = await convertVideo({ file }, config, pool as never, {
      shouldFinishCurrent: () =>
        pool.partPayloads.filter((payload) => !payload.disableOptimizations).length >= 2,
    })

    expect(result.completionStatus).toBe('finished-incomplete')
    expect(result.artifacts).toHaveLength(2)
    expect(result.completedOutputs).toBe(2)
    expect(result.expectedOutputs).toBe(2)
    expect(result.warnings.some((warning) => warning.includes('Keeping completed outputs'))).toBe(true)
    expect(pool.clearFrameCacheCalls).toBe(1)
  })
})
