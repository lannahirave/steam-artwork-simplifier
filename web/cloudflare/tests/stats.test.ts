// @vitest-environment node
// Unit tests for the site stats routes. D1 is replaced with an in-memory
// node:sqlite database running the real migration, so the tests pin the
// hardening behavior (fail-closed origin guard, per-visitor burst limit and
// daily cap, global daily cap, daily salt rotation, token-protected stats
// read) against real SQL.

import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  handleStats,
  isStatsPath,
  type D1Database,
  type D1PreparedStatement,
  type RateLimiter,
  type StatsEnv,
} from '../stats'

const ORIGIN = 'https://artworkstudio.lannahirave.com'
const MIGRATION = readFileSync(new URL('../../migrations/0001_counters.sql', import.meta.url), 'utf-8')

function fakeD1(db: DatabaseSync): D1Database {
  const statement = (query: string, values: unknown[] = []): D1PreparedStatement & { run: () => void } => ({
    bind: (...next: unknown[]) => statement(query, next),
    first: async <T,>() => (db.prepare(query).get(...(values as never[])) ?? null) as T | null,
    all: async <T,>() => ({ results: db.prepare(query).all(...(values as never[])) as T[] }),
    run: () => {
      db.prepare(query).run(...(values as never[]))
    },
  })
  return {
    prepare: (query) => statement(query),
    // Like D1, a batch is one transaction that rolls back entirely on failure.
    batch: async (statements) => {
      db.exec('BEGIN')
      try {
        for (const stmt of statements) {
          ;(stmt as ReturnType<typeof statement>).run()
        }
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      db.exec('COMMIT')
      return []
    },
  }
}

let db: DatabaseSync
let env: StatsEnv

function counter(key: string): number | undefined {
  return (db.prepare('SELECT n FROM counters WHERE key = ?').get(key) as { n: number } | undefined)?.n
}

function keys(): string[] {
  return (db.prepare('SELECT key FROM counters ORDER BY key').all() as { key: string }[]).map((row) => row.key)
}

function visitorKeys(): string[] {
  return keys().filter((key) => key.startsWith('visitor/'))
}

function allowedOriginRequest(method: 'GET' | 'POST' | 'DELETE', url: string, ip = '203.0.113.7'): Request {
  return new Request(`${ORIGIN}${url}`, { method, headers: { origin: ORIGIN, 'cf-connecting-ip': ip } })
}

function track(ip?: string): Promise<Response> {
  return handleStats(allowedOriginRequest('POST', '/api/track', ip), env)
}

function setNow(iso: string): void {
  vi.useFakeTimers({ now: new Date(iso), toFake: ['Date'] })
}

beforeEach(() => {
  vi.useRealTimers()
  db = new DatabaseSync(':memory:')
  db.exec(MIGRATION)
  env = { DB: fakeD1(db), ALLOWED_ORIGINS: ORIGIN }
})

describe('isStatsPath', () => {
  it('matches only the stats routes', () => {
    expect(isStatsPath('/api/track')).toBe(true)
    expect(isStatsPath('/api/stats')).toBe(true)
    expect(isStatsPath('/api/other')).toBe(false)
    expect(isStatsPath('/')).toBe(false)
  })
})

describe('POST /api/track', () => {
  it('increments the day counter and a hashed visitor counter', async () => {
    setNow('2026-10-28T12:34:56Z')

    const response = await track()

    expect(response.status).toBe(204)
    expect(counter('day/2026-10-28')).toBe(1)
    const [visitor] = visitorKeys()
    expect(visitor).toMatch(/^visitor\/2026-10-28\/[0-9a-f]{32}$/)
    expect(visitor).not.toContain('203.0.113.7')
  })

  it('adds to the previous stored values', async () => {
    setNow('2026-10-28T12:00:00Z')
    db.exec("INSERT INTO counters (key, n) VALUES ('day/2026-10-28', 30)")

    await track()
    await track()

    expect(counter('day/2026-10-28')).toBe(32)
  })

  it('accepts a Referer from an allowed origin when Origin is missing', async () => {
    const request = new Request(`${ORIGIN}/api/track`, {
      method: 'POST',
      headers: { referer: `${ORIGIN}/uk/`, 'cf-connecting-ip': '203.0.113.7' },
    })

    const response = await handleStats(request, env)

    expect(response.status).toBe(204)
  })

  it('rejects cross-site origins without touching the database', async () => {
    const request = new Request(`${ORIGIN}/api/track`, {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    })

    const response = await handleStats(request, env)

    expect(response.status).toBe(403)
    expect(keys()).toEqual([])
  })

  it('fails closed when the request sends no origin hints', async () => {
    const response = await handleStats(new Request(`${ORIGIN}/api/track`, { method: 'POST' }), env)

    expect(response.status).toBe(403)
    expect(keys()).toEqual([])
  })

  it('fails closed when the allowlist is not configured', async () => {
    env.ALLOWED_ORIGINS = ''

    const response = await track()

    expect(response.status).toBe(403)
    expect(keys()).toEqual([])
  })

  it('returns 503 when the database is unavailable', async () => {
    db.exec('DROP TABLE counters')

    const response = await track()

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
  })
})

describe('per-visitor limits', () => {
  it('blocks a visitor rejected by the burst limiter without writing anything', async () => {
    const limit = vi.fn<RateLimiter['limit']>().mockResolvedValue({ success: false })
    env.TRACK_LIMITER = { limit }

    const response = await track('198.51.100.9')

    expect(response.status).toBe(429)
    expect(limit).toHaveBeenCalledWith({ key: 'track:198.51.100.9' })
    expect(keys()).toEqual([])
  })

  it('counts normally when the burst limiter allows the request', async () => {
    env.TRACK_LIMITER = { limit: vi.fn<RateLimiter['limit']>().mockResolvedValue({ success: true }) }

    expect((await track()).status).toBe(204)
  })

  it('applies the per-visitor daily cap to that visitor only', async () => {
    setNow('2026-10-28T12:00:00Z')
    env.STATS_VISITOR_DAILY_LIMIT = '2'

    const statuses = []
    for (let i = 0; i < 3; i += 1) {
      statuses.push((await track('198.51.100.9')).status)
    }
    const otherVisitor = (await track('192.0.2.44')).status

    expect(statuses).toEqual([204, 204, 429])
    expect(otherVisitor).toBe(204)
    expect(counter('day/2026-10-28')).toBe(3)
  })

  it('reuses the salt within a day and rotates it the next day', async () => {
    setNow('2026-10-28T12:00:00Z')
    await track()
    await track()
    const firstDay = visitorKeys()

    setNow('2026-10-29T00:00:05Z')
    await track()

    expect(firstDay).toHaveLength(1)
    const salts = db.prepare('SELECT day FROM salts').all() as { day: string }[]
    expect(salts).toEqual([{ day: '2026-10-29' }])
    const secondDay = visitorKeys()
    expect(secondDay).toHaveLength(1)
    expect(secondDay[0].split('/')[2]).not.toBe(firstDay[0].split('/')[2])
  })

  it('deletes earlier days of visitor rows but keeps the day counters', async () => {
    setNow('2026-10-28T12:00:00Z')
    await track()

    setNow('2026-10-29T08:00:00Z')
    await track()

    expect(keys().filter((key) => key.startsWith('day/'))).toEqual(['day/2026-10-28', 'day/2026-10-29'])
    expect(visitorKeys().every((key) => key.startsWith('visitor/2026-10-29/'))).toBe(true)
  })
})

describe('global daily cap', () => {
  it('blocks every visitor once the day is full, without writing anything', async () => {
    setNow('2026-10-28T12:00:00Z')
    env.STATS_DAILY_LIMIT = '5'
    db.exec("INSERT INTO counters (key, n) VALUES ('day/2026-10-28', 5)")

    const response = await track('192.0.2.44')

    expect(response.status).toBe(429)
    expect(keys()).toEqual(['day/2026-10-28'])
    expect(counter('day/2026-10-28')).toBe(5)
  })
})

describe('GET /api/stats', () => {
  it('is unavailable without STATS_TOKEN', async () => {
    const response = await handleStats(allowedOriginRequest('GET', '/api/stats?token=secret'), env)

    expect(response.status).toBe(404)
  })

  it('returns the day counters and their total, without visitor rows', async () => {
    env.STATS_TOKEN = 'secret'
    db.exec(
      "INSERT INTO counters (key, n) VALUES ('day/2026-10-06', 15), ('day/2026-10-07', 26), ('visitor/2026-10-07/abc', 3)",
    )

    const response = await handleStats(allowedOriginRequest('GET', '/api/stats?token=secret'), env)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      total: 41,
      days: { '2026-10-06': 15, '2026-10-07': 26 },
    })
  })

  it('rejects the wrong token', async () => {
    env.STATS_TOKEN = 'secret'

    const response = await handleStats(allowedOriginRequest('GET', '/api/stats?token=nope'), env)

    expect(response.status).toBe(404)
  })
})

describe('other methods', () => {
  it('responds 405 without touching the database', async () => {
    const response = await handleStats(allowedOriginRequest('DELETE', '/api/track'), env)

    expect(response.status).toBe(405)
    expect(keys()).toEqual([])
  })
})
