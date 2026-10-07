// @vitest-environment node
// Unit tests for the site stats function. The Blobs store is replaced with a
// fake, so the tests pin the hardening behavior (fail-closed origin guard,
// per-minute rate cap, aggregate counter keys, token-protected stats read)
// without touching any real store.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getStore } from '@netlify/blobs'
import handler from './track'

vi.mock('@netlify/blobs', () => ({ getStore: vi.fn() }))

const getStoreMock = vi.mocked(getStore)

const store = {
  getWithMetadata: vi.fn().mockResolvedValue(null),
  setJSON: vi.fn().mockResolvedValue(undefined),
  list: vi.fn().mockImplementation(async function* emptyList() {}),
}

function fakeListPages(pages: { blobs: { key: string }[] }[]): AsyncGenerator<{
  blobs: { key: string }[]
}> {
  return (async function* listPages() {
    for (const page of pages) {
      yield page
    }
  })()
}

function allowedOriginRequest(method: 'GET' | 'POST' | 'DELETE', url: string): Request {
  return new Request(`https://artwork-helper.netlify.app${url}`, {
    method,
    headers: { origin: 'https://artwork-helper.netlify.app' },
  })
}

beforeEach(() => {
  vi.unstubAllEnvs()
  getStoreMock.mockReset()
  getStoreMock.mockReturnValue(store as unknown as ReturnType<typeof getStore>)
  store.getWithMetadata.mockReset().mockResolvedValue(null)
  store.setJSON.mockReset().mockResolvedValue(undefined)
  store.list.mockReset().mockImplementation(async function* emptyList() {})
  vi.stubEnv('URL', 'https://artwork-helper.netlify.app')
})

describe('POST /api/track', () => {
  it('increments the rate cap, day, and total counters on an allowed origin', async () => {
    const response = await handler(allowedOriginRequest('POST', '/api/track'))

    expect(response.status).toBe(204)
    expect(store.setJSON).toHaveBeenCalledTimes(3)
    expect(store.setJSON).toHaveBeenCalledWith(
      expect.stringMatching(/^rate\/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
      expect.objectContaining({ requests: 1 }),
    )
    expect(store.setJSON).toHaveBeenCalledWith(
      expect.stringMatching(/^day\/\d{4}-\d{2}-\d{2}$/),
      expect.objectContaining({ conversions: 1 }),
    )
    expect(store.setJSON).toHaveBeenCalledWith('total', expect.objectContaining({ conversions: 1 }))
  })

  it('counts the previous stored values', async () => {
    store.getWithMetadata
      .mockResolvedValueOnce({ data: { requests: 5 } })
      .mockResolvedValueOnce({ data: { conversions: 7 } })
      .mockResolvedValueOnce({ data: { conversions: 30 } })

    await handler(allowedOriginRequest('POST', '/api/track'))

    expect(store.setJSON).toHaveBeenCalledWith(
      expect.stringContaining('rate/'),
      expect.objectContaining({ requests: 6 }),
    )
    expect(store.setJSON).toHaveBeenCalledWith(
      expect.stringContaining('day/'),
      expect.objectContaining({ conversions: 8 }),
    )
    expect(store.setJSON).toHaveBeenCalledWith(
      'total',
      expect.objectContaining({ conversions: 31 }),
    )
  })

  it('rejects cross-site origins without touching the store', async () => {
    const request = new Request('https://artwork-helper.netlify.app/api/track', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    })

    const response = await handler(request)

    expect(response.status).toBe(403)
    expect(store.setJSON).not.toHaveBeenCalled()
  })

  it('fails closed when the request sends no origin hints', async () => {
    const response = await handler(
      new Request('https://artwork-helper.netlify.app/api/track', { method: 'POST' }),
    )

    expect(response.status).toBe(403)
    expect(store.setJSON).not.toHaveBeenCalled()
  })

  it('fails closed when the allowlist is not configured', async () => {
    vi.stubEnv('URL', '')
    vi.stubEnv('DEPLOY_PRIME_URL', '')
    vi.stubEnv('ALLOWED_ORIGINS', '')

    const response = await handler(allowedOriginRequest('POST', '/api/track'))

    expect(response.status).toBe(403)
    expect(store.setJSON).not.toHaveBeenCalled()
  })

  it('applies the per-minute rate cap and stops counting further requests', async () => {
    vi.stubEnv('STATS_RATE_LIMIT', '60')
    store.getWithMetadata.mockResolvedValue({ data: { requests: 60 } })

    const response = await handler(allowedOriginRequest('POST', '/api/track'))

    expect(response.status).toBe(429)
    expect(store.setJSON).not.toHaveBeenCalled()
  })
})

describe('GET /api/stats', () => {
  it('is unavailable without STATS_TOKEN', async () => {
    vi.stubEnv('STATS_TOKEN', '')

    const response = await handler(allowedOriginRequest('GET', '/api/stats?token=secret'))

    expect(response.status).toBe(404)
    expect(store.list).not.toHaveBeenCalled()
  })

  it('returns the total and day counters for the matching token', async () => {
    vi.stubEnv('STATS_TOKEN', 'secret')
    store.getWithMetadata.mockResolvedValue({ data: { conversions: 41 } })
    store.list.mockImplementation(() =>
      fakeListPages([{ blobs: [{ key: 'day/2026-10-06' }, { key: 'day/2026-10-07' }] }]),
    )

    const response = await handler(allowedOriginRequest('GET', '/api/stats?token=secret'))

    expect(response.status).toBe(200)
    const body = (await response.json()) as { total: number; days: Record<string, number> }
    expect(body).toEqual({
      total: 41,
      days: { '2026-10-06': 41, '2026-10-07': 41 },
    })
  })

  it('rejects the wrong token', async () => {
    vi.stubEnv('STATS_TOKEN', 'secret')

    const response = await handler(allowedOriginRequest('GET', '/api/stats?token=nope'))

    expect(response.status).toBe(404)
    expect(store.list).not.toHaveBeenCalled()
  })
})

describe('other methods', () => {
  it('responds 405 without touching the store', async () => {
    const response = await handler(allowedOriginRequest('DELETE', '/api/track'))

    expect(response.status).toBe(405)
    expect(store.setJSON).not.toHaveBeenCalled()
    expect(store.list).not.toHaveBeenCalled()
  })
})
