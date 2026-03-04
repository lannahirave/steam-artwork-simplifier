# Steam Artwork Docs (Legacy CLI Notes)

Checked on March 4, 2026.

This `information/` folder documents the legacy Python CLI path.
For the current browser app, use:

- root `README.md`
- `web/README.md`
- `docs/README.md`

## Legacy scripts

- `video_parts_pipeline.py`
- `steam_hex_patch.py`
- `steam_hex_edit_header.py`
- `autofill/steam_upload_autofill_workshop.js`
- `autofill/steam_upload_autofill_featured.js`

## Browser app quick start (primary workflow)

```bash
cd .\web
npm install
npm run dev
```

Required headers for conversion runtime:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

## Legacy CLI quick start

```bash
python video_parts_pipeline.py --input .\media\my_video.mp4 --preset workshop
python video_parts_pipeline.py --input .\media\my_video.mp4 --preset featured
```

## Legacy env notes

CLI scripts read `.env` defaults, with CLI args taking priority.
