import { describe, expect, it } from 'vitest'
import { ConversionWorkerPool } from './conversionWorkerPool'
import type { AnyWorkerRequest, WorkerResponseMessage } from './types'

class FakeWorker {
  onmessage: ((event: MessageEvent<WorkerResponseMessage>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  terminated = false
  handledCommands: string[] = []
  private readonly delayMs: number

  constructor(delayMs = 5) {
    this.delayMs = delayMs
  }

  postMessage(message: AnyWorkerRequest): void {
    this.handledCommands.push(message.command)
    const reply = (payload: WorkerResponseMessage): void => {
      this.onmessage?.({ data: payload } as MessageEvent<WorkerResponseMessage>)
    }

    if (message.command === 'init') {
      setTimeout(() => {
        reply({
          id: message.id,
          event: 'result',
          payload: {
            command: 'init',
            data: { initialized: true },
          },
        })
      }, 0)
      return
    }

    if (message.command === 'probe') {
      setTimeout(() => {
        reply({
          id: message.id,
          event: 'progress',
          payload: {
            stage: 'probe',
            message: 'probing...',
          },
        })
        reply({
          id: message.id,
          event: 'result',
          payload: {
            command: 'probe',
            data: { width: 1280, height: 720, duration: 3.5, fps: 30, startOffsetSec: 0 },
          },
        })
      }, 0)
      return
    }

    if (message.command === 'clearFrameCache') {
      setTimeout(() => {
        reply({
          id: message.id,
          event: 'result',
          payload: {
            command: 'clearFrameCache',
            data: { cleared: true },
          },
        })
      }, 0)
      return
    }

    if (message.command === 'convertPart') {
      setTimeout(() => {
        const sourceBaseName = message.payload.fileName.replace(/\.[^.]+$/, '')
        reply({
          id: message.id,
          event: 'progress',
          payload: {
            stage: 'frames',
            message: 'extracting frames...',
          },
        })
        reply({
          id: message.id,
          event: 'memory',
          payload: {
            bucket: 'decoded-rgba',
            label: 'Decoded RGBA frame sequence',
            bytes: 4096,
            kind: 'estimate',
            stage: 'frames',
            requestId: message.id,
          },
        })
        reply({
          id: message.id,
          event: 'progress',
          payload: {
            stage: 'gifski',
            message: 'encoding gif...',
          },
        })
        reply({
          id: message.id,
          event: 'result',
          payload: {
            command: 'convertPart',
            data: {
              name: `${sourceBaseName}_part_${String(message.payload.partIndex + 1).padStart(2, '0')}.gif`,
              fileBytes: new Uint8Array([1, 2, 3]),
              sizeKb: 0.01,
              width: message.payload.partWidth,
              height: 100,
              status: 'original',
              finalFps: message.payload.gifFps,
              finalQuality: 100,
            },
          },
        })
      }, this.delayMs)
      return
    }

    setTimeout(() => {
      const sourceBaseName = message.payload.fileName.replace(/\.[^.]+$/, '')
      reply({
        id: message.id,
        event: 'result',
        payload: {
          command: 'convertFeatured',
          data: {
            name: `${sourceBaseName}_featured.gif`,
            fileBytes: new Uint8Array([1, 2, 3]),
            sizeKb: 0.01,
            width: 630,
            height: 100,
            status: 'original',
            finalFps: message.payload.gifFps,
            finalQuality: 100,
          },
        },
      })
    }, this.delayMs)
  }

  terminate(): void {
    this.terminated = true
  }
}

function convertPartPayload(partIndex: number) {
  return {
    fileName: 'a.mp4',
    fileBytes: new Uint8Array([1]),
    sourceCacheKey: 'test-source',
    isStillImage: false,
    srcWidth: 1280,
    srcHeight: 720,
    duration: 2,
    gifFps: 15,
    minGifFps: 10,
    disableOptimizations: false,
    maxGifKb: 5000,
    targetGifKb: 4500,
    optimizationMode: 'hybrid' as const,
    enableQualityRecovery: true,
    standardRetriesEnabled: true,
    retryAllowFpsDrop: true,
    retryAllowQualityDrop: true,
    lossyOversize: true,
    lossyLevel: 2,
    lossyMaxAttempts: 24,
    partIndex,
    parts: 5,
    partWidth: 150,
  }
}

describe('conversion worker pool', () => {
  it('warms up and handles probe/conversion tasks', async () => {
    const pool = new ConversionWorkerPool({
      workerCount: 2,
      workerFactory: () => new FakeWorker() as unknown as Worker,
    })

    await pool.warmup()

    const probe = await pool.runTask('probe', {
      fileName: 'a.mp4',
      fileBytes: new Uint8Array([1, 2]),
    })

    expect(probe.width).toBe(1280)

    const progressStages: string[] = []
    const memoryEvents: Array<{ bytes: number; workerIndex: number }> = []
    const outputs = await Promise.all([
      pool.runTask('convertPart', {
        ...convertPartPayload(0),
      }, {
        onProgress: (_, stage) => {
          progressStages.push(stage)
        },
        onMemoryDebug: (event, workerIndex) => {
          memoryEvents.push({ bytes: event.bytes, workerIndex })
        },
      }),
      pool.runTask('convertPart', convertPartPayload(1)),
    ])

    expect(outputs[0].name).toBe('a_part_01.gif')
    expect(outputs[1].name).toBe('a_part_02.gif')
    expect(progressStages).toContain('frames')
    expect(progressStages).toContain('gifski')
    expect(memoryEvents).toContainEqual({ bytes: 4096, workerIndex: 0 })

    pool.dispose()
  })

  it('clears frame caches across worker slots', async () => {
    const workers: FakeWorker[] = []
    const pool = new ConversionWorkerPool({
      workerCount: 2,
      workerFactory: () => {
        const worker = new FakeWorker()
        workers.push(worker)
        return worker as unknown as Worker
      },
    })

    await pool.clearFrameCaches()

    expect(workers.map((worker) => worker.handledCommands.filter((command) => command === 'clearFrameCache').length))
      .toEqual([1, 1])
    pool.dispose()
  })

  it('cancels pending tasks', async () => {
    const pool = new ConversionWorkerPool({
      workerCount: 1,
      workerFactory: () => new FakeWorker() as unknown as Worker,
    })

    const promise = pool.runTask('convertPart', convertPartPayload(0))

    pool.cancelAll('stop')

    await expect(promise).rejects.toThrow('stop')
    pool.dispose()
  })

  it('finishes active tasks while rejecting queued tasks without terminating workers', async () => {
    const workers: FakeWorker[] = []
    const pool = new ConversionWorkerPool({
      workerCount: 1,
      workerFactory: () => {
        const worker = new FakeWorker(20)
        workers.push(worker)
        return worker as unknown as Worker
      },
    })

    const active = pool.runTask('convertPart', convertPartPayload(0))
    const queued = pool.runTask('convertPart', convertPartPayload(1))
    const queuedRejection = queued.catch((error: unknown) => error)

    const finish = pool.finishCurrent('finish now')

    await expect(active).resolves.toMatchObject({ name: 'a_part_01.gif' })
    await expect(queuedRejection).resolves.toMatchObject({ message: 'finish now' })
    await expect(finish).resolves.toBeUndefined()
    expect(workers[0].terminated).toBe(false)
    expect(workers[0].handledCommands.filter((command) => command === 'convertPart')).toHaveLength(1)

    pool.dispose()
  })

  it('keeps tasks with the same affinity key on the same worker slot', async () => {
    const workers: FakeWorker[] = []
    const pool = new ConversionWorkerPool({
      workerCount: 2,
      workerFactory: () => {
        const worker = new FakeWorker()
        workers.push(worker)
        return worker as unknown as Worker
      },
    })

    await pool.runTask('convertPart', convertPartPayload(0), { affinityKey: 'part-1' })
    await pool.runTask('convertPart', convertPartPayload(0), { affinityKey: 'part-1' })

    expect(workers.map((worker) => worker.handledCommands.filter((command) => command === 'convertPart').length))
      .toEqual([2, 0])
    pool.dispose()
  })

  it('runs different affinity keys in parallel on separate idle workers', async () => {
    const workers: FakeWorker[] = []
    const pool = new ConversionWorkerPool({
      workerCount: 2,
      workerFactory: () => {
        const worker = new FakeWorker(20)
        workers.push(worker)
        return worker as unknown as Worker
      },
    })

    const first = pool.runTask('convertPart', convertPartPayload(0), { affinityKey: 'part-1' })
    const second = pool.runTask('convertPart', convertPartPayload(1), { affinityKey: 'part-2' })

    expect(workers.map((worker) => worker.handledCommands.filter((command) => command === 'convertPart').length))
      .toEqual([1, 1])

    await Promise.all([first, second])
    pool.dispose()
  })

  it('does not let a blocked affinity task starve unrelated queued work', async () => {
    const workers: FakeWorker[] = []
    const pool = new ConversionWorkerPool({
      workerCount: 2,
      workerFactory: () => {
        const worker = new FakeWorker(20)
        workers.push(worker)
        return worker as unknown as Worker
      },
    })

    const first = pool.runTask('convertPart', convertPartPayload(0), { affinityKey: 'part-1' })
    const sameAffinity = pool.runTask('convertPart', convertPartPayload(0), { affinityKey: 'part-1' })
    const unrelated = pool.runTask('convertPart', convertPartPayload(1))

    expect(workers.map((worker) => worker.handledCommands.filter((command) => command === 'convertPart').length))
      .toEqual([1, 1])

    await Promise.all([first, sameAffinity, unrelated])
    expect(workers.map((worker) => worker.handledCommands.filter((command) => command === 'convertPart').length))
      .toEqual([2, 1])
    pool.dispose()
  })
})
