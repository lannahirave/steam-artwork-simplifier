import { patchGifHeaderBytes, patchLastByteBytes } from './patch'
import { runPrecheck } from './precheck'
import { FFmpegWorkerPool } from './workerPool'
import type {
  ConversionArtifact,
  ConversionConfig,
  ConversionInput,
  ConversionResult,
  SourceProbe,
  WorkerArtifactData,
} from './types'

export interface ConversionProgress {
  stage: string
  message: string
}

export interface ConversionExecutionResult extends ConversionResult {
  probe: SourceProbe
}

export interface ConversionOptions {
  onProgress?: (progress: ConversionProgress) => void
}

function toBytes(blob: Blob): Promise<Uint8Array> {
  return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer))
}

function bytesToBlob(bytes: Uint8Array, type: string): Blob {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const buffer: ArrayBuffer = copy.buffer
  return new Blob([buffer], { type })
}

function toArtifact(data: WorkerArtifactData): ConversionArtifact {
  return {
    name: data.name,
    blob: bytesToBlob(data.fileBytes, 'image/gif'),
    sizeKb: data.sizeKb,
    width: data.width,
    height: data.height,
    status: data.status,
  }
}

async function applyPostPatches(
  artifacts: ConversionArtifact[],
  config: ConversionConfig,
): Promise<ConversionArtifact[]> {
  const out: ConversionArtifact[] = []

  for (const artifact of artifacts) {
    let bytes = await toBytes(artifact.blob)

    if (config.headerPatchEnabled) {
      const headerPatched = patchGifHeaderBytes(
        bytes,
        config.headerWidth,
        config.headerHeight,
        false,
        config.eofByte,
      )
      bytes = headerPatched.bytes
    }

    if (config.eofPatchEnabled) {
      const eofPatched = patchLastByteBytes(bytes, config.eofByte)
      bytes = eofPatched.bytes
    }

    out.push({
      ...artifact,
      blob: bytesToBlob(bytes, 'image/gif'),
      sizeKb: bytes.byteLength / 1024,
    })
  }

  return out
}

export async function convertVideo(
  input: ConversionInput,
  config: ConversionConfig,
  pool: FFmpegWorkerPool,
  options: ConversionOptions = {},
): Promise<ConversionExecutionResult> {
  const logs: string[] = []
  const warnings: string[] = []

  const emit = (stage: string, message: string): void => {
    const line = `[${stage}] ${message}`
    logs.push(line)
    options.onProgress?.({ stage, message })
  }

  emit('init', `Preparing ${config.workerCount} ffmpeg worker(s).`)
  await pool.warmup()

  emit('input', `Loading file ${input.file.name}.`)
  const sourceBytes = new Uint8Array(await input.file.arrayBuffer())

  emit('probe', 'Probing source dimensions and duration.')
  const probe = await pool.runTask('probe', {
    fileName: input.file.name,
    fileBytes: sourceBytes.slice(),
  }, {
    timeoutMs: 45_000,
  })

  const parts = config.preset === 'featured' ? 1 : config.parts
  const partWidth = config.preset === 'featured' ? config.featuredWidth : config.partWidth

  if (config.precheckEnabled) {
    const precheck = runPrecheck({
      srcWidth: probe.width,
      srcHeight: probe.height,
      duration: probe.duration,
      parts,
      partWidth,
      minGifFps: config.minGifFps,
      maxGifKb: config.maxGifKb,
      precheckBppf: config.precheckBppf,
      precheckMarginPct: config.precheckMarginPct,
    })
    warnings.push(precheck.message)
    emit('precheck', precheck.message)
    if (precheck.shouldBlock) {
      throw new Error(
        `Precheck blocked conversion: estimated ${precheck.estimatedKb.toFixed(1)}KB exceeds ` +
          `allowed ${precheck.allowedKb.toFixed(1)}KB. Adjust limits/FPS or disable precheck.`,
      )
    }
  }

  const workerProgress = (workerIndex: number) => (message: string, stage: string): void => {
    emit(`worker-${workerIndex + 1}:${stage}`, message)
  }

  emit('convert', `Starting ${parts} conversion task(s).`)

  const resultData =
    config.preset === 'featured'
      ? [
          await pool.runTask(
            'convertFeatured',
            {
              fileName: input.file.name,
              fileBytes: sourceBytes.slice(),
              srcWidth: probe.width,
              srcHeight: probe.height,
              duration: probe.duration,
              gifFps: config.gifFps,
              minGifFps: config.minGifFps,
              maxGifKb: config.maxGifKb,
              targetGifKb: config.targetGifKb,
              standardRetriesEnabled: config.standardRetriesEnabled,
              retryAllowFpsDrop: config.retryAllowFpsDrop,
              retryAllowColorDrop: config.retryAllowColorDrop,
              lossyOversize: config.lossyOversize,
              lossyLevel: config.lossyLevel,
              lossyMaxAttempts: config.lossyMaxAttempts,
              featuredWidth: config.featuredWidth,
            },
            {
              onProgress: workerProgress(0),
              timeoutMs: 6 * 60_000,
            },
          ),
        ]
      : await Promise.all(
          Array.from({ length: parts }, (_, index) =>
            pool.runTask(
              'convertPart',
              {
                fileName: input.file.name,
                fileBytes: sourceBytes.slice(),
                srcWidth: probe.width,
                srcHeight: probe.height,
                duration: probe.duration,
                gifFps: config.gifFps,
                minGifFps: config.minGifFps,
                maxGifKb: config.maxGifKb,
                targetGifKb: config.targetGifKb,
                standardRetriesEnabled: config.standardRetriesEnabled,
                retryAllowFpsDrop: config.retryAllowFpsDrop,
                retryAllowColorDrop: config.retryAllowColorDrop,
                lossyOversize: config.lossyOversize,
                lossyLevel: config.lossyLevel,
                lossyMaxAttempts: config.lossyMaxAttempts,
                partIndex: index,
                parts,
                partWidth,
              },
              {
                onProgress: workerProgress(index),
                timeoutMs: 6 * 60_000,
              },
            ),
          ),
        )

  const sorted = resultData
    .map(toArtifact)
    .sort((a, b) => a.name.localeCompare(b.name))

  const patched = await applyPostPatches(sorted, config)

  const oversize = patched.filter((artifact) => artifact.sizeKb > config.maxGifKb)
  if (oversize.length > 0) {
    const first = oversize[0]
    throw new Error(`Output exceeded max limit: ${first.name} is ${first.sizeKb.toFixed(1)}KB.`)
  }

  emit('done', 'Conversion completed successfully.')

  return {
    probe,
    artifacts: patched,
    logs,
    warnings,
  }
}
