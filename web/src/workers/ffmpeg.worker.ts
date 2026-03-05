/// <reference lib="webworker" />

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'
import { computeTargetHeight } from '../lib/defaults'
import { mapColorsToGifskiQuality } from '../lib/gifskiQuality'
import { buildLossyCandidates, buildStandardCandidates, estimateFpsForKbTarget } from '../lib/sizeStrategy'
import {
  encodeWithGifski,
  ensureGifskiRuntimeLoaded,
  GIFSKI_RUNTIME_VERSION,
} from './gifskiRuntime'
import type {
  AnyWorkerRequest,
  ArtifactStatus,
  ConvertFeaturedPayload,
  ConvertGuidePayload,
  ConvertPartPayload,
  ProbePayload,
  ProbeResultData,
  WorkerArtifactData,
  WorkerCommand,
  WorkerErrorMessage,
  WorkerProgressMessage,
  WorkerResultMessage,
} from '../lib/types'

declare const self: DedicatedWorkerGlobalScope

const ffmpeg = new FFmpeg()
const ffmpegLogBuffer: string[] = []
let loaded = false
let currentRequestId = ''
const SCALE_FLAGS = 'bicubic'
const INTRO_SAMPLE_FRAMES = 12
const INTRO_DARK_YAVG_THRESHOLD = 20
const INTRO_BRIGHT_YAVG_MIN = 24
const INTRO_BRIGHT_DELTA_MIN = 8
const INTRO_MAX_OFFSET_SECONDS = 1

ffmpeg.on('log', ({ message }) => {
  ffmpegLogBuffer.push(message)
  if (currentRequestId) {
    postProgress(currentRequestId, 'ffmpeg', message)
  }
})

function postProgress(id: string, stage: string, message: string): void {
  const payload: WorkerProgressMessage = {
    id,
    event: 'progress',
    payload: {
      stage,
      message,
    },
  }
  self.postMessage(payload)
}

function postResult<T extends WorkerCommand>(
  id: string,
  command: T,
  data: WorkerResultMessage<T>['payload']['data'],
): void {
  const payload: WorkerResultMessage<T> = {
    id,
    event: 'result',
    payload: {
      command,
      data,
    },
  }

  const maybeWithFileBytes = data as Partial<WorkerArtifactData>
  if (maybeWithFileBytes.fileBytes instanceof Uint8Array) {
    self.postMessage(payload, [maybeWithFileBytes.fileBytes.buffer])
    return
  }

  self.postMessage(payload)
}

function postError(id: string, command: WorkerCommand, message: string): void {
  const payload: WorkerErrorMessage = {
    id,
    event: 'error',
    payload: {
      command,
      message,
    },
  }
  self.postMessage(payload)
}

function tailLogOutput(logs: string[], lineCount = 24): string {
  const trimmed = logs
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const tail = trimmed.slice(-lineCount)
  return tail.length > 0 ? tail.join('\n') : '(no ffmpeg output was captured)'
}

function parseDurationFromLogs(logs: string[]): number {
  for (const line of logs) {
    const match = line.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
    if (!match) {
      continue
    }
    const hours = Number.parseInt(match[1], 10)
    const minutes = Number.parseInt(match[2], 10)
    const seconds = Number.parseFloat(match[3])
    const duration = hours * 3600 + minutes * 60 + seconds
    if (Number.isFinite(duration) && duration >= 0) {
      return duration
    }
  }
  return 0
}

function parseSourceFpsFromLogs(logs: string[]): number {
  for (const line of logs) {
    if (!line.includes('Stream #') || !line.includes('Video:')) {
      continue
    }

    const match = line.match(/(\d+(?:\.\d+)?)\s*fps/i)
    if (!match) {
      continue
    }

    const fps = Number.parseFloat(match[1])
    if (Number.isFinite(fps) && fps > 0) {
      return fps
    }
  }
  return 0
}

function parseSignalYAvgSeries(logs: string[]): number[] {
  const out: number[] = []
  for (const line of logs) {
    const match = line.match(/lavfi\.signalstats\.YAVG=(\d+(?:\.\d+)?)/)
    if (!match) {
      continue
    }
    const value = Number.parseFloat(match[1])
    if (Number.isFinite(value)) {
      out.push(value)
    }
  }
  return out
}

function estimateDarkIntroOffsetSeconds(logs: string[], sourceFps: number): number {
  const ySeries = parseSignalYAvgSeries(logs)
  if (ySeries.length < 2 || sourceFps <= 0) {
    return 0
  }

  const first = ySeries[0]
  if (first > INTRO_DARK_YAVG_THRESHOLD) {
    return 0
  }

  for (let index = 1; index < ySeries.length; index += 1) {
    const value = ySeries[index]
    if (value < INTRO_BRIGHT_YAVG_MIN) {
      continue
    }
    if (value < first + INTRO_BRIGHT_DELTA_MIN) {
      continue
    }
    const seconds = index / sourceFps
    if (seconds > 0 && seconds <= INTRO_MAX_OFFSET_SECONDS) {
      return Number(seconds.toFixed(3))
    }
    return 0
  }

  return 0
}

function parsePngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) {
    return null
  }
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (let i = 0; i < sig.length; i += 1) {
    if (bytes[i] !== sig[i]) {
      return null
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16, false)
  const height = view.getUint32(20, false)
  if (width <= 0 || height <= 0) {
    return null
  }
  return { width, height }
}

function extensionOf(fileName: string): string {
  const parts = fileName.split('.')
  if (parts.length < 2) {
    return 'mp4'
  }
  return parts.pop() ?? 'mp4'
}

function sourceBaseName(fileName: string): string {
  const trimmed = fileName.trim()
  if (!trimmed) {
    return 'output'
  }
  const dotIndex = trimmed.lastIndexOf('.')
  if (dotIndex <= 0) {
    return trimmed
  }
  return trimmed.slice(0, dotIndex)
}

async function safeDelete(path: string): Promise<void> {
  try {
    await ffmpeg.deleteFile(path)
  } catch {
    // ignore cleanup failures
  }
}

async function ensureLoaded(requestId: string): Promise<void> {
  if (loaded) {
    return
  }

  postProgress(requestId, 'init', 'Loading FFmpeg WASM core...')

  // Use single-thread core in browser workers for higher stability.
  const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm'
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  })

  postProgress(requestId, 'init', `Loading gifski WASM runtime (${GIFSKI_RUNTIME_VERSION})...`)
  await ensureGifskiRuntimeLoaded()

  loaded = true
}

interface ExecContext {
  ret: number
  logTail: string
}

async function execWithContext(args: string[]): Promise<ExecContext> {
  const start = ffmpegLogBuffer.length
  const ret = await ffmpeg.exec(args)
  const logs = ffmpegLogBuffer.slice(start)
  const trimmed = logs.map((line) => line.trim()).filter((line) => line.length > 0)
  return {
    ret,
    logTail: tailLogOutput(trimmed),
  }
}

interface EncodeOptions {
  inputName: string
  outputTag: string
  vf: string
  fps: number
  maxColors: number
  startOffsetSec?: number
}

function hasGifSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 6) {
    return false
  }
  const head = String.fromCharCode(
    bytes[0],
    bytes[1],
    bytes[2],
    bytes[3],
    bytes[4],
    bytes[5],
  )
  return head === 'GIF87a' || head === 'GIF89a'
}

async function decodePngToRgba(pngBytes: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('createImageBitmap is not available in this worker runtime.')
  }

  const safePngBytes = new Uint8Array(pngBytes.byteLength)
  safePngBytes.set(pngBytes)
  const imageBlob = new Blob([safePngBytes.buffer], { type: 'image/png' })
  const bitmap = await createImageBitmap(imageBlob)
  try {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      throw new Error('Failed to create 2D canvas context for frame decode.')
    }
    context.drawImage(bitmap, 0, 0, width, height)
    const imageData = context.getImageData(0, 0, width, height)
    const out = new Uint8Array(imageData.data.byteLength)
    out.set(imageData.data)
    return out
  } finally {
    bitmap.close()
  }
}

async function listFramePaths(prefix: string): Promise<string[]> {
  const entries = await ffmpeg.listDir('.')
  return entries
    .filter((entry) => !entry.isDir && entry.name.startsWith(`${prefix}-`) && entry.name.endsWith('.png'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
}

async function encodeGif(options: EncodeOptions): Promise<Uint8Array> {
  const framePrefix = `frames-${options.outputTag}`
  const framePattern = `${framePrefix}-%05d.png`
  let framePaths: string[] = []
  const seekArgs =
    options.startOffsetSec && options.startOffsetSec > 0
      ? ['-ss', options.startOffsetSec.toFixed(3)]
      : []

  try {
    if (currentRequestId) {
      postProgress(currentRequestId, 'frames', `Extracting PNG frame sequence at ${options.fps}fps...`)
    }

    const extractResult = await execWithContext([
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-threads',
      '1',
      ...seekArgs,
      '-i',
      options.inputName,
      '-vf',
      options.vf,
      '-vsync',
      '0',
      '-f',
      'image2',
      '-vcodec',
      'png',
      framePattern,
    ])

    if (extractResult.ret !== 0) {
      throw new Error(`ffmpeg frame extraction failed.\n\nffmpeg tail:\n${extractResult.logTail}`)
    }

    framePaths = await listFramePaths(framePrefix)
    if (framePaths.length === 0) {
      throw new Error('Frame extraction succeeded but produced no PNG frames.')
    }

    const firstFrame = (await ffmpeg.readFile(framePaths[0])) as Uint8Array
    const dims = parsePngDimensions(firstFrame)
    if (!dims) {
      throw new Error(`Failed to parse PNG dimensions from ${framePaths[0]}.`)
    }

    const rgbaFrames: Uint8Array[] = []
    rgbaFrames.push(await decodePngToRgba(firstFrame, dims.width, dims.height))

    for (let index = 1; index < framePaths.length; index += 1) {
      const frameBytes = (await ffmpeg.readFile(framePaths[index])) as Uint8Array
      const frameDims = parsePngDimensions(frameBytes)
      if (!frameDims || frameDims.width !== dims.width || frameDims.height !== dims.height) {
        throw new Error(`Frame geometry mismatch in ${framePaths[index]}.`)
      }
      rgbaFrames.push(await decodePngToRgba(frameBytes, dims.width, dims.height))
    }

    const quality = mapColorsToGifskiQuality(options.maxColors)
    if (currentRequestId) {
      postProgress(
        currentRequestId,
        'gifski',
        `Encoding ${framePaths.length} frame(s) with quality ${quality}.`,
      )
    }

    const gifBytes = await encodeWithGifski({
      frames: rgbaFrames,
      width: dims.width,
      height: dims.height,
      fps: options.fps,
      quality,
      repeat: 0,
    })

    if (!hasGifSignature(gifBytes)) {
      throw new Error('gifski produced output without a valid GIF signature.')
    }

    return gifBytes
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`GIF encode failed via gifski.\n\n${message}`)
  } finally {
    await Promise.all(framePaths.map((path) => safeDelete(path)))
  }
}

interface BestEncodeResult {
  bytes: Uint8Array
  sizeKb: number
  status: ArtifactStatus
  finalFps: number
  finalColors: number
}

interface SearchEncodeOptions {
  inputName: string
  baseFilter: string
  isStillImage: boolean
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
  startOffsetSec: number
  requestId: string
}

async function searchBestEncode(options: SearchEncodeOptions): Promise<BestEncodeResult> {
  if (options.isStillImage) {
    postProgress(options.requestId, 'convert', 'Static image source detected: resize-only encode.')
    const bytes = await encodeGif({
      inputName: options.inputName,
      outputTag: `still-${options.requestId}`,
      vf: options.baseFilter,
      fps: 1,
      maxColors: 256,
      startOffsetSec: options.startOffsetSec,
    })
    const sizeKb = bytes.byteLength / 1024
    return {
      bytes,
      sizeKb,
      status: 'original',
      finalFps: 1,
      finalColors: 256,
    }
  }

  postProgress(options.requestId, 'convert', 'Starting initial encode...')
  let bestFps = options.gifFps
  let bestColors = 256
  let bestBytes = await encodeGif({
    inputName: options.inputName,
    outputTag: `initial-${options.requestId}`,
    vf: `fps=${options.gifFps},${options.baseFilter}`,
    fps: options.gifFps,
    maxColors: 256,
    startOffsetSec: options.startOffsetSec,
  })
  let bestSize = bestBytes.byteLength / 1024
  let bestStatus: ArtifactStatus = 'original'

  postProgress(options.requestId, 'convert', `Initial encode: ${bestSize.toFixed(1)}KB`)

  if (options.disableOptimizations) {
    postProgress(
      options.requestId,
      'convert',
      'Disable optimizations enabled: using raw initial encode and skipping size/quality retries.',
    )
    return {
      bytes: bestBytes,
      sizeKb: bestSize,
      status: bestStatus,
      finalFps: bestFps,
      finalColors: bestColors,
    }
  }

  if (bestSize <= options.targetGifKb) {
    return {
      bytes: bestBytes,
      sizeKb: bestSize,
      status: bestStatus,
      finalFps: bestFps,
      finalColors: bestColors,
    }
  }

  if (options.standardRetriesEnabled) {
    const standardCandidates = buildStandardCandidates(options.gifFps, options.minGifFps, {
      allowFpsDrop: options.retryAllowFpsDrop,
      allowColorDrop: options.retryAllowColorDrop,
    })
    for (let i = 0; i < standardCandidates.length; i += 1) {
      const candidate = standardCandidates[i]
      postProgress(
        options.requestId,
        'standard',
        `Trying standard ${i + 1}/${standardCandidates.length}: fps=${candidate.fps}, colors=${candidate.colors}`,
      )
      const attemptBytes = await encodeGif({
        inputName: options.inputName,
        outputTag: `standard-${candidate.fps}-${candidate.colors}-${options.requestId}`,
        vf: `fps=${candidate.fps},${options.baseFilter}`,
        fps: candidate.fps,
        maxColors: candidate.colors,
        startOffsetSec: options.startOffsetSec,
      })
      const attemptSize = attemptBytes.byteLength / 1024
      if (attemptSize < bestSize) {
        bestBytes = attemptBytes
        bestSize = attemptSize
        bestFps = candidate.fps
        bestColors = candidate.colors
        bestStatus = 'recompressed'
        postProgress(
          options.requestId,
          'standard',
          `Improved with fps=${candidate.fps}, colors=${candidate.colors}: ${bestSize.toFixed(1)}KB`,
        )
      }

      if (bestSize <= options.targetGifKb) {
        return {
          bytes: bestBytes,
          sizeKb: bestSize,
          status: bestStatus,
          finalFps: bestFps,
          finalColors: bestColors,
        }
      }
    }
  }

  if (options.retryAllowFpsDrop && bestSize > options.targetGifKb) {
    const visitedFps = new Set<number>()
    for (let i = 0; i < 3; i += 1) {
      const targetKb = bestSize > options.maxGifKb ? options.maxGifKb : options.targetGifKb
      const nextFps = estimateFpsForKbTarget(
        bestFps,
        bestSize,
        targetKb,
        options.minGifFps,
      )
      if (nextFps >= bestFps || visitedFps.has(nextFps)) {
        break
      }
      visitedFps.add(nextFps)

      const removedFrames = Math.max(0, bestFps - nextFps)
      postProgress(
        options.requestId,
        'standard',
        `FPS-fit: estimated ${removedFrames} FPS reduction needed to reach ${targetKb.toFixed(1)}KB (try fps=${nextFps}).`,
      )

      const attemptBytes = await encodeGif({
        inputName: options.inputName,
        outputTag: `fpsfit-${nextFps}-${options.requestId}`,
        vf: `fps=${nextFps},${options.baseFilter}`,
        fps: nextFps,
        maxColors: 256,
        startOffsetSec: options.startOffsetSec,
      })
      const attemptSize = attemptBytes.byteLength / 1024
      if (attemptSize < bestSize) {
        bestBytes = attemptBytes
        bestSize = attemptSize
        bestFps = nextFps
        bestColors = 256
        bestStatus = 'recompressed'
        postProgress(
          options.requestId,
          'standard',
          `FPS-fit improved output: ${bestSize.toFixed(1)}KB at ${nextFps}fps.`,
        )

        // Speed-first behavior when standard retries are disabled:
        // once we're within hard max, skip extra target-size chasing passes.
        if (!options.standardRetriesEnabled && bestSize <= options.maxGifKb) {
          return {
            bytes: bestBytes,
            sizeKb: bestSize,
            status: bestStatus,
            finalFps: bestFps,
            finalColors: bestColors,
          }
        }
      }

      if (bestSize <= options.targetGifKb) {
        return {
          bytes: bestBytes,
          sizeKb: bestSize,
          status: bestStatus,
          finalFps: bestFps,
          finalColors: bestColors,
        }
      }
    }
  }

  // Always exhaust FPS-only reductions before palette reductions when oversize.
  if (options.retryAllowFpsDrop && bestSize > options.maxGifKb) {
    const fpsFloor = Math.max(1, options.minGifFps)
    const totalSweepSteps = Math.max(0, bestFps - fpsFloor)
    if (totalSweepSteps > 0) {
      postProgress(
        options.requestId,
        'standard',
        `FPS-priority sweep: trying lower FPS values before any color reduction (${totalSweepSteps} step(s)).`,
      )
    }

    for (let fps = bestFps - 1; fps >= fpsFloor; fps -= 1) {
      const sweepIndex = bestFps - fps
      postProgress(
        options.requestId,
        'standard',
        `FPS-priority ${sweepIndex}/${totalSweepSteps}: fps=${fps}, colors=256`,
      )

      const attemptBytes = await encodeGif({
        inputName: options.inputName,
        outputTag: `fps-priority-${fps}-${options.requestId}`,
        vf: `fps=${fps},${options.baseFilter}`,
        fps,
        maxColors: 256,
        startOffsetSec: options.startOffsetSec,
      })
      const attemptSize = attemptBytes.byteLength / 1024
      if (attemptSize < bestSize) {
        bestBytes = attemptBytes
        bestSize = attemptSize
        bestFps = fps
        bestColors = 256
        bestStatus = 'recompressed'
        postProgress(
          options.requestId,
          'standard',
          `FPS-priority improved output: ${bestSize.toFixed(1)}KB at ${fps}fps.`,
        )
      }

      if (bestSize <= options.maxGifKb) {
        break
      }
    }
  }

  if (bestSize <= options.maxGifKb || !options.lossyOversize) {
    return {
      bytes: bestBytes,
      sizeKb: bestSize,
      status: bestStatus,
      finalFps: bestFps,
      finalColors: bestColors,
    }
  }

  const lossyCandidates = buildLossyCandidates(
    bestFps,
    options.minGifFps,
    options.lossyLevel,
    options.lossyMaxAttempts,
    { allowFpsDrop: options.retryAllowFpsDrop },
  )

  for (let i = 0; i < lossyCandidates.length; i += 1) {
    const candidate = lossyCandidates[i]
    postProgress(
      options.requestId,
      'lossy',
      `Trying lossy ${i + 1}/${lossyCandidates.length}: fps=${candidate.fps}, colors=${candidate.colors}`,
    )
    const vfParts = [`fps=${candidate.fps}`]
    if (candidate.prefilter) {
      vfParts.push(candidate.prefilter)
    }
    vfParts.push(options.baseFilter)

    const attemptBytes = await encodeGif({
      inputName: options.inputName,
      outputTag: `lossy-${candidate.fps}-${candidate.colors}-${options.requestId}`,
      vf: vfParts.join(','),
      fps: candidate.fps,
      maxColors: candidate.colors,
      startOffsetSec: options.startOffsetSec,
    })

    const attemptSize = attemptBytes.byteLength / 1024
    if (attemptSize < bestSize) {
      bestBytes = attemptBytes
      bestSize = attemptSize
      bestFps = candidate.fps
      bestColors = candidate.colors
      bestStatus = 'lossy'
      postProgress(
        options.requestId,
        'lossy',
        `Improved with fps=${candidate.fps}, colors=${candidate.colors}: ${bestSize.toFixed(1)}KB`,
      )
    }

    if (bestSize <= options.targetGifKb || bestSize <= options.maxGifKb) {
      return {
        bytes: bestBytes,
        sizeKb: bestSize,
        status: bestStatus,
        finalFps: bestFps,
        finalColors: bestColors,
      }
    }
  }

  return {
    bytes: bestBytes,
    sizeKb: bestSize,
    status: bestStatus,
    finalFps: bestFps,
    finalColors: bestColors,
  }
}

async function runProbe(requestId: string, payload: ProbePayload): Promise<ProbeResultData> {
  const inputName = `${requestId}.${extensionOf(payload.fileName)}`
  const probeFrameName = `${requestId}.probe.png`
  ffmpegLogBuffer.length = 0
  await ffmpeg.writeFile(inputName, payload.fileBytes)

  try {
    const ret = await ffmpeg.exec([
      '-hide_banner',
      '-loglevel',
      'info',
      '-y',
      '-i',
      inputName,
      '-map',
      '0:v:0',
      '-frames:v',
      '1',
      probeFrameName,
    ])

    if (ret !== 0) {
      throw new Error(
        'ffmpeg probe failed to inspect input video.\n\n' +
          'ffmpeg output:\n' +
          tailLogOutput(ffmpegLogBuffer),
      )
    }

    const frameBytes = (await ffmpeg.readFile(probeFrameName)) as Uint8Array
    const dims = parsePngDimensions(frameBytes)
    if (!dims) {
      throw new Error(
        'Unable to parse source dimensions from generated probe frame.\n\n' +
          'ffmpeg output:\n' +
          tailLogOutput(ffmpegLogBuffer),
      )
    }

    const duration = parseDurationFromLogs(ffmpegLogBuffer)
    const fps = parseSourceFpsFromLogs(ffmpegLogBuffer)
    let startOffsetSec = 0

    const introAnalysisStart = ffmpegLogBuffer.length
    const introRet = await ffmpeg.exec([
      '-hide_banner',
      '-loglevel',
      'info',
      '-y',
      '-i',
      inputName,
      '-vf',
      'signalstats,metadata=print',
      '-frames:v',
      String(INTRO_SAMPLE_FRAMES),
      '-f',
      'null',
      '-',
    ])
    if (introRet === 0 && fps > 0) {
      const introLogs = ffmpegLogBuffer.slice(introAnalysisStart)
      startOffsetSec = estimateDarkIntroOffsetSeconds(introLogs, fps)
    }

    return {
      width: dims.width,
      height: dims.height,
      duration: Number.isFinite(duration) ? Math.max(0, duration) : 0,
      fps: Number.isFinite(fps) ? Math.max(0, fps) : 0,
      startOffsetSec,
    }
  } catch (error) {
    const base = error instanceof Error ? error.message : String(error)
    const withLogs =
      base +
      '\n\n' +
      'ffmpeg log tail:\n' +
      tailLogOutput(ffmpegLogBuffer)
    throw new Error(withLogs)
  } finally {
    await safeDelete(probeFrameName)
    await safeDelete(inputName)
  }
}

async function runConvertPart(requestId: string, payload: ConvertPartPayload): Promise<WorkerArtifactData> {
  const inputName = `${requestId}.${extensionOf(payload.fileName)}`
  ffmpegLogBuffer.length = 0
  postProgress(
    requestId,
    'convert',
    `Part ${payload.partIndex + 1}/${payload.parts}: preparing input...`,
  )
  await ffmpeg.writeFile(inputName, payload.fileBytes)

  const requestedSplitWidths = payload.splitWidths
  const splitWidths =
    requestedSplitWidths && requestedSplitWidths.length === payload.parts
      ? requestedSplitWidths.map((width) => Math.max(1, Math.floor(width)))
      : Array.from({ length: payload.parts }, () => payload.partWidth)
  const totalTargetWidth = splitWidths.reduce((sum, width) => sum + width, 0)
  const targetHeight = computeTargetHeight(payload.srcWidth, payload.srcHeight, totalTargetWidth)
  const outputWidth = splitWidths[payload.partIndex] ?? payload.partWidth
  const cropX = splitWidths
    .slice(0, payload.partIndex)
    .reduce((sum, width) => sum + width, 0)
  const baseFilter =
    `scale=${totalTargetWidth}:${targetHeight}:flags=${SCALE_FLAGS},` +
    `crop=${outputWidth}:${targetHeight}:${cropX}:0`

  const best = await searchBestEncode({
    inputName,
    baseFilter,
    isStillImage: payload.isStillImage,
    gifFps: payload.gifFps,
    minGifFps: payload.minGifFps,
    disableOptimizations: payload.disableOptimizations,
    maxGifKb: payload.maxGifKb,
    targetGifKb: payload.targetGifKb,
    standardRetriesEnabled: payload.standardRetriesEnabled,
    retryAllowFpsDrop: payload.retryAllowFpsDrop,
    retryAllowColorDrop: payload.retryAllowColorDrop,
    lossyOversize: payload.lossyOversize,
    lossyLevel: payload.lossyLevel,
    lossyMaxAttempts: payload.lossyMaxAttempts,
    startOffsetSec: payload.startOffsetSec ?? 0,
    requestId,
  })

  await safeDelete(inputName)

  const outputName = `${sourceBaseName(payload.fileName)}_part_${String(payload.partIndex + 1).padStart(2, '0')}.gif`

  return {
    name: outputName,
    fileBytes: best.bytes,
    sizeKb: best.sizeKb,
    width: outputWidth,
    height: targetHeight,
    status: best.status,
    finalFps: best.finalFps,
    finalColors: best.finalColors,
  }
}

async function runConvertFeatured(
  requestId: string,
  payload: ConvertFeaturedPayload,
): Promise<WorkerArtifactData> {
  const inputName = `${requestId}.${extensionOf(payload.fileName)}`
  ffmpegLogBuffer.length = 0
  postProgress(requestId, 'convert', 'Featured: preparing input...')
  await ffmpeg.writeFile(inputName, payload.fileBytes)

  const targetHeight = computeTargetHeight(payload.srcWidth, payload.srcHeight, payload.featuredWidth)
  const baseFilter = `scale=${payload.featuredWidth}:${targetHeight}:flags=${SCALE_FLAGS}`

  const best = await searchBestEncode({
    inputName,
    baseFilter,
    isStillImage: payload.isStillImage,
    gifFps: payload.gifFps,
    minGifFps: payload.minGifFps,
    disableOptimizations: payload.disableOptimizations,
    maxGifKb: payload.maxGifKb,
    targetGifKb: payload.targetGifKb,
    standardRetriesEnabled: payload.standardRetriesEnabled,
    retryAllowFpsDrop: payload.retryAllowFpsDrop,
    retryAllowColorDrop: payload.retryAllowColorDrop,
    lossyOversize: payload.lossyOversize,
    lossyLevel: payload.lossyLevel,
    lossyMaxAttempts: payload.lossyMaxAttempts,
    startOffsetSec: payload.startOffsetSec ?? 0,
    requestId,
  })

  await safeDelete(inputName)

  return {
    name: `${sourceBaseName(payload.fileName)}_featured.gif`,
    fileBytes: best.bytes,
    sizeKb: best.sizeKb,
    width: payload.featuredWidth,
    height: targetHeight,
    status: best.status,
    finalFps: best.finalFps,
    finalColors: best.finalColors,
  }
}

async function runConvertGuide(
  requestId: string,
  payload: ConvertGuidePayload,
): Promise<WorkerArtifactData> {
  const inputName = `${requestId}.${extensionOf(payload.fileName)}`
  ffmpegLogBuffer.length = 0
  postProgress(requestId, 'convert', 'Guide: preparing input...')
  await ffmpeg.writeFile(inputName, payload.fileBytes)

  // Keep aspect ratio, then center-crop to exact square size.
  const baseFilter =
    `scale=${payload.guideSize}:${payload.guideSize}:flags=${SCALE_FLAGS}:force_original_aspect_ratio=increase,` +
    `crop=${payload.guideSize}:${payload.guideSize}`

  const best = await searchBestEncode({
    inputName,
    baseFilter,
    isStillImage: payload.isStillImage,
    gifFps: payload.gifFps,
    minGifFps: payload.minGifFps,
    disableOptimizations: payload.disableOptimizations,
    maxGifKb: payload.maxGifKb,
    targetGifKb: payload.targetGifKb,
    standardRetriesEnabled: payload.standardRetriesEnabled,
    retryAllowFpsDrop: payload.retryAllowFpsDrop,
    retryAllowColorDrop: payload.retryAllowColorDrop,
    lossyOversize: payload.lossyOversize,
    lossyLevel: payload.lossyLevel,
    lossyMaxAttempts: payload.lossyMaxAttempts,
    startOffsetSec: payload.startOffsetSec ?? 0,
    requestId,
  })

  await safeDelete(inputName)

  return {
    name: `${sourceBaseName(payload.fileName)}_guide.gif`,
    fileBytes: best.bytes,
    sizeKb: best.sizeKb,
    width: payload.guideSize,
    height: payload.guideSize,
    status: best.status,
    finalFps: best.finalFps,
    finalColors: best.finalColors,
  }
}

self.onmessage = async (event: MessageEvent<AnyWorkerRequest>) => {
  const request = event.data
  currentRequestId = request.id

  try {
    await ensureLoaded(request.id)

    if (request.command === 'init') {
      postResult(request.id, request.command, { initialized: true })
      return
    }

    if (request.command === 'probe') {
      const data = await runProbe(request.id, request.payload)
      postResult(request.id, request.command, data)
      return
    }

    if (request.command === 'convertPart') {
      const data = await runConvertPart(request.id, request.payload)
      postResult(request.id, request.command, data)
      return
    }

    if (request.command === 'convertFeatured') {
      const data = await runConvertFeatured(request.id, request.payload)
      postResult(request.id, request.command, data)
      return
    }

    if (request.command === 'convertGuide') {
      const data = await runConvertGuide(request.id, request.payload)
      postResult(request.id, request.command, data)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    postError(request.id, request.command, message)
  } finally {
    currentRequestId = ''
  }
}

export {}
