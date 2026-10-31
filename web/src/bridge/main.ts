import {
  deleteHandoff,
  HANDOFF_PROTOCOL_VERSION,
  isHandoffId,
  PROFILE_PREVIEW_ORIGIN,
  readHandoff,
  type HandoffLookup,
} from '../lib/profileHandoff'
import { NOT_FOUND_RETRY_DELAYS_MS, readHandoffWithRetry } from './readWithRetry'

// Runs inside a hidden iframe on the SteamCanvas profile preview. Messages go only to the preview's
// origin: postMessage drops them if the parent is any other site.

const id = new URLSearchParams(window.location.search).get('id')

function post(message: Record<string, unknown>): void {
  window.parent.postMessage(
    { source: 'steam-artwork-studio', version: HANDOFF_PROTOCOL_VERSION, id, ...message },
    PROFILE_PREVIEW_ORIGIN,
  )
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.origin !== PROFILE_PREVIEW_ORIGIN || event.source !== window.parent) return
  const data = event.data as Record<string, unknown> | null
  if (
    !data ||
    data.source !== 'steamcanvas' ||
    data.version !== HANDOFF_PROTOCOL_VERSION ||
    data.type !== 'handoff-consumed' ||
    data.id !== id ||
    !isHandoffId(id)
  ) {
    return
  }
  void deleteHandoff(id).catch(() => {
    // The record expires on its own after 24 hours.
  })
})

async function start(): Promise<void> {
  if (window.parent === window || !isHandoffId(id)) return

  let lookup: HandoffLookup
  try {
    lookup = await readHandoffWithRetry(() => readHandoff(id), NOT_FOUND_RETRY_DELAYS_MS)
  } catch {
    // Storage blocked or unavailable in this embedded context (for example, Safari tracking prevention).
    post({ type: 'handoff-error', reason: 'storage-unavailable' })
    return
  }

  if (lookup.status !== 'found') {
    post({ type: 'handoff-error', reason: lookup.status })
    return
  }
  const { record } = lookup
  post({
    type: 'handoff',
    preset: record.preset,
    workshopRows: record.workshopRows,
    sourceName: record.sourceName,
    createdAt: record.createdAt,
    files: record.files,
  })
}

void start()
