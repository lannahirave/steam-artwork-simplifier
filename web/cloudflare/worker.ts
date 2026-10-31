import { handleStats, isStatsPath, type StatsEnv } from './stats'

interface Env extends StatsEnv {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>
  }
  /** Origin of the SteamCanvas profile preview, the only site allowed to embed /bridge/. */
  PROFILE_PREVIEW_ORIGIN?: string
}

const DEFAULT_PROFILE_PREVIEW_ORIGIN = 'https://preview.lannahirave.com'

// 'wasm-unsafe-eval' compiles the FFmpeg and gifski WASM; blob: covers the hash-checked
// FFmpeg core that the conversion worker imports from a blob URL; cdn.jsdelivr.net is
// where that core is downloaded from (see src/workers/ffmpeg.worker.ts).
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' blob: https://cdn.jsdelivr.net",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const SECURITY_HEADERS: Record<string, string> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}

export function isBridgePath(pathname: string): boolean {
  return pathname === '/bridge' || pathname.startsWith('/bridge/')
}

/**
 * Headers for /bridge/, the page SteamCanvas embeds to receive the GIFs saved for a profile preview
 * (src/bridge/main.ts). Only the preview's origin may frame it, so X-Frame-Options is left out
 * (it cannot name an origin). It needs no cross-origin isolation, so COOP and COEP are left out too.
 */
export function bridgeHeaders(previewOrigin: string): Record<string, string> {
  return {
    'Content-Security-Policy': [
      "default-src 'none'",
      "script-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      `frame-ancestors ${previewOrigin}`,
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    const response = isStatsPath(pathname)
      ? await handleStats(request, env)
      : await env.ASSETS.fetch(request)
    const headers = new Headers(response.headers)
    const bridge = isBridgePath(pathname)
    const securityHeaders = bridge
      ? bridgeHeaders(env.PROFILE_PREVIEW_ORIGIN || DEFAULT_PROFILE_PREVIEW_ORIGIN)
      : SECURITY_HEADERS

    for (const [name, value] of Object.entries(securityHeaders)) {
      headers.set(name, value)
    }
    if (bridge) {
      // public/_headers adds these to every asset; the bridge must not be cross-origin isolated.
      headers.delete('Cross-Origin-Opener-Policy')
      headers.delete('Cross-Origin-Embedder-Policy')
      headers.delete('X-Frame-Options')
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
}
