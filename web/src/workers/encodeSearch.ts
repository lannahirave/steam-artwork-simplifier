import {
  buildLossyCandidates,
  buildOptimizationCandidates,
  buildQualityRecoveryCandidates,
  shouldTryQualityRecovery,
} from '../lib/sizeStrategy'
import type { ArtifactStatus } from '../lib/types'
import { encodeGif, type EncodeGifOptions } from './gifFrameEncoder'
import type { WorkerProgressSink } from './workerMessaging'

interface BestEncodeResult {
  bytes: Uint8Array
  sizeKb: number
  status: ArtifactStatus
  finalFps: number
  finalColors: number
}

export interface SearchEncodeOptions extends Pick<EncodeGifOptions, 'ffmpeg' | 'ffmpegLogBuffer'> {
  postProgress: WorkerProgressSink
  inputName: string
  baseFilter: string
  isStillImage: boolean
  gifFps: number
  minGifFps: number
  disableOptimizations: boolean
  maxGifKb: number
  targetGifKb: number
  optimizationMode: 'hybrid' | 'quality-first' | 'fast-fit'
  enableQualityRecovery: boolean
  fixedColors?: number
  standardRetriesEnabled: boolean
  retryAllowFpsDrop: boolean
  retryAllowColorDrop: boolean
  lossyOversize: boolean
  lossyLevel: number
  lossyMaxAttempts: number
  startOffsetSec: number
  requestId: string
}

function encodeAttempt(
  options: SearchEncodeOptions,
  outputTag: string,
  vf: string,
  fps: number,
  maxColors: number,
): Promise<Uint8Array> {
  return encodeGif({
    ffmpeg: options.ffmpeg,
    ffmpegLogBuffer: options.ffmpegLogBuffer,
    postProgress: options.postProgress,
    requestId: options.requestId,
    inputName: options.inputName,
    outputTag,
    vf,
    fps,
    maxColors,
    startOffsetSec: options.startOffsetSec,
  })
}

export async function searchBestEncode(options: SearchEncodeOptions): Promise<BestEncodeResult> {
  if (options.isStillImage) {
    options.postProgress(options.requestId, 'convert', 'Static image source detected: resize-only encode.')
    const bytes = await encodeAttempt(
      options,
      `still-${options.requestId}`,
      options.baseFilter,
      1,
      256,
    )
    const sizeKb = bytes.byteLength / 1024
    return {
      bytes,
      sizeKb,
      status: 'original',
      finalFps: 1,
      finalColors: 256,
    }
  }

  options.postProgress(options.requestId, 'convert', 'Starting initial encode...')
  let bestFps = options.gifFps
  let bestColors = options.fixedColors ?? 256
  let bestBytes = await encodeAttempt(
    options,
    `initial-${options.requestId}`,
    `fps=${options.gifFps},${options.baseFilter}`,
    options.gifFps,
    bestColors,
  )
  let bestSize = bestBytes.byteLength / 1024
  let bestStatus: ArtifactStatus = 'original'

  options.postProgress(options.requestId, 'convert', `Initial encode: ${bestSize.toFixed(1)}KB`)

  if (options.disableOptimizations) {
    options.postProgress(
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

  const standardCandidates = buildOptimizationCandidates({
    mode: options.optimizationMode,
    currentFps: options.gifFps,
    currentSizeKb: bestSize,
    targetGifKb: options.targetGifKb,
    maxGifKb: options.maxGifKb,
    minGifFps: options.minGifFps,
    allowFpsDrop: options.retryAllowFpsDrop,
    allowColorDrop: options.retryAllowColorDrop,
    standardRetriesEnabled: options.standardRetriesEnabled,
  })

  for (let i = 0; i < standardCandidates.length; i += 1) {
    const candidate = standardCandidates[i]
    options.postProgress(
      options.requestId,
      candidate.phase,
      `Trying ${candidate.phase} ${i + 1}/${standardCandidates.length}: fps=${candidate.fps}, colors=${candidate.colors}. ${candidate.reason}`,
    )
    const attemptBytes = await encodeAttempt(
      options,
      `${candidate.phase}-${candidate.fps}-${candidate.colors}-${options.requestId}`,
      `fps=${candidate.fps},${options.baseFilter}`,
      candidate.fps,
      candidate.colors,
    )
    const attemptSize = attemptBytes.byteLength / 1024
    if (attemptSize < bestSize) {
      bestBytes = attemptBytes
      bestSize = attemptSize
      bestFps = candidate.fps
      bestColors = candidate.colors
      bestStatus = 'recompressed'
      options.postProgress(
        options.requestId,
        candidate.phase,
        `Improved with fps=${candidate.fps}, colors=${candidate.colors}: ${bestSize.toFixed(1)}KB`,
      )
    }

    if (bestSize <= options.targetGifKb || (options.optimizationMode === 'fast-fit' && bestSize <= options.maxGifKb)) {
      break
    }
  }

  if (
    options.enableQualityRecovery &&
    options.optimizationMode === 'hybrid' &&
    bestSize <= options.maxGifKb &&
    shouldTryQualityRecovery(bestSize, options.targetGifKb)
  ) {
    const recoveryCandidates = buildQualityRecoveryCandidates({
      fps: bestFps,
      colors: bestColors,
      allowColorDrop: options.retryAllowColorDrop,
    })
    for (let i = 0; i < recoveryCandidates.length; i += 1) {
      const candidate = recoveryCandidates[i]
      options.postProgress(
        options.requestId,
        'quality-recovery',
        `Trying recovery ${i + 1}/${recoveryCandidates.length}: fps=${candidate.fps}, colors=${candidate.colors}.`,
      )
      const attemptBytes = await encodeAttempt(
        options,
        `recovery-${candidate.fps}-${candidate.colors}-${options.requestId}`,
        `fps=${candidate.fps},${options.baseFilter}`,
        candidate.fps,
        candidate.colors,
      )
      const attemptSize = attemptBytes.byteLength / 1024
      if (attemptSize > options.maxGifKb) {
        options.postProgress(
          options.requestId,
          'quality-recovery',
          `Recovery stopped: ${attemptSize.toFixed(1)}KB would exceed max ${options.maxGifKb}KB.`,
        )
        break
      }
      if (attemptSize > bestSize) {
        bestBytes = attemptBytes
        bestSize = attemptSize
        bestColors = candidate.colors
        bestStatus = 'recompressed'
        options.postProgress(
          options.requestId,
          'quality-recovery',
          `Recovered quality to colors=${candidate.colors}: ${bestSize.toFixed(1)}KB.`,
        )
      }
      if (!shouldTryQualityRecovery(bestSize, options.targetGifKb)) {
        break
      }
    }
  } else if (options.enableQualityRecovery && options.optimizationMode === 'hybrid' && bestSize <= options.maxGifKb) {
    options.postProgress(
      options.requestId,
      'quality-recovery',
      `Recovery skipped: ${bestSize.toFixed(1)}KB is within 10% of target ${options.targetGifKb}KB.`,
    )
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
    options.postProgress(
      options.requestId,
      'lossy',
      `Trying lossy ${i + 1}/${lossyCandidates.length}: fps=${candidate.fps}, colors=${candidate.colors}`,
    )
    const vfParts = [`fps=${candidate.fps}`]
    if (candidate.prefilter) {
      vfParts.push(candidate.prefilter)
    }
    vfParts.push(options.baseFilter)

    const attemptBytes = await encodeAttempt(
      options,
      `lossy-${candidate.fps}-${candidate.colors}-${options.requestId}`,
      vfParts.join(','),
      candidate.fps,
      candidate.colors,
    )

    const attemptSize = attemptBytes.byteLength / 1024
    if (attemptSize < bestSize) {
      bestBytes = attemptBytes
      bestSize = attemptSize
      bestFps = candidate.fps
      bestColors = candidate.colors
      bestStatus = 'lossy'
      options.postProgress(
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
