import type { FFmpeg } from '@ffmpeg/ffmpeg'
import type { ProbePayload, ProbeResultData } from '../lib/types'
import { extensionOf, parsePngDimensions, safeDelete, tailLogOutput } from './ffmpegWorkerFiles'
import { isFfmpegCoreFailure, withCoreWatchdog, type CoreWatch } from './ffmpegCoreHealth'

const INTRO_SAMPLE_FRAMES = 12
const INTRO_DARK_YAVG_THRESHOLD = 20
const INTRO_BRIGHT_YAVG_MIN = 24
const INTRO_BRIGHT_DELTA_MIN = 8
const INTRO_MAX_OFFSET_SECONDS = 1
// Each probe command decodes at most a dozen frames. Both commands share one deadline that
// sits well inside the pool's 45s probe timeout, so a wedged core is normally reset in place
// instead of the whole worker being replaced (which would download the ffmpeg core again).
export const PROBE_EXEC_WATCHDOG_MS = 20_000
// The optional dark-intro step always gets at least this long, even if the first step was slow.
const MIN_PROBE_STEP_MS = 5_000

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

/**
 * WebM keeps VP8/VP9 alpha in a side channel that ffmpeg's native decoders drop. The container
 * flags it with `alpha_mode: 1`; libvpx decodes it. Returns the decoder to force, or undefined.
 */
export function parseWebmAlphaDecoder(logs: string[]): string | undefined {
  let codec: string | undefined
  let alphaMode = false
  for (const line of logs) {
    if (line.includes('Stream mapping:') || line.startsWith('Output #')) {
      break
    }
    if (codec === undefined && line.includes('Stream #') && line.includes('Video:')) {
      codec = line.match(/Video:\s*(\w+)/)?.[1]?.toLowerCase()
    }
    if (/^\s*alpha_mode\s*:\s*1\s*$/.test(line)) {
      alphaMode = true
    }
  }
  if (!alphaMode) {
    return undefined
  }
  if (codec === 'vp9') {
    return 'libvpx-vp9'
  }
  if (codec === 'vp8') {
    return 'libvpx'
  }
  return undefined
}

/** PNG colour types 4 and 6 carry an alpha channel; a tRNS chunk adds transparency to the others. */
export function pngMayHaveAlpha(bytes: Uint8Array): boolean {
  if (bytes.length < 26) {
    return false
  }
  const colorType = bytes[25]
  if (colorType === 4 || colorType === 6) {
    return true
  }
  // Walk the chunks up to the image data, looking for tRNS.
  let offset = 8
  while (offset + 8 <= bytes.length) {
    const length =
      ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
    if (type === 'tRNS') {
      return true
    }
    if (type === 'IDAT' || type === 'IEND') {
      return false
    }
    offset += 12 + length
  }
  return false
}

/** True when any pixel of the decoded PNG is not fully opaque. */
async function pngHasTransparentPixels(bytes: Uint8Array, width: number, height: number): Promise<boolean> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
    return false
  }
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const bitmap = await createImageBitmap(new Blob([copy.buffer], { type: 'image/png' }))
  try {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      return false
    }
    context.drawImage(bitmap, 0, 0, width, height)
    const data = context.getImageData(0, 0, width, height).data
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] < 255) {
        return true
      }
    }
    return false
  } finally {
    bitmap.close()
  }
}

/** Alpha detection is a convenience; a failure here must never fail the probe. */
async function detectFrameAlpha(bytes: Uint8Array, width: number, height: number): Promise<boolean> {
  if (!pngMayHaveAlpha(bytes)) {
    return false
  }
  try {
    return await pngHasTransparentPixels(bytes, width, height)
  } catch {
    return false
  }
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

export async function runProbe(
  ffmpeg: FFmpeg,
  requestId: string,
  payload: ProbePayload,
  ffmpegLogBuffer: string[],
  watchCore: CoreWatch = withCoreWatchdog,
): Promise<ProbeResultData> {
  const inputName = `${requestId}.${extensionOf(payload.fileName)}`
  const probeFrameName = `${requestId}.probe.png`
  ffmpegLogBuffer.length = 0
  await ffmpeg.writeFile(inputName, payload.fileBytes)
  const probeDeadline = Date.now() + PROBE_EXEC_WATCHDOG_MS
  const remainingProbeMs = (): number => Math.max(MIN_PROBE_STEP_MS, probeDeadline - Date.now())

  try {
    const ret = await watchCore(ffmpeg.exec([
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
    ]), remainingProbeMs())

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
    const alphaDecoder = parseWebmAlphaDecoder(ffmpegLogBuffer)
    const hasAlpha = alphaDecoder !== undefined || (await detectFrameAlpha(frameBytes, dims.width, dims.height))
    let startOffsetSec = 0

    const introAnalysisStart = ffmpegLogBuffer.length
    // Dark-intro detection is optional: if the core fails or stalls here, keep the probe
    // result already parsed and skip the offset. The core stays flagged, so the worker
    // resets it before the next request.
    const introRet = await watchCore(ffmpeg.exec([
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
    ]), remainingProbeMs()).catch((error: unknown) => {
      if (isFfmpegCoreFailure(error)) {
        return -1
      }
      throw error
    })
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
      hasAlpha,
      ...(alphaDecoder ? { alphaDecoder } : {}),
    }
  } catch (error) {
    const base = error instanceof Error ? error.message : String(error)
    const withLogs =
      base +
      '\n\n' +
      'ffmpeg log tail:\n' +
      tailLogOutput(ffmpegLogBuffer)
    throw new Error(withLogs, { cause: error })
  } finally {
    await safeDelete(ffmpeg, probeFrameName)
    await safeDelete(ffmpeg, inputName)
  }
}
