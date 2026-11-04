import { PROFILE_PREVIEW_ORIGIN } from './profileHandoff'

// Lets the Library tab manage what SteamCanvas saved in this browser: the demo examples opened with
// "Preview on my Steam profile" on the demo page. SteamCanvas keeps them in its own IndexedDB on its
// own origin, so the Studio embeds SteamCanvas's /bridge/ page in a hidden iframe and asks it over
// postMessage. The bridge can list, delete one and delete all.
// Protocol: steamcanvas/docs/ARTWORK_STUDIO_INTEGRATION.md, "Saved artwork bridge".

const CHANNEL = 'saved-artwork'
const PROTOCOL_VERSION = 1
const CONNECT_TIMEOUT_MS = 15_000
const REQUEST_TIMEOUT_MS = 20_000
const PRESETS = ['workshop', 'showcase', 'featured'] as const

export interface SteamCanvasSavedFile {
  name: string
  width: number
  height: number
  blob: Blob
}

export interface SteamCanvasSavedEntry {
  id: string
  /** The demo page's ID for the example, used to open it again. */
  sourceId: string
  title: string
  preset: (typeof PRESETS)[number]
  workshopRows: 1 | 2 | 3
  savedAt: number
  bytes: number
  files: SteamCanvasSavedFile[]
}

export type SteamCanvasSavedFailure = 'timeout' | 'storage-unavailable' | 'invalid'

export class SteamCanvasSavedError extends Error {
  readonly reason: SteamCanvasSavedFailure

  constructor(reason: SteamCanvasSavedFailure) {
    super(reason)
    this.reason = reason
  }
}

/** Opens SteamCanvas with a saved demo example; it uses the saved copy, not the demo site. */
export function steamCanvasDemoUrl(sourceId: string): string {
  const url = new URL('/', PROFILE_PREVIEW_ORIGIN)
  url.searchParams.set('demo', sourceId)
  return url.href
}

function parseEntry(raw: unknown): SteamCanvasSavedEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Record<string, unknown>
  if (typeof entry.id !== 'string' || typeof entry.sourceId !== 'string') return null
  const preset = PRESETS.find((value) => value === entry.preset)
  if (!preset || !Array.isArray(entry.files)) return null
  const files = entry.files.flatMap((file: unknown) => {
    const item = (file ?? {}) as Record<string, unknown>
    if (!(item.blob instanceof Blob)) return []
    return [{
      name: typeof item.name === 'string' ? item.name : 'artwork.gif',
      width: Number(item.width) || 0,
      height: Number(item.height) || 0,
      blob: item.blob,
    }]
  })
  const rows = Number(entry.workshopRows)
  return {
    id: entry.id,
    sourceId: entry.sourceId,
    title: typeof entry.title === 'string' ? entry.title : entry.sourceId,
    preset,
    workshopRows: rows === 2 || rows === 3 ? rows : 1,
    savedAt: Number(entry.savedAt) || 0,
    bytes: Number(entry.bytes) || files.reduce((sum, file) => sum + file.blob.size, 0),
    files,
  }
}

interface Pending {
  resolve: (data: Record<string, unknown>) => void
  reject: (error: SteamCanvasSavedError) => void
  timer: ReturnType<typeof setTimeout>
}

let connection: Promise<HTMLIFrameElement> | null = null
const pending = new Map<string, Pending>()
let requestCounter = 0

function isBridgeMessage(event: MessageEvent, frame: HTMLIFrameElement): Record<string, unknown> | null {
  if (event.origin !== PROFILE_PREVIEW_ORIGIN || event.source !== frame.contentWindow) return null
  const data = event.data as Record<string, unknown> | null
  if (!data || data.source !== 'steamcanvas' || data.channel !== CHANNEL || data.version !== PROTOCOL_VERSION) return null
  return data
}

function connect(): Promise<HTMLIFrameElement> {
  if (connection) return connection
  connection = new Promise<HTMLIFrameElement>((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.hidden = true
    frame.setAttribute('aria-hidden', 'true')
    frame.tabIndex = -1
    frame.title = 'SteamCanvas saved artwork'
    frame.src = new URL('/bridge/', PROFILE_PREVIEW_ORIGIN).href

    const timer = setTimeout(() => {
      window.removeEventListener('message', onReady)
      frame.remove()
      reject(new SteamCanvasSavedError('timeout'))
    }, CONNECT_TIMEOUT_MS)
    function onReady(event: MessageEvent): void {
      const data = isBridgeMessage(event, frame)
      if (!data || data.type !== 'ready') return
      clearTimeout(timer)
      window.removeEventListener('message', onReady)
      window.addEventListener('message', (message) => {
        const answer = isBridgeMessage(message, frame)
        const requestId = typeof answer?.requestId === 'string' ? answer.requestId : ''
        const waiting = pending.get(requestId)
        if (!answer || !waiting) return
        pending.delete(requestId)
        clearTimeout(waiting.timer)
        if (answer.type === 'error') {
          waiting.reject(new SteamCanvasSavedError(answer.reason === 'storage-unavailable' ? 'storage-unavailable' : 'invalid'))
        } else {
          waiting.resolve(answer)
        }
      })
      resolve(frame)
    }
    window.addEventListener('message', onReady)
    document.body.append(frame)
  })
  // A failed connection is retried on the next request.
  connection.catch(() => {
    connection = null
  })
  return connection
}

async function request(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  const frame = await connect()
  const requestId = `s${++requestCounter}`
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new SteamCanvasSavedError('timeout'))
    }, REQUEST_TIMEOUT_MS)
    pending.set(requestId, { resolve, reject, timer })
    frame.contentWindow?.postMessage(
      { source: 'steam-artwork-studio', channel: CHANNEL, version: PROTOCOL_VERSION, requestId, ...message },
      PROFILE_PREVIEW_ORIGIN,
    )
  })
}

/** Everything SteamCanvas saved in this browser, newest first. */
export async function listSteamCanvasSaved(): Promise<SteamCanvasSavedEntry[]> {
  const result = await request({ type: 'list' })
  if (result.type !== 'list-result' || !Array.isArray(result.entries)) throw new SteamCanvasSavedError('invalid')
  return result.entries.flatMap((entry: unknown) => {
    const parsed = parseEntry(entry)
    return parsed ? [parsed] : []
  })
}

export async function deleteSteamCanvasSaved(id: string): Promise<void> {
  const result = await request({ type: 'delete', id })
  if (result.type !== 'done') throw new SteamCanvasSavedError('invalid')
}

export async function clearSteamCanvasSaved(): Promise<void> {
  const result = await request({ type: 'clear' })
  if (result.type !== 'done') throw new SteamCanvasSavedError('invalid')
}
