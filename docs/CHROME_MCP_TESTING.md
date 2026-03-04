# Chrome MCP Testing Guide

## Purpose

Provide a repeatable browser-level test workflow for conversion, progress logging, and output sanity checks using the Chrome MCP tools.

## Prerequisites

1. Dev server running for the web app:

```bash
cd web
npm run dev -- --host 127.0.0.1 --port 5173 --force
```

2. Test fixtures available in:

- `media/test-fixtures/`

3. Chrome MCP available in the Codex session.

## Core Smoke Scenario

1. Open app:
   - `http://127.0.0.1:5173/`
2. Upload one fixture MP4.
3. Run workshop conversion.
4. Wait for either:
   - `Conversion complete in ...`
   - `Output ready in ...`
   - `Failed: ...`
5. Verify:
   - no tiny `6.1KB` false-success outputs
   - 5 workshop outputs are generated
   - output previews render
   - progress log shows expected stages
   - elapsed timing is shown (`Time:` and `Output ready in ...`)

## Recommended Fixture Matrix

Use these fixtures to cover typical edge cases:

1. `fixture01_square_576x576_25fps_13s.mp4`
2. `fixture02_landscape_1280x720_30fps_8s.mp4`
3. `fixture03_portrait_720x1280_30fps_8s.mp4`
4. `fixture04_small_320x240_12fps_6s.mp4`
5. `fixture05_long_640x360_24fps_20s.mp4`
6. `fixture06_highfps_854x480_60fps_6s.mp4`
7. `fixture07_dark_640x360_24fps_10s.mp4`
8. `fixture08_large_square_1024x1024_30fps_5s.mp4`
9. `fixture09_static_png_1024x1024.png`
10. `fixture10_webp_animated_720x720.webp`
11. `fixture11_jpg_photo_1200x800.jpg`

## What To Assert

### Conversion path

1. Probe starts and completes.
2. Convert starts with expected job count.
3. Outputs are real GIFs and not tiny black placeholders.
4. GIF cards show `FPS` and `Color reduction` metadata.
5. For oversize cases, logs show FPS-priority behavior before color-reduction attempts.

### UI/UX path

1. Progress bar advances while tasks run.
2. `Live Progress` updates continuously.
3. Artifact sizes show near download buttons.
4. ZIP download button enables after success.
5. Workshop preview strip shows five outputs in one row on desktop.
6. Elapsed timer updates during run and remains visible after completion.

### Stability path

1. Run conversion twice in a row without page reload.
2. Confirm no probe parse failures on second run.
3. Confirm worker fallback messages still end in valid outputs.

## Useful MCP Actions

1. `new_page` -> open app URL.
2. `take_snapshot` -> inspect element UIDs.
3. `upload_file` -> set source file.
4. `click` -> run conversion.
5. `wait_for` -> completion/failure markers.
6. `list_console_messages` -> browser-side errors.

## Failure Triage

If conversion fails:

1. Capture `Live Progress` text.
2. Capture `Run Logs` text.
3. Record fixture filename + preset + worker count.
4. Re-run with `workerCount=1` to isolate concurrency effects.
5. Cross-check with `docs/TROUBLESHOOTING.md`.
