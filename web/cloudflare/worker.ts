import { handleStats, isStatsPath, type StatsEnv } from './stats'

interface Env extends StatsEnv {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (isStatsPath(new URL(request.url).pathname)) {
      return handleStats(request, env)
    }

    const response = await env.ASSETS.fetch(request)
    const headers = new Headers(response.headers)

    headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp')

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
}
