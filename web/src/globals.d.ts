declare const __APP_VERSION__: string
declare const __CHANGELOG_LATEST__: string

/** The text of the repo's CHANGELOG.md (see changelogPlugin in vite.config.ts). */
declare module 'virtual:changelog' {
  const source: string
  export default source
}
