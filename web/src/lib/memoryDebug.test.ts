import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  appendMemoryDebugEvent,
  createEmptyMemoryDebugSession,
  createMemoryDebugEvent,
  MEMORY_DEBUG_HISTORY_LIMIT,
  sampleBrowserMemory,
  summarizeMemoryDebugBuckets,
  summarizeMemoryDebugWorkers,
} from './memoryDebug'

const originalMeasure = (performance as Performance & {
  measureUserAgentSpecificMemory?: unknown
}).measureUserAgentSpecificMemory
const originalMemory = (performance as Performance & {
  memory?: unknown
}).memory

afterEach(() => {
  Object.defineProperty(performance, 'measureUserAgentSpecificMemory', {
    configurable: true,
    value: originalMeasure,
  })
  Object.defineProperty(performance, 'memory', {
    configurable: true,
    value: originalMemory,
  })
})

describe('memory debug sampler', () => {
  it('uses measureUserAgentSpecificMemory with browser breakdown when available', async () => {
    Object.defineProperty(performance, 'measureUserAgentSpecificMemory', {
      configurable: true,
      value: vi.fn().mockResolvedValue({
        bytes: 1234,
        breakdown: [
          {
            bytes: 1000,
            attribution: [{ scope: 'DedicatedWorkerGlobalScope', url: 'worker.js' }],
            types: ['JS'],
          },
        ],
      }),
    })

    const sample = await sampleBrowserMemory('test')

    expect(sample.source).toBe('measureUserAgentSpecificMemory')
    expect(sample.bytes).toBe(1234)
    expect(sample.breakdown).toEqual([
      {
        bytes: 1000,
        scope: 'DedicatedWorkerGlobalScope',
        url: 'worker.js',
        types: ['JS'],
      },
    ])
  })

  it('falls back to limited performance.memory data', async () => {
    Object.defineProperty(performance, 'measureUserAgentSpecificMemory', {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(performance, 'memory', {
      configurable: true,
      value: {
        usedJSHeapSize: 2048,
        totalJSHeapSize: 4096,
        jsHeapSizeLimit: 8192,
      },
    })

    const sample = await sampleBrowserMemory('fallback')

    expect(sample.source).toBe('performance.memory')
    expect(sample.bytes).toBe(2048)
    expect(sample.note).toContain('worker memory may be underreported')
  })
})

describe('memory debug summaries', () => {
  it('keeps bounded event history', () => {
    let session = createEmptyMemoryDebugSession()
    for (let index = 0; index < MEMORY_DEBUG_HISTORY_LIMIT + 5; index += 1) {
      session = appendMemoryDebugEvent(session, createMemoryDebugEvent({
        bucket: 'decoded-rgba',
        label: `event ${index}`,
        bytes: index,
        kind: 'estimate',
        stage: 'frames',
      }, 'main'))
    }

    expect(session.events).toHaveLength(MEMORY_DEBUG_HISTORY_LIMIT)
    expect(session.events[0].bytes).toBe(5)
  })

  it('summarizes retained buckets and workers independently', () => {
    const events = [
      createMemoryDebugEvent({
        bucket: 'frame-cache-retained',
        label: 'worker 1 cache',
        bytes: 100,
        kind: 'retained',
        stage: 'frames',
        retainedKey: 'frame-cache',
      }, 'worker', 1),
      createMemoryDebugEvent({
        bucket: 'frame-cache-retained',
        label: 'worker 2 cache',
        bytes: 300,
        kind: 'retained',
        stage: 'frames',
        retainedKey: 'frame-cache',
      }, 'worker', 2),
      createMemoryDebugEvent({
        bucket: 'decoded-rgba',
        label: 'decode',
        bytes: 500,
        kind: 'estimate',
        stage: 'frames',
      }, 'worker', 2),
    ]

    expect(summarizeMemoryDebugBuckets(events)[0]).toMatchObject({
      bucket: 'frame-cache-retained',
      retainedBytes: 400,
    })
    expect(summarizeMemoryDebugWorkers(events)).toEqual([
      {
        workerIndex: 1,
        retainedBytes: 100,
        observedBytes: 100,
        events: 1,
      },
      {
        workerIndex: 2,
        retainedBytes: 300,
        observedBytes: 800,
        events: 2,
      },
    ])
  })
})
