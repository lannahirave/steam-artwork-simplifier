import { useMemo, useState } from 'react'
import {
  formatBytes,
  getPeakBrowserMemorySample,
  summarizeMemoryDebugBuckets,
  summarizeMemoryDebugWorkers,
} from '../../lib/memoryDebug'
import type { BrowserMemorySample, MemoryDebugEvent, MemoryDebugSession } from '../../lib/types'

interface MemoryDebugPanelProps {
  memoryDebug: MemoryDebugSession
  busy: boolean
}

function sampleTitle(sample: BrowserMemorySample | null): string {
  if (!sample) {
    return 'No sample yet'
  }
  return `${formatBytes(sample.bytes)} via ${sample.source}`
}

function eventSourceLabel(event: MemoryDebugEvent): string {
  if (event.source === 'worker') {
    return `worker ${event.workerIndex ?? '?'}`
  }
  return 'main'
}

export function MemoryDebugPanel({ memoryDebug, busy }: MemoryDebugPanelProps) {
  const [copied, setCopied] = useState(false)
  const latestSample = memoryDebug.samples[memoryDebug.samples.length - 1] ?? null
  const peakSample = useMemo(
    () => getPeakBrowserMemorySample(memoryDebug.samples),
    [memoryDebug.samples],
  )
  const bucketRows = useMemo(
    () => summarizeMemoryDebugBuckets(memoryDebug.events),
    [memoryDebug.events],
  )
  const workerRows = useMemo(
    () => summarizeMemoryDebugWorkers(memoryDebug.events),
    [memoryDebug.events],
  )
  const recentEvents = memoryDebug.events.slice(-14).reverse()
  const currentBreakdown = latestSample?.breakdown.slice(0, 8) ?? []

  async function copyDebugJson(): Promise<void> {
    const payload = JSON.stringify(memoryDebug, null, 2)
    try {
      await navigator.clipboard.writeText(payload)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  return (
    <details className="memory-debug-panel">
      <summary>
        <span>
          <strong>Memory Debug</strong>
          <small>{busy ? 'sampling conversion' : 'last conversion'}</small>
        </span>
        <span className="memory-debug-summary">{sampleTitle(latestSample)}</span>
      </summary>

      <div className="memory-debug-grid">
        <section className="memory-debug-section memory-debug-metrics" aria-label="Measured browser memory">
          <h3>Measured browser memory</h3>
          <dl>
            <div>
              <dt>Current</dt>
              <dd>{sampleTitle(latestSample)}</dd>
            </div>
            <div>
              <dt>Peak</dt>
              <dd>{sampleTitle(peakSample)}</dd>
            </div>
            <div>
              <dt>Samples</dt>
              <dd>{memoryDebug.samples.length}</dd>
            </div>
          </dl>
          {latestSample?.note && <p className="memory-debug-note">{latestSample.note}</p>}
        </section>

        <section className="memory-debug-section" aria-label="Estimated pipeline buckets">
          <div className="memory-debug-head">
            <h3>Estimated pipeline buckets</h3>
            <button type="button" className="inline-action" onClick={() => void copyDebugJson()}>
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
          </div>
          <div className="memory-debug-table-wrap">
            <table className="memory-debug-table">
              <thead>
                <tr>
                  <th>Bucket</th>
                  <th>Retained</th>
                  <th>Observed</th>
                  <th>Peak event</th>
                </tr>
              </thead>
              <tbody>
                {bucketRows.length === 0 && (
                  <tr>
                    <td colSpan={4}>No pipeline memory events yet.</td>
                  </tr>
                )}
                {bucketRows.map((row) => (
                  <tr key={row.bucket}>
                    <td>{row.bucket}</td>
                    <td>{formatBytes(row.retainedBytes)}</td>
                    <td>{formatBytes(row.observedBytes)}</td>
                    <td>{formatBytes(row.peakBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="memory-debug-section" aria-label="Worker memory attribution">
          <h3>Workers</h3>
          <div className="memory-debug-worker-list">
            {workerRows.length === 0 && <p className="memory-debug-note">No worker events yet.</p>}
            {workerRows.map((row) => (
              <div className="memory-debug-worker" key={row.workerIndex}>
                <span>Worker {row.workerIndex}</span>
                <strong>{formatBytes(row.retainedBytes)}</strong>
                <small>{formatBytes(row.observedBytes)} observed</small>
              </div>
            ))}
          </div>
        </section>

        <section className="memory-debug-section" aria-label="Browser memory breakdown">
          <h3>Browser breakdown</h3>
          <div className="memory-debug-table-wrap">
            <table className="memory-debug-table">
              <thead>
                <tr>
                  <th>Scope</th>
                  <th>Types</th>
                  <th>Bytes</th>
                </tr>
              </thead>
              <tbody>
                {currentBreakdown.length === 0 && (
                  <tr>
                    <td colSpan={3}>No browser breakdown available.</td>
                  </tr>
                )}
                {currentBreakdown.map((item, index) => (
                  <tr key={`${item.scope}-${index}`}>
                    <td>{item.scope}</td>
                    <td>{item.types.join(', ') || 'unknown'}</td>
                    <td>{formatBytes(item.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="memory-debug-section memory-debug-timeline" aria-label="Recent memory events">
          <h3>Recent expensive points</h3>
          <ol>
            {recentEvents.length === 0 && <li>No events yet.</li>}
            {recentEvents.map((event) => (
              <li key={event.id}>
                <span>{event.time}</span>
                <strong>{formatBytes(event.bytes)}</strong>
                <em>{event.bucket}</em>
                <small>
                  {eventSourceLabel(event)} | {event.label}
                  {event.detail ? ` | ${event.detail}` : ''}
                </small>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </details>
  )
}
