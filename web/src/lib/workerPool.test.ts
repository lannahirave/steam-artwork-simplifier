import { describe, expect, it } from 'vitest'
import { FFmpegWorkerPool } from './workerPool'
import type { AnyWorkerRequest, WorkerResponseMessage } from './types'

class FakeWorker {
  onmessage: ((event: MessageEvent<WorkerResponseMessage>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  terminated = false

  postMessage(message: AnyWorkerRequest): void {
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
              finalColors: 256,
            },
          },
        })
      }, 5)
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
            finalColors: 256,
          },
        },
      })
    }, 5)
  }

  terminate(): void {
    this.terminated = true
  }
}

describe('worker pool', () => {
  it('warms up and handles probe/conversion tasks', async () => {
    const pool = new FFmpegWorkerPool({
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
    const outputs = await Promise.all([
      pool.runTask('convertPart', {
        fileName: 'a.mp4',
        fileBytes: new Uint8Array([1]),
        isStillImage: false,
        srcWidth: 1280,
        srcHeight: 720,
        duration: 2,
        gifFps: 15,
        minGifFps: 10,
        disableOptimizations: false,
        maxGifKb: 5000,
        targetGifKb: 4500,
        standardRetriesEnabled: true,
        retryAllowFpsDrop: true,
        retryAllowColorDrop: true,
        lossyOversize: true,
        lossyLevel: 2,
        lossyMaxAttempts: 24,
        partIndex: 0,
        parts: 5,
        partWidth: 150,
      }, {
        onProgress: (_, stage) => {
          progressStages.push(stage)
        },
      }),
      pool.runTask('convertPart', {
        fileName: 'a.mp4',
        fileBytes: new Uint8Array([1]),
        isStillImage: false,
        srcWidth: 1280,
        srcHeight: 720,
        duration: 2,
        gifFps: 15,
        minGifFps: 10,
        disableOptimizations: false,
        maxGifKb: 5000,
        targetGifKb: 4500,
        standardRetriesEnabled: true,
        retryAllowFpsDrop: true,
        retryAllowColorDrop: true,
        lossyOversize: true,
        lossyLevel: 2,
        lossyMaxAttempts: 24,
        partIndex: 1,
        parts: 5,
        partWidth: 150,
      }),
    ])

    expect(outputs[0].name).toBe('a_part_01.gif')
    expect(outputs[1].name).toBe('a_part_02.gif')
    expect(progressStages).toContain('frames')
    expect(progressStages).toContain('gifski')

    pool.dispose()
  })

  it('cancels pending tasks', async () => {
    const pool = new FFmpegWorkerPool({
      workerCount: 1,
      workerFactory: () => new FakeWorker() as unknown as Worker,
    })

    const promise = pool.runTask('convertPart', {
      fileName: 'a.mp4',
      fileBytes: new Uint8Array([1]),
      isStillImage: false,
      srcWidth: 1280,
      srcHeight: 720,
      duration: 2,
      gifFps: 15,
      minGifFps: 10,
      disableOptimizations: false,
      maxGifKb: 5000,
      targetGifKb: 4500,
      standardRetriesEnabled: true,
      retryAllowFpsDrop: true,
      retryAllowColorDrop: true,
      lossyOversize: true,
      lossyLevel: 2,
      lossyMaxAttempts: 24,
      partIndex: 0,
      parts: 5,
      partWidth: 150,
    })

    pool.cancelAll('stop')

    await expect(promise).rejects.toThrow('stop')
    pool.dispose()
  })
})
