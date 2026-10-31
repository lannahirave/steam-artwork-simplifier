import type { ConversionArtifact, ConversionConfig } from './types'

// Hands converted GIFs to the SteamCanvas profile preview (a separate site on another subdomain).
// The Studio saves them in IndexedDB; SteamCanvas embeds /bridge/, which reads them from here and
// posts them to the preview. Nothing is uploaded. Protocol: steamcanvas/docs/ARTWORK_STUDIO_INTEGRATION.md

export const PROFILE_PREVIEW_ORIGIN: string =
  import.meta.env.VITE_PROFILE_PREVIEW_ORIGIN || 'https://preview.lannahirave.com'

export const HANDOFF_PROTOCOL_VERSION = 1
export const HANDOFF_TTL_MS = 24 * 60 * 60 * 1000
export const HANDOFF_MAX_RECORDS = 5

const DB_NAME = 'steam-artwork-handoff'
const DB_VERSION = 1
const STORE = 'handoffs'

export type ProfilePreviewPreset = 'workshop' | 'showcase' | 'featured'

export interface HandoffFile {
  name: string
  type: string
  width: number
  height: number
  blob: Blob
}

export interface HandoffRecord {
  id: string
  createdAt: number
  preset: ProfilePreviewPreset
  workshopRows: 1 | 2 | 3
  sourceName: string
  files: HandoffFile[]
}

/** The preset and layout a finished conversion was made with. */
export interface ConversionLayout {
  preset: ConversionConfig['preset']
  workshopParts: number
  workshopRows: ConversionConfig['workshopRows']
}

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
export function previewBlobOf(artifact: ConversionArtifact): Blob {
  return artifact.previewBlob ?? artifact.blob
}

export function createHandoffId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function isHandoffId(value: string | null): value is string {
  return value !== null && /^[A-Za-z0-9_-]{16,64}$/.test(value)
}

export function profilePreviewUrl(id: string): string {
  const url = new URL('/', PROFILE_PREVIEW_ORIGIN)
  url.searchParams.set('handoff', id)
  return url.href
}

export function buildHandoffRecord(
  id: string,
  layout: ConversionLayout,
  artifacts: ConversionArtifact[],
  sourceName: string,
  now = Date.now(),
): HandoffRecord {
  if (!canPreviewOnProfile(layout, artifacts)) {
    throw new Error('These results cannot be previewed on a Steam profile.')
  }
  return {
    id,
    createdAt: now,
    preset: layout.preset as ProfilePreviewPreset,
    workshopRows: layout.preset === 'workshop' ? layout.workshopRows : 1,
    sourceName,
    files: artifacts.map((artifact) => {
      const blob = previewBlobOf(artifact)
      return { name: artifact.name, type: blob.type, width: artifact.width, height: artifact.height, blob }
    }),
  }
}

export function isHandoffExpired(record: Pick<HandoffRecord, 'createdAt'>, now = Date.now()): boolean {
  return now - record.createdAt > HANDOFF_TTL_MS
}

/** Ids to delete so that only unexpired records remain, at most `max - incoming` of them. */
export function handoffIdsToPrune(
  records: Pick<HandoffRecord, 'id' | 'createdAt'>[],
  now = Date.now(),
  keep = HANDOFF_MAX_RECORDS - 1,
): string[] {
  const live = records
    .filter((record) => !isHandoffExpired(record, now))
    .sort((a, b) => b.createdAt - a.createdAt)
  const kept = new Set(live.slice(0, Math.max(0, keep)).map((record) => record.id))
  return records.filter((record) => !kept.has(record.id)).map((record) => record.id)
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))
  })
}

function openHandoffDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available.'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab.'))
  })
}

/** Saves a handoff, dropping expired ones and the oldest beyond the limit. */
export async function saveHandoff(record: HandoffRecord): Promise<void> {
  const db = await openHandoffDb()
  try {
    const transaction = db.transaction(STORE, 'readwrite')
    const store = transaction.objectStore(STORE)
    const existing = (await requestToPromise(store.getAll())) as HandoffRecord[]
    for (const id of handoffIdsToPrune(existing, record.createdAt)) store.delete(id)
    store.put(record)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export type HandoffLookup =
  | { status: 'found'; record: HandoffRecord }
  | { status: 'not-found' }
  | { status: 'expired' }

export async function readHandoff(id: string, now = Date.now()): Promise<HandoffLookup> {
  const db = await openHandoffDb()
  try {
    const transaction = db.transaction(STORE, 'readonly')
    const record = (await requestToPromise(transaction.objectStore(STORE).get(id))) as HandoffRecord | undefined
    if (!record) return { status: 'not-found' }
    return isHandoffExpired(record, now) ? { status: 'expired' } : { status: 'found', record }
  } finally {
    db.close()
  }
}

export async function deleteHandoff(id: string): Promise<void> {
  const db = await openHandoffDb()
  try {
    const transaction = db.transaction(STORE, 'readwrite')
    transaction.objectStore(STORE).delete(id)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}
