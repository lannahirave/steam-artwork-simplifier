import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import './App.css'
import { applyPreset, computeTargetHeight, getDefaultConfig, getDefaultWorkerCount } from './lib/defaults'
import { convertVideo, type ConversionProgress } from './lib/conversion'
import { applyEofPatch, applyHeaderPatch } from './lib/patch'
import { estimateFpsForTargetKb, estimateGifKb } from './lib/precheck'
import { FEATURED_SNIPPET, SCREENSHOT_SNIPPET, WORKSHOP_SNIPPET } from './lib/steamSnippets'
import type { ConversionConfig, PatchResult } from './lib/types'
import { createZip } from './lib/zip'
import { FFmpegWorkerPool } from './lib/workerPool'
import { isSupportedConversionSource, parseHexByte } from './lib/validation'
import {
  GUIDE_SECTIONS,
  GUIDE_SIZE,
  MAX_SAFE_WASM_WORKERS,
  THEME_STORAGE_KEY,
  cleanupArtifactViews,
  downloadBlob,
  formatElapsed,
  getBaseProgress,
  getColorReductionPercent,
  getIsolationState,
  getPresetJobCount,
  getPresetSplitWidths,
  getWorkerStageWeight,
  parseWorkerStage,
  resolveEstimateBppf,
  toArtifactViews,
  toFiles,
  type ArtifactView,
  type OutputItem,
  type TabKey,
  type ThemeMode,
} from './agents/appAgents'
import { ConvertPanel } from './components/panels/ConvertPanel'
import { PatchToolsPanel } from './components/panels/PatchToolsPanel'
import { SteamHelpersPanel } from './components/panels/SteamHelpersPanel'
import { GuidesPanel } from './components/panels/GuidesPanel'

const APP_VERSION = __APP_VERSION__

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
  const [elapsedMs, setElapsedMs] = useState(0)
  const [lastElapsedMs, setLastElapsedMs] = useState<number | null>(null)
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
  const conversionStartMsRef = useRef<number | null>(null)

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

  useEffect(() => {
    if (!busy) {
      return
    }

    const timer = window.setInterval(() => {
      const startedAt = conversionStartMsRef.current
      if (!startedAt) {
        return
      }
      setElapsedMs(Date.now() - startedAt)
    }, 200)

    return () => {
      window.clearInterval(timer)
    }
  }, [busy])

  const convertDisabled = busy || !sourceFile
  const isWorkshopStrip =
    artifactViews.length === 5 &&
    artifactViews.every((item) => /^part_\d{2}\.gif$/i.test(item.artifact.name))
  const isShowcaseStrip =
    artifactViews.length === 2 &&
    artifactViews.every((item) => /^showcase_\d{2}\.gif$/i.test(item.artifact.name))
  const isCompactStrip = isWorkshopStrip || isShowcaseStrip
  const resultsGridClassName = isWorkshopStrip
    ? 'results-grid workshop-strip'
    : isShowcaseStrip
      ? 'results-grid showcase-strip'
      : 'results-grid'
  const optimizationDisabled = config.disableOptimizations
  const standardRetriesEffective = !optimizationDisabled && config.standardRetriesEnabled
  const retryControlsDisabled = optimizationDisabled || !config.standardRetriesEnabled
  const precheckEffective = !optimizationDisabled && config.precheckEnabled
  const retryFpsEffective = standardRetriesEffective && config.retryAllowFpsDrop
  const retryColorEffective = standardRetriesEffective && config.retryAllowColorDrop
  const lossyEffective = !optimizationDisabled && config.lossyOversize

  function resetConvertState(): void {
    setProgress([])
    setLogs([])
    setWarnings([])
    setError('')
    setFpsEstimateInfo('')
    setProgressPercent(0)
    setProgressLabel('')
    setElapsedMs(0)
    setLastElapsedMs(null)
    workerWeightsRef.current = {}
    conversionStartMsRef.current = null
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

    const requestedJobs = getPresetJobCount(config)
    const splitPreset = config.preset === 'workshop' || config.preset === 'showcase'
    const effectiveWorkerCount =
      !splitPreset
        ? 1
        : Math.max(1, Math.min(config.workerCount, MAX_SAFE_WASM_WORKERS, requestedJobs))
    const runtimeConfig: ConversionConfig = {
      ...config,
      workerCount: effectiveWorkerCount,
    }
    const extraWarnings: string[] = []

    totalJobsRef.current = requestedJobs
    workerWeightsRef.current = {}
    resetConvertState()
    const startedAt = Date.now()
    conversionStartMsRef.current = startedAt
    setBusy(true)
    setProgressPercent(2)
    setProgressLabel('Starting conversion...')
    setElapsedMs(0)
    setLastElapsedMs(null)

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
      const totalMs = Date.now() - startedAt
      setElapsedMs(totalMs)
      setLastElapsedMs(totalMs)
      setProgressLabel(`Conversion complete in ${formatElapsed(totalMs)}.`)
    } catch (conversionError) {
      const message = conversionError instanceof Error ? conversionError.message : String(conversionError)
      const totalMs = Date.now() - startedAt
      setElapsedMs(totalMs)
      setLastElapsedMs(totalMs)
      setError(message)
      setProgressLabel(`Failed: ${message}`)
    } finally {
      setBusy(false)
      conversionStartMsRef.current = null
    }
  }

  function cancelConversion(): void {
    const startedAt = conversionStartMsRef.current
    if (startedAt) {
      const totalMs = Date.now() - startedAt
      setElapsedMs(totalMs)
      setLastElapsedMs(totalMs)
    }
    poolRef.current?.cancelAll()
    setBusy(false)
    setError('Conversion cancelled.')
    setProgressLabel('Conversion cancelled.')
    conversionStartMsRef.current = null
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
        workerCount: getDefaultWorkerCount(getPresetJobCount(next)),
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
      const requestedJobs = getPresetJobCount(config)
      const splitPreset = config.preset === 'workshop' || config.preset === 'showcase'
      const effectiveWorkerCount =
        !splitPreset
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

      const splitWidths = getPresetSplitWidths(config)
      const perGifWidth =
        config.preset === 'guide'
          ? GUIDE_SIZE
          : Math.max(...splitWidths)
      const totalTargetWidth = splitWidths.reduce((sum, width) => sum + width, 0)
      const targetHeight =
        config.preset === 'guide'
          ? GUIDE_SIZE
          : computeTargetHeight(probe.width, probe.height, totalTargetWidth)
      const duration = Math.max(0.1, probe.duration)
      const estimateBppf = resolveEstimateBppf(config)

      const estimatedFromTarget = estimateFpsForTargetKb(
        perGifWidth,
        targetHeight,
        duration,
        config.targetGifKb,
        estimateBppf,
      )
      const estimatedFromMax = estimateFpsForTargetKb(
        perGifWidth,
        targetHeight,
        duration,
        config.maxGifKb,
        estimateBppf,
      )

      const cappedByLimit = Math.max(1, Math.min(estimatedFromTarget, estimatedFromMax))
      const sourceFpsCap = probe.fps > 0 ? Math.max(1, Math.floor(probe.fps)) : 60
      const safetyLimitedFps = Math.max(1, Math.min(60, cappedByLimit))
      const autoFps = Math.max(1, Math.min(sourceFpsCap, safetyLimitedFps))
      const minWasReduced = config.minGifFps > autoFps
      const estimatedSizeAtAuto = estimateGifKb(
        perGifWidth,
        targetHeight,
        autoFps,
        duration,
        estimateBppf,
      )

      setConfig((prev) => ({
        ...prev,
        gifFps: autoFps,
        minGifFps: Math.min(prev.minGifFps, autoFps),
      }))

      const sizeCapNote =
        cappedByLimit !== estimatedFromTarget
          ? ` Capped by max GIF limit (${config.maxGifKb}KB).`
          : ''
      const safetyCapNote = safetyLimitedFps < cappedByLimit ? ' Capped to 60 FPS safety limit.' : ''
      const sourceCapNote =
        probe.fps > 0 && autoFps === sourceFpsCap
          ? ` Capped by source video FPS (${probe.fps.toFixed(2)}).`
          : ''
      const sourceLimitWarning =
        probe.fps > 0 && cappedByLimit > sourceFpsCap
          ? ' Source FPS is a hard upper bound; output size may still need optimization retries.'
          : ''
      const minNote = minWasReduced ? ' Min GIF FPS was lowered to match.' : ''
      const bppfNote = ` Using estimate BPPF ${estimateBppf.toFixed(3)} (~${estimatedSizeAtAuto.toFixed(0)}KB).`
      setFpsEstimateInfo(
        `Auto-set GIF FPS to ${autoFps} using ${perGifWidth}x${targetHeight} @ ${duration.toFixed(2)}s for ~${config.targetGifKb}KB target.${sizeCapNote}${safetyCapNote}${sourceCapNote}${sourceLimitWarning}${minNote}${bppfNote}`,
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

  async function copySnippet(label: 'workshop' | 'featured' | 'screenshot'): Promise<void> {
    const text =
      label === 'workshop'
        ? WORKSHOP_SNIPPET
        : label === 'featured'
          ? FEATURED_SNIPPET
          : SCREENSHOT_SNIPPET
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
          <h1>
            Steam Artwork Studio <span className="app-version">V{APP_VERSION}</span>
          </h1>
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
        <button className={tab === 'guides' ? 'tab active' : 'tab'} onClick={() => setTab('guides')}>
          Guides
        </button>
      </nav>

      {tab === 'convert' && (
        <ConvertPanel
          config={config}
          setConfig={setConfig}
          sourceFile={sourceFile}
          busy={busy}
          estimatingFps={estimatingFps}
          fpsEstimateInfo={fpsEstimateInfo}
          convertDisabled={convertDisabled}
          optimizationDisabled={optimizationDisabled}
          standardRetriesEffective={standardRetriesEffective}
          retryControlsDisabled={retryControlsDisabled}
          precheckEffective={precheckEffective}
          retryFpsEffective={retryFpsEffective}
          retryColorEffective={retryColorEffective}
          lossyEffective={lossyEffective}
          progressPercent={progressPercent}
          progressLabel={progressLabel}
          elapsedMs={elapsedMs}
          lastElapsedMs={lastElapsedMs}
          warnings={warnings}
          progress={progress}
          logs={logs}
          error={error}
          artifactViews={artifactViews}
          isCompactStrip={isCompactStrip}
          resultsGridClassName={resultsGridClassName}
          getColorReductionPercent={getColorReductionPercent}
          onUpdatePreset={updatePreset}
          onSourceFileChange={handleSourceFileChange}
          onEstimateAndApplyFps={() => void estimateAndApplyFps()}
          onRunConversion={() => void runConversion()}
          onCancelConversion={cancelConversion}
          onDownloadZip={() => void downloadZip()}
          onResetConvertState={resetConvertState}
          onDownloadBlob={downloadBlob}
        />
      )}

      {tab === 'patch' && (
        <PatchToolsPanel
          eofFilesCount={eofFiles.length}
          eofByteInput={eofByteInput}
          eofOutputs={eofOutputs}
          eofError={eofError}
          headerFilesCount={headerFiles.length}
          headerWidth={headerWidth}
          headerHeight={headerHeight}
          headerEofEnabled={headerEofEnabled}
          headerByteInput={headerByteInput}
          headerOutputs={headerOutputs}
          headerError={headerError}
          onEofFilesChange={(event) => setEofFiles(toFiles(event.target.files))}
          onEofByteInputChange={setEofByteInput}
          onRunEofPatch={() => void runEofPatch()}
          onHeaderFilesChange={(event) => setHeaderFiles(toFiles(event.target.files))}
          onHeaderWidthChange={setHeaderWidth}
          onHeaderHeightChange={setHeaderHeight}
          onHeaderEofEnabledChange={setHeaderEofEnabled}
          onHeaderByteInputChange={setHeaderByteInput}
          onRunHeaderPatch={() => void runHeaderPatch()}
          onDownloadBlob={downloadBlob}
        />
      )}

      {tab === 'steam' && (
        <SteamHelpersPanel
          copyStatus={copyStatus}
          onCopySnippet={(label) => void copySnippet(label)}
        />
      )}

      {tab === 'guides' && <GuidesPanel guides={GUIDE_SECTIONS} />}
    </main>
  )
}

export default App
