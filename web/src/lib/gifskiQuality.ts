export const MAX_GIFSKI_QUALITY = 100
export const MIN_GIFSKI_QUALITY = 1

export function clampGifskiQuality(quality: number): number {
  if (!Number.isFinite(quality)) {
    return MAX_GIFSKI_QUALITY
  }
  return Math.max(MIN_GIFSKI_QUALITY, Math.min(MAX_GIFSKI_QUALITY, Math.round(quality)))
}

export function getQualityReductionPercent(finalQuality: number): number {
  const clamped = clampGifskiQuality(finalQuality)
  return Math.max(0, Math.round((1 - clamped / MAX_GIFSKI_QUALITY) * 100))
}

export interface QualityBinarySearchState {
  low: number
  high: number
  bestQuality: number | null
}

export function createQualityBinarySearch(
  lowExclusive: number,
  highInclusive: number,
): QualityBinarySearchState {
  return {
    low: clampGifskiQuality(lowExclusive),
    high: clampGifskiQuality(highInclusive),
    bestQuality: null,
  }
}

export function nextQualityBinaryProbe(state: QualityBinarySearchState): number | null {
  if (state.high <= state.low) {
    return null
  }
  return Math.ceil((state.low + state.high) / 2)
}

export function recordQualityBinaryProbe(
  state: QualityBinarySearchState,
  quality: number,
  accepted: boolean,
): QualityBinarySearchState {
  const clampedQuality = clampGifskiQuality(quality)
  if (accepted) {
    return {
      low: Math.max(state.low, clampedQuality),
      high: state.high,
      bestQuality:
        state.bestQuality === null
          ? clampedQuality
          : Math.max(state.bestQuality, clampedQuality),
    }
  }

  return {
    low: state.low,
    high: Math.min(state.high, clampedQuality - 1),
    bestQuality: state.bestQuality,
  }
}
