import { getLibraryEntry, listLibraryEntries } from '../lib/artworkLibrary'
import {
  HANDOFF_PROTOCOL_VERSION,
  parseBridgeRequest,
  PROFILE_PREVIEW_ORIGIN,
  toBridgeEntry,
} from '../lib/profileHandoff'
import { NOT_FOUND_RETRY_DELAYS_MS, readWithRetry } from './readWithRetry'

// Runs inside a hidden iframe on the SteamCanvas profile preview and answers its requests for the
// Studio's library. Messages are accepted from, and sent to, the preview's origin only: postMessage
// drops them if the parent is any other site. The bridge only reads; it never changes the library.

function post(message: Record<string, unknown>): void {
  window.parent.postMessage(
    { source: 'steam-artwork-studio', version: HANDOFF_PROTOCOL_VERSION, ...message },
    PROFILE_PREVIEW_ORIGIN,
  )
}

async function answer(request: NonNullable<ReturnType<typeof parseBridgeRequest>>): Promise<void> {
  const { requestId } = request
  try {
    if (request.type === 'list') {
      const entries = await listLibraryEntries()
      post({ type: 'list-result', requestId, entries: entries.map(toBridgeEntry) })
      return
    }
    const entry = await readWithRetry(() => getLibraryEntry(request.id), NOT_FOUND_RETRY_DELAYS_MS)
    if (entry) post({ type: 'get-result', requestId, entry: toBridgeEntry(entry) })
    else post({ type: 'error', requestId, reason: 'not-found' })
  } catch {
    // Storage blocked or unavailable in this embedded context (for example, Safari tracking prevention).
    post({ type: 'error', requestId, reason: 'storage-unavailable' })
  }
}

if (window.parent !== window) {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.origin !== PROFILE_PREVIEW_ORIGIN || event.source !== window.parent) return
    const request = parseBridgeRequest(event.data)
    if (request) void answer(request)
  })
  post({ type: 'ready' })
}
