# Deployment Runbook

## Deployment Targets

1. Netlify (primary production path)
2. Cloudflare Worker assets (optional/fallback)

## Prerequisites

- Node.js 20+
- npm
- Successful local build from `web/`

## Local Verification Before Deploy

From `web/`:

```bash
npm install
npm run build
npm run test
```

## Netlify (Primary)

Production deploy is automatic on push to `main`.

Root `netlify.toml` settings:

- `base = "web"`
- `command = "npm run build"`
- `publish = "dist"`

### Netlify setup checklist

1. Connect repository to Netlify.
2. Set production branch to `main`.
3. Confirm build base is `web` and publish is `dist`.

### Netlify deployment flow

1. Merge/push to `main`.
2. Wait for Netlify production deploy completion.
3. Open production URL.
4. Validate conversion works (not just page load).

## Cloudflare Worker (Optional)

Cloudflare config:

- `web/wrangler.toml`
- `web/cloudflare/worker.ts`

Deploy command:

```bash
cd web
npm run deploy
```

This builds app and deploys Wrangler worker serving `dist` assets.

## Required Runtime Headers

Conversion requires cross-origin isolation:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

For Cloudflare path, worker injects them.
For any host, ensure headers are present on HTML and assets.

## Production Verification Checklist

1. App loads without isolation blocking screen.
2. Convert one small source with `Featured Showcase`.
3. Convert one source with `Workshop Showcase` and verify multi-output strip.
4. Confirm `Download all (ZIP archive)` works.
5. Confirm output file naming is source-based (`<source>_...`).
6. Confirm Steam helper links are clickable and correct.

## Rollback

Use commit-level rollback:

1. Revert to known-good commit on `main`.
2. Push revert commit.
3. Netlify auto-redeploys reverted state.

## Common Deployment Issues

1. Wrong folder deployed:
   - verify Netlify base/publish values from `netlify.toml`
2. Isolation blocked in production:
   - verify COOP/COEP headers on responses
3. Site updated but behavior stale:
   - hard refresh and clear cache
4. Build succeeds locally but fails in CI:
   - match Node.js version and run `npm ci`/`npm install` cleanly
