import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import './App.css'
import { applyPreset, computeTargetHeight, getDefaultConfig, getDefaultWorkerCount } from './lib/defaults'
import { convertVideo, type ConversionProgress } from './lib/conversion'
import { applyEofPatch, applyHeaderPatch } from './lib/patch'
import { estimateFpsForTargetKb } from './lib/precheck'
import { WORKSHOP_SNIPPET, FEATURED_SNIPPET, STEAM_HELPER_NOTES } from './lib/steamSnippets'
import type { ConversionArtifact, ConversionConfig, PatchResult } from './lib/types'
import { createZip } from './lib/zip'
import { FFmpegWorkerPool } from './lib/workerPool'
import { isSupportedConversionSource, parseHexByte } from './lib/validation'

type TabKey = 'convert' | 'patch' | 'steam'
type ThemeMode = 'auto' | 'light' | 'dark'
const MAX_SAFE_WASM_WORKERS = 3
const THEME_STORAGE_KEY = 'steam-artwork-theme-mode'

interface ArtifactView {
  artifact: ConversionArtifact
  url: string
}

interface OutputItem {
  name: string
  blob: Blob
  note: string
}

interface IsolationState {
  ok: boolean
  reason?: string
}

function getIsolationState(): IsolationState {
  const params = new URLSearchParams(window.location.search)
  if (params.get('noiso') === '1') {
    return {
      ok: false,
      reason: 'Simulation mode enabled via ?noiso=1.',
    }
  }

  if (window.isSecureContext && window.crossOriginIsolated) {
    return { ok: true }
  }

  return {
    ok: false,
    reason:
      'This app requires cross-origin isolation to run ffmpeg.wasm multithread core (SharedArrayBuffer).',
  }
}

function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

function toFiles(fileList: FileList | null): File[] {
  if (!fileList) {
    return []
  }
  return Array.from(fileList)
}

function toArtifactViews(artifacts: ConversionArtifact[]): ArtifactView[] {
  return artifacts.map((artifact) => ({
    artifact,
    url: URL.createObjectURL(artifact.blob),
  }))
}

function cleanupArtifactViews(items: ArtifactView[]): void {
  for (const item of items) {
    URL.revokeObjectURL(item.url)
  }
}

function getColorReductionPercent(finalColors: number): number {
  const clamped = Math.min(256, Math.max(0, finalColors))
  return Math.max(0, Math.round((1 - clamped / 256) * 100))
}

interface WorkerStageEvent {
  workerIndex: number
  stage: string
}

function parseWorkerStage(stage: string): WorkerStageEvent | null {
  const match = /^worker-(\d+):(.+)$/.exec(stage)
  if (!match) {
    return null
  }
  return {
    workerIndex: Number.parseInt(match[1], 10),
    stage: match[2],
  }
}

function getBaseProgress(stage: string): number {
  if (stage === 'init') {
    return 4
  }
  if (stage === 'input') {
    return 10
  }
  if (stage === 'probe') {
    return 18
  }
  if (stage === 'precheck') {
    return 24
  }
  if (stage === 'convert') {
    return 30
  }
  if (stage === 'done') {
    return 100
  }
  return 0
}

function getWorkerStageWeight(stage: string): number {
  if (stage === 'ffmpeg') {
    return 0.35
  }
  if (stage === 'convert') {
    return 0.5
  }
  if (stage === 'standard') {
    return 0.75
  }
  if (stage === 'lossy') {
    return 0.92
  }
  return 0.45
}

function App() {
  const isolationState = useMemo(() => getIsolationState(), [])
  const [tab, setTab] = useState<TabKey>('convert')
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') {
      return 'auto'
    }
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto'
  })
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)').matches : false,
  )

  const [config, setConfig] = useState<ConversionConfig>(() => getDefaultConfig('workshop'))
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<ConversionProgress[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string>('')
  const [artifactViews, setArtifactViews] = useState<ArtifactView[]>([])
  const [progressPercent, setProgressPercent] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [estimatingFps, setEstimatingFps] = useState(false)
  const [fpsEstimateInfo, setFpsEstimateInfo] = useState('')

  const [eofFiles, setEofFiles] = useState<File[]>([])
  const [eofByteInput, setEofByteInput] = useState('21')
  const [eofOutputs, setEofOutputs] = useState<OutputItem[]>([])
  const [eofError, setEofError] = useState('')

  const [headerFiles, setHeaderFiles] = useState<File[]>([])
  const [headerWidth, setHeaderWidth] = useState('1000')
  const [headerHeight, setHeaderHeight] = useState('1')
  const [headerEofEnabled, setHeaderEofEnabled] = useState(true)
  const [headerByteInput, setHeaderByteInput] = useState('21')
  const [headerOutputs, setHeaderOutputs] = useState<OutputItem[]>([])
  const [headerError, setHeaderError] = useState('')

  const [copyStatus, setCopyStatus] = useState('')

  const poolRef = useRef<FFmpegWorkerPool | null>(null)
  const totalJobsRef = useRef(1)
  const workerWeightsRef = useRef<Record<number, number>>({})

  useEffect(() => {
    return () => {
      poolRef.current?.dispose()
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent): void => {
      setSystemPrefersDark(event.matches)
    }
    media.addEventListener('change', onChange)
    return () => {
      media.removeEventListener('change', onChange)
    }
  }, [])

  const effectiveTheme = themeMode === 'auto' ? (systemPrefersDark ? 'dark' : 'light') : themeMode

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme)
  }, [effectiveTheme])

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode)
  }, [themeMode])

  useEffect(() => {
    return () => {
      cleanupArtifactViews(artifactViews)
    }
  }, [artifactViews])

  const convertDisabled = busy || !sourceFile
  const isWorkshopStrip =
    artifactViews.length === 5 &&
    artifactViews.every((item) => /^part_\d{2}\.gif$/i.test(item.artifact.name))

  function resetConvertState(): void {
    setProgress([])
    setLogs([])
    setWarnings([])
    setError('')
    setFpsEstimateInfo('')
    setProgressPercent(0)
    setProgressLabel('')
    workerWeightsRef.current = {}
    cleanupArtifactViews(artifactViews)
    setArtifactViews([])
  }

  function cycleThemeMode(): void {
    setThemeMode((prev) => {
      if (prev === 'auto') {
        return 'dark'
      }
      if (prev === 'dark') {
        return 'light'
      }
      return 'auto'
    })
  }

  function updateProgressView(entry: ConversionProgress): void {
    setProgressLabel(`[${entry.stage}] ${entry.message}`)

    const workerStage = parseWorkerStage(entry.stage)
    if (workerStage) {
      const nextWeight = getWorkerStageWeight(workerStage.stage)
      const currentWeight = workerWeightsRef.current[workerStage.workerIndex] ?? 0
      if (nextWeight > currentWeight) {
        workerWeightsRef.current[workerStage.workerIndex] = nextWeight
      }

      const totalJobs = Math.max(1, totalJobsRef.current)
      const sum = Object.values(workerWeightsRef.current).reduce((acc, value) => acc + value, 0)
      const average = Math.min(1, sum / totalJobs)
      const estimated = 30 + average * 66
      setProgressPercent((prev) => Math.max(prev, Math.min(96, estimated)))
      return
    }

    const base = getBaseProgress(entry.stage)
    if (base > 0) {
      setProgressPercent((prev) => Math.max(prev, base))
    }
  }

  function ensurePool(workerCount: number): FFmpegWorkerPool {
    if (!poolRef.current) {
      poolRef.current = new FFmpegWorkerPool({ workerCount })
      return poolRef.current
    }

    const existing = poolRef.current
    if (existing.size === workerCount) {
      return existing
    }

    existing.dispose()
    poolRef.current = new FFmpegWorkerPool({ workerCount })
    return poolRef.current
  }

  async function runConversion(): Promise<void> {
    if (!sourceFile) {
      return
    }

    const requestedJobs = config.preset === 'featured' ? 1 : config.parts
    const effectiveWorkerCount =
      config.preset === 'featured'
        ? 1
        : Math.max(1, Math.min(config.workerCount, MAX_SAFE_WASM_WORKERS, requestedJobs))
    const runtimeConfig: ConversionConfig = {
      ...config,
      workerCount: effectiveWorkerCount,
    }
    const extraWarnings: string[] = []

    totalJobsRef.current = requestedJobs
    workerWeightsRef.current = {}
    setBusy(true)
    resetConvertState()
    setProgressPercent(2)
    setProgressLabel('Starting conversion...')

    try {
      const pool = ensurePool(runtimeConfig.workerCount)
      if (runtimeConfig.workerCount !== config.workerCount) {
        extraWarnings.push(
          `Worker count capped to ${runtimeConfig.workerCount} for stability with wasm.`,
        )
        setProgressLabel(
          `Starting conversion... (using ${runtimeConfig.workerCount} workers for stability)`,
        )
      }
      const result = await convertVideo(
        { file: sourceFile },
        runtimeConfig,
        pool,
        {
          onProgress: (entry) => {
            setProgress((prev) => [...prev.slice(-199), entry])
            updateProgressView(entry)
          },
        },
      )

      setLogs(result.logs)
      setWarnings([...extraWarnings, ...result.warnings])
      setArtifactViews(toArtifactViews(result.artifacts))
      setProgressPercent(100)
      setProgressLabel('Conversion complete.')
    } catch (conversionError) {
      const message = conversionError instanceof Error ? conversionError.message : String(conversionError)
      setError(message)
      setProgressLabel(`Failed: ${message}`)
    } finally {
      setBusy(false)
    }
  }

  function cancelConversion(): void {
    poolRef.current?.cancelAll()
    setBusy(false)
    setError('Conversion cancelled.')
    setProgressLabel('Conversion cancelled.')
  }

  async function downloadZip(): Promise<void> {
    if (artifactViews.length === 0) {
      return
    }

    const zip = await createZip(
      artifactViews.map((item) => ({
        name: item.artifact.name,
        blob: item.artifact.blob,
      })),
    )
    downloadBlob(zip.name, zip.blob)
  }

  function updatePreset(nextPreset: ConversionConfig['preset']): void {
    setConfig((prev) => {
      const next = applyPreset(prev, nextPreset)
      return {
        ...next,
        workerCount: getDefaultWorkerCount(nextPreset === 'featured' ? 1 : next.parts),
      }
    })
  }

  function handleSourceFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      setSourceFile(null)
      setFpsEstimateInfo('')
      return
    }

    if (!isSupportedConversionSource(file)) {
      setSourceFile(null)
      setFpsEstimateInfo('')
      setError('Unsupported source file. Use a video file or image (.gif, .png, .webp, .jpg, .jpeg, .bmp).')
      event.target.value = ''
      return
    }

    setSourceFile(file)
    setFpsEstimateInfo('')
    setError('')
  }

  async function estimateAndApplyFps(): Promise<void> {
    if (!sourceFile || busy || estimatingFps) {
      return
    }

    setError('')
    setFpsEstimateInfo('')
    setEstimatingFps(true)
    try {
      const requestedJobs = config.preset === 'featured' ? 1 : config.parts
      const effectiveWorkerCount =
        config.preset === 'featured'
          ? 1
          : Math.max(1, Math.min(config.workerCount, MAX_SAFE_WASM_WORKERS, requestedJobs))

      const pool = ensurePool(effectiveWorkerCount)
      const sourceBytes = new Uint8Array(await sourceFile.arrayBuffer())
      const probe = await pool.runTask('probe', {
        fileName: sourceFile.name,
        fileBytes: sourceBytes.slice(),
      }, {
        timeoutMs: 45_000,
      })

      const parts = config.preset === 'featured' ? 1 : config.parts
      const perGifWidth = config.preset === 'featured' ? config.featuredWidth : config.partWidth
      const totalTargetWidth = parts * perGifWidth
      const targetHeight = computeTargetHeight(probe.width, probe.height, totalTargetWidth)
      const duration = Math.max(0.1, probe.duration)

      const estimatedFromTarget = estimateFpsForTargetKb(
        perGifWidth,
        targetHeight,
        duration,
        config.targetGifKb,
        config.precheckBppf,
      )
      const estimatedFromMax = estimateFpsForTargetKb(
        perGifWidth,
        targetHeight,
        duration,
        config.maxGifKb,
        config.precheckBppf,
      )

      const cappedByLimit = Math.max(1, Math.min(estimatedFromTarget, estimatedFromMax))
      const autoFps = Math.max(1, Math.min(60, cappedByLimit))
      const minWasReduced = config.minGifFps > autoFps

      setConfig((prev) => ({
        ...prev,
        gifFps: autoFps,
        minGifFps: Math.min(prev.minGifFps, autoFps),
      }))

      const sizeCapNote =
        cappedByLimit !== estimatedFromTarget
          ? ` Capped by max GIF limit (${config.maxGifKb}KB).`
          : ''
      const safetyCapNote = autoFps !== cappedByLimit ? ' Capped to 60 FPS safety limit.' : ''
      const minNote = minWasReduced ? ' Min GIF FPS was lowered to match.' : ''
      setFpsEstimateInfo(
        `Auto-set GIF FPS to ${autoFps} using ${perGifWidth}x${targetHeight} @ ${duration.toFixed(2)}s for ~${config.targetGifKb}KB target.${sizeCapNote}${safetyCapNote}${minNote}`,
      )
    } catch (estimateError) {
      const message = estimateError instanceof Error ? estimateError.message : String(estimateError)
      setError(message)
    } finally {
      setEstimatingFps(false)
    }
  }

  async function runEofPatch(): Promise<void> {
    setEofError('')
    setEofOutputs([])
    try {
      const byte = parseHexByte(eofByteInput)
      const patched = await applyEofPatch({
        files: eofFiles,
        byte,
      })
      setEofOutputs(
        patched.map((item) => ({
          name: item.fileName,
          blob: item.blob,
          note: item.message,
        })),
      )
    } catch (patchError) {
      const message = patchError instanceof Error ? patchError.message : String(patchError)
      setEofError(message)
    }
  }

  async function runHeaderPatch(): Promise<void> {
    setHeaderError('')
    setHeaderOutputs([])
    try {
      const width = Number.parseInt(headerWidth, 10)
      const height = Number.parseInt(headerHeight, 10)
      const byte = parseHexByte(headerByteInput)
      const patched = await applyHeaderPatch({
        files: headerFiles,
        width,
        height,
        eofPatchEnabled: headerEofEnabled,
        eofByte: byte,
      })
      setHeaderOutputs(
        patched.map((item: PatchResult) => ({
          name: item.fileName,
          blob: item.blob,
          note: item.message,
        })),
      )
    } catch (patchError) {
      const message = patchError instanceof Error ? patchError.message : String(patchError)
      setHeaderError(message)
    }
  }

  async function copySnippet(label: 'workshop' | 'featured'): Promise<void> {
    const text = label === 'workshop' ? WORKSHOP_SNIPPET : FEATURED_SNIPPET
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus(`${label} snippet copied.`)
    } catch {
      setCopyStatus('Clipboard copy failed. Copy manually from the text area.')
    }
  }

  if (!isolationState.ok) {
    return (
      <main className="shell">
        <section className="panel panel-blocking">
          <h1>Cross-Origin Isolation Required</h1>
          <p>{isolationState.reason}</p>
          <p>
            Serve this app with these response headers:
            <code>Cross-Origin-Opener-Policy: same-origin</code>
            <code>Cross-Origin-Embedder-Policy: require-corp</code>
          </p>
          <p>
            For local Vite dev/preview this project already sets them. For production, configure the web server or CDN
            to send the same headers.
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <header className="masthead">
        <div className="masthead-top">
          <h1>Steam Artwork Studio</h1>
          <button type="button" className="theme-switch" onClick={cycleThemeMode}>
            Theme: {themeMode === 'auto' ? `Auto (${effectiveTheme})` : themeMode}
          </button>
        </div>
        <p>Turn videos and images into Steam-ready artwork in your browser, with fast multithreaded processing.</p>
      </header>

      <nav className="tabs" aria-label="Sections">
        <button className={tab === 'convert' ? 'tab active' : 'tab'} onClick={() => setTab('convert')}>
          Convert
        </button>
        <button className={tab === 'patch' ? 'tab active' : 'tab'} onClick={() => setTab('patch')}>
          Patch Tools
        </button>
        <button className={tab === 'steam' ? 'tab active' : 'tab'} onClick={() => setTab('steam')}>
          Steam Helpers
        </button>
      </nav>

      {tab === 'convert' && (
        <section className="panel">
          <h2>Media to GIF</h2>

          <div className="form-grid">
            <label title="Select output mode: workshop creates 5 slices, featured creates one wide GIF.">
              Preset
              <select value={config.preset} onChange={(event) => updatePreset(event.target.value as 'workshop' | 'featured')}>
                <option value="workshop">Workshop (5x150 slices)</option>
                <option value="featured">Featured (single 630px)</option>
              </select>
            </label>

            <label title="Choose a source video or image file (GIF/PNG/WEBP/JPG/BMP) to convert to GIF output.">
              Source File
              <input
                type="file"
                accept="video/*,.gif,image/gif,.png,image/png,.webp,image/webp,.jpg,.jpeg,image/jpeg,.bmp,image/bmp"
                onChange={handleSourceFileChange}
              />
            </label>

            <label title="Starting frame rate for the first encode pass.">
              GIF FPS
              <div className="field-input-row">
                <input
                  type="number"
                  min={1}
                  value={config.gifFps}
                  onChange={(event) => setConfig((prev) => ({ ...prev, gifFps: Number.parseInt(event.target.value, 10) || 1 }))}
                />
                <button
                  type="button"
                  className="inline-action"
                  title="Estimate and apply a practical GIF FPS from source resolution, duration, and current size target."
                  disabled={!sourceFile || busy || estimatingFps}
                  onClick={() => void estimateAndApplyFps()}
                >
                  {estimatingFps ? 'Estimating...' : 'Estimate'}
                </button>
              </div>
              {fpsEstimateInfo && <small className="field-note">{fpsEstimateInfo}</small>}
            </label>

            <label title="Lowest FPS allowed during recompression attempts.">
              Min GIF FPS
              <input
                type="number"
                min={1}
                value={config.minGifFps}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, minGifFps: Number.parseInt(event.target.value, 10) || 1 }))
                }
              />
            </label>

            {config.preset === 'workshop' && (
              <>
                <label title="Number of output slices for workshop preset.">
                  Parts
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={config.parts}
                    onChange={(event) =>
                      setConfig((prev) => ({
                        ...prev,
                        parts: Number.parseInt(event.target.value, 10) || 1,
                        workerCount: getDefaultWorkerCount(Number.parseInt(event.target.value, 10) || 1),
                      }))
                    }
                  />
                </label>
                <label title="Width in pixels of each workshop slice.">
                  Part Width
                  <input
                    type="number"
                    min={1}
                    value={config.partWidth}
                    onChange={(event) =>
                      setConfig((prev) => ({ ...prev, partWidth: Number.parseInt(event.target.value, 10) || 1 }))
                    }
                  />
                </label>
              </>
            )}

            {config.preset === 'featured' && (
              <label title="Width in pixels of the featured output GIF.">
                Featured Width
                <input
                  type="number"
                  min={1}
                  value={config.featuredWidth}
                  onChange={(event) =>
                    setConfig((prev) => ({ ...prev, featuredWidth: Number.parseInt(event.target.value, 10) || 1 }))
                  }
                />
              </label>
            )}

            <label title="Hard output size limit per GIF in kilobytes.">
              Max GIF KB
              <input
                type="number"
                min={1}
                value={config.maxGifKb}
                onChange={(event) => setConfig((prev) => ({ ...prev, maxGifKb: Number.parseInt(event.target.value, 10) || 1 }))}
              />
            </label>

            <label title="Preferred output size target used by recompression attempts.">
              Target GIF KB
              <input
                type="number"
                min={1}
                value={config.targetGifKb}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, targetGifKb: Number.parseInt(event.target.value, 10) || 1 }))
                }
              />
            </label>

            <label title="How many conversion jobs run in parallel (higher can be faster but less stable).">
              Worker Count
              <input
                type="number"
                min={1}
                max={3}
                value={config.workerCount}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, workerCount: Number.parseInt(event.target.value, 10) || 1 }))
                }
              />
            </label>

            <label title="Lossy fallback aggressiveness (1 mild, 2 balanced, 3 aggressive).">
              Lossy Level
              <input
                type="number"
                min={1}
                max={3}
                value={config.lossyLevel}
                onChange={(event) => setConfig((prev) => ({ ...prev, lossyLevel: Number.parseInt(event.target.value, 10) || 1 }))}
              />
            </label>

            <label title="Maximum lossy attempts when output is still above max GIF size.">
              Lossy Attempts
              <input
                type="number"
                min={1}
                value={config.lossyMaxAttempts}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, lossyMaxAttempts: Number.parseInt(event.target.value, 10) || 1 }))
                }
              />
            </label>

            <label title="Hex byte value used for EOF patching (for example 21 = 0x21).">
              EOF Byte (hex)
              <input
                value={config.eofByte.toString(16).toUpperCase()}
                onChange={(event) => {
                  try {
                    const byte = parseHexByte(event.target.value)
                    setConfig((prev) => ({ ...prev, eofByte: byte }))
                  } catch {
                    // ignore transient invalid text
                  }
                }}
              />
            </label>

            <label className="toggle" title="Estimate output size before encoding and stop early if likely too large.">
              <input
                type="checkbox"
                checked={config.precheckEnabled}
                onChange={(event) => setConfig((prev) => ({ ...prev, precheckEnabled: event.target.checked }))}
              />
              Enable precheck
            </label>
            <label className="toggle" title="Enable standard recompression retries after initial encode.">
              <input
                type="checkbox"
                checked={config.standardRetriesEnabled}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, standardRetriesEnabled: event.target.checked }))
                }
              />
              Enable standard retries
            </label>
            <label
              className="toggle"
              title="Allow standard retries to reduce FPS from GIF FPS down to Min GIF FPS."
            >
              <input
                type="checkbox"
                checked={config.retryAllowFpsDrop}
                disabled={!config.standardRetriesEnabled}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, retryAllowFpsDrop: event.target.checked }))
                }
              />
              Allow FPS reduction
            </label>
            <label
              className="toggle"
              title="Allow standard retries to reduce palette colors for smaller output."
            >
              <input
                type="checkbox"
                checked={config.retryAllowColorDrop}
                disabled={!config.standardRetriesEnabled}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, retryAllowColorDrop: event.target.checked }))
                }
              />
              Allow color reduction
            </label>
            <label className="toggle" title="Enable extra lossy profiles when GIF is still above max size.">
              <input
                type="checkbox"
                checked={config.lossyOversize}
                onChange={(event) => setConfig((prev) => ({ ...prev, lossyOversize: event.target.checked }))}
              />
              Enable lossy oversize fallback
            </label>
            <label className="toggle" title="Patch the last byte of each output file with the configured EOF byte.">
              <input
                type="checkbox"
                checked={config.eofPatchEnabled}
                onChange={(event) => setConfig((prev) => ({ ...prev, eofPatchEnabled: event.target.checked }))}
              />
              Patch EOF byte on outputs
            </label>
            <label className="toggle" title="Rewrite GIF header logical width/height metadata on outputs.">
              <input
                type="checkbox"
                checked={config.headerPatchEnabled}
                onChange={(event) => setConfig((prev) => ({ ...prev, headerPatchEnabled: event.target.checked }))}
              />
              Patch GIF header width/height
            </label>

            {config.headerPatchEnabled && (
              <>
                <label title="Width value written to GIF header bytes 6-7.">
                  Header Width
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={config.headerWidth}
                    onChange={(event) =>
                      setConfig((prev) => ({ ...prev, headerWidth: Number.parseInt(event.target.value, 10) || 1 }))
                    }
                  />
                </label>
                <label title="Height value written to GIF header bytes 8-9.">
                  Header Height
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={config.headerHeight}
                    onChange={(event) =>
                      setConfig((prev) => ({ ...prev, headerHeight: Number.parseInt(event.target.value, 10) || 1 }))
                    }
                  />
                </label>
              </>
            )}
          </div>

          <div className="actions">
            <button disabled={convertDisabled} onClick={() => void runConversion()}>
              Run Conversion
            </button>
            <button disabled={!busy} onClick={cancelConversion}>
              Cancel
            </button>
            <button disabled={artifactViews.length === 0} onClick={() => void downloadZip()}>
              Download ZIP
            </button>
            <button onClick={resetConvertState}>Reset Results</button>
          </div>

          {(busy || progressPercent > 0) && (
            <div className="progress-panel">
              <div className="progress-head">
                <span>{busy ? 'Converting GIFs...' : 'Last conversion'}</span>
                <strong>{Math.round(progressPercent)}%</strong>
              </div>
              <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPercent)}>
                <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
              </div>
              {progressLabel && <p className="progress-label">{progressLabel}</p>}
            </div>
          )}

          {error && <p className="error">{error}</p>}

          {warnings.length > 0 && (
            <div className="warn-box">
              <h3>Warnings</h3>
              <ul>
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {progress.length > 0 && (
            <div className="log-box">
              <h3>Live Progress</h3>
              <pre>{progress.map((entry) => `[${entry.stage}] ${entry.message}`).join('\n')}</pre>
            </div>
          )}

          {logs.length > 0 && (
            <div className="log-box">
              <h3>Run Logs</h3>
              <pre>{logs.join('\n')}</pre>
            </div>
          )}

          {artifactViews.length > 0 && (
            <section className={isWorkshopStrip ? 'results-grid workshop-strip' : 'results-grid'}>
              {artifactViews.map((item) => (
                <article className="result-card" key={item.artifact.name}>
                  {!isWorkshopStrip && (
                    <>
                      <h3>{item.artifact.name}</h3>
                      <p>
                        {item.artifact.width}x{item.artifact.height} | {item.artifact.status}
                      </p>
                    </>
                  )}
                  <img src={item.url} alt={item.artifact.name} loading="lazy" />
                  <div className={isWorkshopStrip ? 'gif-meta compact' : 'gif-meta'}>
                    <span>FPS: {item.artifact.finalFps}</span>
                    <span>Color reduction: {getColorReductionPercent(item.artifact.finalColors)}%</span>
                  </div>
                  <div className={isWorkshopStrip ? 'download-row compact' : 'download-row'}>
                    <span className="gif-size">{item.artifact.sizeKb.toFixed(1)}KB</span>
                    <button
                      className={isWorkshopStrip ? 'compact-download' : ''}
                      onClick={() => downloadBlob(item.artifact.name, item.artifact.blob)}
                    >
                      {isWorkshopStrip ? 'DL' : 'Download'}
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}
        </section>
      )}

      {tab === 'patch' && (
        <section className="panel">
          <h2>Patch Tools</h2>

          <div className="patch-grid">
            <article className="subpanel">
              <h3>EOF Patch</h3>
              <label title="Choose files for EOF patching.">
                Files
                <input type="file" multiple onChange={(event) => setEofFiles(toFiles(event.target.files))} />
              </label>
              <label title="Hex byte to write as the final file byte.">
                EOF Byte (hex)
                <input value={eofByteInput} onChange={(event) => setEofByteInput(event.target.value)} />
              </label>
              <button disabled={eofFiles.length === 0} onClick={() => void runEofPatch()}>
                Apply EOF Patch
              </button>
              {eofError && <p className="error">{eofError}</p>}
              <ul className="output-list">
                {eofOutputs.map((item) => (
                  <li key={`${item.name}-${item.note}`}>
                    <span>{item.note}</span>
                    <button onClick={() => downloadBlob(item.name, item.blob)}>Download</button>
                  </li>
                ))}
              </ul>
            </article>

            <article className="subpanel">
              <h3>GIF Header Patch</h3>
              <label title="Choose GIF files for header width/height patching.">
                GIF Files
                <input type="file" accept=".gif,image/gif" multiple onChange={(event) => setHeaderFiles(toFiles(event.target.files))} />
              </label>
              <label title="Width value to write to GIF header bytes 6-7.">
                Width
                <input type="number" min={1} max={65535} value={headerWidth} onChange={(event) => setHeaderWidth(event.target.value)} />
              </label>
              <label title="Height value to write to GIF header bytes 8-9.">
                Height
                <input type="number" min={1} max={65535} value={headerHeight} onChange={(event) => setHeaderHeight(event.target.value)} />
              </label>
              <label title="Hex byte to use for optional EOF patch in header tool.">
                EOF Byte (hex)
                <input value={headerByteInput} onChange={(event) => setHeaderByteInput(event.target.value)} />
              </label>
              <label className="toggle" title="Also patch EOF byte while applying header width/height changes.">
                <input
                  type="checkbox"
                  checked={headerEofEnabled}
                  onChange={(event) => setHeaderEofEnabled(event.target.checked)}
                />
                Patch EOF byte
              </label>
              <button disabled={headerFiles.length === 0} onClick={() => void runHeaderPatch()}>
                Apply Header Patch
              </button>
              {headerError && <p className="error">{headerError}</p>}
              <ul className="output-list">
                {headerOutputs.map((item) => (
                  <li key={`${item.name}-${item.note}`}>
                    <span>{item.note}</span>
                    <button onClick={() => downloadBlob(item.name, item.blob)}>Download</button>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>
      )}

      {tab === 'steam' && (
        <section className="panel">
          <h2>Steam Upload Helpers</h2>
          <p>Copy and run these snippets in Steam upload page DevTools Console.</p>
          <ul>
            {STEAM_HELPER_NOTES.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>

          <article className="subpanel">
            <div className="snippet-head">
              <h3>Workshop Snippet</h3>
              <button onClick={() => void copySnippet('workshop')}>Copy</button>
            </div>
            <textarea readOnly value={WORKSHOP_SNIPPET} rows={14} />
          </article>

          <article className="subpanel">
            <div className="snippet-head">
              <h3>Featured Snippet</h3>
              <button onClick={() => void copySnippet('featured')}>Copy</button>
            </div>
            <textarea readOnly value={FEATURED_SNIPPET} rows={14} />
          </article>

          {copyStatus && <p>{copyStatus}</p>}
        </section>
      )}
    </main>
  )
}

export default App
