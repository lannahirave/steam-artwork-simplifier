import { describe, expect, it } from 'vitest'
import type { ConversionArtifact } from './types'
import { buildLibraryEntry, type ConversionLayout } from './artworkLibrary'
import {
  canPreviewOnProfile,
  HANDOFF_PROTOCOL_VERSION,
  parseBridgeRequest,
  previewBlobOf,
  profilePreviewUrl,
  toBridgeEntry,
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

describe('toBridgeEntry', () => {
  const id = 'abcdefghijklmnopqrstuvwx'

  it('sends the unpatched copies, never the patched uploads', () => {
    const original = new Blob(['original'], { type: 'image/gif' })
    const entry = buildLibraryEntry(id, single('featured'), [artifact('featured.gif', 630, { previewBlob: original })], 'clip.mp4', true, 1000)
    const bridged = toBridgeEntry(entry)
    expect(bridged).toMatchObject({ id, preset: 'featured', sourceName: 'clip.mp4', createdAt: 1000, complete: true })
    expect(bridged.files).toEqual([{ name: 'featured.gif', type: 'image/gif', width: 630, height: 300, blob: original }])
  })

  it('keeps the Workshop layout and file order', () => {
    const outputs = parts(10)
    const bridged = toBridgeEntry(buildLibraryEntry(id, workshop(2), outputs, '', true))
    expect(bridged).toMatchObject({ workshopRows: 2, workshopParts: 5 })
    expect(bridged.files.map((file) => file.name)).toEqual(outputs.map((output) => output.name))
  })
})

describe('parseBridgeRequest', () => {
  const base = { source: 'steamcanvas', version: HANDOFF_PROTOCOL_VERSION, requestId: 'r1' }

  it('accepts list and get requests from SteamCanvas', () => {
    expect(parseBridgeRequest({ ...base, type: 'list' })).toEqual({ type: 'list', requestId: 'r1' })
    expect(parseBridgeRequest({ ...base, type: 'get', id: 'abcdefghijklmnopqrstuvwx' })).toEqual({
      type: 'get',
      requestId: 'r1',
      id: 'abcdefghijklmnopqrstuvwx',
    })
  })

  it('ignores other senders, versions and malformed ids', () => {
    expect(parseBridgeRequest(null)).toBeNull()
    expect(parseBridgeRequest({ ...base, source: 'other', type: 'list' })).toBeNull()
    expect(parseBridgeRequest({ ...base, version: 1, type: 'list' })).toBeNull()
    expect(parseBridgeRequest({ ...base, type: 'get', id: '../x' })).toBeNull()
    expect(parseBridgeRequest({ ...base, type: 'delete', id: 'abcdefghijklmnopqrstuvwx' })).toBeNull()
    expect(parseBridgeRequest({ source: 'steamcanvas', version: HANDOFF_PROTOCOL_VERSION, type: 'list' })).toBeNull()
  })
})

describe('profilePreviewUrl', () => {
  it('points at the preview with the library id in the query', () => {
    const url = new URL(profilePreviewUrl('abcdefghijklmnopqrstuvwx'))
    expect(url.pathname).toBe('/')
    expect(url.searchParams.get('studio')).toBe('abcdefghijklmnopqrstuvwx')
  })
})

describe('previewBlobOf', () => {
  it('falls back to the output blob when nothing was patched', () => {
    const output = artifact('a')
    expect(previewBlobOf(output)).toBe(output.blob)
  })
})
