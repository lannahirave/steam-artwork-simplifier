import type { ConversionArtifact } from './types'
import type { ConversionLayout, LibraryEntry } from './artworkLibrary'

// Lets the SteamCanvas profile preview (a separate site on another subdomain) read the Studio's
// library. SteamCanvas embeds /bridge/ in a hidden iframe and asks it for entries over postMessage;
// the bridge answers only that origin. Nothing is uploaded.
// Protocol: steamcanvas/docs/ARTWORK_STUDIO_INTEGRATION.md

export const PROFILE_PREVIEW_ORIGIN: string =
  import.meta.env.VITE_PROFILE_PREVIEW_ORIGIN || 'https://previewartwork.lannahirave.com'

export const HANDOFF_PROTOCOL_VERSION = 2

const PREVIEW_IMAGE_TYPE = /^image\/(png|jpeg|webp|gif|avif|apng)$/

/**
 * Whether these results can be shown on a Steam profile in SteamCanvas. SteamCanvas places
 * Workshop panels five per row, the Artwork Showcase as a main and a side panel, and the
 * Featured Artwork Showcase as one image. Guides have no place on a profile.
 */
export function canPreviewOnProfile(layout: ConversionLayout | null, artifacts: ConversionArtifact[]): boolean {
  if (!layout || artifacts.length === 0) return false
  if (!artifacts.every((artifact) => PREVIEW_IMAGE_TYPE.test(previewBlobOf(artifact).type))) return false
  switch (layout.preset) {
    case 'featured':
      return artifacts.length === 1
    case 'showcase':
      return artifacts.length === 2
    case 'workshop':
      return layout.workshopParts === 5 && artifacts.length === 5 * layout.workshopRows
    default:
      return false
  }
}

/** The file to show in a browser preview: the unpatched copy when post-patches changed the bytes. */
export function previewBlobOf(artifact: Pick<ConversionArtifact, 'blob' | 'previewBlob'>): Blob {
  return artifact.previewBlob ?? artifact.blob
}

/** Opens SteamCanvas and places this library entry on the profile. */
export function profilePreviewUrl(id: string): string {
  const url = new URL('/', PROFILE_PREVIEW_ORIGIN)
  url.searchParams.set('studio', id)
  return url.href
}

/** One library entry as the bridge sends it: preview copies only, never the patched uploads. */
export interface BridgeEntry {
  id: string
  createdAt: number
  sourceName: string
  preset: LibraryEntry['preset']
  workshopParts: number
  workshopRows: LibraryEntry['workshopRows']
  complete: boolean
  /** The user's notes from the Library tab; empty when there are none. */
  notes: string
  files: Array<{ name: string; type: string; width: number; height: number; blob: Blob }>
}

export function toBridgeEntry(entry: LibraryEntry): BridgeEntry {
  return {
    id: entry.id,
    createdAt: entry.createdAt,
    sourceName: entry.sourceName,
    preset: entry.preset,
    workshopParts: entry.workshopParts,
    workshopRows: entry.workshopRows,
    complete: entry.complete,
    notes: entry.notes ?? '',
    files: entry.files.map((file) => {
      const blob = previewBlobOf(file)
      return { name: file.name, type: blob.type, width: file.width, height: file.height, blob }
    }),
  }
}

/** A request from SteamCanvas, or null when the message is not one. */
export type BridgeRequest =
  | { type: 'list'; requestId: string }
  | { type: 'get'; requestId: string; id: string }

export function parseBridgeRequest(data: unknown): BridgeRequest | null {
  if (!data || typeof data !== 'object') return null
  const message = data as Record<string, unknown>
  if (message.source !== 'steamcanvas' || message.version !== HANDOFF_PROTOCOL_VERSION) return null
  if (typeof message.requestId !== 'string' || !message.requestId || message.requestId.length > 64) return null
  if (message.type === 'list') return { type: 'list', requestId: message.requestId }
  if (message.type === 'get' && typeof message.id === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(message.id)) {
    return { type: 'get', requestId: message.requestId, id: message.id }
  }
  return null
}
