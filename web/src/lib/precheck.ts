import { computeTargetHeight } from './defaults'

export interface PrecheckInput {
  srcWidth: number
  srcHeight: number
  duration: number
  parts: number
  partWidth: number
  totalTargetWidth?: number
  sampleGifWidth?: number
  minGifFps: number
  maxGifKb: number
  precheckBppf: number
  precheckMarginPct: number
}

export interface PrecheckResult {
  estimatedKb: number
  allowedKb: number
  sourceTargetHeight: number
  shouldBlock: boolean
  message: string
}

export function estimateGifKb(
  width: number,
  height: number,
  fps: number,
  duration: number,
  bppf: number,
): number {
  const pixelFrames = width * height * fps * duration
  return (pixelFrames * bppf) / 1024
}

export function estimateFpsForTargetKb(
  width: number,
  height: number,
  duration: number,
  targetKb: number,
  bppf: number,
): number {
  const denominator = width * height * duration * bppf
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return 1
  }
  const raw = (targetKb * 1024) / denominator
  if (!Number.isFinite(raw) || raw <= 0) {
    return 1
  }
  return Math.max(1, Math.floor(raw))
}

export function runPrecheck(input: PrecheckInput): PrecheckResult {
  const totalTargetWidth = input.totalTargetWidth ?? input.parts * input.partWidth
  const sampleGifWidth = input.sampleGifWidth ?? input.partWidth
  const targetHeight = computeTargetHeight(input.srcWidth, input.srcHeight, totalTargetWidth)
  const estimatedKb = estimateGifKb(
    sampleGifWidth,
    targetHeight,
    input.minGifFps,
    input.duration,
    input.precheckBppf,
  )
  const allowedKb = input.maxGifKb * (1 + input.precheckMarginPct / 100)
  const shouldBlock = estimatedKb > allowedKb
  const message =
    `Precheck estimate: ${estimatedKb.toFixed(1)}KB per GIF at ${input.minGifFps}fps ` +
    `(allow ${allowedKb.toFixed(1)}KB with margin).`

  return {
    estimatedKb,
    allowedKb,
    sourceTargetHeight: targetHeight,
    shouldBlock,
    message,
  }
}
