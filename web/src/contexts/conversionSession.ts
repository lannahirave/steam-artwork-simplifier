import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { useIntl } from 'react-intl'
import { applyPreset, getDefaultConfig, getDefaultWorkerCount } from '../lib/defaults'
import { convertVideo, type ConversionProgress } from '../lib/conversion'
import { estimateFpsForTargetKb, estimateGifKb } from '../lib/precheck'
import type { ConversionArtifact, ConversionConfig, MemoryDebugSession } from '../lib/types'
import { createZip } from '../lib/zip'
import { ConversionWorkerPool } from '../lib/conversionWorkerPool'
import { isSupportedConversionSource } from '../lib/validation'
import { applySourceEditToProbe, type SourceEdit } from '../lib/sourceEdit'
import { trackConversionComplete } from '../lib/trackConversion'
import { computePresetTargetHeight, resolvePresetPlan } from '../lib/presetPlan'
import type { PresetPlan } from '../lib/presetPlan'
import { inspectBrowserSupport, type BrowserSupportReport } from '../lib/browserSupport'
import { distributeEvenly } from '../lib/workshopRows'
import { canPreviewOnProfile, profilePreviewUrl } from '../lib/profileHandoff'
import {
  buildLibraryEntry,
  createLibraryId,
  saveLibraryEntry,
  type ConversionLayout,
} from '../lib/artworkLibrary'
import {
  appendBrowserMemorySample,
  appendMemoryDebugEvent,
  createEmptyMemoryDebugSession,
  createMemoryDebugEvent,
  sampleBrowserMemory,
} from '../lib/memoryDebug'
import {
  shouldShowLongMp4Memo,
  shouldShowWorkshopMemoryMemo,
  type SourceMediaMetadata,
} from '../lib/sourceAdvisories'
import {
  cleanupArtifactViews,
  downloadBlob,
  formatElapsed,
  getBaseProgress,
  getQualityReductionPercent,
  getWorkerStageWeight,
  parseWorkerStage,
  toArtifactViews,
  type ArtifactView,
} from '../agents/appAgents'
import type { MessageId } from '../i18n/messages'
import { useFeedbackPrompt } from './useFeedbackPrompt'
import type { FpsHeadroom } from '../lib/sizeStrategy'

export interface ConvertState {
  config: ConversionConfig
  sourceFile: File | null
  /** Crop/trim from the Cut Preview editor; reset whenever the source changes. */
  sourceEdit: SourceEdit | null
  sourceMetadata: SourceMediaMetadata | null
  busy: boolean
  finishingCurrent: boolean
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
  memoryDebug: MemoryDebugSession
  feedbackPromptOpen: boolean
  /** Set when the results could not be saved for the Steam profile preview. */
  profilePreviewError: string
  /** Whether the latest results are saved in the Library. */
  librarySave: LibrarySaveState
  /** Set when the latest results left room for a higher FPS and the settings are unchanged. */
  fpsHeadroom: FpsHeadroom | null
}

export type LibrarySaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; id: string; evictedCount: number }
  | { status: 'failed'; detail: string }

export interface ConvertActions {
  setConfig: Dispatch<SetStateAction<ConversionConfig>>
  onUpdatePreset: (preset: ConversionConfig['preset']) => void
  onSourceFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onSourceEditChange: (edit: SourceEdit | null) => void
  onEstimateAndApplyFps: () => void
  onRunConversion: () => void
  /** Converts again at the FPS suggested by `fpsHeadroom`. */
  onConvertAtSuggestedFps: () => void
  onCancelConversion: () => void
  onFinishCurrentConversion: () => void
  onDownloadZip: () => void
  onResetConvertState: () => void
  onUpdateWorkshopParts: (parts: number) => void
  onUpdateWorkshopRows: (rows: ConversionConfig['workshopRows']) => void
  onDismissFeedbackPrompt: () => void
  /** Opens the saved results on a Steam profile in SteamCanvas. */
  onOpenProfilePreview: () => void
}

export interface ConvertMeta {
  convertDisabled: boolean
  optimizationDisabled: boolean
  standardRetriesEffective: boolean
  retryControlsDisabled: boolean
  precheckEffective: boolean
  retryFpsEffective: boolean
  retryQualityEffective: boolean
  lossyEffective: boolean
  isCompactStrip: boolean
  resultsGridClassName: string
  getQualityReductionPercent: (finalQuality: number) => number
  downloadBlob: (name: string, blob: Blob) => void
  presetPlan: PresetPlan
  showLongMp4Memo: boolean
  showWorkshopMemoryMemo: boolean
  browserSupport: BrowserSupportReport
  /** The results fit a Workshop, Artwork or Featured Artwork Showcase on a profile. */
  profilePreviewAvailable: boolean
}

export interface ConvertContextValue {
  state: ConvertState
  actions: ConvertActions
  meta: ConvertMeta
}

export function toArchiveBaseName(fileName: string): string {
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

export function getArtifactLayoutClassName(artifactViews: ArtifactView[]): {
  isCompactStrip: boolean
  resultsGridClassName: string
} {
  const isPartNamedOutput = (name: string): boolean => /_part_\d{2}\.(?:gif|png|jpg|webp)$/i.test(name)
  const isWorkshopGridOutput = (name: string): boolean => /_row_\d{2}_part_\d{2}\.(?:gif|png|jpg|webp)$/i.test(name)
  const isWorkshopStrip =
    artifactViews.length === 5 &&
    artifactViews.every((item) => isPartNamedOutput(item.artifact.name))
  const isWorkshopGrid =
    artifactViews.length > 0 &&
    artifactViews.every((item) => isWorkshopGridOutput(item.artifact.name))
  const isShowcaseStrip =
    artifactViews.length === 2 &&
    artifactViews.every((item) => isPartNamedOutput(item.artifact.name))

  return {
    isCompactStrip: isWorkshopStrip || isWorkshopGrid || isShowcaseStrip,
    resultsGridClassName: isWorkshopStrip
      ? 'results-grid workshop-strip'
      : isWorkshopGrid
        ? 'results-grid workshop-grid'
        : isShowcaseStrip
        ? 'results-grid showcase-strip'
        : 'results-grid',
  }
}

export function useConversionSession(): ConvertContextValue {
  const intl = useIntl()
  const [browserSupport] = useState<BrowserSupportReport>(() => inspectBrowserSupport())
  const [config, setConfig] = useState<ConversionConfig>(() => getDefaultConfig('workshop'))
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [sourceEdit, setSourceEdit] = useState<SourceEdit | null>(null)
  const [sourceMetadata, setSourceMetadata] = useState<SourceMediaMetadata | null>(null)
  const [busy, setBusy] = useState(false)
  const [finishingCurrent, setFinishingCurrent] = useState(false)
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
  const [lastConversionLayout, setLastConversionLayout] = useState<ConversionLayout | null>(null)
  const [profilePreviewError, setProfilePreviewError] = useState('')
  const [librarySave, setLibrarySave] = useState<LibrarySaveState>({ status: 'idle' })
  const lastLibraryIdRef = useRef<string | null>(null)
  const [estimatingFps, setEstimatingFps] = useState(false)
  const [fpsEstimateInfo, setFpsEstimateInfo] = useState('')
  const [headroomRun, setHeadroomRun] = useState<{ config: ConversionConfig; headroom: FpsHeadroom | null } | null>(null)
  const fpsHeadroom = headroomRun?.config === config ? headroomRun.headroom : null
  const [memoryDebug, setMemoryDebug] = useState<MemoryDebugSession>(() => createEmptyMemoryDebugSession())
  const { open: feedbackPromptOpen, arm: armFeedbackPrompt, dismiss: dismissFeedbackPrompt } = useFeedbackPrompt()

  const poolRef = useRef<ConversionWorkerPool | null>(null)
  const totalJobsRef = useRef(1)
  const workerWeightsRef = useRef<Record<number, number>>({})
  const conversionStartMsRef = useRef<number | null>(null)
  const finishCurrentRequestedRef = useRef(false)

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

  const { isCompactStrip, resultsGridClassName } = getArtifactLayoutClassName(artifactViews)
  const presetPlan = resolvePresetPlan(config)
  const optimizationDisabled = config.disableOptimizations
  const standardRetriesEffective = !optimizationDisabled && config.standardRetriesEnabled
  const retryControlsDisabled = optimizationDisabled || !config.standardRetriesEnabled
  const precheckEffective = !optimizationDisabled && config.precheckEnabled
  const retryFpsEffective = standardRetriesEffective && config.retryAllowFpsDrop
  const retryQualityEffective = standardRetriesEffective && config.retryAllowQualityDrop
  const lossyEffective = !optimizationDisabled && config.lossyOversize
  const showLongMp4Memo = shouldShowLongMp4Memo(sourceMetadata)
  const showWorkshopMemoryMemo = shouldShowWorkshopMemoryMemo(config)
  const formatMessage = (id: MessageId, values?: Record<string, number | string>): string =>
    intl.formatMessage({ id }, values)

  function readVideoDuration(file: File): Promise<number | null> {
    if (!file.type.trim().toLowerCase().startsWith('video/') && !file.name.trim().toLowerCase().endsWith('.mp4')) {
      return Promise.resolve(null)
    }

    return new Promise((resolve) => {
      const video = document.createElement('video')
      const url = URL.createObjectURL(file)
      const cleanup = (): void => {
        URL.revokeObjectURL(url)
        video.removeAttribute('src')
        video.load()
      }
      video.preload = 'metadata'
      video.onloadedmetadata = () => {
        const duration = Number.isFinite(video.duration) ? video.duration : null
        cleanup()
        resolve(duration)
      }
      video.onerror = () => {
        cleanup()
        resolve(null)
      }
      video.src = url
    })
  }

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
    finishCurrentRequestedRef.current = false
    setFinishingCurrent(false)
    cleanupArtifactViews(artifactViews)
    setArtifactViews([])
    setProfilePreviewError('')
    setLibrarySave({ status: 'idle' })
    lastLibraryIdRef.current = null
    setHeadroomRun(null)
    setMemoryDebug(createEmptyMemoryDebugSession())
  }

  async function recordBrowserMemorySample(label: string): Promise<void> {
    if (!import.meta.env.DEV) {
      return
    }
    const sample = await sampleBrowserMemory(label)
    setMemoryDebug((prev) => appendBrowserMemorySample(prev, sample))
  }

  function updateProgressView(entry: ConversionProgress): void {
    setProgressLabel(`[${entry.time}] [${entry.stage}] ${entry.message}`)

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

  function ensurePool(workerCount: number): ConversionWorkerPool {
    if (!poolRef.current) {
      poolRef.current = new ConversionWorkerPool({ workerCount })
      return poolRef.current
    }

    const existing = poolRef.current
    if (existing.size === workerCount) {
      return existing
    }

    existing.dispose()
    poolRef.current = new ConversionWorkerPool({ workerCount })
    return poolRef.current
  }

  function formatSessionLogTime(date = new Date()): string {
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    const millis = String(date.getMilliseconds()).padStart(3, '0')
    return `${hours}:${minutes}:${seconds}.${millis}`
  }

  function failForUnsupportedBrowser(): void {
    resetConvertState()
    const time = formatSessionLogTime()
    const entries = browserSupport.diagnosticLog.map((message) => ({
      stage: 'browser-support',
      message,
      time,
    }))
    setProgress(entries)
    setLogs(entries.map((entry) => `[${entry.time}] [${entry.stage}] ${entry.message}`))
    setWarnings(browserSupport.reasons.map((reason) => `${reason.label}: ${reason.detail}`))
    setError(browserSupport.summary)
    setProgressPercent(1)
    setProgressLabel(formatMessage('convert.status.failed', { message: browserSupport.summary }))
    setElapsedMs(0)
    setLastElapsedMs(0)
  }

  /** Keeps every finished conversion in the Library (IndexedDB), including ones finished early. */
  function saveToLibrary(
    layout: ConversionLayout,
    artifacts: ConversionArtifact[],
    sourceName: string,
    complete: boolean,
  ): void {
    const id = createLibraryId()
    lastLibraryIdRef.current = id
    setLibrarySave({ status: 'saving' })
    void saveLibraryEntry(buildLibraryEntry(id, layout, artifacts, sourceName, complete))
      .then(({ evictedCount }) => {
        if (lastLibraryIdRef.current === id) setLibrarySave({ status: 'saved', id, evictedCount })
      })
      .catch((saveError: unknown) => {
        if (lastLibraryIdRef.current !== id) return
        lastLibraryIdRef.current = null
        const detail = saveError instanceof Error ? saveError.message : String(saveError)
        setLibrarySave({ status: 'failed', detail })
      })
  }

  function convertAtSuggestedFps(): void {
    if (!fpsHeadroom || busy) {
      return
    }
    const nextConfig = { ...config, gifFps: fpsHeadroom.suggestedFps }
    setConfig(nextConfig)
    void runConversion(nextConfig)
  }

  async function runConversion(activeConfig: ConversionConfig = config): Promise<void> {
    if (!sourceFile) {
      return
    }

    if (!browserSupport.supported) {
      failForUnsupportedBrowser()
      return
    }

    const plan = resolvePresetPlan(activeConfig)
    const runtimeConfig: ConversionConfig = {
      ...activeConfig,
      workerCount: plan.effectiveWorkerCount,
    }
    const extraWarnings: string[] = []
    const conversionSourceName = sourceFile.name
    const conversionLayout: ConversionLayout = {
      preset: activeConfig.preset,
      workshopParts: activeConfig.parts,
      workshopRows: activeConfig.workshopRows,
    }
    setLastConversionSourceName(conversionSourceName)
    setLastConversionLayout(conversionLayout)

    totalJobsRef.current = plan.jobCount
    workerWeightsRef.current = {}
    finishCurrentRequestedRef.current = false
    setFinishingCurrent(false)
    resetConvertState()
    const startedAt = Date.now()
    conversionStartMsRef.current = startedAt
    setBusy(true)
    setProgressPercent(2)
    setProgressLabel(formatMessage('convert.status.starting'))
    setElapsedMs(0)
    setLastElapsedMs(null)
    void recordBrowserMemorySample('conversion-start')
    const memorySampleTimer = import.meta.env.DEV
      ? window.setInterval(() => {
          void recordBrowserMemorySample('conversion-interval')
        }, 2000)
      : undefined

    try {
      const pool = ensurePool(runtimeConfig.workerCount)
      if (runtimeConfig.workerCount !== activeConfig.workerCount) {
        extraWarnings.push(
          formatMessage('convert.runtime.workerCountCapped', { count: runtimeConfig.workerCount }),
        )
        setProgressLabel(
          formatMessage('convert.status.startingWithWorkers', { count: runtimeConfig.workerCount }),
        )
      }
      const result = await convertVideo(
        { file: sourceFile, edit: sourceEdit },
        runtimeConfig,
        pool,
        {
          onProgress: (entry) => {
            setProgress((prev) => [...prev.slice(-199), entry])
            updateProgressView(entry)
          },
          onMemoryDebug: (entry) => {
            setMemoryDebug((prev) => appendMemoryDebugEvent(prev, entry))
          },
          memoryDebugEnabled: import.meta.env.DEV,
          shouldFinishCurrent: () => finishCurrentRequestedRef.current,
          formatMessage,
        },
      )

      setLogs(result.logs)
      setWarnings([...extraWarnings, ...result.warnings])
      const nextArtifactViews = toArtifactViews(result.artifacts)
      if (import.meta.env.DEV) {
        for (const item of nextArtifactViews) {
          setMemoryDebug((prev) => appendMemoryDebugEvent(prev, createMemoryDebugEvent({
            bucket: 'preview-object-url',
            label: 'Preview object URL retaining output Blob',
            bytes: item.artifact.blob.size,
            kind: 'retained',
            stage: 'preview',
            retainedKey: `preview:${item.artifact.name}`,
            detail: item.artifact.name,
          }, 'main')))
        }
      }
      setArtifactViews(nextArtifactViews)
      setHeadroomRun({ config: activeConfig, headroom: result.fpsHeadroom })
      if (result.artifacts.length > 0) {
        saveToLibrary(
          conversionLayout,
          result.artifacts,
          conversionSourceName,
          result.completionStatus === 'complete',
        )
        trackConversionComplete()
      }
      setProgressPercent(100)
      const totalMs = Date.now() - startedAt
      setElapsedMs(totalMs)
      setLastElapsedMs(totalMs)
      setProgressLabel(
        result.completionStatus === 'complete'
          ? formatMessage('convert.status.completeIn', { time: formatElapsed(totalMs) })
          : formatMessage('convert.status.finishedCurrentIn', { time: formatElapsed(totalMs) }),
      )
    } catch (conversionError) {
      const message = conversionError instanceof Error ? conversionError.message : String(conversionError)
      const totalMs = Date.now() - startedAt
      setElapsedMs(totalMs)
      setLastElapsedMs(totalMs)
      setError(message)
      setProgressLabel(formatMessage('convert.status.failed', { message }))
    } finally {
      if (memorySampleTimer !== undefined) {
        window.clearInterval(memorySampleTimer)
      }
      void recordBrowserMemorySample('conversion-finished')
      setBusy(false)
      setFinishingCurrent(false)
      finishCurrentRequestedRef.current = false
      conversionStartMsRef.current = null
    }
  }

  function finishCurrentConversion(): void {
    if (!busy || finishingCurrent) {
      return
    }
    finishCurrentRequestedRef.current = true
    setFinishingCurrent(true)
    setProgressLabel(formatMessage('convert.status.finishingActiveWorkers'))
    void poolRef.current?.finishCurrent()
  }

  function cancelConversion(): void {
    const startedAt = conversionStartMsRef.current
    if (startedAt) {
      const totalMs = Date.now() - startedAt
      setElapsedMs(totalMs)
      setLastElapsedMs(totalMs)
    }
    finishCurrentRequestedRef.current = false
    poolRef.current?.cancelAll()
    setBusy(false)
    setFinishingCurrent(false)
    setError(formatMessage('convert.status.cancelled'))
    setProgressLabel(formatMessage('convert.status.cancelled'))
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
    armFeedbackPrompt()
  }

  function openProfilePreview(): void {
    const artifacts = artifactViews.map((item) => item.artifact)
    if (busy || !lastConversionLayout || !canPreviewOnProfile(lastConversionLayout, artifacts)) {
      return
    }
    const id = lastLibraryIdRef.current
    if (!id) {
      const detail = librarySave.status === 'failed' ? librarySave.detail : ''
      setProfilePreviewError(formatMessage('convert.profilePreview.saveFailed', { detail }))
      return
    }
    setProfilePreviewError('')
    // The entry may still be being written; the bridge retries briefly if SteamCanvas asks first.
    window.open(profilePreviewUrl(id), '_blank', 'noopener,noreferrer')
  }

  function updatePreset(nextPreset: ConversionConfig['preset']): void {
    setConfig((prev) => {
      const next = applyPreset(prev, nextPreset)
      return {
        ...next,
        workerCount: getDefaultWorkerCount(resolvePresetPlan(next).jobCount),
      }
    })
  }

  function updateWorkshopParts(parts: number): void {
    setConfig((prev) => ({
      ...prev,
      parts,
      workerCount: getDefaultWorkerCount(parts * prev.workshopRows),
    }))
  }

  function updateWorkshopRows(rows: ConversionConfig['workshopRows']): void {
    setConfig((prev) => ({
      ...prev,
      workshopRows: rows,
      workerCount: getDefaultWorkerCount(prev.parts * rows),
    }))
  }

  function handleSourceFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null
    setSourceEdit(null)
    if (!file) {
      setSourceFile(null)
      setSourceMetadata(null)
      setFpsEstimateInfo('')
      return
    }

    if (!isSupportedConversionSource(file)) {
      setSourceFile(null)
      setSourceMetadata(null)
      setFpsEstimateInfo('')
      setError(formatMessage('convert.error.unsupportedSource'))
      event.target.value = ''
      return
    }

    setSourceFile(file)
    setSourceMetadata({
      durationSec: null,
      sizeBytes: file.size,
      mimeType: file.type,
      name: file.name,
    })
    setFpsEstimateInfo('')
    setError('')
    void readVideoDuration(file).then((durationSec) => {
      setSourceMetadata((current) => {
        if (!current || current.name !== file.name || current.sizeBytes !== file.size) {
          return current
        }
        return {
          ...current,
          durationSec,
        }
      })
    })
  }

  async function estimateAndApplyFps(): Promise<void> {
    if (!sourceFile || busy || estimatingFps) {
      return
    }

    if (!browserSupport.supported) {
      failForUnsupportedBrowser()
      return
    }

    setError('')
    setFpsEstimateInfo('')
    setEstimatingFps(true)
    try {
      const plan = resolvePresetPlan(config)
      const pool = ensurePool(plan.effectiveWorkerCount)
      const sourceBytes = new Uint8Array(await sourceFile.arrayBuffer())
      const rawProbe = await pool.runTask('probe', {
        fileName: sourceFile.name,
        fileBytes: sourceBytes.slice(),
      }, {
        timeoutMs: 45_000,
      })
      const probe = applySourceEditToProbe(rawProbe, sourceEdit, false)

      const perGifWidth = plan.sampleGifWidth
      const totalTargetHeight = computePresetTargetHeight(config, probe.width, probe.height)
      const targetHeight = plan.splitRows > 1
        ? Math.max(...distributeEvenly(totalTargetHeight, plan.splitRows))
        : totalTargetHeight
      const duration = Math.max(0.1, probe.duration)
      const estimateBppf = plan.estimateBppf

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

  return {
    state: {
      config,
      sourceFile,
      sourceEdit,
      sourceMetadata,
      busy,
      finishingCurrent,
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
      memoryDebug,
      feedbackPromptOpen,
      profilePreviewError,
      librarySave,
      fpsHeadroom,
    },
    actions: {
      setConfig,
      onUpdatePreset: updatePreset,
      onSourceFileChange: handleSourceFileChange,
      onSourceEditChange: setSourceEdit,
      onEstimateAndApplyFps: () => void estimateAndApplyFps(),
      onRunConversion: () => void runConversion(),
      onConvertAtSuggestedFps: convertAtSuggestedFps,
      onCancelConversion: cancelConversion,
      onFinishCurrentConversion: finishCurrentConversion,
      onDownloadZip: () => void downloadZip(),
      onResetConvertState: resetConvertState,
      onUpdateWorkshopParts: updateWorkshopParts,
      onUpdateWorkshopRows: updateWorkshopRows,
      onDismissFeedbackPrompt: dismissFeedbackPrompt,
      onOpenProfilePreview: openProfilePreview,
    },
    meta: {
      convertDisabled: busy || !sourceFile,
      optimizationDisabled,
      standardRetriesEffective,
      retryControlsDisabled,
      precheckEffective,
      retryFpsEffective,
      retryQualityEffective,
      lossyEffective,
      isCompactStrip,
      resultsGridClassName,
      getQualityReductionPercent,
      downloadBlob: (name: string, blob: Blob) => {
        downloadBlob(name, blob)
        armFeedbackPrompt()
      },
      presetPlan,
      showLongMp4Memo,
      showWorkshopMemoryMemo,
      browserSupport,
      profilePreviewAvailable: !busy && canPreviewOnProfile(
        lastConversionLayout,
        artifactViews.map((item) => item.artifact),
      ),
    },
  }
}
