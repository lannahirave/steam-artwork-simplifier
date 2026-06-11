import type { OptimizationMode } from './types'
import { MAX_GIFSKI_QUALITY, clampGifskiQuality } from './gifskiQuality'

export interface StandardCandidate {
  fps: number
  quality: number
}

export type EncodeCandidatePhase = 'fast-fit' | 'quality-recovery' | 'quality-first' | 'lossy'

export interface EncodeCandidate {
  phase: EncodeCandidatePhase
  fps: number
  quality: number
  reason: string
}

export interface LossyCandidate {
  fps: number
  quality: number
  dither: string
  statsMode: 'single' | 'diff'
  prefilter: string
}

export interface LossyCandidateOptions {
  allowFpsDrop?: boolean
}

const STANDARD_QUALITIES = [92, 84, 76, 68, 58, 48, 40, 32, 24, 16, 12] as const
const RECOVERY_QUALITIES = [100, 92, 84, 76, 68, 58, 48, 40, 32, 24, 16, 12] as const
export const RECOVERY_UNDER_TARGET_RATIO = 0.9
export const HEAVY_PART_RATIO = 1.1

export interface SizeBoundItem {
  sizeKb: number
}

export interface StandardCandidateOptions {
  allowFpsDrop?: boolean
  allowQualityDrop?: boolean
}

export function estimateFpsForKbTarget(
  currentFps: number,
  currentSizeKb: number,
  targetSizeKb: number,
  minGifFps: number,
): number {
  const minFps = Math.max(1, minGifFps)
  if (!Number.isFinite(currentFps) || currentFps <= 0) {
    return minFps
  }
  if (!Number.isFinite(currentSizeKb) || currentSizeKb <= 0) {
    return Math.max(minFps, Math.floor(currentFps))
  }
  if (!Number.isFinite(targetSizeKb) || targetSizeKb <= 0) {
    return minFps
  }

  const scaled = Math.floor((currentFps * targetSizeKb) / currentSizeKb)
  return Math.max(minFps, Math.min(Math.floor(currentFps), scaled))
}

export function buildStandardCandidates(
  baseFps: number,
  minGifFps: number,
  options: StandardCandidateOptions = {},
): StandardCandidate[] {
  const allowFpsDrop = options.allowFpsDrop ?? true
  const allowQualityDrop = options.allowQualityDrop ?? true

  if (!allowFpsDrop && !allowQualityDrop) {
    return []
  }

  const fpsFloor = Math.max(1, minGifFps)
  const reducedFpsCandidates: number[] = []
  if (allowFpsDrop) {
    for (let fps = baseFps - 1; fps >= fpsFloor; fps -= 1) {
      reducedFpsCandidates.push(fps)
    }
  }

  const unique = new Set<string>()
  const out: StandardCandidate[] = []
  const pushCandidate = (fps: number, quality: number): void => {
    const clampedQuality = clampGifskiQuality(quality)
    if (fps === baseFps && clampedQuality === MAX_GIFSKI_QUALITY) {
      // Initial encode already uses this combination.
      return
    }
    const key = `${fps}:${clampedQuality}`
    if (unique.has(key)) {
      return
    }
    unique.add(key)
    out.push({ fps, quality: clampedQuality })
  }

  // Prefer FPS-only reduction before touching encode quality.
  for (const fps of reducedFpsCandidates) {
    pushCandidate(fps, MAX_GIFSKI_QUALITY)
  }

  if (allowQualityDrop) {
    for (const quality of STANDARD_QUALITIES) {
      pushCandidate(baseFps, quality)
    }
  }

  if (allowFpsDrop && allowQualityDrop) {
    for (const fps of reducedFpsCandidates) {
      for (const quality of STANDARD_QUALITIES) {
        pushCandidate(fps, quality)
      }
    }
  }

  return out
}

function toEncodeCandidate(candidate: StandardCandidate, phase: EncodeCandidatePhase, reason: string): EncodeCandidate {
  return {
    phase,
    fps: candidate.fps,
    quality: candidate.quality,
    reason,
  }
}

function pushUniqueCandidate(candidates: EncodeCandidate[], seen: Set<string>, candidate: EncodeCandidate): void {
  const key = `${candidate.fps}:${candidate.quality}`
  if (seen.has(key)) {
    return
  }
  seen.add(key)
  candidates.push(candidate)
}

function estimateFastFitCandidate(input: {
  currentFps: number
  currentSizeKb: number
  maxGifKb: number
  minGifFps: number
  allowFpsDrop: boolean
  allowQualityDrop: boolean
}): StandardCandidate | null {
  if (input.allowFpsDrop) {
    const estimatedFps = estimateFpsForKbTarget(
      input.currentFps,
      input.currentSizeKb,
      input.maxGifKb,
      input.minGifFps,
    )
    if (estimatedFps < input.currentFps) {
      return { fps: estimatedFps, quality: MAX_GIFSKI_QUALITY }
    }
  }

  if (!input.allowQualityDrop) {
    return null
  }

  const ratio = input.maxGifKb / input.currentSizeKb
  const estimatedQuality = Math.max(12, Math.min(92, Math.floor(MAX_GIFSKI_QUALITY * ratio)))
  const qualityCandidate = STANDARD_QUALITIES.find((quality) => quality <= estimatedQuality) ?? STANDARD_QUALITIES[STANDARD_QUALITIES.length - 1]
  return {
    fps: input.currentFps,
    quality: qualityCandidate,
  }
}

export function buildOptimizationCandidates(input: {
  mode: OptimizationMode
  currentFps: number
  currentSizeKb: number
  targetGifKb: number
  maxGifKb: number
  minGifFps: number
  allowFpsDrop: boolean
  allowQualityDrop: boolean
  standardRetriesEnabled: boolean
}): EncodeCandidate[] {
  if (!input.standardRetriesEnabled && input.mode === 'quality-first') {
    return []
  }

  const candidates: EncodeCandidate[] = []
  const seen = new Set<string>()
  const includeFastFit = input.mode === 'hybrid' || input.mode === 'fast-fit'
  if (includeFastFit) {
    const fastFit = estimateFastFitCandidate(input)
    if (fastFit) {
      pushUniqueCandidate(
        candidates,
        seen,
        toEncodeCandidate(fastFit, 'fast-fit', `Estimated from current size ${input.currentSizeKb.toFixed(1)}KB toward max ${input.maxGifKb}KB.`),
      )
    }
  }

  if (input.mode !== 'fast-fit' && input.standardRetriesEnabled) {
    for (const candidate of buildStandardCandidates(input.currentFps, input.minGifFps, {
      allowFpsDrop: input.allowFpsDrop,
      allowQualityDrop: input.allowQualityDrop,
    })) {
      pushUniqueCandidate(
        candidates,
        seen,
        toEncodeCandidate(candidate, 'quality-first', 'Ordered standard retry candidate.'),
      )
    }
  }

  return candidates
}

export function shouldTryQualityRecovery(sizeKb: number, targetGifKb: number): boolean {
  return sizeKb < targetGifKb * RECOVERY_UNDER_TARGET_RATIO
}

export function allItemsFit(items: SizeBoundItem[], budgetKb: number): boolean {
  return items.every((item) => item.sizeKb <= budgetKb)
}

export function selectBatchRecoveryBudget(
  items: SizeBoundItem[],
  targetGifKb: number,
  maxGifKb: number,
): number | null {
  if (allItemsFit(items, targetGifKb)) {
    return targetGifKb
  }
  if (allItemsFit(items, maxGifKb)) {
    return maxGifKb
  }
  return null
}

export function buildSharedFpsRecoveryCandidates(currentFps: number, maxFps: number): number[] {
  const start = Math.max(1, Math.floor(currentFps) + 1)
  const end = Math.max(start - 1, Math.floor(maxFps))
  const out: number[] = []
  for (let fps = start; fps <= end; fps += 1) {
    out.push(fps)
  }
  return out
}

export function buildQualityRecoveryCandidates(input: {
  fps: number
  quality: number
  allowQualityDrop: boolean
}): EncodeCandidate[] {
  if (!input.allowQualityDrop) {
    return []
  }
  return RECOVERY_QUALITIES
    .filter((quality) => quality > input.quality)
    .sort((a, b) => a - b)
    .map((quality) => ({
      phase: 'quality-recovery',
      fps: input.fps,
      quality,
      reason: 'Recovering quality while preserving output timing.',
    }))
}

export interface SplitPartSize {
  index: number
  name: string
  sizeKb: number
}

export interface SplitPartWeight extends SplitPartSize {
  averageSizeKb: number
  heavy: boolean
}

export function analyzeSplitPartWeights(parts: SplitPartSize[]): SplitPartWeight[] {
  if (parts.length === 0) {
    return []
  }
  const averageSizeKb = parts.reduce((sum, part) => sum + part.sizeKb, 0) / parts.length
  return parts.map((part) => ({
    ...part,
    averageSizeKb,
    heavy: part.sizeKb > averageSizeKb * HEAVY_PART_RATIO,
  }))
}

export function orderSplitPartIndicesByWeight(parts: SplitPartWeight[]): number[] {
  return [...parts]
    .sort((a, b) => b.sizeKb - a.sizeKb)
    .map((part) => part.index)
}

export function buildLossyCandidates(
  baseFps: number,
  minGifFps: number,
  lossyLevel: number,
  maxAttempts: number,
  options: LossyCandidateOptions = {},
): LossyCandidate[] {
  const fpsFloor = Math.max(1, minGifFps)
  const allowFpsDrop = options.allowFpsDrop ?? true
  const fpsCandidates: number[] = []
  if (allowFpsDrop) {
    for (let fps = baseFps; fps >= fpsFloor; fps -= 1) {
      fpsCandidates.push(fps)
    }
  } else {
    fpsCandidates.push(baseFps)
  }
  if (fpsCandidates.length === 0) {
    fpsCandidates.push(baseFps)
  }

  const level = Math.min(3, Math.max(1, lossyLevel))

  const qualityCandidates =
    level === 1 ? [48, 40, 32, 24] : level === 2 ? [48, 40, 32, 24, 16] : [48, 40, 32, 24, 16, 12]
  const ditherCandidates =
    level === 1
      ? ['bayer:bayer_scale=5', 'none']
      : ['bayer:bayer_scale=5', 'bayer:bayer_scale=3', 'none']
  const statsModes: Array<'single' | 'diff'> = level === 1 ? ['single'] : ['single', 'diff']
  const prefilters = level === 3 ? ['', 'gblur=sigma=0.3', 'gblur=sigma=0.6'] : level === 2 ? ['', 'gblur=sigma=0.3'] : ['']

  const out: LossyCandidate[] = []
  const unique = new Set<string>()

  for (const fps of fpsCandidates) {
    for (const prefilter of prefilters) {
      for (const statsMode of statsModes) {
        for (const dither of ditherCandidates) {
          for (const quality of qualityCandidates) {
            const key = `${fps}:${quality}:${dither}:${statsMode}:${prefilter}`
            if (unique.has(key)) {
              continue
            }
            unique.add(key)
            out.push({
              fps,
              quality,
              dither,
              statsMode,
              prefilter,
            })
            if (out.length >= maxAttempts) {
              return out
            }
          }
        }
      }
    }
  }

  return out
}
