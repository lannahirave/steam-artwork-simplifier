// Remembers the newest changelog release the visitor has opened, so the Changelog button's dot only
// shows while there is something they have not seen.
export const CHANGELOG_SEEN_STORAGE_KEY = 'steam-artwork-studio:changelog-seen'

/** The first `## [version] - date` heading of CHANGELOG.md, fixed at build time. */
export const LATEST_CHANGELOG_RELEASE = __CHANGELOG_LATEST__

export function hasUnseenChangelog(): boolean {
  if (typeof window === 'undefined' || !LATEST_CHANGELOG_RELEASE) {
    return false
  }
  try {
    return window.localStorage.getItem(CHANGELOG_SEEN_STORAGE_KEY) !== LATEST_CHANGELOG_RELEASE
  } catch {
    // Without storage the dot would never go away, so leave it off.
    return false
  }
}

export function storeChangelogSeen(): void {
  try {
    window.localStorage.setItem(CHANGELOG_SEEN_STORAGE_KEY, LATEST_CHANGELOG_RELEASE)
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}
