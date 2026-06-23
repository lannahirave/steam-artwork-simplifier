import { useMemo, useState } from 'react'
import { useIntl } from 'react-intl'
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

function eventSourceLabel(event: MemoryDebugEvent): string {
  if (event.source === 'worker') {
    return `worker ${event.workerIndex ?? '?'}`
  }
  return 'main'
}

export function MemoryDebugPanel({ memoryDebug, busy }: MemoryDebugPanelProps) {
  const intl = useIntl()
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

  function sampleTitle(sample: BrowserMemorySample | null): string {
    if (!sample) {
      return intl.formatMessage({ id: 'memoryDebug.noSample' })
    }
    return intl.formatMessage(
      { id: 'memoryDebug.sampleVia' },
      { bytes: formatBytes(sample.bytes), source: sample.source },
    )
  }

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
          <strong>{intl.formatMessage({ id: 'memoryDebug.title' })}</strong>
          <small>
            {intl.formatMessage({ id: busy ? 'memoryDebug.samplingConversion' : 'memoryDebug.lastConversion' })}
          </small>
        </span>
        <span className="memory-debug-summary">{sampleTitle(latestSample)}</span>
      </summary>

      <div className="memory-debug-grid">
        <section
          className="memory-debug-section memory-debug-metrics"
          aria-label={intl.formatMessage({ id: 'memoryDebug.measuredBrowserMemory' })}
        >
          <h3>{intl.formatMessage({ id: 'memoryDebug.measuredBrowserMemory' })}</h3>
          <dl>
            <div>
              <dt>{intl.formatMessage({ id: 'memoryDebug.current' })}</dt>
              <dd>{sampleTitle(latestSample)}</dd>
            </div>
            <div>
              <dt>{intl.formatMessage({ id: 'memoryDebug.peak' })}</dt>
              <dd>{sampleTitle(peakSample)}</dd>
            </div>
            <div>
              <dt>{intl.formatMessage({ id: 'memoryDebug.samples' })}</dt>
              <dd>{memoryDebug.samples.length}</dd>
            </div>
          </dl>
          {latestSample?.note && <p className="memory-debug-note">{latestSample.note}</p>}
        </section>

        <section
          className="memory-debug-section"
          aria-label={intl.formatMessage({ id: 'memoryDebug.estimatedPipelineBuckets' })}
        >
          <div className="memory-debug-head">
            <h3>{intl.formatMessage({ id: 'memoryDebug.estimatedPipelineBuckets' })}</h3>
            <button type="button" className="inline-action" onClick={() => void copyDebugJson()}>
              {intl.formatMessage({ id: copied ? 'convert.copied' : 'memoryDebug.copyJson' })}
            </button>
          </div>
          <div className="memory-debug-table-wrap">
            <table className="memory-debug-table">
              <thead>
                <tr>
                  <th>{intl.formatMessage({ id: 'memoryDebug.bucket' })}</th>
                  <th>{intl.formatMessage({ id: 'memoryDebug.retained' })}</th>
                  <th>{intl.formatMessage({ id: 'memoryDebug.observed' })}</th>
                  <th>{intl.formatMessage({ id: 'memoryDebug.peakEvent' })}</th>
                </tr>
              </thead>
              <tbody>
                {bucketRows.length === 0 && (
                  <tr>
                    <td colSpan={4}>{intl.formatMessage({ id: 'memoryDebug.noPipelineEvents' })}</td>
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

        <section
          className="memory-debug-section"
          aria-label={intl.formatMessage({ id: 'memoryDebug.workerMemoryAttribution' })}
        >
          <h3>{intl.formatMessage({ id: 'memoryDebug.workers' })}</h3>
          <div className="memory-debug-worker-list">
            {workerRows.length === 0 && (
              <p className="memory-debug-note">{intl.formatMessage({ id: 'memoryDebug.noWorkerEvents' })}</p>
            )}
            {workerRows.map((row) => (
              <div className="memory-debug-worker" key={row.workerIndex}>
                <span>{intl.formatMessage({ id: 'memoryDebug.worker' }, { index: row.workerIndex })}</span>
                <strong>{formatBytes(row.retainedBytes)}</strong>
                <small>
                  {intl.formatMessage({ id: 'memoryDebug.observedBytes' }, { bytes: formatBytes(row.observedBytes) })}
                </small>
              </div>
            ))}
          </div>
        </section>

        <section
          className="memory-debug-section"
          aria-label={intl.formatMessage({ id: 'memoryDebug.browserMemoryBreakdown' })}
        >
          <h3>{intl.formatMessage({ id: 'memoryDebug.browserBreakdown' })}</h3>
          <div className="memory-debug-table-wrap">
            <table className="memory-debug-table">
              <thead>
                <tr>
                  <th>{intl.formatMessage({ id: 'memoryDebug.scope' })}</th>
                  <th>{intl.formatMessage({ id: 'memoryDebug.types' })}</th>
                  <th>{intl.formatMessage({ id: 'memoryDebug.bytes' })}</th>
                </tr>
              </thead>
              <tbody>
                {currentBreakdown.length === 0 && (
                  <tr>
                    <td colSpan={3}>{intl.formatMessage({ id: 'memoryDebug.noBrowserBreakdown' })}</td>
                  </tr>
                )}
                {currentBreakdown.map((item, index) => (
                  <tr key={`${item.scope}-${index}`}>
                    <td>{item.scope}</td>
                    <td>{item.types.join(', ') || intl.formatMessage({ id: 'memoryDebug.unknown' })}</td>
                    <td>{formatBytes(item.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section
          className="memory-debug-section memory-debug-timeline"
          aria-label={intl.formatMessage({ id: 'memoryDebug.recentMemoryEvents' })}
        >
          <h3>{intl.formatMessage({ id: 'memoryDebug.recentExpensivePoints' })}</h3>
          <ol>
            {recentEvents.length === 0 && <li>{intl.formatMessage({ id: 'memoryDebug.noEvents' })}</li>}
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
