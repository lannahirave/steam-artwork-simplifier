import { describe, expect, it } from 'vitest'
import type { ConversionArtifact } from './types'
import {
  buildHandoffRecord,
  canPreviewOnProfile,
  createHandoffId,
  handoffIdsToPrune,
  HANDOFF_TTL_MS,
  isHandoffExpired,
  isHandoffId,
  previewBlobOf,
  profilePreviewUrl,
  type ConversionLayout,
} from './profileHandoff'

function artifact(name: string, width = 150, extra: Partial<ConversionArtifact> = {}): ConversionArtifact {
  return {
    name,
    blob: new Blob(['patched'], { type: 'image/gif' }),
    sizeKb: 1,
    width,
    height: 300,
    status: 'original',
    finalFps: 20,
    finalQuality: 100,
    ...extra,
  }
}

function parts(count: number): ConversionArtifact[] {
  return Array.from({ length: count }, (_, index) => artifact(`part_${index}`))
}

const workshop = (rows: 1 | 2 | 3, workshopParts = 5): ConversionLayout => ({
  preset: 'workshop',
  workshopParts,
  workshopRows: rows,
})

const single = (preset: ConversionLayout['preset']): ConversionLayout => ({ preset, workshopParts: 5, workshopRows: 1 })

describe('canPreviewOnProfile', () => {
  it('accepts five Workshop parts per row', () => {
    expect(canPreviewOnProfile(workshop(1), parts(5))).toBe(true)
    expect(canPreviewOnProfile(workshop(3), parts(15))).toBe(true)
  })

  it('rejects Workshop layouts SteamCanvas cannot place', () => {
    expect(canPreviewOnProfile(workshop(1, 4), parts(4))).toBe(false)
    // A conversion finished early can leave fewer parts than the layout needs.
    expect(canPreviewOnProfile(workshop(2), parts(7))).toBe(false)
  })

  it('accepts two Artwork Showcase parts and one Featured image', () => {
    expect(canPreviewOnProfile(single('showcase'), [artifact('main', 506), artifact('side', 100)])).toBe(true)
    expect(canPreviewOnProfile(single('featured'), [artifact('featured', 630)])).toBe(true)
    expect(canPreviewOnProfile(single('featured'), parts(2))).toBe(false)
  })

  it('rejects guides, missing layouts and non-image outputs', () => {
    expect(canPreviewOnProfile(single('guide'), [artifact('guide', 195)])).toBe(false)
    expect(canPreviewOnProfile(null, [artifact('x')])).toBe(false)
    const notImage = artifact('x', 630, { blob: new Blob(['x'], { type: 'application/zip' }) })
    expect(canPreviewOnProfile(single('featured'), [notImage])).toBe(false)
  })
})

describe('buildHandoffRecord', () => {
  const id = 'abcdefghijklmnopqrstuvwx'

  it('sends the unpatched copy when there is one', () => {
    const original = new Blob(['original'], { type: 'image/gif' })
    const record = buildHandoffRecord(
      id,
      { preset: 'featured', workshopParts: 5, workshopRows: 2 },
      [artifact('featured.gif', 630, { previewBlob: original })],
      'clip.mp4',
      1000,
    )
    expect(record).toMatchObject({ id, preset: 'featured', workshopRows: 1, sourceName: 'clip.mp4', createdAt: 1000 })
    expect(record.files).toEqual([{ name: 'featured.gif', type: 'image/gif', width: 630, height: 300, blob: original }])
  })

  it('keeps the Workshop row count and file order', () => {
    const outputs = parts(10)
    const record = buildHandoffRecord(id, workshop(2), outputs, '')
    expect(record.workshopRows).toBe(2)
    expect(record.files.map((file) => file.name)).toEqual(outputs.map((output) => output.name))
  })

  it('refuses results that cannot be previewed', () => {
    expect(() => buildHandoffRecord(id, workshop(1, 4), parts(4), '')).toThrow()
  })
})

describe('handoff ids and URLs', () => {
  it('creates URL-safe ids that the bridge and SteamCanvas accept', () => {
    const ids = new Set(Array.from({ length: 20 }, () => createHandoffId()))
    expect(ids.size).toBe(20)
    for (const id of ids) expect(isHandoffId(id)).toBe(true)
  })

  it('rejects malformed ids', () => {
    expect(isHandoffId(null)).toBe(false)
    expect(isHandoffId('short')).toBe(false)
    expect(isHandoffId('abcdefghijklmnop/../x')).toBe(false)
  })

  it('points at the preview with the id in the query', () => {
    const url = new URL(profilePreviewUrl('abcdefghijklmnopqrstuvwx'))
    expect(url.pathname).toBe('/')
    expect(url.searchParams.get('handoff')).toBe('abcdefghijklmnopqrstuvwx')
  })
})

describe('expiry and pruning', () => {
  const now = 10 * HANDOFF_TTL_MS

  it('expires records after 24 hours', () => {
    expect(isHandoffExpired({ createdAt: now - HANDOFF_TTL_MS }, now)).toBe(false)
    expect(isHandoffExpired({ createdAt: now - HANDOFF_TTL_MS - 1 }, now)).toBe(true)
  })

  it('drops expired records and keeps the newest four, leaving room for the new one', () => {
    const records = [
      { id: 'expired', createdAt: now - HANDOFF_TTL_MS - 1 },
      ...Array.from({ length: 5 }, (_, index) => ({ id: `r${index}`, createdAt: now - index * 1000 })),
    ]
    expect(handoffIdsToPrune(records, now).sort()).toEqual(['expired', 'r4'])
  })
})

describe('previewBlobOf', () => {
  it('falls back to the output blob when nothing was patched', () => {
    const output = artifact('a')
    expect(previewBlobOf(output)).toBe(output.blob)
  })
})
