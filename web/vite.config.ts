import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface PackageJson {
  version?: string
}

const configDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(
  readFileSync(resolve(configDir, 'package.json'), 'utf-8'),
) as PackageJson
const appVersion = packageJson.version ?? '0.0.0'

const changelogPath = resolve(configDir, '../CHANGELOG.md')
const CHANGELOG_ID = 'virtual:changelog'
// The newest release heading, used to tell whether the visitor has seen the latest changes.
const changelogLatest =
  readFileSync(changelogPath, 'utf-8')
    .split(/\r?\n/)
    .find((line) => line.startsWith('## '))
    ?.slice(3)
    .trim() ?? ''

// The Changelog dialog reads the repo's CHANGELOG.md, which sits outside web/; serve its text as a
// module instead of widening the dev server's file access.
function changelogPlugin(): Plugin {
  return {
    name: 'artwork-studio-changelog',
    resolveId: (id) => (id === CHANGELOG_ID ? `\0${CHANGELOG_ID}` : undefined),
    load(id) {
      if (id !== `\0${CHANGELOG_ID}`) return undefined
      this.addWatchFile(changelogPath)
      return `export default ${JSON.stringify(readFileSync(changelogPath, 'utf-8'))}`
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), changelogPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __CHANGELOG_LATEST__: JSON.stringify(changelogLatest),
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(configDir, 'index.html'),
        // Embedded by the SteamCanvas profile preview to receive saved GIFs (src/bridge/main.ts).
        bridge: resolve(configDir, 'bridge/index.html'),
      },
    },
  },
  optimizeDeps: {
    // ffmpeg packages include worker-entry imports that can break Vite dep pre-bundling.
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'cloudflare/tests/**/*.{test,spec}.{ts,tsx}',
    ],
  },
})

