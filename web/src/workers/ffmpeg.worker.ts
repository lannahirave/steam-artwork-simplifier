/// <reference lib="webworker" />

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'
import { computeTargetHeight } from '../lib/defaults'
import { buildLossyCandidates, buildStandardCandidates, estimateFpsForKbTarget } from '../lib/sizeStrategy'
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

  loaded = true
}

interface ExecContext {
  ret: number
  logTail: string
  hasAbortLog: boolean
}

async function execWithContext(args: string[]): Promise<ExecContext> {
  const start = ffmpegLogBuffer.length
  const ret = await ffmpeg.exec(args)
  const logs = ffmpegLogBuffer.slice(start)
  const trimmed = logs.map((line) => line.trim()).filter((line) => line.length > 0)
  return {
    ret,
    logTail: tailLogOutput(trimmed),
    hasAbortLog: trimmed.some((line) => /aborted\(\)/i.test(line)),
  }
}

interface EncodeOptions {
  inputName: string
  outputName: string
  vf: string
  maxColors: number
  dither?: string
  statsMode?: 'single' | 'diff'
}

const SUSPICIOUS_ABORT_GIF_MAX_BYTES = 8 * 1024

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

async function readGifIfValid(path: string): Promise<Uint8Array | null> {
  try {
    const bytes = (await ffmpeg.readFile(path)) as Uint8Array
    return hasGifSignature(bytes) ? bytes : null
  } catch {
    return null
  }
}

async function encodeGif(options: EncodeOptions): Promise<Uint8Array> {
  // Faster default than sierra2_4a with acceptable quality for Steam artwork.
  const dither = options.dither ?? 'bayer:bayer_scale=5'
  const statsMode = options.statsMode ?? 'single'
  const singlePassGraph =
    `[0:v]${options.vf},split[v][p];` +
    `[p]palettegen=max_colors=${options.maxColors}:stats_mode=${statsMode}[palette];` +
    `[v][palette]paletteuse=dither=${dither}:diff_mode=rectangle`
  const twoPassGraph = `${options.vf}[x];[x][1:v]paletteuse=dither=${dither}:diff_mode=rectangle`
  const paletteName = `${options.outputName}.palette.png`

  try {
    const singleResult = await execWithContext([
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-threads',
      '1',
      '-i',
      options.inputName,
      '-filter_complex',
      singlePassGraph,
      options.outputName,
    ])
    const singleBytes = await readGifIfValid(options.outputName)
    const singleSuspiciousAbort =
      singleResult.hasAbortLog &&
      singleBytes !== null &&
      singleBytes.byteLength <= SUSPICIOUS_ABORT_GIF_MAX_BYTES

    if (
      singleResult.ret === 0 &&
      singleBytes !== null &&
      !singleSuspiciousAbort
    ) {
      return singleBytes
    }

    if (currentRequestId) {
      postProgress(
        currentRequestId,
        'convert',
        'Primary GIF encode reported instability; retrying with compatibility palette pass...',
      )
    }

    const paletteResult = await execWithContext([
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-threads',
      '1',
      '-i',
      options.inputName,
      '-vf',
      `${options.vf},palettegen=max_colors=${options.maxColors}:stats_mode=${statsMode}`,
      '-frames:v',
      '1',
      '-update',
      '1',
      paletteName,
    ])

    const compatResult = await execWithContext([
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-threads',
      '1',
      '-i',
      options.inputName,
      '-i',
      paletteName,
      '-lavfi',
      twoPassGraph,
      options.outputName,
    ])
    const compatBytes = await readGifIfValid(options.outputName)

    if (
      compatResult.ret === 0 &&
      compatBytes !== null &&
      !(compatResult.hasAbortLog && compatBytes.byteLength <= SUSPICIOUS_ABORT_GIF_MAX_BYTES)
    ) {
      return compatBytes
    }

    if (currentRequestId) {
      postProgress(
        currentRequestId,
        'convert',
        'Palette encode still unstable; retrying with direct GIF encoder fallback...',
      )
    }

    const directResult = await execWithContext([
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-threads',
      '1',
      '-i',
      options.inputName,
      '-vf',
      options.vf,
      options.outputName,
    ])
    const directBytes = await readGifIfValid(options.outputName)

    if (
      directResult.ret === 0 &&
      directBytes !== null &&
      !(directResult.hasAbortLog && directBytes.byteLength <= SUSPICIOUS_ABORT_GIF_MAX_BYTES)
    ) {
      return directBytes
    }

    if (singleResult.ret === 0 && singleBytes !== null && !singleSuspiciousAbort) {
      return singleBytes
    }

    const reasons = [
      `single-pass ret=${singleResult.ret}${singleResult.hasAbortLog ? ' (Aborted logged)' : ''}`,
      `compat-palette ret=${compatResult.ret}${compatResult.hasAbortLog ? ' (Aborted logged)' : ''}`,
      `palette-pass ret=${paletteResult.ret}${paletteResult.hasAbortLog ? ' (Aborted logged)' : ''}`,
      `direct-gif ret=${directResult.ret}${directResult.hasAbortLog ? ' (Aborted logged)' : ''}`,
    ].join('\n')

    const details = [
      `single-pass tail:\n${singleResult.logTail}`,
      `compat-palette tail:\n${compatResult.logTail}`,
      `palette-pass tail:\n${paletteResult.logTail}`,
      `direct-gif tail:\n${directResult.logTail}`,
    ].join('\n\n')

    if (singleBytes === null && compatBytes === null && directBytes === null) {
      throw new Error(
        `GIF encode failed.\n\n${reasons}\n\n${details}`,
      )
    }

    throw new Error(
      'GIF encode produced suspicious output after fallback.\n\n' +
        `${reasons}\n\n` +
        `${details}`,
    )
  } finally {
    await safeDelete(paletteName)
    await safeDelete(options.outputName)
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
  requestId: string
}

async function searchBestEncode(options: SearchEncodeOptions): Promise<BestEncodeResult> {
  if (options.isStillImage) {
    postProgress(options.requestId, 'convert', 'Static image source detected: resize-only encode.')
    const bytes = await encodeGif({
      inputName: options.inputName,
      outputName: `still-${options.requestId}.gif`,
      vf: options.baseFilter,
      maxColors: 256,
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
    outputName: `initial-${options.requestId}.gif`,
    vf: `fps=${options.gifFps},${options.baseFilter}`,
    maxColors: 256,
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
        outputName: `standard-${candidate.fps}-${candidate.colors}-${options.requestId}.gif`,
        vf: `fps=${candidate.fps},${options.baseFilter}`,
        maxColors: candidate.colors,
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
        outputName: `fpsfit-${nextFps}-${options.requestId}.gif`,
        vf: `fps=${nextFps},${options.baseFilter}`,
        maxColors: 256,
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
        outputName: `fps-priority-${fps}-${options.requestId}.gif`,
        vf: `fps=${fps},${options.baseFilter}`,
        maxColors: 256,
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
      outputName: `lossy-${candidate.fps}-${candidate.colors}-${options.requestId}.gif`,
      vf: vfParts.join(','),
      maxColors: candidate.colors,
      dither: candidate.dither,
      statsMode: candidate.statsMode,
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

    return {
      width: dims.width,
      height: dims.height,
      duration: Number.isFinite(duration) ? Math.max(0, duration) : 0,
      fps: Number.isFinite(fps) ? Math.max(0, fps) : 0,
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

  const totalTargetWidth = payload.parts * payload.partWidth
  const targetHeight = computeTargetHeight(payload.srcWidth, payload.srcHeight, totalTargetWidth)
  const cropX = payload.partIndex * payload.partWidth
  const baseFilter =
    `scale=${totalTargetWidth}:${targetHeight}:flags=${SCALE_FLAGS},` +
    `crop=${payload.partWidth}:${targetHeight}:${cropX}:0`

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
    requestId,
  })

  await safeDelete(inputName)

  if (!payload.disableOptimizations && best.sizeKb > payload.maxGifKb) {
    throw new Error(
      `part_${String(payload.partIndex + 1).padStart(2, '0')}.gif still exceeds max size (${best.sizeKb.toFixed(1)}KB).`,
    )
  }

  return {
    name: `part_${String(payload.partIndex + 1).padStart(2, '0')}.gif`,
    fileBytes: best.bytes,
    sizeKb: best.sizeKb,
    width: payload.partWidth,
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
    requestId,
  })

  await safeDelete(inputName)

  if (!payload.disableOptimizations && best.sizeKb > payload.maxGifKb) {
    throw new Error(`featured.gif still exceeds max size (${best.sizeKb.toFixed(1)}KB).`)
  }

  return {
    name: 'featured.gif',
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
    requestId,
  })

  await safeDelete(inputName)

  if (!payload.disableOptimizations && best.sizeKb > payload.maxGifKb) {
    throw new Error(`guide.gif still exceeds max size (${best.sizeKb.toFixed(1)}KB).`)
  }

  return {
    name: 'guide.gif',
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
