import { describe, expect, it } from 'vitest'
import type { ConversionArtifact } from './types'
import {
  buildLibraryEntry,
  createLibraryId,
  isLibraryId,
  libraryEntryArtifacts,
  libraryEntryBytes,
  libraryEntryLayout,
  pickEntriesToEvict,
} from './artworkLibrary'

function artifact(name: string, extra: Partial<ConversionArtifact> = {}): ConversionArtifact {
  return {
    name,
    blob: new Blob(['patched!'], { type: 'image/gif' }),
    sizeKb: 1,
    width: 150,
    height: 300,
    status: 'lossy',
    finalFps: 18,
    finalQuality: 90,
    ...extra,
  }
}

const layout = { preset: 'workshop' as const, workshopParts: 5, workshopRows: 2 as const }

describe('buildLibraryEntry', () => {
  it('keeps the layout, source name and every file', () => {
    const entry = buildLibraryEntry('abcdefghijklmnopqrstuvwx', layout, [artifact('a.gif'), artifact('b.gif')], 'clip.mp4', false, 5)
    expect(entry).toMatchObject({
      id: 'abcdefghijklmnopqrstuvwx',
      createdAt: 5,
      sourceName: 'clip.mp4',
      preset: 'workshop',
      workshopParts: 5,
      workshopRows: 2,
      complete: false,
    })
    expect(entry.files.map((file) => file.name)).toEqual(['a.gif', 'b.gif'])
    expect(libraryEntryLayout(entry)).toEqual(layout)
  })

  it('stores the unpatched copy only when it differs', () => {
    const original = new Blob(['orig'], { type: 'image/gif' })
    const patched = artifact('a.gif', { previewBlob: original })
    const unpatched = artifact('b.gif')
    const entry = buildLibraryEntry('abcdefghijklmnopqrstuvwx', layout, [patched, unpatched], '', true)
    expect(entry.files[0].previewBlob).toBe(original)
    expect('previewBlob' in entry.files[1]).toBe(false)
    expect(libraryEntryBytes(entry)).toBe(8 + 4 + 8)
  })

  it('round-trips into conversion results for downloads and previews', () => {
    const original = new Blob(['orig'], { type: 'image/gif' })
    const source = artifact('a.gif', { previewBlob: original })
    const [restored] = libraryEntryArtifacts(buildLibraryEntry('abcdefghijklmnopqrstuvwx', layout, [source], '', true))
    expect(restored).toMatchObject({ name: 'a.gif', width: 150, height: 300, status: 'lossy', finalFps: 18, finalQuality: 90 })
    expect(restored.blob).toBe(source.blob)
    expect(restored.previewBlob).toBe(original)
  })
})

describe('library ids', () => {
  it('creates URL-safe ids that the bridge and SteamCanvas accept', () => {
    const ids = new Set(Array.from({ length: 20 }, () => createLibraryId()))
    expect(ids.size).toBe(20)
    for (const id of ids) expect(isLibraryId(id)).toBe(true)
  })

  it('rejects malformed ids', () => {
    expect(isLibraryId(null)).toBe(false)
    expect(isLibraryId('short')).toBe(false)
    expect(isLibraryId('abcdefghijklmnop/../x')).toBe(false)
  })
})

describe('pickEntriesToEvict', () => {
  function sized(id: string, createdAt: number, bytes: number) {
    const file = artifact(`${id}.gif`, { blob: new Blob([new Uint8Array(bytes)], { type: 'image/gif' }) })
    return buildLibraryEntry(id.padEnd(16, 'x'), layout, [file], id, true, createdAt)
  }

  it('picks nothing when the Library fits', () => {
    expect(pickEntriesToEvict([sized('a', 1, 40), sized('b', 2, 40)], 100)).toEqual([])
  })

  it('picks the oldest entries until the rest fit', () => {
    const entries = [sized('new', 3, 40), sized('old', 1, 40), sized('mid', 2, 40)]
    expect(pickEntriesToEvict(entries, 50).map((entry) => entry.sourceName)).toEqual(['old', 'mid'])
  })

  it('never picks the entry just saved, even when it alone is over the limit', () => {
    const big = sized('big', 1, 500)
    const evicted = pickEntriesToEvict([big, sized('other', 2, 10)], 100, big.id)
    expect(evicted.map((entry) => entry.sourceName)).toEqual(['other'])
  })
})
