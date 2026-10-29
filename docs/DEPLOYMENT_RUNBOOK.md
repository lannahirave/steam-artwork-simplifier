# Deployment Runbook

## Deployment Targets

1. Cloudflare Worker with static assets (production, `artworkstudio.lannahirave.com`)
2. Netlify (legacy): builds from the `netlify` branch only, until it becomes a redirect.

## Prerequisites

- Node.js 22.13+ or 23.4+ (the Worker stats tests use `node:sqlite` without a flag)
- npm
- Successful local build from `web/`

## Local Verification Before Deploy

From `web/`:

```bash
npm install
npm run build
npm run test
```

## Cloudflare Worker

Cloudflare config:

- `web/wrangler.toml`
- `web/cloudflare/worker.ts`: serves `dist` assets with COOP/COEP headers and routes the
  stats endpoints
- `web/cloudflare/stats.ts`: `POST /api/track` and `GET /api/stats`
- `web/migrations/`: D1 schema for the stats counters

Deploy command:

```bash
cd web
npm run deploy
```

This builds the app and deploys the Worker serving `dist` assets.

The `routes` entry in `web/wrangler.toml` attaches the Worker to `artworkstudio.lannahirave.com`
as a custom domain. On deploy, Wrangler creates the DNS record and certificate (the
`lannahirave.com` zone is in the same Cloudflare account). `workers_dev = false` keeps the site off
`*.workers.dev`.

### Stats endpoint setup (one time)

The conversion counter stores per-day counts in D1; `/api/stats` adds them up for the total.
For the per-visitor daily cap it also keeps, for the current UTC day only, a count per
SHA-256 hash of (random daily salt + IP). Raw IPs are never stored, and the salt and visitor
rows are deleted once the day is over.

1. Create the database: `npx wrangler d1 create steam-artwork-stats`.
   Add the printed `database_id` to the `[[d1_databases]]` block in `web/wrangler.toml` and
   commit it (it is not secret). Done for production: the id is in `web/wrangler.toml`.
2. Apply the schema: `npx wrangler d1 migrations apply steam-artwork-stats --remote`.
   Done for production (`0001_counters.sql`); rerun after adding a migration.
3. Set the stats read token: `npx wrangler secret put STATS_TOKEN`.
4. Check `ALLOWED_ORIGINS` in `web/wrangler.toml` lists every production origin.
   Beacons from any other origin get `403`.
5. Carry over the Netlify counts: D1 starts at zero. Read `GET /api/stats?token=…` on the
   Netlify site at cutover and add its `days` to D1 as `day/YYYY-MM-DD` rows with
   `INSERT INTO counters (key, n) VALUES (…) ON CONFLICT(key) DO UPDATE SET n = n + excluded.n`.
   Netlify's separate `total` is not imported; D1 derives the total from the days.

Limits on counted beacons:

- `TRACK_LIMITER` (`[[ratelimits]]` in `web/wrangler.toml`): 10 per minute per IP, kept in
  Cloudflare's memory (approximate, per Cloudflare location). Optional: if the binding is not
  available, the other limits still apply.
- `STATS_VISITOR_DAILY_LIMIT` (default 300): per visitor per UTC day.
- `STATS_DAILY_LIMIT` (default 20000): for everyone per UTC day. It is the backstop against
  floods spread over many IPs and keeps worst-case writes under the D1 free plan's 100k rows
  per day.

Visitors behind a shared IP (mobile networks, offices) share the per-visitor limits.
If the database is missing or over quota, the stats routes return `503`; the app ignores the
result.

Read the counters with the token in a header (the URL form `?token=` is not accepted):

```
curl -H "Authorization: Bearer <STATS_TOKEN>" https://artworkstudio.lannahirave.com/api/stats
```

### Local Worker run

1. Create `web/.dev.vars` (gitignored):
   ```
   ALLOWED_ORIGINS=http://localhost:8787
   STATS_TOKEN=local-test
   ```
2. `npm run build`
3. `npx wrangler d1 migrations apply steam-artwork-stats --local`
4. `npx wrangler dev`

## Required Runtime Headers

Conversion requires cross-origin isolation:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

For Cloudflare path, worker injects them.
For any host, ensure headers are present on HTML and assets.

## License Compliance

Deployments must keep these static files publicly reachable:

1. `/LICENSE.txt`
2. `/THIRD_PARTY_NOTICES.txt`
3. `/SOURCE.txt`

`/SOURCE.txt` must point to the canonical corresponding source repository:

`https://github.com/lannahirave/steam-artwork-simplifier`

## Production Verification Checklist

1. App loads without isolation blocking screen.
2. Convert one small source with `Featured Showcase`.
3. Convert one source with `Workshop Showcase` and verify multi-output strip.
4. Confirm `Download all (ZIP archive)` works.
5. Confirm output file naming is source-based (`<source>_...`).
6. Confirm Steam helper links are clickable and correct.
7. Confirm `/LICENSE.txt` returns `200`.
8. Confirm `/THIRD_PARTY_NOTICES.txt` returns `200`.
9. Confirm `/SOURCE.txt` returns `200` and points to the canonical source URL.

## Rollback

Use commit-level rollback:

1. Revert to known-good commit on `main`.
2. Push revert commit.
3. Redeploy with `npm run deploy` from `web/`, or wait for the Cloudflare Git build.

## Common Deployment Issues

1. Wrong folder deployed:
   - verify `[assets] directory = "./dist"` in `web/wrangler.toml`
2. Isolation blocked in production:
   - verify COOP/COEP headers on responses
3. Site updated but behavior stale:
   - hard refresh and clear cache
4. `/api/track` returns `403` in production:
   - add the site origin to `ALLOWED_ORIGINS` in `web/wrangler.toml`
5. Build succeeds locally but fails in CI:
   - match Node.js version and run `npm ci`/`npm install` cleanly
