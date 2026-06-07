import type { OptimizationMode } from './types'

export interface StandardCandidate {
  fps: number
  colors: number
}

export type EncodeCandidatePhase = 'fast-fit' | 'quality-recovery' | 'quality-first' | 'lossy'

export interface EncodeCandidate {
  phase: EncodeCandidatePhase
  fps: number
  colors: number
  reason: string
}

export interface LossyCandidate {
  fps: number
  colors: number
  dither: string
  statsMode: 'single' | 'diff'
  prefilter: string
}

export interface LossyCandidateOptions {
  allowFpsDrop?: boolean
}

const STANDARD_COLORS = [224, 192, 160, 128, 96, 64, 48, 32] as const
const RECOVERY_COLORS = [256, 224, 192, 160, 128, 96, 64, 48, 32, 24, 16, 12] as const
export const RECOVERY_UNDER_TARGET_RATIO = 0.9
export const HEAVY_PART_RATIO = 1.1

export interface StandardCandidateOptions {
  allowFpsDrop?: boolean
  allowColorDrop?: boolean
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
  const allowColorDrop = options.allowColorDrop ?? true

  if (!allowFpsDrop && !allowColorDrop) {
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
  const pushCandidate = (fps: number, colors: number): void => {
    if (fps === baseFps && colors === 256) {
      // Initial encode already uses this combination.
      return
    }
    const key = `${fps}:${colors}`
    if (unique.has(key)) {
      return
    }
    unique.add(key)
    out.push({ fps, colors })
  }

  // Prefer FPS-only reduction before touching palette colors.
  for (const fps of reducedFpsCandidates) {
    pushCandidate(fps, 256)
  }

  if (allowColorDrop) {
    for (const colors of STANDARD_COLORS) {
      pushCandidate(baseFps, colors)
    }
  }

  if (allowFpsDrop && allowColorDrop) {
    for (const fps of reducedFpsCandidates) {
      for (const colors of STANDARD_COLORS) {
        pushCandidate(fps, colors)
      }
    }
  }

  return out
}

function toEncodeCandidate(candidate: StandardCandidate, phase: EncodeCandidatePhase, reason: string): EncodeCandidate {
  return {
    phase,
    fps: candidate.fps,
    colors: candidate.colors,
    reason,
  }
}

function pushUniqueCandidate(candidates: EncodeCandidate[], seen: Set<string>, candidate: EncodeCandidate): void {
  const key = `${candidate.fps}:${candidate.colors}`
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
  allowColorDrop: boolean
}): StandardCandidate | null {
  if (input.allowFpsDrop) {
    const estimatedFps = estimateFpsForKbTarget(
      input.currentFps,
      input.currentSizeKb,
      input.maxGifKb,
      input.minGifFps,
    )
    if (estimatedFps < input.currentFps) {
      return { fps: estimatedFps, colors: 256 }
    }
  }

  if (!input.allowColorDrop) {
    return null
  }

  const ratio = input.maxGifKb / input.currentSizeKb
  const estimatedColors = Math.max(32, Math.min(224, Math.floor(256 * ratio)))
  const colorCandidate = STANDARD_COLORS.find((colors) => colors <= estimatedColors) ?? STANDARD_COLORS[STANDARD_COLORS.length - 1]
  return {
    fps: input.currentFps,
    colors: colorCandidate,
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
  allowColorDrop: boolean
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
      allowColorDrop: input.allowColorDrop,
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

export function buildQualityRecoveryCandidates(input: {
  fps: number
  colors: number
  allowColorDrop: boolean
}): EncodeCandidate[] {
  if (!input.allowColorDrop) {
    return []
  }
  return RECOVERY_COLORS
    .filter((colors) => colors > input.colors)
    .sort((a, b) => a - b)
    .map((colors) => ({
      phase: 'quality-recovery',
      fps: input.fps,
      colors,
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

  const colorsCandidates =
    level === 1 ? [64, 48, 32, 24] : level === 2 ? [64, 48, 32, 24, 16] : [64, 48, 32, 24, 16, 12]
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
          for (const colors of colorsCandidates) {
            const key = `${fps}:${colors}:${dither}:${statsMode}:${prefilter}`
            if (unique.has(key)) {
              continue
            }
            unique.add(key)
            out.push({
              fps,
              colors,
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
