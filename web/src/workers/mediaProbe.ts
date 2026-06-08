import type { FFmpeg } from '@ffmpeg/ffmpeg'
import type { ProbePayload, ProbeResultData } from '../lib/types'
import { extensionOf, parsePngDimensions, safeDelete, tailLogOutput } from './ffmpegWorkerFiles'

const INTRO_SAMPLE_FRAMES = 12
const INTRO_DARK_YAVG_THRESHOLD = 20
const INTRO_BRIGHT_YAVG_MIN = 24
const INTRO_BRIGHT_DELTA_MIN = 8
const INTRO_MAX_OFFSET_SECONDS = 1

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

export async function runProbe(
  ffmpeg: FFmpeg,
  requestId: string,
  payload: ProbePayload,
  ffmpegLogBuffer: string[],
): Promise<ProbeResultData> {
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
    throw new Error(withLogs, { cause: error })
  } finally {
    await safeDelete(ffmpeg, probeFrameName)
    await safeDelete(ffmpeg, inputName)
  }
}
