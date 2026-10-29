import { handleStats, isStatsPath, type StatsEnv } from './stats'

interface Env extends StatsEnv {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>
  }
}

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = isStatsPath(new URL(request.url).pathname)
      ? await handleStats(request, env)
      : await env.ASSETS.fetch(request)
    const headers = new Headers(response.headers)

    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(name, value)
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
}
