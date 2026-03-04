import { patchGifHeaderBytes, patchLastByteBytes } from './patch'
import { DEFAULTS } from './defaults'
import { runPrecheck } from './precheck'
import { estimateFpsForKbTarget } from './sizeStrategy'
import { FFmpegWorkerPool } from './workerPool'
import type {
  ConvertPartPayload,
  ConversionArtifact,
  ConversionConfig,
  ConversionInput,
  ConversionResult,
  SourceProbe,
  WorkerArtifactData,
} from './types'
import { isLikelyImageSource } from './validation'

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
    finalFps: data.finalFps,
    finalColors: data.finalColors,
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
  const imageLikeSource = isLikelyImageSource(input.file)

  emit('probe', 'Probing source dimensions and duration.')
  const probe = await pool.runTask('probe', {
    fileName: input.file.name,
    fileBytes: sourceBytes.slice(),
  }, {
    timeoutMs: 45_000,
  })
  if (probe.startOffsetSec > 0) {
    emit('probe', `Detected dark intro; encoding starts at ${probe.startOffsetSec.toFixed(2)}s.`)
  }
  const isStillImage = imageLikeSource && probe.duration <= 0.001

  const isSingleOutputPreset = config.preset === 'featured' || config.preset === 'guide'
  const isSplitPreset = config.preset === 'workshop' || config.preset === 'showcase'
  const splitWidths = config.preset === 'showcase' ? [...DEFAULTS.showcase.splitWidths] : undefined
  const guideSize = DEFAULTS.guide.size
  const parts = isSingleOutputPreset
    ? 1
    : config.preset === 'showcase'
      ? DEFAULTS.showcase.splitWidths.length
      : config.parts
  const partWidth =
    config.preset === 'featured'
      ? config.featuredWidth
      : config.preset === 'guide'
        ? guideSize
        : config.preset === 'showcase'
          ? DEFAULTS.showcase.splitWidths[0]
          : config.partWidth
  const totalTargetWidth = splitWidths
    ? splitWidths.reduce((sum, width) => sum + width, 0)
    : parts * partWidth
  const sampleGifWidth = splitWidths ? Math.max(...splitWidths) : partWidth

  if (config.disableOptimizations) {
    const message =
      'Optimizations disabled: max-size checks and retry ladders are bypassed (raw encode mode).'
    warnings.push(message)
    emit('precheck', message)
  } else if (config.precheckEnabled) {
    const precheck = runPrecheck({
      srcWidth: probe.width,
      srcHeight: probe.height,
      duration: probe.duration,
      parts,
      partWidth,
      totalTargetWidth,
      sampleGifWidth,
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

  const buildPartPayload = (
    partIndex: number,
    overrides: Partial<
      Pick<
        ConvertPartPayload,
        | 'gifFps'
        | 'minGifFps'
        | 'retryAllowFpsDrop'
        | 'disableOptimizations'
        | 'standardRetriesEnabled'
        | 'retryAllowColorDrop'
        | 'lossyOversize'
        | 'lossyMaxAttempts'
        | 'maxGifKb'
        | 'targetGifKb'
      >
    > = {},
  ): ConvertPartPayload => ({
    fileName: input.file.name,
    fileBytes: sourceBytes.slice(),
    isStillImage,
    srcWidth: probe.width,
    srcHeight: probe.height,
    duration: probe.duration,
    gifFps: overrides.gifFps ?? config.gifFps,
    minGifFps: overrides.minGifFps ?? config.minGifFps,
    disableOptimizations: overrides.disableOptimizations ?? config.disableOptimizations,
    maxGifKb: overrides.maxGifKb ?? config.maxGifKb,
    targetGifKb: overrides.targetGifKb ?? config.targetGifKb,
    standardRetriesEnabled: overrides.standardRetriesEnabled ?? config.standardRetriesEnabled,
    retryAllowFpsDrop: overrides.retryAllowFpsDrop ?? config.retryAllowFpsDrop,
    retryAllowColorDrop: overrides.retryAllowColorDrop ?? config.retryAllowColorDrop,
    lossyOversize: overrides.lossyOversize ?? config.lossyOversize,
    lossyLevel: config.lossyLevel,
    lossyMaxAttempts: overrides.lossyMaxAttempts ?? config.lossyMaxAttempts,
    startOffsetSec: probe.startOffsetSec,
    partIndex,
    parts,
    partWidth,
    splitWidths,
  })

  const runSplitBatch = async (
    batchGifFps: number,
    batchRetryAllowFpsDrop: boolean,
    label: string,
    batchOverrides: Partial<
      Pick<
        ConvertPartPayload,
        | 'disableOptimizations'
        | 'standardRetriesEnabled'
        | 'retryAllowColorDrop'
        | 'lossyOversize'
        | 'lossyMaxAttempts'
        | 'maxGifKb'
        | 'targetGifKb'
      >
    > = {},
  ): Promise<WorkerArtifactData[]> => {
    emit('convert', label)
    const batchMinFps = Math.min(config.minGifFps, Math.max(1, Math.floor(batchGifFps)))
    return Promise.all(
      Array.from({ length: parts }, (_, index) =>
        pool.runTask(
          'convertPart',
          buildPartPayload(index, {
            gifFps: batchGifFps,
            minGifFps: batchMinFps,
            retryAllowFpsDrop: batchRetryAllowFpsDrop,
            ...batchOverrides,
          }),
          {
            onProgress: workerProgress(index),
            timeoutMs: 6 * 60_000,
          },
        ),
      ),
    )
  }

  let resultData: WorkerArtifactData[]
  if (config.preset === 'featured') {
    resultData = [
      await pool.runTask(
        'convertFeatured',
        {
          fileName: input.file.name,
          fileBytes: sourceBytes.slice(),
          isStillImage,
          srcWidth: probe.width,
          srcHeight: probe.height,
          duration: probe.duration,
          gifFps: config.gifFps,
          minGifFps: config.minGifFps,
          disableOptimizations: config.disableOptimizations,
          maxGifKb: config.maxGifKb,
          targetGifKb: config.targetGifKb,
          standardRetriesEnabled: config.standardRetriesEnabled,
          retryAllowFpsDrop: config.retryAllowFpsDrop,
          retryAllowColorDrop: config.retryAllowColorDrop,
          lossyOversize: config.lossyOversize,
          lossyLevel: config.lossyLevel,
          lossyMaxAttempts: config.lossyMaxAttempts,
          startOffsetSec: probe.startOffsetSec,
          featuredWidth: config.featuredWidth,
        },
        {
          onProgress: workerProgress(0),
          timeoutMs: 6 * 60_000,
        },
      ),
    ]
  } else if (config.preset === 'guide') {
    resultData = [
      await pool.runTask(
        'convertGuide',
        {
          fileName: input.file.name,
          fileBytes: sourceBytes.slice(),
          isStillImage,
          srcWidth: probe.width,
          srcHeight: probe.height,
          duration: probe.duration,
          gifFps: config.gifFps,
          minGifFps: config.minGifFps,
          disableOptimizations: config.disableOptimizations,
          maxGifKb: config.maxGifKb,
          targetGifKb: config.targetGifKb,
          standardRetriesEnabled: config.standardRetriesEnabled,
          retryAllowFpsDrop: config.retryAllowFpsDrop,
          retryAllowColorDrop: config.retryAllowColorDrop,
          lossyOversize: config.lossyOversize,
          lossyLevel: config.lossyLevel,
          lossyMaxAttempts: config.lossyMaxAttempts,
          startOffsetSec: probe.startOffsetSec,
          guideSize,
        },
        {
          onProgress: workerProgress(0),
          timeoutMs: 6 * 60_000,
        },
      ),
    ]
  } else {
    if (!isSplitPreset) {
      throw new Error(`Unsupported split preset: ${config.preset}`)
    }
    const splitPresetLabel = config.preset === 'showcase' ? 'Showcase' : 'Workshop'
    const canRunSharedFpsPass =
      config.retryAllowFpsDrop &&
      !config.disableOptimizations &&
      !isStillImage

    if (!canRunSharedFpsPass) {
      const firstPass = await runSplitBatch(
        config.gifFps,
        config.retryAllowFpsDrop,
        `${splitPresetLabel} single pass: running full conversion at fps=${config.gifFps}.`,
      )
      if (!config.retryAllowFpsDrop) {
        emit('convert', `${splitPresetLabel} shared-FPS adjustment skipped: FPS reduction is disabled.`)
      }
      resultData = firstPass
    } else {
      const sizingPass = await runSplitBatch(
        config.gifFps,
        false,
        `${splitPresetLabel} pass 1/2: sizing run at fps=${config.gifFps} (no retries).`,
        {
          disableOptimizations: true,
          standardRetriesEnabled: false,
          retryAllowColorDrop: false,
          lossyOversize: false,
          lossyMaxAttempts: 1,
          maxGifKb: Number.MAX_SAFE_INTEGER,
          targetGifKb: Number.MAX_SAFE_INTEGER,
        },
      )
      const largest = sizingPass.reduce((current, item) => (item.sizeKb > current.sizeKb ? item : current))
      const fpsTargetKb = config.standardRetriesEnabled
        ? (largest.sizeKb > config.maxGifKb ? config.maxGifKb : config.targetGifKb)
        : config.maxGifKb
      const sharedFps = estimateFpsForKbTarget(
        config.gifFps,
        largest.sizeKb,
        fpsTargetKb,
        config.minGifFps,
      )

      if (
        sharedFps >= config.gifFps &&
        !config.standardRetriesEnabled &&
        largest.sizeKb <= config.maxGifKb
      ) {
        emit(
          'convert',
          `${splitPresetLabel} pass 1 satisfied max-size limits without FPS drop; largest ${largest.name} is ${largest.sizeKb.toFixed(1)}KB.`,
        )
        resultData = sizingPass
      } else {
        const finalFps =
          sharedFps < config.gifFps && largest.sizeKb > fpsTargetKb
            ? sharedFps
            : config.gifFps
        if (finalFps < config.gifFps) {
          emit(
            'convert',
            `${splitPresetLabel} largest slice ${largest.name} is ${largest.sizeKb.toFixed(1)}KB; re-encoding all parts at shared fps=${finalFps}.`,
          )
        } else {
          emit(
            'convert',
            `${splitPresetLabel} pass 1 shows no required shared FPS drop; running final full pass at fps=${finalFps}.`,
          )
        }
        emit(
          'convert',
          `${splitPresetLabel} pass 2/2: enforcing shared fps=${finalFps} for all ${parts} parts.`,
        )
        resultData = await runSplitBatch(
          finalFps,
          false,
          `${splitPresetLabel} pass 2/2: final conversion at shared fps=${finalFps}.`,
        )
      }
    }
  }

  const sorted = resultData
    .map(toArtifact)
    .sort((a, b) => a.name.localeCompare(b.name))

  const patched = await applyPostPatches(sorted, config)

  if (!config.disableOptimizations) {
    const oversize = patched.filter((artifact) => artifact.sizeKb > config.maxGifKb)
    if (oversize.length > 0) {
      const details = oversize
        .map((artifact) => `${artifact.name} (${artifact.sizeKb.toFixed(1)}KB)`)
        .join(', ')
      const message =
        `Some outputs still exceed max size (${config.maxGifKb}KB): ${details}. ` +
        'Keeping outputs so you can preview/download anyway.'
      warnings.push(message)
      emit('warn', message)
    }
  }

  emit('done', 'Conversion completed successfully.')

  return {
    probe,
    artifacts: patched,
    logs,
    warnings,
  }
}
