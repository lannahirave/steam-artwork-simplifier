# Steam: Workshop Showcase Upload (Legacy CLI Guide)

Checked on March 4, 2026.

For the browser app workflow, use the Guides tab and `web/README.md`.
This file is only for legacy CLI + manual upload flow.

## Goal

Upload GIF assets to Steam Workshop and place them in Workshop Showcase sections.

## Upload URL

- Workshop upload page: `https://steamcommunity.com/sharedfiles/editguide/?appid=760`

## Legacy autofill

- `autofill/steam_upload_autofill_workshop.js`

## Legacy conversion command

```bash
python video_parts_pipeline.py --input .\media\my_video.mp4 --preset workshop
```

Default legacy workshop behavior:

- 5 parts
- 150px per part
- max/target typically 5000/4500 KB (from env/defaults)

## Notes

- Ensure Steam Workshop legal agreement is accepted.
- Verify visibility settings if items do not appear in showcase.
