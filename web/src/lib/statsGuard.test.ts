import { describe, expect, it } from 'vitest'
import {
  dayBucketKey,
  isAllowedSource,
  normalizeOrigin,
  parsePositiveInt,
  refererOrigin,
  resolveAllowedOrigins,
} from './statsGuard'

describe('normalizeOrigin', () => {
  it('normalizes scheme, host case, and trailing slash', () => {
    expect(normalizeOrigin('HTTPS://Artwork-Helper.netlify.app/')).toBe(
      'https://artwork-helper.netlify.app',
    )
  })

  it('accepts bare hosts by assuming https', () => {
    expect(normalizeOrigin('artwork-helper.netlify.app')).toBe('https://artwork-helper.netlify.app')
  })

  it('rejects unusable values', () => {
    expect(normalizeOrigin(null)).toBeNull()
    expect(normalizeOrigin('   ')).toBeNull()
    expect(normalizeOrigin('not a url')).toBeNull()
    expect(normalizeOrigin('javascript:alert(1)')).toBeNull()
  })
})

describe('refererOrigin', () => {
  it('extracts the origin from a referer URL', () => {
    expect(refererOrigin('https://artwork-helper.netlify.app/en?x=1')).toBe(
      'https://artwork-helper.netlify.app',
    )
  })

  it('returns null for absent or malformed referers', () => {
    expect(refererOrigin(null)).toBeNull()
    expect(refererOrigin('')).toBeNull()
    expect(refererOrigin('::bad')).toBeNull()
  })
})

describe('resolveAllowedOrigins', () => {
  it('normalizes entries and trims duplicates', () => {
    expect(
      resolveAllowedOrigins({
        ALLOWED_ORIGINS: 'https://artworkstudio.lannahirave.com,https://ArtworkStudio.lannahirave.com/',
      }),
    ).toEqual(['https://artworkstudio.lannahirave.com'])
  })

  it('accepts several origins and drops unusable entries', () => {
    expect(
      resolveAllowedOrigins({
        ALLOWED_ORIGINS: ' https://artworkstudio.lannahirave.com , http://localhost:8787 , bad value ',
      }),
    ).toEqual(['https://artworkstudio.lannahirave.com', 'http://localhost:8787'])
  })

  it('fails closed with no configuration', () => {
    expect(resolveAllowedOrigins({})).toEqual([])
  })
})

describe('isAllowedSource', () => {
  const allowed = ['https://artwork-helper.netlify.app']

  it('accepts a matching Origin header', () => {
    expect(isAllowedSource({ origin: 'https://artwork-helper.netlify.app' }, allowed)).toBe(true)
  })

  it('falls back to the Referer when Origin is missing', () => {
    expect(
      isAllowedSource({ referer: 'https://artwork-helper.netlify.app/en' }, allowed),
    ).toBe(true)
  })

  it('rejects cross-site origins and sandboxed null origins', () => {
    expect(isAllowedSource({ origin: 'https://evil.example' }, allowed)).toBe(false)
    expect(isAllowedSource({ origin: 'null' }, allowed)).toBe(false)
  })

  it('rejects requests with no origin hints', () => {
    expect(isAllowedSource({}, allowed)).toBe(false)
  })

  it('fails closed when the allowlist is empty', () => {
    expect(isAllowedSource({ origin: 'https://artwork-helper.netlify.app' }, [])).toBe(false)
  })
})

describe('bucket keys', () => {
  const date = new Date('2026-10-07T09:41:59.000Z')

  it('derives a day bucket for daily counters', () => {
    expect(dayBucketKey(date)).toBe('2026-10-07')
  })
})

describe('parsePositiveInt', () => {
  it('parses valid values', () => {
    expect(parsePositiveInt('120', 60)).toBe(120)
  })

  it('falls back on invalid values', () => {
    expect(parsePositiveInt(undefined, 60)).toBe(60)
    expect(parsePositiveInt('', 60)).toBe(60)
    expect(parsePositiveInt('-5', 60)).toBe(60)
    expect(parsePositiveInt('0', 60)).toBe(60)
    expect(parsePositiveInt('abc', 60)).toBe(60)
  })
})
