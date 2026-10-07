// Fire-and-forget aggregate conversion counter.
// Posts an empty beacon to the Netlify stats function, which stores only
// integer counters (total and per-day). Nothing identifying is sent, no
// response is read, and failures are swallowed: stats must never affect
// the conversion flow.
export function trackConversionComplete(): void {
  if (import.meta.env.DEV) {
    return
  }
  if (typeof navigator.sendBeacon !== 'function') {
    return
  }
  try {
    navigator.sendBeacon('/api/track')
  } catch {
    // Best-effort only.
  }
}
