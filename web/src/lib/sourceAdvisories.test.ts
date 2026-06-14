import { describe, expect, it } from 'vitest'
import { getDefaultConfig } from './defaults'
import {
  LONG_MP4_MIN_BYTES,
  shouldShowLongMp4Memo,
  shouldShowWorkshopMemoryMemo,
  type SourceMediaMetadata,
} from './sourceAdvisories'

function metadata(overrides: Partial<SourceMediaMetadata> = {}): SourceMediaMetadata {
  return {
    durationSec: 21,
    sizeBytes: LONG_MP4_MIN_BYTES,
    mimeType: 'video/mp4',
    name: 'clip.mp4',
    ...overrides,
  }
}

describe('source advisories', () => {
  it('shows the long MP4 memo for files above duration and size thresholds', () => {
    expect(shouldShowLongMp4Memo(metadata())).toBe(true)
  })

  it('hides the long MP4 memo at or below thresholds', () => {
    expect(shouldShowLongMp4Memo(metadata({ durationSec: 20 }))).toBe(false)
    expect(shouldShowLongMp4Memo(metadata({ sizeBytes: LONG_MP4_MIN_BYTES - 1 }))).toBe(false)
  })

  it('hides the long MP4 memo for non-MP4 video and unreadable duration', () => {
    expect(shouldShowLongMp4Memo(metadata({ name: 'clip.webm', mimeType: 'video/webm' }))).toBe(false)
    expect(shouldShowLongMp4Memo(metadata({ durationSec: null }))).toBe(false)
  })

  it('shows the RAM memo for Workshop with 3 rows', () => {
    expect(shouldShowWorkshopMemoryMemo(getDefaultConfig('workshop'))).toBe(true)
    expect(shouldShowWorkshopMemoryMemo({ ...getDefaultConfig('workshop'), workshopRows: 2 })).toBe(false)
    expect(shouldShowWorkshopMemoryMemo(getDefaultConfig('featured'))).toBe(false)
  })
})
