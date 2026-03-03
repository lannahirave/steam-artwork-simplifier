export type Preset = 'workshop' | 'featured' | 'guide'

export type ArtifactStatus = 'original' | 'recompressed' | 'lossy'

export interface ConversionConfig {
  preset: Preset
  gifFps: number
  minGifFps: number
  parts: number
  partWidth: number
  featuredWidth: number
  disableOptimizations: boolean
  maxGifKb: number
  targetGifKb: number
  standardRetriesEnabled: boolean
  retryAllowFpsDrop: boolean
  retryAllowColorDrop: boolean
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
}

export interface SourceProbe {
  width: number
  height: number
  duration: number
  fps: number
}

export interface ConversionArtifact {
  name: string
  blob: Blob
  sizeKb: number
  width: number
  height: number
  status: ArtifactStatus
  finalFps: number
  finalColors: number
}

export interface ConversionResult {
  artifacts: ConversionArtifact[]
  logs: string[]
  warnings: string[]
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

export type WorkerCommand = 'init' | 'probe' | 'convertPart' | 'convertFeatured' | 'convertGuide'
export type WorkerEvent = 'ready' | 'progress' | 'result' | 'error'

export interface InitPayload {
  forceReload?: boolean
}

export interface ProbePayload {
  fileName: string
  fileBytes: Uint8Array
}

export interface ConvertPayloadBase {
  fileName: string
  fileBytes: Uint8Array
  isStillImage: boolean
  srcWidth: number
  srcHeight: number
  duration: number
  gifFps: number
  minGifFps: number
  disableOptimizations: boolean
  maxGifKb: number
  targetGifKb: number
  standardRetriesEnabled: boolean
  retryAllowFpsDrop: boolean
  retryAllowColorDrop: boolean
  lossyOversize: boolean
  lossyLevel: number
  lossyMaxAttempts: number
}

export interface ConvertPartPayload extends ConvertPayloadBase {
  partIndex: number
  parts: number
  partWidth: number
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
}

export interface WorkerArtifactData {
  name: string
  fileBytes: Uint8Array
  sizeKb: number
  width: number
  height: number
  status: ArtifactStatus
  finalFps: number
  finalColors: number
}

export interface WorkerProgressData {
  message: string
  stage: string
}

export interface WorkerErrorData {
  message: string
  command: WorkerCommand
}

export type WorkerRequestPayloadMap = {
  init: InitPayload
  probe: ProbePayload
  convertPart: ConvertPartPayload
  convertFeatured: ConvertFeaturedPayload
  convertGuide: ConvertGuidePayload
}

export type WorkerResultDataMap = {
  init: { initialized: boolean }
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
  | WorkerResultMessage
  | WorkerErrorMessage
