import type {
  BrowserMemoryBreakdownItem,
  BrowserMemorySample,
  BrowserMemorySampleSource,
  MemoryDebugBucket,
  MemoryDebugEvent,
  MemoryDebugEventData,
  MemoryDebugSession,
} from './types'

export const MEMORY_DEBUG_HISTORY_LIMIT = 400

interface MemoryMeasurementBreakdown {
  bytes?: number
  attribution?: Array<{
    url?: string
    scope?: string
  }>
  types?: string[]
}

interface UserAgentSpecificMemoryResult {
  bytes?: number
  breakdown?: MemoryMeasurementBreakdown[]
}

interface BrowserHeapMemory {
  usedJSHeapSize?: number
  totalJSHeapSize?: number
  jsHeapSizeLimit?: number
}

interface PerformanceWithMemory extends Performance {
  memory?: BrowserHeapMemory
  measureUserAgentSpecificMemory?: () => Promise<UserAgentSpecificMemoryResult>
}

export interface MemoryDebugBucketSummary {
  bucket: MemoryDebugBucket
  observedBytes: number
  retainedBytes: number
  peakBytes: number
  events: number
}

export interface MemoryDebugWorkerSummary {
  workerIndex: number
  retainedBytes: number
  observedBytes: number
  events: number
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatTime(date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  const millis = String(date.getMilliseconds()).padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${millis}`
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return 'n/a'
  }
  const abs = Math.abs(bytes)
  if (abs >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`
  }
  if (abs >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  }
  if (abs >= 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`
  }
  return `${bytes.toFixed(0)}B`
}

export function createMemoryDebugEvent(
  data: MemoryDebugEventData,
  source: MemoryDebugEvent['source'],
  workerIndex?: number,
): MemoryDebugEvent {
  return {
    ...data,
    id: createId('mem-event'),
    time: formatTime(),
    timeMs: Date.now(),
    source,
    workerIndex,
  }
}

function normalizeBreakdown(
  breakdown: MemoryMeasurementBreakdown[] | undefined,
): BrowserMemoryBreakdownItem[] {
  if (!Array.isArray(breakdown)) {
    return []
  }

  return breakdown.map((item) => {
    const attribution = item.attribution?.[0]
    return {
      bytes: typeof item.bytes === 'number' ? item.bytes : 0,
      scope: attribution?.scope ?? 'unattributed',
      url: attribution?.url ?? '',
      types: Array.isArray(item.types) ? item.types : [],
    }
  })
}

export async function sampleBrowserMemory(label: string): Promise<BrowserMemorySample> {
  const now = new Date()
  if (typeof performance === 'undefined') {
    return {
      id: createId('mem-sample'),
      time: formatTime(now),
      timeMs: now.getTime(),
      label,
      source: 'unavailable',
      bytes: null,
      breakdown: [],
      note: 'Browser memory APIs are unavailable in this runtime.',
    }
  }

  const performanceWithMemory = performance as PerformanceWithMemory
  if (typeof performanceWithMemory.measureUserAgentSpecificMemory === 'function') {
    try {
      const result = await performanceWithMemory.measureUserAgentSpecificMemory()
      const bytes = typeof result.bytes === 'number' ? result.bytes : null
      return {
        id: createId('mem-sample'),
        time: formatTime(now),
        timeMs: now.getTime(),
        label,
        source: 'measureUserAgentSpecificMemory',
        bytes,
        breakdown: normalizeBreakdown(result.breakdown),
      }
    } catch (error) {
      const fallback = readPerformanceMemory('performance.memory')
      return {
        ...fallback,
        label,
        note:
          `measureUserAgentSpecificMemory failed; using limited JS heap fallback. ` +
          `${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  return readPerformanceMemory('performance.memory', label)
}

function readPerformanceMemory(
  source: BrowserMemorySampleSource,
  label = 'sample',
): BrowserMemorySample {
  const now = new Date()
  const memory = (performance as PerformanceWithMemory).memory
  if (!memory || typeof memory.usedJSHeapSize !== 'number') {
    return {
      id: createId('mem-sample'),
      time: formatTime(now),
      timeMs: now.getTime(),
      label,
      source: 'unavailable',
      bytes: null,
      breakdown: [],
      note: 'No browser memory API is available.',
    }
  }

  return {
    id: createId('mem-sample'),
    time: formatTime(now),
    timeMs: now.getTime(),
    label,
    source,
    bytes: memory.usedJSHeapSize,
    usedJSHeapSize: memory.usedJSHeapSize,
    totalJSHeapSize: memory.totalJSHeapSize,
    jsHeapSizeLimit: memory.jsHeapSizeLimit,
    breakdown: [],
    note: 'Limited JS heap fallback; worker memory may be underreported.',
  }
}

export function createEmptyMemoryDebugSession(): MemoryDebugSession {
  return {
    events: [],
    samples: [],
  }
}

function appendBounded<T>(items: T[], item: T, limit = MEMORY_DEBUG_HISTORY_LIMIT): T[] {
  return [...items, item].slice(-limit)
}

export function appendMemoryDebugEvent(
  session: MemoryDebugSession,
  event: MemoryDebugEvent,
): MemoryDebugSession {
  return {
    ...session,
    events: appendBounded(session.events, event),
  }
}

export function appendBrowserMemorySample(
  session: MemoryDebugSession,
  sample: BrowserMemorySample,
): MemoryDebugSession {
  return {
    ...session,
    samples: appendBounded(session.samples, sample),
  }
}

export function summarizeMemoryDebugBuckets(events: MemoryDebugEvent[]): MemoryDebugBucketSummary[] {
  const rows = new Map<MemoryDebugBucket, MemoryDebugBucketSummary>()
  const retainedByKey = new Map<string, MemoryDebugEvent>()

  for (const event of events) {
    const current = rows.get(event.bucket) ?? {
      bucket: event.bucket,
      observedBytes: 0,
      retainedBytes: 0,
      peakBytes: 0,
      events: 0,
    }
    current.observedBytes += event.bytes
    current.peakBytes = Math.max(current.peakBytes, event.bytes)
    current.events += 1
    rows.set(event.bucket, current)

    if (event.kind === 'retained' && event.retainedKey) {
      retainedByKey.set(`${event.source}:${event.workerIndex ?? 'main'}:${event.retainedKey}`, event)
    }
  }

  for (const event of retainedByKey.values()) {
    const row = rows.get(event.bucket)
    if (row) {
      row.retainedBytes += event.bytes
    }
  }

  return Array.from(rows.values()).sort((left, right) =>
    right.retainedBytes - left.retainedBytes || right.observedBytes - left.observedBytes,
  )
}

export function summarizeMemoryDebugWorkers(events: MemoryDebugEvent[]): MemoryDebugWorkerSummary[] {
  const rows = new Map<number, MemoryDebugWorkerSummary>()
  const retainedByKey = new Map<string, MemoryDebugEvent>()

  for (const event of events) {
    if (event.workerIndex === undefined) {
      continue
    }
    const current = rows.get(event.workerIndex) ?? {
      workerIndex: event.workerIndex,
      retainedBytes: 0,
      observedBytes: 0,
      events: 0,
    }
    current.observedBytes += event.bytes
    current.events += 1
    rows.set(event.workerIndex, current)

    if (event.kind === 'retained' && event.retainedKey) {
      retainedByKey.set(`${event.workerIndex}:${event.retainedKey}`, event)
    }
  }

  for (const event of retainedByKey.values()) {
    if (event.workerIndex === undefined) {
      continue
    }
    const row = rows.get(event.workerIndex)
    if (row) {
      row.retainedBytes += event.bytes
    }
  }

  return Array.from(rows.values()).sort((left, right) => left.workerIndex - right.workerIndex)
}

export function getPeakBrowserMemorySample(
  samples: BrowserMemorySample[],
): BrowserMemorySample | null {
  return samples.reduce<BrowserMemorySample | null>((peak, sample) => {
    if (sample.bytes === null) {
      return peak
    }
    if (!peak || peak.bytes === null || sample.bytes > peak.bytes) {
      return sample
    }
    return peak
  }, null)
}
