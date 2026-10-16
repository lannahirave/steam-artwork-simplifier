import type { ShadowDarkening } from './types'

export const SHADOW_DARKENING_LEVELS = ['off', 'low', 'medium', 'high'] as const satisfies readonly ShadowDarkening[]

/** Input black point per level: everything at or below this brightness becomes pure black. */
export const SHADOW_BLACK_POINTS: Record<ShadowDarkening, number> = {
  off: 0,
  low: 0.04,
  medium: 0.08,
  high: 0.12,
}

/**
 * ffmpeg filter that raises the input black point and stretches the rest back to full range.
 * Near-black noise collapses to pure black, so gifski stops spending palette entries and
 * dithering on shadows. Returns null when darkening is off.
 */
export function buildShadowDarkeningFilter(level: ShadowDarkening | undefined): string | null {
  const blackPoint = SHADOW_BLACK_POINTS[level ?? 'off'] ?? 0
  if (blackPoint <= 0) {
    return null
  }
  return `colorlevels=rimin=${blackPoint}:gimin=${blackPoint}:bimin=${blackPoint}`
}

/** Appends the shadow filter to an existing scale/crop chain. */
export function withShadowDarkening(baseFilter: string, level: ShadowDarkening | undefined): string {
  const filter = buildShadowDarkeningFilter(level)
  return filter ? `${baseFilter},${filter}` : baseFilter
}
