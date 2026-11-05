import type { ConversionArtifact, ConversionConfig } from './types'

// Every finished conversion is kept in this browser's IndexedDB, so it can be downloaded again,
// opened on a Steam profile in SteamCanvas, or deleted from the Library tab. Nothing is uploaded.
// SteamCanvas reads the library through the /bridge/ page (see lib/profileHandoff.ts).

const DB_NAME = 'steam-artwork-library'
const DB_VERSION = 1
const STORE = 'conversions'
/** The one-time handoff store this library replaced. Deleted on startup. */
const LEGACY_HANDOFF_DB_NAME = 'steam-artwork-handoff'

export type LibraryPreset = ConversionConfig['preset']

/** The preset and layout a finished conversion was made with. */
export interface ConversionLayout {
  preset: LibraryPreset
  workshopParts: number
  workshopRows: ConversionConfig['workshopRows']
}

export interface LibraryFile {
  name: string
  type: string
  width: number
  height: number
  finalFps: number
  finalQuality: number
  status: ConversionArtifact['status']
  /** The file to upload to Steam (with the header and end-byte patches, when they were on). */
  blob: Blob
  /** The unpatched copy, kept only when the patches changed the bytes. Previews use this one. */
  previewBlob?: Blob
}

export interface LibraryEntry {
  id: string
  createdAt: number
  sourceName: string
  preset: LibraryPreset
  workshopParts: number
  workshopRows: ConversionConfig['workshopRows']
  /** False when the conversion was finished early and some parts are missing. */
  complete: boolean
  files: LibraryFile[]
  /** The user's own notes, edited on the Library tab. Entries saved before notes existed have none. */
  notes?: string
}

/** Longest note kept, in characters. */
export const LIBRARY_NOTES_MAX_LENGTH = 1000

/** Notes as stored: line endings unified, surrounding whitespace trimmed, at most LIBRARY_NOTES_MAX_LENGTH characters. */
export function normalizeLibraryNotes(notes: string): string {
  return notes.replace(/\r\n?/g, '\n').trim().slice(0, LIBRARY_NOTES_MAX_LENGTH)
}

export function createLibraryId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function isLibraryId(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(value)
}

export function buildLibraryEntry(
  id: string,
  layout: ConversionLayout,
  artifacts: ConversionArtifact[],
  sourceName: string,
  complete: boolean,
  now = Date.now(),
): LibraryEntry {
  return {
    id,
    createdAt: now,
    sourceName,
    preset: layout.preset,
    workshopParts: layout.workshopParts,
    workshopRows: layout.workshopRows,
    complete,
    files: artifacts.map((artifact) => ({
      name: artifact.name,
      type: artifact.blob.type,
      width: artifact.width,
      height: artifact.height,
      finalFps: artifact.finalFps,
      finalQuality: artifact.finalQuality,
      status: artifact.status,
      blob: artifact.blob,
      ...(artifact.previewBlob && artifact.previewBlob !== artifact.blob ? { previewBlob: artifact.previewBlob } : {}),
    })),
  }
}

export function libraryEntryLayout(entry: LibraryEntry): ConversionLayout {
  return { preset: entry.preset, workshopParts: entry.workshopParts, workshopRows: entry.workshopRows }
}

/** The entry's files as conversion results, for the same download and preview code paths. */
export function libraryEntryArtifacts(entry: LibraryEntry): ConversionArtifact[] {
  return entry.files.map((file) => ({
    name: file.name,
    blob: file.blob,
    sizeKb: file.blob.size / 1024,
    width: file.width,
    height: file.height,
    status: file.status,
    finalFps: file.finalFps,
    finalQuality: file.finalQuality,
    ...(file.previewBlob ? { previewBlob: file.previewBlob } : {}),
  }))
}

/** Bytes this entry takes in storage, counting the unpatched copies. */
export function libraryEntryBytes(entry: LibraryEntry): number {
  return entry.files.reduce((sum, file) => sum + file.blob.size + (file.previewBlob?.size ?? 0), 0)
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

function openLibraryDb(): Promise<IDBDatabase> {
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

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openLibraryDb()
  try {
    const transaction = db.transaction(STORE, mode)
    const result = await run(transaction.objectStore(STORE))
    await transactionDone(transaction)
    return result
  } finally {
    db.close()
  }
}

/** Fires after the library changes in this tab, so open views can refresh. */
export const LIBRARY_CHANGED_EVENT = 'steam-artwork-library-changed'

function notifyChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LIBRARY_CHANGED_EVENT))
}

/** The Library keeps at most this many bytes unless the user raises the limit on the Library tab. */
export const DEFAULT_LIBRARY_LIMIT_BYTES = 500 * 1024 * 1024
/** Limits offered on the Library tab. */
export const LIBRARY_LIMIT_OPTIONS_BYTES = [250, 500, 1024, 2048, 5120].map((mb) => mb * 1024 * 1024)
const LIBRARY_LIMIT_STORAGE_KEY = 'steam-artwork-library-limit-bytes'

export function getLibraryLimitBytes(): number {
  try {
    const stored = Number(globalThis.localStorage?.getItem(LIBRARY_LIMIT_STORAGE_KEY))
    if (Number.isFinite(stored) && stored > 0) return stored
  } catch {
    // Storage blocked: use the default.
  }
  return DEFAULT_LIBRARY_LIMIT_BYTES
}

export function setLibraryLimitBytes(bytes: number): void {
  try {
    globalThis.localStorage?.setItem(LIBRARY_LIMIT_STORAGE_KEY, String(bytes))
  } catch {
    // Storage blocked: the limit lasts only for this page.
  }
}

/**
 * The oldest entries to delete so the rest fit in `limitBytes`. `keepId` (the conversion just saved)
 * is never picked, even when it alone is over the limit.
 */
export function pickEntriesToEvict(entries: LibraryEntry[], limitBytes: number, keepId?: string): LibraryEntry[] {
  let total = entries.reduce((sum, entry) => sum + libraryEntryBytes(entry), 0)
  const oldestFirst = [...entries].sort((a, b) => a.createdAt - b.createdAt)
  const evicted: LibraryEntry[] = []
  for (const entry of oldestFirst) {
    if (total <= limitBytes) break
    if (entry.id === keepId) continue
    evicted.push(entry)
    total -= libraryEntryBytes(entry)
  }
  return evicted
}

/** Deletes the oldest entries until the Library fits in the limit. Returns how many were deleted. */
export async function enforceLibraryLimit(limitBytes = getLibraryLimitBytes(), keepId?: string): Promise<number> {
  const evicted = pickEntriesToEvict(await listLibraryEntries(), limitBytes, keepId)
  if (evicted.length === 0) return 0
  await withStore('readwrite', (store) => {
    for (const entry of evicted) store.delete(entry.id)
  })
  notifyChanged()
  return evicted.length
}

export interface LibrarySaveResult {
  /** Older conversions deleted to stay under the size limit. */
  evictedCount: number
}

export async function saveLibraryEntry(entry: LibraryEntry): Promise<LibrarySaveResult> {
  await withStore('readwrite', (store) => {
    store.put(entry)
  })
  let evictedCount = 0
  try {
    evictedCount = await enforceLibraryLimit(getLibraryLimitBytes(), entry.id)
  } catch {
    // The entry is saved; trimming can happen on the next save.
  }
  notifyChanged()
  return { evictedCount }
}

/** All saved conversions, newest first. */
export async function listLibraryEntries(): Promise<LibraryEntry[]> {
  const entries = await withStore('readonly', (store) => requestToPromise(store.getAll()) as Promise<LibraryEntry[]>)
  return entries.sort((a, b) => b.createdAt - a.createdAt)
}

export async function getLibraryEntry(id: string): Promise<LibraryEntry | null> {
  const entry = await withStore('readonly', (store) => requestToPromise(store.get(id)) as Promise<LibraryEntry | undefined>)
  return entry ?? null
}

/**
 * Replaces an entry's notes. Read and write happen in one transaction, so a save from another tab
 * cannot be lost in between. Returns false when the entry no longer exists.
 */
export async function updateLibraryEntryNotes(id: string, notes: string): Promise<boolean> {
  const nextNotes = normalizeLibraryNotes(notes)
  const updated = await withStore('readwrite', async (store) => {
    const entry = (await requestToPromise(store.get(id))) as LibraryEntry | undefined
    if (!entry) return false
    if ((entry.notes ?? '') === nextNotes) return true
    const next: LibraryEntry = { ...entry }
    if (nextNotes) next.notes = nextNotes
    else delete next.notes
    store.put(next)
    return true
  })
  if (updated) notifyChanged()
  return updated
}

export async function deleteLibraryEntry(id: string): Promise<void> {
  await withStore('readwrite', (store) => {
    store.delete(id)
  })
  notifyChanged()
}

export async function clearLibrary(): Promise<void> {
  await withStore('readwrite', (store) => {
    store.clear()
  })
  notifyChanged()
}

export interface StorageUsage {
  usedBytes: number
  quotaBytes: number
}

/** The browser's estimate for this whole site, or null when it does not say. */
export async function estimateStorageUsage(): Promise<StorageUsage | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
  const estimate = await navigator.storage.estimate()
  if (typeof estimate.usage !== 'number' || typeof estimate.quota !== 'number') return null
  return { usedBytes: estimate.usage, quotaBytes: estimate.quota }
}

/** Removes the old one-time handoff database. Safe to call on every start. */
export function deleteLegacyHandoffDb(): void {
  if (typeof indexedDB === 'undefined') return
  try {
    indexedDB.deleteDatabase(LEGACY_HANDOFF_DB_NAME)
  } catch {
    // Nothing to clean up, or storage is blocked.
  }
}
