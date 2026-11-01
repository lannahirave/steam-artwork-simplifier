/**
 * The Studio saves a conversion to the library as soon as it finishes, but a user can click
 * "Preview on my Steam profile" while that write is still running. Retry a missing entry for a few
 * seconds before giving up.
 */
export const NOT_FOUND_RETRY_DELAYS_MS = [250, 500, 750, 1000, 1500, 2000]

export async function readWithRetry<T>(
  read: () => Promise<T | null>,
  delaysMs: readonly number[],
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T | null> {
  let found = await read()
  for (const delay of delaysMs) {
    if (found !== null) return found
    await wait(delay)
    found = await read()
  }
  return found
}
