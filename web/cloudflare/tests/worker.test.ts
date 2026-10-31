// @vitest-environment node
import { describe, expect, it } from 'vitest'
import worker, { bridgeHeaders, isBridgePath } from '../worker'

type WorkerEnv = Parameters<typeof worker.fetch>[1]

const env = {
  // Like public/_headers, the assets binding adds COOP and COEP to every file.
  ASSETS: {
    fetch: async () =>
      new Response('<!doctype html>', {
        headers: {
          'Content-Type': 'text/html',
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
        },
      }),
  },
  PROFILE_PREVIEW_ORIGIN: 'https://preview.example.com',
} as unknown as WorkerEnv

describe('bridge headers', () => {
  it('matches only the bridge path', () => {
    expect(isBridgePath('/bridge')).toBe(true)
    expect(isBridgePath('/bridge/')).toBe(true)
    expect(isBridgePath('/bridge/index.html')).toBe(true)
    expect(isBridgePath('/bridges')).toBe(false)
    expect(isBridgePath('/')).toBe(false)
  })

  it('lets only the preview origin frame the bridge, without cross-origin isolation', async () => {
    const response = await worker.fetch(new Request('https://studio.example.com/bridge/?id=x'), env)
    const csp = response.headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain('frame-ancestors https://preview.example.com')
    expect(csp).toContain("default-src 'none'")
    expect(response.headers.get('X-Frame-Options')).toBeNull()
    expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBeNull()
    expect(response.headers.get('Cross-Origin-Opener-Policy')).toBeNull()
  })

  it('keeps the app itself isolated and unframeable', async () => {
    const response = await worker.fetch(new Request('https://studio.example.com/'), env)
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp')
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'")
  })

  it('names the given preview origin', () => {
    expect(bridgeHeaders('https://previewartwork.lannahirave.com')['Content-Security-Policy']).toContain(
      'frame-ancestors https://previewartwork.lannahirave.com',
    )
  })
})
