# Steam: Upload Art for `Workshop Showcase`

Checked on March 1, 2026.

## What you need
- A Steam account logged in via web browser.
- A showcase slot on your profile (commonly unlocked at profile level 10, or via Points Shop additional showcase slot).
- Your image/GIF files ready.

## Fast workflow (Workshop Showcase)
1. Accept Steam Workshop legal terms first:  
   `https://steamcommunity.com/sharedfiles/workshoplegalagreement`
2. Open the Steam upload form:  
   `https://steamcommunity.com/sharedfiles/edititem/767/3/`
3. Open browser DevTools console (`F12` -> `Console`) and run:
   ```js
   $J('[name=consumer_app_id]').val(480);$J('[name=file_type]').val(0);$J('[name=visibility]').val(0);
   ```
4. Upload your file, set title/preview, tick the certification checkbox, then click `Save and Continue`.
5. Go to Steam profile -> `Edit Profile` -> `Featured Showcase`.
6. Add or edit `Workshop Showcase` (or `My Workshop Showcase`) and pick the uploaded item(s).
7. Save profile changes.

## Local automation (this repo)
- Script: `video_parts_pipeline.py`
- Input: one video file (for example `media/art3.mp4`)
- Output: one folder with final GIFs only, at `media/<file_name>/output/`
- It creates 5 GIF parts by default.
- Each part is **150px wide**; height is auto-calculated to preserve aspect ratio.
- If a GIF is over **5000 KB**, script recompresses it and targets **4500 KB**.
- HEX step is automatic: final byte is patched to `0x21` for each output GIF.
- Defaults are loaded from `.env` in repo root.

### Command examples
```bash
# Default (5 parts, 150px width, 15 fps, auto size handling + hex patch)
python video_parts_pipeline.py --input .\media\art3.mp4

# Custom settings
python video_parts_pipeline.py --input .\media\art3.mp4 --parts 5 --part-width 150 --gif-fps 12

# Custom output directory
python video_parts_pipeline.py --input .\media\art3.mp4 --out-dir .\media\art3\output_custom
```

### `.env` keys (used by scripts)
```env
FFMPEG_BIN=D:\ffmpeg\bin
GIF_PARTS=5
GIF_PART_WIDTH=150
GIF_FPS=15
GIF_MAX_KB=5000
GIF_TARGET_KB=4500
GIF_HEX_PATCH_ENABLED=true
GIF_HEX_BYTE=21
HEX_DEFAULT_BYTE=21
HEX_DEFAULT_EXTENSIONS=.gif,.png,.jpg,.jpeg,.webm,.mp4
HEX_BACKUP_ENABLED=true
```

## GIF resolution for `Workshop Showcase`
- Valve does not publish a strict pixel-resolution rule for this web upload route; values below are community-verified.
- If you use the local script in this repo, output is **150px width per part** with aspect-ratio-preserved height (not forced `150x150`).
- For `My Workshop Showcase`, treat each upload as a square tile.
- Common working size: **150x150 px per GIF** (community template standard for this showcase).
- On profile it is rendered smaller (community guide reports around **122x122** visible size), so bigger files are downscaled.
- Practical recommendation:
  - `150x150` for smallest file size.
  - `300x300` if you want extra sharpness after downscale.
- For a full 5-tile strip, design at **750x150** and slice into five `150x150` GIFs.
- Keep each GIF **<= 5 MB** (or upload fails).

## If you want `My Workshop Showcase` (5 slots)
- Split your full design into 5 parts (one for each slot).
- Upload each part as a workshop item using the same method above.
- Place parts left-to-right in the 5 slots.
- For extra-tall/long effects, community methods use HEX editing before upload.

## Common issues
- Upload blocked: re-check Workshop legal agreement acceptance.
- Item not appearing in showcase: verify item visibility is public and re-save profile showcases.
- If only you can see workshop content, community reports suggest checking that the related app (`Spacewar`, app 480) is not marked private in game privacy settings.

## Sources
- Steam Community guide (updated Nov 21, 2025):  
  https://steamcommunity.com/sharedfiles/filedetails/?id=2174159512
- Steam Community profile customization guide (workshop code + showcase flow):  
  https://steamcommunity.com/sharedfiles/filedetails/?id=2409557180
- Steam Community [5 Slot] guide (size notes: 150x150 tiles, <= 5 MB):  
  https://steamcommunity.com/sharedfiles/filedetails/?id=1655670004
- Steam Community animated workshop guide (display note: shown around 122x122):  
  https://steamcommunity.com/sharedfiles/filedetails/?id=1717371438
- Steam Workshop legal agreement page:  
  https://steamcommunity.com/sharedfiles/workshoplegalagreement
- Steam discussions referencing legal-agreement requirement for Workshop uploads:  
  https://steamcommunity.com/discussions/forum/1/3105768154689449796/  
  https://steamcommunity.com/app/2923300/discussions/0/603017735155284530/
