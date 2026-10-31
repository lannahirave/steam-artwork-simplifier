import type { HandoffLookup } from '../lib/profileHandoff'

/**
 * The Studio opens the preview tab inside the click and saves the files right after, so the first
 * read can come before the write. Retry "not found" for a few seconds before giving up.
 */
export const NOT_FOUND_RETRY_DELAYS_MS = [250, 500, 750, 1000, 1500, 2000]

export async function readHandoffWithRetry(
  read: () => Promise<HandoffLookup>,
  delaysMs: readonly number[],
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<HandoffLookup> {
  let lookup = await read()
  for (const delay of delaysMs) {
    if (lookup.status !== 'not-found') return lookup
    await wait(delay)
    lookup = await read()
  }
  return lookup
}
