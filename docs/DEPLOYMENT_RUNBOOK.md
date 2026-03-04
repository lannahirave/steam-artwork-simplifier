# Deployment Runbook

## Target

Netlify production deployment from `web/dist`, triggered automatically on push to `main`.

## Prerequisites

1. Node.js 20+
2. npm
3. Netlify site connected to this GitHub repository
4. Netlify production branch set to `main`

## Local Build and Test

From `web/`:

```bash
npm install
npm run build
npm run test -- --run
```

## Production Deploy (Automatic)

Production deploy happens automatically when commits land on `main`.

Repository config for Netlify:

- `netlify.toml`
  - `base = "web"`
  - `command = "npm run build"`
  - `publish = "dist"`

## Required Runtime Headers

Defined in `web/public/_headers`:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

Without these headers, the app blocks conversion and shows isolation guidance.

## Verification Checklist

1. Push to `main`.
2. Wait for Netlify production deploy to complete.
3. Open production URL.
4. Confirm app loads without isolation error.
5. Run a featured conversion on a small fixture.
6. Run workshop conversion and confirm 5 outputs + ZIP.
7. Check response headers:

```bash
curl -I https://<your-netlify-site>.netlify.app
```

## Optional Manual Deploy (Fallback)

If Netlify auto deploy is unavailable, deploy from Netlify UI or CLI using the same build/publish settings from `netlify.toml`.

## Rollback

Rollback is commit-based:

1. Revert `main` to a known-good commit (or create a revert commit).
2. Push to `main`.
3. Netlify auto-deploys the reverted state.

## Common Operational Issues

1. Missing COOP/COEP headers:
   - ensure `web/public/_headers` is present and deployed
2. Wrong folder deployed:
   - ensure `netlify.toml` uses `base = "web"` and `publish = "dist"`
3. Stale asset behavior:
   - force reload browser cache after deploy
