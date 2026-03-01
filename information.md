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

## GIF resolution for `Workshop Showcase`
- Valve does not publish a strict pixel-resolution rule for this web upload route; values below are community-verified.
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
