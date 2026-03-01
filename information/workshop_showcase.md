# Steam: Workshop Showcase Upload

Checked on March 1, 2026.

## Goal
Upload artwork to Steam Workshop and display it in `Workshop Showcase` / `My Workshop Showcase`.

## Requirements
- Steam account logged in via browser.
- Showcase slot on profile (commonly level 10+, or extra slot from Points Shop).
- Prepared media files.

## Autofill JS file
- Workshop upload autofill: `autofill/steam_upload_autofill_workshop.js`

## Fast workflow (Workshop path)
1. Accept Steam Workshop legal terms first:  
   `https://steamcommunity.com/sharedfiles/workshoplegalagreement`
2. Open upload form:  
   `https://steamcommunity.com/sharedfiles/edititem/767/3/`
3. In DevTools Console (`F12` -> `Console`) run:
   ```js
   $J('[name=consumer_app_id]').val(480);$J('[name=file_type]').val(0);$J('[name=visibility]').val(0);
   ```
4. Upload file, set title/preview, tick certification, click `Save and Continue`.
5. Profile -> `Edit Profile` -> `Featured Showcase`.
6. Add/edit `Workshop Showcase` (or `My Workshop Showcase`) and select uploaded item(s).
7. Save profile.

## Local pipeline (workshop preset)
Use `video_parts_pipeline.py` preset `workshop`:

```bash
python video_parts_pipeline.py --input .\media\art3.mp4 --preset workshop
```

Default behavior:
- 5 parts
- 150px width each
- aspect ratio preserved
- max `5000 KB`, target `4500 KB`
- min FPS comes from `.env` (`GIF_MIN_FPS`, default `15`)
- auto hex patch (`0x21`)

## Command examples
```bash
# Workshop default
python video_parts_pipeline.py --input .\media\my_video.mp4 --preset workshop

# Workshop with explicit settings
python video_parts_pipeline.py --input .\media\my_video.mp4 --preset workshop --parts 5 --part-width 150 --gif-fps 15

# Workshop with custom output folder
python video_parts_pipeline.py --input .\media\my_video.mp4 --preset workshop --out-dir .\media\my_video\workshop_output
```

## Resolution notes
- Community-common tile size is `150x150`.
- In this repo pipeline, output is `150px` width per part and auto height (ratio preserved).
- Keep each file within Steam size limits (`<= 5 MB` practical limit for this flow).

## Common issues
- Upload blocked: legal agreement not accepted yet.
- Item not visible in showcase: re-check visibility and save showcase again.
- If workshop content is only visible to you, check privacy settings related to app visibility.

## Sources
- https://steamcommunity.com/sharedfiles/filedetails/?id=2174159512
- https://steamcommunity.com/sharedfiles/filedetails/?id=2409557180
- https://steamcommunity.com/sharedfiles/filedetails/?id=1655670004
- https://steamcommunity.com/sharedfiles/filedetails/?id=1717371438
- https://steamcommunity.com/sharedfiles/workshoplegalagreement
- https://steamcommunity.com/discussions/forum/1/3105768154689449796/
- https://steamcommunity.com/app/2923300/discussions/0/603017735155284530/
