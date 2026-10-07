// Aggregate-only conversion counter for the Steam Artwork Simplifier.
//
// POST /api/track  -> increments aggregate counters (total, per-day) in
//                     Netlify Blobs. No request body is read, no IP, user
//                     agent, or session identifier is ever stored.
// GET  /api/stats?token=<STATS_TOKEN> -> returns the aggregate counters.
//
// Hardening:
// - Origin/Referer allowlist (Netlify system URL env vars plus optional
//   ALLOWED_ORIGINS for custom domains). Requests with no origin hint fail
//   closed, which blocks cross-site beacon spam and bare curl calls.
// - Global per-minute rate cap (STATS_RATE_LIMIT, default 60) so a flood can
//   inflate numbers by at most a bounded amount and burn only a bounded
//   number of function invocations.
//
// Counters are approximate under concurrency (read-modify-write) and should
// be read as directional statistics, not audit-grade data.

import { getStore } from '@netlify/blobs'
import type { Store } from '@netlify/blobs'
import {
  dayBucketKey,
  isAllowedSource,
  minuteBucketKey,
  parsePositiveInt,
  resolveAllowedOrigins,
} from '../../src/lib/statsGuard'

interface CountBlob {
  conversions?: number
  requests?: number
}

const DAY_KEY_PREFIX = 'day/'

function getStatsStore(): Store {
  return getStore('site-stats', { consistency: 'strong' })
}

/** Read an aggregate count entry, or null when the entry does not exist. */
async function readCount(store: Store, key: string): Promise<CountBlob | null> {
  const result = await store.getWithMetadata(key, { type: 'json' })
  return result === null ? null : ((result.data ?? null) as CountBlob | null)
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    return readStats(req)
  }
  if (req.method !== 'POST') {
    return new Response(null, { status: 405, headers: { allow: 'GET, POST' } })
  }
  return recordConversion(req)
}

async function recordConversion(req: Request): Promise<Response> {
  const allowedOrigins = resolveAllowedOrigins({
    URL: process.env.URL,
    DEPLOY_PRIME_URL: process.env.DEPLOY_PRIME_URL,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  })
  if (
    !isAllowedSource(
      { origin: req.headers.get('origin'), referer: req.headers.get('referer') },
      allowedOrigins,
    )
  ) {
    return json({ error: 'forbidden' }, 403)
  }

  const store = getStatsStore()
  const now = new Date()

  const rateLimit = parsePositiveInt(process.env.STATS_RATE_LIMIT, 60)
  const rateKey = `rate/${minuteBucketKey(now)}`
  const rateEntry = (await readCount(store, rateKey)) ?? { requests: 0 }
  if ((rateEntry.requests ?? 0) >= rateLimit) {
    return new Response(null, { status: 429 })
  }

  const dayKey = `${DAY_KEY_PREFIX}${dayBucketKey(now)}`
  const dayEntry = (await readCount(store, dayKey)) ?? { conversions: 0 }
  const totalEntry = (await readCount(store, 'total')) ?? { conversions: 0 }

  await store.setJSON(rateKey, { requests: (rateEntry.requests ?? 0) + 1 })
  await store.setJSON(dayKey, { conversions: (dayEntry.conversions ?? 0) + 1 })
  await store.setJSON('total', { conversions: (totalEntry.conversions ?? 0) + 1 })
  return new Response(null, { status: 204 })
}

async function readStats(req: Request): Promise<Response> {
  const expectedToken = process.env.STATS_TOKEN
  if (!expectedToken) {
    return json({ error: 'stats unavailable' }, 404)
  }
  const providedToken = new URL(req.url).searchParams.get('token') ?? ''
  if (providedToken !== expectedToken) {
    return json({ error: 'stats unavailable' }, 404)
  }

  const store = getStatsStore()
  const total = (await readCount(store, 'total'))?.conversions ?? 0
  const days: Record<string, number> = {}
  for await (const page of store.list({ prefix: DAY_KEY_PREFIX, paginate: true })) {
    for (const blob of page.blobs) {
      const entry = await readCount(store, blob.key)
      days[blob.key.slice(DAY_KEY_PREFIX.length)] = entry?.conversions ?? 0
    }
  }
  return json({ total, days }, 200)
}
