# Steam: Featured Artwork Upload (`630px` workflow)

Checked on March 1, 2026.

## Related guides
- General docs: `information/information.md`
- Workshop guide: `information/workshop_showcase.md`
- Header hex-edit guide: `information/hex_edit_header.md`

## Goal
Upload one wide artwork/GIF and place it into **Featured Artwork Showcase**.

## Requirements
- Steam profile level 10+ (or an extra showcase slot from Points Shop).
- One final GIF prepared for featured artwork.
- Recommended width: **630 px** (height can vary, keep aspect ratio).

## Autofill JS files
- Featured upload autofill: `autofill/steam_upload_autofill_featured.js`
- Workshop upload autofill: `autofill/steam_upload_autofill_workshop.js`

## 1) Generate featured GIF from video (local pipeline)
Use the featured preset in this repo:

```bash
python video_parts_pipeline.py --input .\media\art3.mp4 --preset featured
```

Default output:
- `.\media\art3\output\featured.gif`

Preset behavior:
- width: `630px`
- size policy: max `4500 KB`, target `4500 KB`
- minimum FPS: `15` (from `.env` -> `GIF_MIN_FPS`)
- automatic hex patch: last byte `0x21`

## 2) Upload as Artwork (not Workshop)
1. Open artwork upload page (browser, logged in):  
   `https://steamcommunity.com/sharedfiles/edititem/767/3/`
2. Give the artwork a title (or run `autofill/steam_upload_autofill_featured.js` in DevTools Console).
3. Select `featured.gif`.
4. Open DevTools Console (`F12`) and run:
   ```js
   document.getElementsByName("image_width")[0].value=1000;document.getElementsByName("image_height")[0].value=1;
   ```
5. Check certification box, set visibility to `Public`, click `Save and Continue`.

## 3) Put it in Featured Artwork Showcase
1. Go to profile -> `Edit Profile` -> `Featured Showcase`.
2. Add `Featured Artwork Showcase`.
3. Select the uploaded artwork item (it appears like a horizontal line in selection).
4. Save.

## Command examples
```bash
# Featured default
python video_parts_pipeline.py --input .\media\my_video.mp4 --preset featured

# Featured with custom fps and output folder
python video_parts_pipeline.py --input .\media\my_video.mp4 --preset featured --gif-fps 15 --out-dir .\media\my_video\featured_output

# Featured with custom size limits (override defaults)
python video_parts_pipeline.py --input .\media\my_video.mp4 --preset featured --max-gif-kb 4500 --target-gif-kb 4500
```

## Notes
- Do **not** use the workshop conversion command (`consumer_app_id=480`, `file_type=0`) for featured artwork uploads.
- For this featured flow, upload as normal **Artwork** and use the `image_width/image_height` console line above.
- Script fails fast if `--gif-fps` is below `.env` `GIF_MIN_FPS` or if final output is still above max KB.
