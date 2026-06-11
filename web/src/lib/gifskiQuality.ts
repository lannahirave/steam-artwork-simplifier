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
