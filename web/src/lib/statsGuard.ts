// Shared guard logic for the site stats endpoint (/api/track).
// Pure string/number helpers only, so the Netlify Functions runtime and the
// browser tsconfig can both consume it and the logic stays unit-testable.

export interface SourceHeaders {
  origin?: string | null
  referer?: string | null
}

/** Normalize an origin-like string to lowercase `scheme://host[:port]`, or null when unusable. */
export function normalizeOrigin(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }
    return `${url.protocol}//${url.host}`.toLowerCase()
  } catch {
    return null
  }
}

/** Extract the origin of a Referer URL, or null when absent/invalid. */
export function refererOrigin(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }
  try {
    return new URL(value.trim()).origin.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Build the allowed-origin allowlist from Netlify system env vars plus an
 * optional explicit extension list (useful for custom domains). Empty when
 * nothing is configured, which makes the endpoint fail closed.
 */
export function resolveAllowedOrigins(env: {
  URL?: string | undefined
  DEPLOY_PRIME_URL?: string | undefined
  ALLOWED_ORIGINS?: string | undefined
}): string[] {
  const system = [normalizeOrigin(env.URL ?? null), normalizeOrigin(env.DEPLOY_PRIME_URL ?? null)]
  const explicit = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((entry) => normalizeOrigin(entry))
  return [...new Set([...system, ...explicit])].filter(
    (entry): entry is string => entry !== null,
  )
}

/**
 * Accept a beacon only when its Origin (or Referer fallback) matches the
 * allowlist. Cross-site pages and tools that send neither header are rejected.
 */
export function isAllowedSource(source: SourceHeaders, allowedOrigins: string[]): boolean {
  if (allowedOrigins.length === 0) {
    return false
  }
  const fromOrigin = normalizeOrigin(source.origin ?? null)
  if (fromOrigin) {
    return allowedOrigins.includes(fromOrigin)
  }
  const fromReferer = refererOrigin(source.referer ?? null)
  if (fromReferer) {
    return allowedOrigins.includes(fromReferer)
  }
  return false
}

/** Aggregate minute bucket, e.g. `2026-10-07T09:41`, used by the rate cap. */
export function minuteBucketKey(date: Date): string {
  return date.toISOString().slice(0, 16)
}

/** Aggregate day bucket, e.g. `2026-10-07`, used by the daily counter key. */
export function dayBucketKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Parse a positive integer from an env value, falling back when absent/invalid. */
export function parsePositiveInt(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
