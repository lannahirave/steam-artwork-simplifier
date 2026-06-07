import { buildLossyCandidates, buildStandardCandidates, estimateFpsForKbTarget } from '../lib/sizeStrategy'
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
  let bestColors = 256
  let bestBytes = await encodeAttempt(
    options,
    `initial-${options.requestId}`,
    `fps=${options.gifFps},${options.baseFilter}`,
    options.gifFps,
    256,
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

  if (options.standardRetriesEnabled) {
    const standardCandidates = buildStandardCandidates(options.gifFps, options.minGifFps, {
      allowFpsDrop: options.retryAllowFpsDrop,
      allowColorDrop: options.retryAllowColorDrop,
    })
    for (let i = 0; i < standardCandidates.length; i += 1) {
      const candidate = standardCandidates[i]
      options.postProgress(
        options.requestId,
        'standard',
        `Trying standard ${i + 1}/${standardCandidates.length}: fps=${candidate.fps}, colors=${candidate.colors}`,
      )
      const attemptBytes = await encodeAttempt(
        options,
        `standard-${candidate.fps}-${candidate.colors}-${options.requestId}`,
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
      options.postProgress(
        options.requestId,
        'standard',
        `FPS-fit: estimated ${removedFrames} FPS reduction needed to reach ${targetKb.toFixed(1)}KB (try fps=${nextFps}).`,
      )

      const attemptBytes = await encodeAttempt(
        options,
        `fpsfit-${nextFps}-${options.requestId}`,
        `fps=${nextFps},${options.baseFilter}`,
        nextFps,
        256,
      )
      const attemptSize = attemptBytes.byteLength / 1024
      if (attemptSize < bestSize) {
        bestBytes = attemptBytes
        bestSize = attemptSize
        bestFps = nextFps
        bestColors = 256
        bestStatus = 'recompressed'
        options.postProgress(
          options.requestId,
          'standard',
          `FPS-fit improved output: ${bestSize.toFixed(1)}KB at ${nextFps}fps.`,
        )

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

  if (options.retryAllowFpsDrop && bestSize > options.maxGifKb) {
    const fpsFloor = Math.max(1, options.minGifFps)
    const totalSweepSteps = Math.max(0, bestFps - fpsFloor)
    if (totalSweepSteps > 0) {
      options.postProgress(
        options.requestId,
        'standard',
        `FPS-priority sweep: trying lower FPS values before any color reduction (${totalSweepSteps} step(s)).`,
      )
    }

    for (let fps = bestFps - 1; fps >= fpsFloor; fps -= 1) {
      const sweepIndex = bestFps - fps
      options.postProgress(
        options.requestId,
        'standard',
        `FPS-priority ${sweepIndex}/${totalSweepSteps}: fps=${fps}, colors=256`,
      )

      const attemptBytes = await encodeAttempt(
        options,
        `fps-priority-${fps}-${options.requestId}`,
        `fps=${fps},${options.baseFilter}`,
        fps,
        256,
      )
      const attemptSize = attemptBytes.byteLength / 1024
      if (attemptSize < bestSize) {
        bestBytes = attemptBytes
        bestSize = attemptSize
        bestFps = fps
        bestColors = 256
        bestStatus = 'recompressed'
        options.postProgress(
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
