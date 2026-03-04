/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { applyPreset, computeTargetHeight, getDefaultConfig, getDefaultWorkerCount } from '../lib/defaults'
import { convertVideo, type ConversionProgress } from '../lib/conversion'
import { estimateFpsForTargetKb, estimateGifKb } from '../lib/precheck'
import type { ConversionConfig } from '../lib/types'
import { createZip } from '../lib/zip'
import { FFmpegWorkerPool } from '../lib/workerPool'
import { isSupportedConversionSource } from '../lib/validation'
import {
  GUIDE_SIZE,
  MAX_SAFE_WASM_WORKERS,
  cleanupArtifactViews,
  downloadBlob,
  formatElapsed,
  getBaseProgress,
  getColorReductionPercent,
  getPresetJobCount,
  getPresetSplitWidths,
  getWorkerStageWeight,
  parseWorkerStage,
  resolveEstimateBppf,
  toArtifactViews,
  type ArtifactView,
} from '../agents/appAgents'

interface ConvertState {
  config: ConversionConfig
  sourceFile: File | null
  busy: boolean
  progress: ConversionProgress[]
  logs: string[]
  warnings: string[]
  error: string
  artifactViews: ArtifactView[]
  progressPercent: number
  progressLabel: string
  elapsedMs: number
  lastElapsedMs: number | null
  estimatingFps: boolean
  fpsEstimateInfo: string
}

interface ConvertActions {
  setConfig: Dispatch<SetStateAction<ConversionConfig>>
  onUpdatePreset: (preset: ConversionConfig['preset']) => void
  onSourceFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onEstimateAndApplyFps: () => void
  onRunConversion: () => void
  onCancelConversion: () => void
  onDownloadZip: () => void
  onResetConvertState: () => void
}

interface ConvertMeta {
  convertDisabled: boolean
  optimizationDisabled: boolean
  standardRetriesEffective: boolean
  retryControlsDisabled: boolean
  precheckEffective: boolean
  retryFpsEffective: boolean
  retryColorEffective: boolean
  lossyEffective: boolean
  isCompactStrip: boolean
  resultsGridClassName: string
  getColorReductionPercent: (finalColors: number) => number
  downloadBlob: (name: string, blob: Blob) => void
}

export interface ConvertContextValue {
  state: ConvertState
  actions: ConvertActions
  meta: ConvertMeta
}

const ConvertContext = createContext<ConvertContextValue | null>(null)

function toArchiveBaseName(fileName: string): string {
  const trimmed = fileName.trim()
  if (!trimmed) {
    return 'steam-artwork-output'
  }
  const dotIndex = trimmed.lastIndexOf('.')
  if (dotIndex <= 0) {
    return trimmed
  }
  return trimmed.slice(0, dotIndex)
}

export function useConvertContext(): ConvertContextValue {
  const context = use(ConvertContext)
  if (!context) {
    throw new Error('useConvertContext must be used within ConvertProvider.')
  }
  return context
}

export function ConvertProvider({ children }: { children: ReactNode }) {
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
  const [lastConversionSourceName, setLastConversionSourceName] = useState('')
  const [estimatingFps, setEstimatingFps] = useState(false)
  const [fpsEstimateInfo, setFpsEstimateInfo] = useState('')

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
  const isPartNamedOutput = (name: string): boolean => /_part_\d{2}\.gif$/i.test(name)
  const isWorkshopStrip =
    artifactViews.length === 5 &&
    artifactViews.every((item) => isPartNamedOutput(item.artifact.name))
  const isShowcaseStrip =
    artifactViews.length === 2 &&
    artifactViews.every((item) => isPartNamedOutput(item.artifact.name))
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
    setLastConversionSourceName(sourceFile.name)

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

    const sourceNameForArchive = lastConversionSourceName || sourceFile?.name || ''
    const archiveName = `${toArchiveBaseName(sourceNameForArchive)}.zip`

    const zip = await createZip(
      artifactViews.map((item) => ({
        name: item.artifact.name,
        blob: item.artifact.blob,
      })),
      archiveName,
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

  const value: ConvertContextValue = {
    state: {
      config,
      sourceFile,
      busy,
      progress,
      logs,
      warnings,
      error,
      artifactViews,
      progressPercent,
      progressLabel,
      elapsedMs,
      lastElapsedMs,
      estimatingFps,
      fpsEstimateInfo,
    },
    actions: {
      setConfig,
      onUpdatePreset: updatePreset,
      onSourceFileChange: handleSourceFileChange,
      onEstimateAndApplyFps: () => void estimateAndApplyFps(),
      onRunConversion: () => void runConversion(),
      onCancelConversion: cancelConversion,
      onDownloadZip: () => void downloadZip(),
      onResetConvertState: resetConvertState,
    },
    meta: {
      convertDisabled,
      optimizationDisabled,
      standardRetriesEffective,
      retryControlsDisabled,
      precheckEffective,
      retryFpsEffective,
      retryColorEffective,
      lossyEffective,
      isCompactStrip,
      resultsGridClassName,
      getColorReductionPercent,
      downloadBlob,
    },
  }

  return <ConvertContext value={value}>{children}</ConvertContext>
}
