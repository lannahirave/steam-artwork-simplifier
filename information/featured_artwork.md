# Steam: Featured Artwork Upload (Legacy CLI Guide)

Checked on March 4, 2026.

For browser app usage, prefer Guides tab + Steam Helpers tab in the web app.
This file documents legacy CLI/manual flow.

## Goal

Create one wide GIF and upload as Artwork/Featured Artwork.

## Upload URL

- Artwork / Featured upload page: `https://steamcommunity.com/sharedfiles/edititem/767/3/#`

## Legacy conversion command

```bash
python video_parts_pipeline.py --input .\media\my_video.mp4 --preset featured
```

## Legacy autofill

- `autofill/steam_upload_autofill_featured.js`

## Typical manual field values

- `image_width = 1000`
- `image_height = 1`

## Notes

- Use artwork upload flow, not workshop file_type flow.
- Check terms/visibility before final submit.
