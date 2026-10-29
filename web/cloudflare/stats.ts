// Aggregate-only conversion counter for the Steam Artwork Simplifier.
//
// POST /api/track  -> increments the per-day conversion counter in D1.
//                     No request body is read; no IP, user agent, or session
//                     identifier is stored.
// GET  /api/stats with `Authorization: Bearer <STATS_TOKEN>` -> returns per-day
//                     counts and their total. The token is not accepted in the
//                     URL, so it stays out of browser history and request logs.
//
// Hardening:
// - Origin/Referer allowlist from ALLOWED_ORIGINS. Requests with no origin
//   hint fail closed, which stops browsers on other sites from sending beacons.
//   Scripts can forge these headers, so the rate limit and daily caps below are
//   what bound abuse.
// - Per-visitor burst limit through the optional TRACK_LIMITER rate limiting
//   binding, keyed on the client IP. Counters live in Cloudflare's memory, not
//   in D1.
// - Per-visitor daily cap (STATS_VISITOR_DAILY_LIMIT, default 300). The visitor
//   is identified by SHA-256(daily random salt + IP). The salt and the visitor
//   rows are deleted once the day is over, so past days cannot be linked to an
//   IP, even by the operator.
// - Global daily cap (STATS_DAILY_LIMIT, default 20000) as the backstop against
//   floods spread across many IPs. A beacon writes about 2 D1 rows, plus about
//   2 per new visitor per day, so this keeps worst-case writes under the D1
//   free plan's 100k rows per day.
// - Caps are checked with a read before any write, so rejected requests write
//   nothing to the counters.
// - D1 failures (missing table, exhausted quota) return 503 instead of an
//   unhandled exception.
//
// Increments are atomic upserts, but the cap checks are read-then-write, so
// the caps can be overshot slightly under concurrency.

import { dayBucketKey, isAllowedSource, parsePositiveInt, resolveAllowedOrigins } from '../src/lib/statsGuard'

/** The subset of the D1 binding API this handler uses. */
export interface D1PreparedStatement {
  bind: (...values: unknown[]) => D1PreparedStatement
  first: <T = Record<string, unknown>>() => Promise<T | null>
  all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>
}

export interface D1Database {
  prepare: (query: string) => D1PreparedStatement
  batch: (statements: D1PreparedStatement[]) => Promise<unknown[]>
}

/** The Workers rate limiting binding. */
export interface RateLimiter {
  limit: (options: { key: string }) => Promise<{ success: boolean }>
}

export interface StatsEnv {
  DB: D1Database
  TRACK_LIMITER?: RateLimiter
  ALLOWED_ORIGINS?: string
  STATS_TOKEN?: string
  STATS_DAILY_LIMIT?: string
  STATS_VISITOR_DAILY_LIMIT?: string
}

const DAY_KEY_PREFIX = 'day/'
const VISITOR_KEY_PREFIX = 'visitor/'

const INCREMENT_SQL = 'INSERT INTO counters (key, n) VALUES (?1, 1) ON CONFLICT(key) DO UPDATE SET n = n + 1'

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** True for the paths this handler owns. */
export function isStatsPath(pathname: string): boolean {
  return pathname === '/api/track' || pathname === '/api/stats'
}

export async function handleStats(req: Request, env: StatsEnv): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(null, { status: 405, headers: { allow: 'GET, POST' } })
  }
  try {
    return req.method === 'GET' ? await readStats(req, env) : await recordConversion(req, env)
  } catch {
    return json({ error: 'unavailable' }, 503)
  }
}

/** Compare SHA-256 digests in constant time, so response timing does not leak the token. */
async function tokensMatch(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  const left = new Uint8Array(a)
  const right = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i] ^ right[i]
  }
  return diff === 0
}

/** Today's random salt, created on first use. Older salts are deleted after each counted beacon. */
async function dailySalt(db: D1Database, day: string): Promise<string> {
  const select = db.prepare('SELECT salt FROM salts WHERE day = ?1').bind(day)
  const existing = await select.first<{ salt: string }>()
  if (existing) {
    return existing.salt
  }
  const fresh = toHex(crypto.getRandomValues(new Uint8Array(32)).buffer)
  // OR IGNORE: when two requests race, both end up using the first stored salt.
  await db.batch([db.prepare('INSERT OR IGNORE INTO salts (day, salt) VALUES (?1, ?2)').bind(day, fresh)])
  return (await select.first<{ salt: string }>())?.salt ?? fresh
}

async function recordConversion(req: Request, env: StatsEnv): Promise<Response> {
  const allowedOrigins = resolveAllowedOrigins({ ALLOWED_ORIGINS: env.ALLOWED_ORIGINS })
  if (
    !isAllowedSource(
      { origin: req.headers.get('origin'), referer: req.headers.get('referer') },
      allowedOrigins,
    )
  ) {
    return json({ error: 'forbidden' }, 403)
  }

  // Cloudflare always sets this in production. The IP is only hashed, never stored.
  const ip = req.headers.get('cf-connecting-ip') ?? ''
  if (env.TRACK_LIMITER && !(await env.TRACK_LIMITER.limit({ key: `track:${ip}` })).success) {
    return new Response(null, { status: 429 })
  }

  const day = dayBucketKey(new Date())
  const dayKey = `${DAY_KEY_PREFIX}${day}`
  const salt = await dailySalt(env.DB, day)
  const visitorHash = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`)))
  const visitorKey = `${VISITOR_KEY_PREFIX}${day}/${visitorHash.slice(0, 32)}`

  const { results } = await env.DB.prepare('SELECT key, n FROM counters WHERE key IN (?1, ?2)')
    .bind(dayKey, visitorKey)
    .all<{ key: string; n: number }>()
  const current = new Map(results.map((row) => [row.key, row.n]))
  if (
    (current.get(dayKey) ?? 0) >= parsePositiveInt(env.STATS_DAILY_LIMIT, 20000) ||
    (current.get(visitorKey) ?? 0) >= parsePositiveInt(env.STATS_VISITOR_DAILY_LIMIT, 300)
  ) {
    return new Response(null, { status: 429 })
  }

  const increment = env.DB.prepare(INCREMENT_SQL)
  await env.DB.batch([
    increment.bind(dayKey),
    increment.bind(visitorKey),
    // Earlier days' visitor rows and salts are never read again.
    env.DB.prepare('DELETE FROM counters WHERE key >= ?1 AND key < ?2').bind(
      VISITOR_KEY_PREFIX,
      `${VISITOR_KEY_PREFIX}${day}`,
    ),
    env.DB.prepare('DELETE FROM salts WHERE day < ?1').bind(day),
  ])
  return new Response(null, { status: 204 })
}

async function readStats(req: Request, env: StatsEnv): Promise<Response> {
  const expectedToken = env.STATS_TOKEN
  if (!expectedToken) {
    return json({ error: 'stats unavailable' }, 404)
  }
  const authorization = req.headers.get('authorization') ?? ''
  const providedToken = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : ''
  if (!(await tokensMatch(providedToken, expectedToken))) {
    return json({ error: 'stats unavailable' }, 404)
  }

  const { results } = await env.DB.prepare(
    "SELECT key, n FROM counters WHERE key LIKE 'day/%' ORDER BY key",
  ).all<{ key: string; n: number }>()

  let total = 0
  const days: Record<string, number> = {}
  for (const row of results) {
    days[row.key.slice(DAY_KEY_PREFIX.length)] = row.n
    total += row.n
  }
  return json({ total, days }, 200)
}
