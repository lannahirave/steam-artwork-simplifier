import {
  buildLossyCandidates,
  buildOptimizationCandidates,
  buildQualityRecoveryCandidates,
  shouldTryQualityRecovery,
} from '../lib/sizeStrategy'
import type { ArtifactStatus } from '../lib/types'
import { createGifFrameCache, type GifFrameCache } from './gifFrameCache'
import {
  encodeGif,
  encodeGifCandidates,
  type EncodeGifOptions,
} from './gifFrameEncoder'
import type { WorkerProgressSink } from './workerMessaging'

interface BestEncodeResult {
  bytes: Uint8Array
  sizeKb: number
  status: ArtifactStatus
  finalFps: number
  finalQuality: number
}

export interface SearchEncodeOptions extends Pick<EncodeGifOptions, 'ffmpeg' | 'ffmpegLogBuffer'> {
  postProgress: WorkerProgressSink
  inputName: string
  sourceCacheKey?: string
  baseFilter: string
  isStillImage: boolean
  gifFps: number
  minGifFps: number
  disableOptimizations: boolean
  maxGifKb: number
  targetGifKb: number
  optimizationMode: 'hybrid' | 'quality-first' | 'fast-fit'
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
  startOffsetSec: number
  requestId: string
  frameCache?: GifFrameCache
}

function encodeAttempt(
  options: SearchEncodeOptions,
  outputTag: string,
  vf: string,
  fps: number,
  quality: number,
  frameCache?: GifFrameCache,
): Promise<Uint8Array> {
  return encodeGif({
    ffmpeg: options.ffmpeg,
    ffmpegLogBuffer: options.ffmpegLogBuffer,
    postProgress: options.postProgress,
    requestId: options.requestId,
    inputName: options.inputName,
    sourceCacheKey: options.sourceCacheKey,
    outputTag,
    vf,
    fps,
    quality,
    startOffsetSec: options.startOffsetSec,
    frameCache,
  })
}

async function encodeFixedQualityCandidates(
  options: SearchEncodeOptions,
  vf: string,
  frameCache?: GifFrameCache,
): Promise<BestEncodeResult> {
  const qualities = options.fixedQualityCandidates?.length
    ? options.fixedQualityCandidates
    : [options.fixedQuality ?? 100]
  const results = await encodeGifCandidates(
    {
      ffmpeg: options.ffmpeg,
      ffmpegLogBuffer: options.ffmpegLogBuffer,
      postProgress: options.postProgress,
      requestId: options.requestId,
      inputName: options.inputName,
      sourceCacheKey: options.sourceCacheKey,
      outputTag: `fixed-quality-${options.requestId}`,
      vf,
      fps: options.gifFps,
      startOffsetSec: options.startOffsetSec,
      frameCache,
    },
    qualities,
    options.fixedQualityMaxKb,
  )
  const budgetKb = options.fixedQualityMaxKb
  const selected =
    budgetKb === undefined
      ? results[0]
      : (results.find((result) => result.sizeKb <= budgetKb) ?? results[results.length - 1])

  options.postProgress(
    options.requestId,
    'convert',
    `Fixed quality search selected quality=${selected.quality}: ${selected.sizeKb.toFixed(1)}KB.`,
  )

  return {
    bytes: selected.bytes,
    sizeKb: selected.sizeKb,
    status: selected.quality === 100 ? 'original' : 'recompressed',
    finalFps: options.gifFps,
    finalQuality: selected.quality,
  }
}

export async function searchBestEncode(options: SearchEncodeOptions): Promise<BestEncodeResult> {
  const frameCache = options.frameCache ?? createGifFrameCache()

  if (options.isStillImage) {
    options.postProgress(options.requestId, 'convert', 'Static image source detected: resize-only encode.')
    const bytes = await encodeAttempt(
      options,
      `still-${options.requestId}`,
      options.baseFilter,
      1,
      100,
      frameCache,
    )
    const sizeKb = bytes.byteLength / 1024
    return {
      bytes,
      sizeKb,
      status: 'original',
      finalFps: 1,
      finalQuality: 100,
    }
  }

  if (options.fixedQualityCandidates?.length) {
    options.postProgress(options.requestId, 'convert', 'Starting fixed quality candidate search...')
    return encodeFixedQualityCandidates(options, `fps=${options.gifFps},${options.baseFilter}`, frameCache)
  }

  options.postProgress(options.requestId, 'convert', 'Starting initial encode...')
  let bestFps = options.gifFps
  let bestQuality = options.fixedQuality ?? 100
  let bestBytes = await encodeAttempt(
    options,
    `initial-${options.requestId}`,
    `fps=${options.gifFps},${options.baseFilter}`,
    options.gifFps,
    bestQuality,
    frameCache,
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
      finalQuality: bestQuality,
    }
  }

  if (bestSize <= options.targetGifKb) {
    return {
      bytes: bestBytes,
      sizeKb: bestSize,
      status: bestStatus,
      finalFps: bestFps,
      finalQuality: bestQuality,
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
    allowQualityDrop: options.retryAllowQualityDrop,
    standardRetriesEnabled: options.standardRetriesEnabled,
  })

  for (let i = 0; i < standardCandidates.length; i += 1) {
    const candidate = standardCandidates[i]
    options.postProgress(
      options.requestId,
      candidate.phase,
      `Trying ${candidate.phase} ${i + 1}/${standardCandidates.length}: fps=${candidate.fps}, quality=${candidate.quality}. ${candidate.reason}`,
    )
    const attemptBytes = await encodeAttempt(
      options,
      `${candidate.phase}-${candidate.fps}-${candidate.quality}-${options.requestId}`,
      `fps=${candidate.fps},${options.baseFilter}`,
      candidate.fps,
      candidate.quality,
      frameCache,
    )
    const attemptSize = attemptBytes.byteLength / 1024
    if (attemptSize < bestSize) {
      bestBytes = attemptBytes
      bestSize = attemptSize
      bestFps = candidate.fps
      bestQuality = candidate.quality
      bestStatus = 'recompressed'
      options.postProgress(
        options.requestId,
        candidate.phase,
        `Improved with fps=${candidate.fps}, quality=${candidate.quality}: ${bestSize.toFixed(1)}KB`,
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
      quality: bestQuality,
      allowQualityDrop: options.retryAllowQualityDrop,
    })
    for (let i = 0; i < recoveryCandidates.length; i += 1) {
      const candidate = recoveryCandidates[i]
      options.postProgress(
        options.requestId,
        'quality-recovery',
        `Trying recovery ${i + 1}/${recoveryCandidates.length}: fps=${candidate.fps}, quality=${candidate.quality}.`,
      )
      const attemptBytes = await encodeAttempt(
        options,
        `recovery-${candidate.fps}-${candidate.quality}-${options.requestId}`,
        `fps=${candidate.fps},${options.baseFilter}`,
        candidate.fps,
        candidate.quality,
        frameCache,
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
        bestQuality = candidate.quality
        bestStatus = 'recompressed'
        options.postProgress(
          options.requestId,
          'quality-recovery',
          `Recovered quality=${candidate.quality}: ${bestSize.toFixed(1)}KB.`,
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
      finalQuality: bestQuality,
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
      `Trying lossy ${i + 1}/${lossyCandidates.length}: fps=${candidate.fps}, quality=${candidate.quality}`,
    )
    const vfParts = [`fps=${candidate.fps}`]
    if (candidate.prefilter) {
      vfParts.push(candidate.prefilter)
    }
    vfParts.push(options.baseFilter)

    const attemptBytes = await encodeAttempt(
      options,
      `lossy-${candidate.fps}-${candidate.quality}-${options.requestId}`,
      vfParts.join(','),
      candidate.fps,
      candidate.quality,
      frameCache,
    )

    const attemptSize = attemptBytes.byteLength / 1024
    if (attemptSize < bestSize) {
      bestBytes = attemptBytes
      bestSize = attemptSize
      bestFps = candidate.fps
      bestQuality = candidate.quality
      bestStatus = 'lossy'
      options.postProgress(
        options.requestId,
        'lossy',
        `Improved with fps=${candidate.fps}, quality=${candidate.quality}: ${bestSize.toFixed(1)}KB`,
      )
    }

    if (bestSize <= options.targetGifKb || bestSize <= options.maxGifKb) {
      return {
        bytes: bestBytes,
        sizeKb: bestSize,
        status: bestStatus,
        finalFps: bestFps,
        finalQuality: bestQuality,
      }
    }
  }

  return {
    bytes: bestBytes,
    sizeKb: bestSize,
    status: bestStatus,
    finalFps: bestFps,
    finalQuality: bestQuality,
  }
}
