# Steam Artwork Toolkit

Steam artwork conversion toolkit with two paths:

- Browser app (`web/`) for conversion, patching, previews, and Steam helper snippets
- Legacy Python CLI scripts in repo root for local ffmpeg-based workflows

The browser app is the primary workflow.

## Web App (`web/`)

Stack:

- React 19 + TypeScript + Vite
- `ffmpeg.wasm` in Web Workers
- ZIP export with `jszip`

### Current presets

- `Workshop Showcase` (default): 5 horizontal slices, default width `150` each
- `Featured Showcase`: single wide GIF, default width `630`
- `Artwork Showcase`: fixed split outputs `506 + 100`
- `Guide`: single fixed square `195x195`

### Output naming

All conversion outputs use source filename base:

- Workshop/Showcase splits: `<originalFileName>_part_01.gif`, `_part_02.gif`, ...
- Featured: `<originalFileName>_featured.gif`
- Guide: `<originalFileName>_guide.gif`
- ZIP archive: `<originalFileName>.zip`

### Size defaults

- Workshop: `max=5000KB`, `target=4500KB`
- Featured: `max=4500KB`, `target=4500KB`
- Artwork Showcase: `max=5000KB`, `target=4500KB`
- Guide: `max=2000KB`, `target=2000KB`

If files still exceed max size, results are still shown and downloadable with warnings.

### Steam upload helper links

- Workshop upload page: `https://steamcommunity.com/sharedfiles/editguide/?appid=760`
- Artwork / Featured / Screenshot upload page: `https://steamcommunity.com/sharedfiles/edititem/767/3/#`

## Quick Start (Web App)

```bash
cd web
npm install
npm run dev
```

Build production bundle:

```bash
npm run build
```

## Cross-Origin Isolation (Required)

Conversion requires these headers:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

Local dev/preview already sets them in `web/vite.config.ts`.

## Deployment

### Netlify (auto deploy)

`netlify.toml` is configured to build from `web/` and publish `dist/`.
Production deploy runs on push to `main`.

### Cloudflare Workers (optional)

`web/wrangler.toml` + `web/cloudflare/worker.ts` are configured to serve `web/dist` and inject required COOP/COEP headers.

Deploy command:

```bash
cd web
npm run deploy
```

## Legacy Python CLI (still available)

Scripts:

- `video_parts_pipeline.py`
- `steam_hex_patch.py`
- `steam_hex_edit_header.py`

Example:

```bash
python video_parts_pipeline.py --input .\media\my_video.mp4 --preset workshop
```

## Documentation Map

- Web app usage: `web/README.md`
- Deep docs index: `docs/README.md`
- Legacy notes: `information/information.md`

## License

MIT. See `LICENSE`.
