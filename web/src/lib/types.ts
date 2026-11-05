import type { SourceEdit } from './sourceEdit'
import type { StillImageFormat } from './stillImage'

export type Preset = 'workshop' | 'featured' | 'guide' | 'showcase'

export type ArtifactStatus = 'original' | 'recompressed' | 'lossy'
export type OptimizationMode = 'hybrid' | 'quality-first' | 'fast-fit'
export type WorkshopRows = 1 | 2 | 3
export type ShadowDarkening = 'off' | 'low' | 'medium' | 'high'

export type HeightFit = 'crop' | 'letterbox'

/**
 * Output background. 'auto' keeps transparency only when the source has it; 'transparent' also
 * makes letterbox bars see-through; 'black' flattens any transparency onto black.
 */
export type BackgroundMode = 'auto' | 'transparent' | 'black'

export type AlphaHandling = 'keep' | 'flatten'

export interface ConversionConfig {
  preset: Preset
  gifFps: number
  minGifFps: number
  parts: number
  workshopRows: WorkshopRows
  partWidth: number
  featuredWidth: number
  /** Custom output height in pixels; 0 follows the source aspect ratio. Ignored by the Guide preset. */
  outputHeight: number
  /** How the source fills a custom height: crop the overflow, or letterbox with black bars. */
  heightFit: HeightFit
  background: BackgroundMode
  disableOptimizations: boolean
  maxGifKb: number
  targetGifKb: number
  optimizationMode: OptimizationMode
  shadowDarkening: ShadowDarkening
  standardRetriesEnabled: boolean
  retryAllowFpsDrop: boolean
  retryAllowQualityDrop: boolean
  lossyOversize: boolean
  lossyLevel: number
  lossyMaxAttempts: number
  precheckEnabled: boolean
  precheckBppf: number
  precheckMarginPct: number
  eofPatchEnabled: boolean
  eofByte: number
  headerPatchEnabled: boolean
  headerWidth: number
  headerHeight: number
  workerCount: number
}

export interface ConversionInput {
  file: File
  /** Crop and trim from the Cut Preview editor, applied before the preset geometry. */
  edit?: SourceEdit | null
}

export interface SourceProbe {
  width: number
  height: number
  duration: number
  fps: number
  startOffsetSec: number
  /** The first frame has see-through pixels, or the stream is WebM with an alpha channel. */
  hasAlpha: boolean
  /** ffmpeg decoder to force before `-i` so the alpha channel is decoded (WebM VP8/VP9). */
  alphaDecoder?: string
}

export interface ConversionArtifact {
  name: string
  blob: Blob
  sizeKb: number
  width: number
  height: number
  status: ArtifactStatus
  finalFps: number
  finalQuality: number
  /** Encoded with a transparent background; previews show a checkerboard behind it. */
  transparent?: boolean
  /**
   * The output before the header and end-byte patches, kept only when they changed the bytes.
   * Patched GIFs are for uploading to Steam; previews outside Steam use this copy.
   */
  previewBlob?: Blob
}

export type ConversionCompletionStatus = 'complete' | 'finished-incomplete'

export interface ConversionResult {
  artifacts: ConversionArtifact[]
  logs: string[]
  warnings: string[]
  completionStatus: ConversionCompletionStatus
  completedOutputs: number
  expectedOutputs: number
}

export type MemoryDebugBucket =
  | 'source-bytes'
  | 'worker-payload-copy'
  | 'worker-memfs-input'
  | 'worker-memfs-png'
  | 'decoded-rgba'
  | 'frame-cache-retained'
  | 'gifski-frame-input'
  | 'gifski-output'
  | 'output-blob'
  | 'patch-copy'
  | 'preview-object-url'

export type MemoryDebugEventKind = 'estimate' | 'retained'

export interface MemoryDebugEventData {
  bucket: MemoryDebugBucket
  label: string
  bytes: number
  kind: MemoryDebugEventKind
  stage: string
  requestId?: string
  retainedKey?: string
  itemCount?: number
  detail?: string
}

export interface MemoryDebugEvent extends MemoryDebugEventData {
  id: string
  time: string
  timeMs: number
  source: 'main' | 'worker'
  workerIndex?: number
}

export type BrowserMemorySampleSource =
  | 'measureUserAgentSpecificMemory'
  | 'performance.memory'
  | 'unavailable'

export interface BrowserMemoryBreakdownItem {
  bytes: number
  scope: string
  url: string
  types: string[]
}

export interface BrowserMemorySample {
  id: string
  time: string
  timeMs: number
  label: string
  source: BrowserMemorySampleSource
  bytes: number | null
  usedJSHeapSize?: number
  totalJSHeapSize?: number
  jsHeapSizeLimit?: number
  breakdown: BrowserMemoryBreakdownItem[]
  note?: string
}

export interface MemoryDebugSession {
  events: MemoryDebugEvent[]
  samples: BrowserMemorySample[]
}

export interface EofPatchRequest {
  files: File[]
  byte: number
}

export interface HeaderPatchRequest {
  files: File[]
  width: number
  height: number
  eofPatchEnabled: boolean
  eofByte: number
}

export interface PatchResult {
  fileName: string
  changed: boolean
  message: string
  blob: Blob
}

export interface ResolvedPresetSettings {
  parts: number
  partWidth: number
  maxGifKb: number
  targetGifKb: number
}

export type WorkerCommand =
  | 'init'
  | 'probe'
  | 'convertPart'
  | 'convertFeatured'
  | 'convertGuide'
  | 'clearFrameCache'
export type WorkerEvent = 'ready' | 'progress' | 'memory' | 'result' | 'error'

export interface InitPayload {
  forceReload?: boolean
}

export interface ClearFrameCachePayload {
  memoryDebugEnabled?: boolean
}

export interface ProbePayload {
  fileName: string
  fileBytes: Uint8Array
}

export interface ConvertPayloadBase {
  fileName: string
  fileBytes: Uint8Array
  sourceCacheKey: string
  isStillImage: boolean
  /** Output format for still image sources; anything but 'gif' skips the GIF encoder. */
  stillFormat?: StillImageFormat
  /** ffmpeg filters for the user's crop/trim, placed in front of the preset scale/crop chain. */
  sourceFilter?: string
  srcWidth: number
  srcHeight: number
  /** Custom frame height; when unset the height follows the source aspect ratio. */
  outputHeight?: number
  heightFit?: HeightFit
  /**
   * 'keep' encodes transparency (1-bit in GIFs); 'flatten' composites a transparent source onto
   * black. Unset for opaque sources with a black background.
   */
  alpha?: AlphaHandling
  /** ffmpeg decoder forced before `-i` (WebM alpha needs libvpx). */
  inputDecoder?: string
  duration: number
  gifFps: number
  minGifFps: number
  disableOptimizations: boolean
  maxGifKb: number
  targetGifKb: number
  optimizationMode: OptimizationMode
  enableQualityRecovery: boolean
  fixedQuality?: number
  fixedQualityCandidates?: number[]
  fixedQualityMaxKb?: number
  standardRetriesEnabled: boolean
  retryAllowFpsDrop: boolean
  retryAllowQualityDrop: boolean
  lossyOversize: boolean
  lossyLevel: number
  lossyMaxAttempts: number
  shadowDarkening?: ShadowDarkening
  startOffsetSec?: number
  memoryDebugEnabled?: boolean
}

export interface ConvertPartPayload extends ConvertPayloadBase {
  partIndex: number
  parts: number
  partWidth: number
  splitWidths?: number[]
  splitColumns?: number
  splitRows?: number
  splitRowHeights?: number[]
}

export interface ConvertFeaturedPayload extends ConvertPayloadBase {
  featuredWidth: number
}

export interface ConvertGuidePayload extends ConvertPayloadBase {
  guideSize: number
}

export interface ProbeResultData {
  width: number
  height: number
  duration: number
  fps: number
  startOffsetSec: number
  hasAlpha: boolean
  alphaDecoder?: string
}

export interface WorkerArtifactData {
  name: string
  fileBytes: Uint8Array
  sizeKb: number
  width: number
  height: number
  status: ArtifactStatus
  finalFps: number
  finalQuality: number
}

export interface WorkerProgressData {
  message: string
  stage: string
}

export type WorkerMemoryDebugData = MemoryDebugEventData

export interface WorkerErrorData {
  message: string
  command: WorkerCommand
  /** The worker cannot run further tasks and must be replaced. */
  fatal?: boolean
}

export type WorkerRequestPayloadMap = {
  init: InitPayload
  clearFrameCache: ClearFrameCachePayload
  probe: ProbePayload
  convertPart: ConvertPartPayload
  convertFeatured: ConvertFeaturedPayload
  convertGuide: ConvertGuidePayload
}

export type WorkerResultDataMap = {
  init: { initialized: boolean }
  clearFrameCache: { cleared: boolean }
  probe: ProbeResultData
  convertPart: WorkerArtifactData
  convertFeatured: WorkerArtifactData
  convertGuide: WorkerArtifactData
}

export interface WorkerRequest<T extends WorkerCommand = WorkerCommand> {
  id: string
  command: T
  payload: WorkerRequestPayloadMap[T]
}

export type AnyWorkerRequest = {
  [K in WorkerCommand]: WorkerRequest<K>
}[WorkerCommand]

export interface WorkerReadyMessage {
  id: string
  event: 'ready'
  payload: { message: string }
}

export interface WorkerProgressMessage {
  id: string
  event: 'progress'
  payload: WorkerProgressData
}

export interface WorkerMemoryDebugMessage {
  id: string
  event: 'memory'
  payload: WorkerMemoryDebugData
}

export interface WorkerResultMessage<T extends WorkerCommand = WorkerCommand> {
  id: string
  event: 'result'
  payload: {
    command: T
    data: WorkerResultDataMap[T]
  }
}

export interface WorkerErrorMessage {
  id: string
  event: 'error'
  payload: WorkerErrorData
}

export type WorkerResponseMessage =
  | WorkerReadyMessage
  | WorkerProgressMessage
  | WorkerMemoryDebugMessage
  | WorkerResultMessage
  | WorkerErrorMessage
