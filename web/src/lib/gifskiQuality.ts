const GIFSKI_QUALITY_BY_COLORS = new Map<number, number>([
  [256, 100],
  [224, 92],
  [192, 84],
  [160, 76],
  [128, 68],
  [96, 58],
  [64, 48],
  [48, 40],
  [32, 32],
  [24, 24],
  [16, 16],
  [12, 12],
])

export function mapColorsToGifskiQuality(maxColors: number): number {
  const normalized = Math.max(12, Math.min(256, Math.round(maxColors)))
  const direct = GIFSKI_QUALITY_BY_COLORS.get(normalized)
  if (direct !== undefined) {
    return direct
  }
  const scaled = Math.round((normalized / 256) * 100)
  return Math.max(1, Math.min(100, scaled))
}

export function mapRetryCandidateToGifskiQuality(candidate: { colors: number }): number {
  return mapColorsToGifskiQuality(candidate.colors)
}

export { GIFSKI_QUALITY_BY_COLORS }
