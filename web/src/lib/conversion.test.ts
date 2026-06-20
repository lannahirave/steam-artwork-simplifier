import { describe, expect, it } from 'vitest'
import { getDefaultConfig } from './defaults'
import { convertVideo } from './conversion'
import type {
  ConvertPartPayload,
  ProbePayload,
  WorkerCommand,
  WorkerRequestPayloadMap,
  WorkerResultDataMap,
} from './types'

class FakeConversionPool {
  readonly partPayloads: ConvertPartPayload[] = []

  async warmup(): Promise<void> {
    return undefined
  }

  async clearFrameCaches(): Promise<void> {
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
      fileBytes: new Uint8Array([partPayload.partIndex]),
      sizeKb: partPayload.disableOptimizations ? sizingSize : 900,
      width: partPayload.partWidth,
      height: partPayload.splitRowHeights?.[rowIndex] ?? 50,
      status: 'recompressed',
      finalFps: partPayload.gifFps,
      finalQuality: 100,
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
  })
})
