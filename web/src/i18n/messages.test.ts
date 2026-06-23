import { describe, expect, it } from 'vitest'
import {
  buildLocalePath,
  detectSystemLocale,
  getRouteLocale,
  normalizeLocale,
} from './messages'

function locationLike(pathname: string, search = '', hash = ''): Pick<Location, 'pathname' | 'search' | 'hash'> {
  return { pathname, search, hash }
}

describe('locale routing helpers', () => {
  it('normalizes supported browser language tags', () => {
    expect(normalizeLocale('uk-UA')).toBe('uk')
    expect(normalizeLocale('cs-CZ')).toBe('cs')
    expect(normalizeLocale('en-US')).toBe('en')
    expect(normalizeLocale('de-DE')).toBeNull()
  })

  it('detects the first supported system locale', () => {
    expect(detectSystemLocale(['de-DE', 'cs-CZ', 'uk-UA'])).toBe('cs')
    expect(detectSystemLocale(['de-DE'])).toBeNull()
  })

  it('reads exact supported locale prefixes from paths', () => {
    expect(getRouteLocale('/uk')).toBe('uk')
    expect(getRouteLocale('/uk/')).toBe('uk')
    expect(getRouteLocale('/uk/foo?x#y')).toBe('uk')
    expect(getRouteLocale('/uk-UA')).toBeNull()
    expect(getRouteLocale('/foo')).toBeNull()
  })

  it('builds locale paths while preserving suffix, search, and hash', () => {
    expect(buildLocalePath('cs', locationLike('/uk/foo', '?x=1', '#top'))).toBe('/cs/foo?x=1#top')
    expect(buildLocalePath('en', locationLike('/', '?noiso=1'))).toBe('/en?noiso=1')
    expect(buildLocalePath('uk', locationLike('/foo', '', '#a'))).toBe('/uk/foo#a')
  })
})
