import type { FFmpeg } from '@ffmpeg/ffmpeg'
import { mapColorsToGifskiQuality } from '../lib/gifskiQuality'
import { encodeWithGifski } from './gifskiRuntime'
import { parsePngDimensions, safeDelete, tailLogOutput } from './ffmpegWorkerFiles'
import type { WorkerProgressSink } from './workerMessaging'

interface ExecContext {
  ret: number
  logTail: string
}

export interface EncodeGifOptions {
  ffmpeg: FFmpeg
  ffmpegLogBuffer: string[]
  postProgress: WorkerProgressSink
  requestId: string
  inputName: string
  outputTag: string
  vf: string
  fps: number
  maxColors: number
  startOffsetSec?: number
}

async function execWithContext(
  ffmpeg: FFmpeg,
  ffmpegLogBuffer: string[],
  args: string[],
): Promise<ExecContext> {
  const start = ffmpegLogBuffer.length
  const ret = await ffmpeg.exec(args)
  const logs = ffmpegLogBuffer.slice(start)
  const trimmed = logs.map((line) => line.trim()).filter((line) => line.length > 0)
  return {
    ret,
    logTail: tailLogOutput(trimmed),
  }
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

async function listFramePaths(ffmpeg: FFmpeg, prefix: string): Promise<string[]> {
  const entries = await ffmpeg.listDir('.')
  return entries
    .filter((entry) => !entry.isDir && entry.name.startsWith(`${prefix}-`) && entry.name.endsWith('.png'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
}

export async function encodeGif(options: EncodeGifOptions): Promise<Uint8Array> {
  const framePrefix = `frames-${options.outputTag}`
  const framePattern = `${framePrefix}-%05d.png`
  let framePaths: string[] = []
  const seekArgs =
    options.startOffsetSec && options.startOffsetSec > 0
      ? ['-ss', options.startOffsetSec.toFixed(3)]
      : []

  try {
    options.postProgress(options.requestId, 'frames', `Extracting PNG frame sequence at ${options.fps}fps...`)

    const extractResult = await execWithContext(options.ffmpeg, options.ffmpegLogBuffer, [
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

    framePaths = await listFramePaths(options.ffmpeg, framePrefix)
    if (framePaths.length === 0) {
      throw new Error('Frame extraction succeeded but produced no PNG frames.')
    }

    const firstFrame = (await options.ffmpeg.readFile(framePaths[0])) as Uint8Array
    const dims = parsePngDimensions(firstFrame)
    if (!dims) {
      throw new Error(`Failed to parse PNG dimensions from ${framePaths[0]}.`)
    }

    const rgbaFrames: Uint8Array[] = []
    rgbaFrames.push(await decodePngToRgba(firstFrame, dims.width, dims.height))

    for (let index = 1; index < framePaths.length; index += 1) {
      const frameBytes = (await options.ffmpeg.readFile(framePaths[index])) as Uint8Array
      const frameDims = parsePngDimensions(frameBytes)
      if (!frameDims || frameDims.width !== dims.width || frameDims.height !== dims.height) {
        throw new Error(`Frame geometry mismatch in ${framePaths[index]}.`)
      }
      rgbaFrames.push(await decodePngToRgba(frameBytes, dims.width, dims.height))
    }

    const quality = mapColorsToGifskiQuality(options.maxColors)
    options.postProgress(
      options.requestId,
      'gifski',
      `Encoding ${framePaths.length} frame(s) with quality ${quality}.`,
    )

    const gifBytes = await encodeWithGifski({
      frames: rgbaFrames,
      width: dims.width,
      height: dims.height,
      fps: options.fps,
      quality,
    })

    if (!hasGifSignature(gifBytes)) {
      throw new Error('gifski produced output without a valid GIF signature.')
    }

    return gifBytes
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`GIF encode failed via gifski.\n\n${message}`, { cause: error })
  } finally {
    await Promise.all(framePaths.map((path) => safeDelete(options.ffmpeg, path)))
  }
}
