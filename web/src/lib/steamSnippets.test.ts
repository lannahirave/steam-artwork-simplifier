import { describe, expect, it } from 'vitest'
import {
  SINGLE_SNIPPETS,
  buildBatchSnippet,
  defaultBatchSettings,
  parseAppId,
  parseDelaySeconds,
  type SteamUploadType,
} from './steamSnippets'

const labels = {
  choose: 'Choose "GIFs" ’n stuff',
  progress: 'Uploading %n of %total',
  done: 'Done: %ok / %failed',
  wrongPage: 'Wrong page',
}

const types: SteamUploadType[] = ['workshop', 'featured', 'screenshot']

describe('steam snippets', () => {
  it.each(types)('%s batch script is valid JavaScript', (type) => {
    const script = buildBatchSnippet(type, defaultBatchSettings(type), labels)
    expect(() => new Function(script)).not.toThrow()
    expect(script).toContain(JSON.stringify(labels))
    expect(script).toContain('const TITLE = "\\u200E ";')
  })

  it.each(types)('%s single script is valid JavaScript', (type) => {
    expect(() => new Function(SINGLE_SNIPPETS[type])).not.toThrow()
  })

  it('uses reasonable defaults', () => {
    expect(defaultBatchSettings('workshop')).toEqual({ appId: 480, visibility: 0, delayMs: 3000 })
    expect(defaultBatchSettings('featured').appId).toBe(767)
    expect(defaultBatchSettings('screenshot').appId).toBe(767)
  })

  it('applies the field overrides for each upload type', () => {
    const build = (type: SteamUploadType) => buildBatchSnippet(type, defaultBatchSettings(type), labels)
    expect(build('workshop')).toContain('{ consumer_app_id: 480, file_type: 0 }')
    expect(build('featured')).toContain('{ consumer_app_id: 767, image_width: 1000, image_height: 1 }')
    expect(build('screenshot')).toContain(
      '{ consumer_app_id: 767, image_width: 1000, image_height: 1, file_type: 5 }',
    )
  })

  it('writes the chosen app ID, visibility and delay into the script', () => {
    const script = buildBatchSnippet('workshop', { appId: 1234, visibility: 2, delayMs: 7500 }, labels)
    expect(script).toContain('consumer_app_id: 1234')
    expect(script).toContain('const VISIBILITY = 2;')
    expect(script).toContain('const DELAY_MS = 7500;')
    expect(() => new Function(script)).not.toThrow()
  })

  it('applies overrides after measured dimensions and before the fixed fields', () => {
    const script = buildBatchSnippet('featured', defaultBatchSettings('featured'), labels)
    const measured = script.indexOf('image_width: width')
    const overrides = script.indexOf('}, OVERRIDES, {')
    const title = script.indexOf('title: TITLE')
    expect(measured).toBeGreaterThan(-1)
    expect(overrides).toBeGreaterThan(measured)
    expect(title).toBeGreaterThan(overrides)
  })

  it('accepts only whole positive app IDs', () => {
    expect(parseAppId('480')).toBe(480)
    expect(parseAppId(' 767 ')).toBe(767)
    expect(parseAppId('0')).toBeNull()
    expect(parseAppId('48a')).toBeNull()
    expect(parseAppId('4.5')).toBeNull()
    expect(parseAppId('')).toBeNull()
    expect(parseAppId('99999999999')).toBeNull()
  })

  it('accepts delays from 1 to 60 seconds', () => {
    expect(parseDelaySeconds('3')).toBe(3)
    expect(parseDelaySeconds('2.5')).toBe(2.5)
    expect(parseDelaySeconds('2,5')).toBe(2.5)
    expect(parseDelaySeconds('1')).toBe(1)
    expect(parseDelaySeconds('60')).toBe(60)
    expect(parseDelaySeconds('0.5')).toBeNull()
    expect(parseDelaySeconds('61')).toBeNull()
    expect(parseDelaySeconds('abc')).toBeNull()
    expect(parseDelaySeconds('')).toBeNull()
  })
})
