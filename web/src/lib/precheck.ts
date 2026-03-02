import { computeTargetHeight } from './defaults'

export interface PrecheckInput {
  srcWidth: number
  srcHeight: number
  duration: number
  parts: number
  partWidth: number
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

export function runPrecheck(input: PrecheckInput): PrecheckResult {
  const totalTargetWidth = input.parts * input.partWidth
  const targetHeight = computeTargetHeight(input.srcWidth, input.srcHeight, totalTargetWidth)
  const estimatedKb = estimateGifKb(
    input.partWidth,
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
