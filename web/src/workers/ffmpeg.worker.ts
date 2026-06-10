/// <reference lib="webworker" />

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'
import type {
  AnyWorkerRequest,
  ConvertFeaturedPayload,
  ConvertGuidePayload,
  ConvertPartPayload,
  WorkerArtifactData,
} from '../lib/types'
import { searchBestEncode } from './encodeSearch'
import { extensionOf, safeDelete, sourceBaseName } from './ffmpegWorkerFiles'
import { GIFSKI_RUNTIME_VERSION, ensureGifskiRuntimeLoaded } from './gifskiRuntime'
import {
  buildFeaturedGeometry,
  buildGuideGeometry,
  buildPartGeometry,
} from './workerGeometry'
import { postError, postProgress, postResult } from './workerMessaging'
import { runProbe } from './mediaProbe'

declare const self: DedicatedWorkerGlobalScope

const ffmpeg = new FFmpeg()
const ffmpegLogBuffer: string[] = []
let loaded = false
let currentRequestId = ''

ffmpeg.on('log', ({ message }) => {
  ffmpegLogBuffer.push(message)
  if (currentRequestId) {
    postProgress(currentRequestId, 'ffmpeg', message)
  }
})

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

function buildSearchOptions(
  requestId: string,
  payload: ConvertPartPayload | ConvertFeaturedPayload | ConvertGuidePayload,
  inputName: string,
  baseFilter: string,
) {
  return {
    ffmpeg,
    ffmpegLogBuffer,
    postProgress,
    inputName,
    baseFilter,
    isStillImage: payload.isStillImage,
    gifFps: payload.gifFps,
    minGifFps: payload.minGifFps,
    disableOptimizations: payload.disableOptimizations,
    maxGifKb: payload.maxGifKb,
    targetGifKb: payload.targetGifKb,
    optimizationMode: payload.optimizationMode,
    enableQualityRecovery: payload.enableQualityRecovery,
    fixedColors: payload.fixedColors,
    standardRetriesEnabled: payload.standardRetriesEnabled,
    retryAllowFpsDrop: payload.retryAllowFpsDrop,
    retryAllowColorDrop: payload.retryAllowColorDrop,
    lossyOversize: payload.lossyOversize,
    lossyLevel: payload.lossyLevel,
    lossyMaxAttempts: payload.lossyMaxAttempts,
    startOffsetSec: payload.startOffsetSec ?? 0,
    requestId,
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

  try {
    const geometry = buildPartGeometry(payload)
    const best = await searchBestEncode(
      buildSearchOptions(requestId, payload, inputName, geometry.baseFilter),
    )

    return {
      name: `${sourceBaseName(payload.fileName)}_part_${String(payload.partIndex + 1).padStart(2, '0')}.gif`,
      fileBytes: best.bytes,
      sizeKb: best.sizeKb,
      width: geometry.outputWidth,
      height: geometry.targetHeight,
      status: best.status,
      finalFps: best.finalFps,
      finalColors: best.finalColors,
    }
  } finally {
    await safeDelete(ffmpeg, inputName)
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

  try {
    const geometry = buildFeaturedGeometry(payload)
    const best = await searchBestEncode(
      buildSearchOptions(requestId, payload, inputName, geometry.baseFilter),
    )

    return {
      name: `${sourceBaseName(payload.fileName)}_featured.gif`,
      fileBytes: best.bytes,
      sizeKb: best.sizeKb,
      width: geometry.width,
      height: geometry.height,
      status: best.status,
      finalFps: best.finalFps,
      finalColors: best.finalColors,
    }
  } finally {
    await safeDelete(ffmpeg, inputName)
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

  try {
    const geometry = buildGuideGeometry(payload)
    const best = await searchBestEncode(
      buildSearchOptions(requestId, payload, inputName, geometry.baseFilter),
    )

    return {
      name: `${sourceBaseName(payload.fileName)}_guide.gif`,
      fileBytes: best.bytes,
      sizeKb: best.sizeKb,
      width: geometry.width,
      height: geometry.height,
      status: best.status,
      finalFps: best.finalFps,
      finalColors: best.finalColors,
    }
  } finally {
    await safeDelete(ffmpeg, inputName)
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
      const data = await runProbe(ffmpeg, request.id, request.payload, ffmpegLogBuffer)
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
