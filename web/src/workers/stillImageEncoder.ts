import type { FFmpeg } from '@ffmpeg/ffmpeg'
import type { ArtifactStatus } from '../lib/types'
import type { StillImageFormat } from '../lib/stillImage'
import { safeDelete, tailLogOutput } from './ffmpegWorkerFiles'

export type StillOutputFormat = Exclude<StillImageFormat, 'gif'>

export interface StillEncodeOptions {
  ffmpeg: FFmpeg
  ffmpegLogBuffer: string[]
  postProgress: (id: string, stage: string, message: string) => void
  requestId: string
  inputName: string
  /** Scale/crop chain from the preset geometry, without GIF-only filters. */
  baseFilter: string
  format: StillOutputFormat
  maxKb: number
  disableOptimizations: boolean
}

export interface StillEncodeResult {
  bytes: Uint8Array
  format: StillOutputFormat
  sizeKb: number
  status: ArtifactStatus
  finalFps: number
  finalQuality: number
}

interface QualityStep {
  args: string[]
  /** Reported in the gifski 1-100 scale so the results card shows the reduction. */
  quality: number
}

// Lossy formats step down only when the output is above the size limit.
const QUALITY_LADDERS: Record<StillOutputFormat, QualityStep[]> = {
  png: [{ args: ['-c:v', 'png'], quality: 100 }],
  jpg: [
    { args: ['-c:v', 'mjpeg', '-q:v', '2'], quality: 100 },
    { args: ['-c:v', 'mjpeg', '-q:v', '4'], quality: 90 },
    { args: ['-c:v', 'mjpeg', '-q:v', '6'], quality: 80 },
    { args: ['-c:v', 'mjpeg', '-q:v', '9'], quality: 70 },
    { args: ['-c:v', 'mjpeg', '-q:v', '13'], quality: 60 },
  ],
  webp: [
    { args: ['-c:v', 'libwebp', '-quality', '92'], quality: 100 },
    { args: ['-c:v', 'libwebp', '-quality', '82'], quality: 90 },
    { args: ['-c:v', 'libwebp', '-quality', '72'], quality: 80 },
    { args: ['-c:v', 'libwebp', '-quality', '62'], quality: 70 },
    { args: ['-c:v', 'libwebp', '-quality', '50'], quality: 60 },
  ],
}

async function encodeOnce(
  options: StillEncodeOptions,
  format: StillOutputFormat,
  step: QualityStep,
  attempt: number,
): Promise<Uint8Array | null> {
  const outputName = `${options.requestId}.still-${attempt}.${format}`
  try {
    const ret = await options.ffmpeg.exec([
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      options.inputName,
      '-vf',
      options.baseFilter,
      '-frames:v',
      '1',
      '-update',
      '1',
      ...step.args,
      outputName,
    ])
    if (ret !== 0) {
      return null
    }
    return (await options.ffmpeg.readFile(outputName)) as Uint8Array
  } finally {
    await safeDelete(options.ffmpeg, outputName)
  }
}

/** Scales and crops a still image into the same format as the source. */
export async function encodeStillImage(options: StillEncodeOptions): Promise<StillEncodeResult> {
  options.postProgress(
    options.requestId,
    'convert',
    `Static image source detected: resizing and cropping as ${options.format.toUpperCase()}.`,
  )

  let format = options.format
  let ladder = QUALITY_LADDERS[format]
  let best: { bytes: Uint8Array; quality: number } | null = null

  for (let attempt = 0; attempt < ladder.length; attempt += 1) {
    const step = ladder[attempt]
    const bytes = await encodeOnce(options, format, step, attempt)
    if (!bytes) {
      if (attempt === 0 && format === 'webp') {
        // Fall back to lossless PNG when the WebP encoder is unavailable.
        options.postProgress(options.requestId, 'convert', 'WebP encoder unavailable; writing PNG instead.')
        format = 'png'
        ladder = QUALITY_LADDERS.png
        attempt = -1
        continue
      }
      if (best) {
        break
      }
      throw new Error(
        `ffmpeg failed to write the ${format.toUpperCase()} image.\n\n` +
          'ffmpeg output:\n' +
          tailLogOutput(options.ffmpegLogBuffer),
      )
    }

    best = { bytes, quality: step.quality }
    const sizeKb = bytes.byteLength / 1024
    if (options.disableOptimizations || sizeKb <= options.maxKb) {
      break
    }
    if (attempt + 1 < ladder.length) {
      options.postProgress(
        options.requestId,
        'convert',
        `${format.toUpperCase()} is ${sizeKb.toFixed(1)}KB (max ${options.maxKb}KB); lowering quality.`,
      )
    }
  }

  if (!best) {
    throw new Error(`ffmpeg produced no ${format.toUpperCase()} output.`)
  }

  return {
    bytes: best.bytes,
    format,
    sizeKb: best.bytes.byteLength / 1024,
    status: best.quality === 100 ? 'original' : 'lossy',
    finalFps: 0,
    finalQuality: best.quality,
  }
}
