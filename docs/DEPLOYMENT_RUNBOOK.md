# Deployment Runbook

## Target

Cloudflare Workers static assets deployment from `web/dist`, with header injection for cross-origin isolation.

## Prerequisites

1. Node.js 20+
2. npm
3. Cloudflare account with Worker deploy permissions
4. Wrangler auth (`npx wrangler whoami` succeeds)

## Local Build and Test

From `web/`:

```bash
npm install
npm run build
npm run test -- --run
```

## Deploy

From `web/`:

```bash
npm run deploy
```

`deploy` runs:

1. `npm run build`
2. `npx wrangler deploy`

## Cloudflare Config

`web/wrangler.toml`:

- `main = "cloudflare/worker.ts"`
- static assets directory: `./dist`
- `run_worker_first = true`
- SPA fallback: `not_found_handling = "single-page-application"`

## Required Runtime Headers

Injected in `web/cloudflare/worker.ts`:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

Without these headers, the app blocks conversion and shows isolation guidance.

## Verification Checklist

1. Open deployment URL.
2. Confirm app loads without isolation error.
3. Run a featured conversion on a small fixture.
4. Run workshop conversion and confirm 5 outputs + ZIP.
5. Check response headers:

```bash
curl -I https://<your-worker>.workers.dev
```

## Rollback

Use Wrangler to redeploy a previous known-good commit state from git history.

Recommended safe rollback process:

1. `git checkout <known-good-commit>`
2. `cd web`
3. `npm run deploy`
4. return to main branch after deploy

## Common Operational Issues

1. Missing COOP/COEP headers:
   - ensure `run_worker_first = true` in `wrangler.toml`
2. Stale asset behavior:
   - force reload browser cache after deploy
3. Local dev worker import cache glitches:
   - start dev server with `npm run dev -- --force`
