# Chrome MCP Testing Guide

## Purpose

Repeatable browser-level validation for conversion, progress logging, preview rendering, naming, and downloads.

## Prerequisites

1. Start app locally:

```bash
cd web
npm run dev -- --host 127.0.0.1 --port 5173 --force
```

2. Fixtures exist in `media/test-fixtures/`.
3. Chrome MCP tools are available in the Codex session.

## Core Smoke Scenario

1. Open `http://127.0.0.1:5173/`.
2. Upload one fixture video.
3. Run conversion with `Workshop Showcase` preset.
4. Wait for:
   - `Conversion complete in ...`, or
   - `Failed: ...`
5. Verify:
   - preview strip renders
   - 5 outputs exist
   - names follow `<source>_part_XX.gif`
   - ZIP button works
   - elapsed timing is shown

## Additional Scenarios

1. Featured naming:
   - run `Featured Showcase`
   - verify output name `<source>_featured.gif`
2. Artwork showcase split:
   - run `Artwork Showcase`
   - verify exactly 2 part outputs
3. Guide preset limits:
   - run `Guide`
   - verify square output and size target context (`2000KB` default)
4. Oversize warning path:
   - use large source and strict limits
   - verify warning appears and GIFs are still displayed/downloadable

## Recommended Fixture Matrix

Current fixture files in repo:

1. `fixture01_square_576x576_25fps_13s.mp4`
2. `fixture02_landscape_1280x720_30fps_8s.mp4`
3. `fixture03_portrait_720x1280_30fps_8s.mp4`
4. `fixture04_small_320x240_12fps_6s.mp4`
5. `fixture05_long_640x360_24fps_20s.mp4`
6. `fixture06_highfps_854x480_60fps_6s.mp4`
7. `fixture07_dark_640x360_24fps_10s.mp4`
8. `fixture08_large_square_1024x1024_30fps_5s.mp4`

## What To Assert

### Conversion path

1. Probe starts and returns dimensions/duration/fps.
2. Conversion starts with expected job count.
3. Output cards show FPS + color reduction metadata.
4. Naming matches source-based naming rules.
5. Oversize warnings do not hide outputs.

### UI/UX path

1. Progress bar advances.
2. `Live Progress` updates continuously.
3. `Output ready in ...` appears on completion.
4. `Download all (ZIP archive)` appears in results actions row.
5. Theme toggle works (auto/light/dark).

### Stability path

1. Run conversion twice without page reload.
2. Confirm second run still probes and converts correctly.
3. If logs include `Aborted()`, ensure fallback still returns valid outputs.

## Useful MCP Actions

1. `new_page`
2. `take_snapshot`
3. `upload_file`
4. `click`
5. `wait_for`
6. `list_console_messages`

## Failure Triage

If run fails:

1. Capture `Live Progress` text.
2. Capture `Run Logs` text.
3. Record source file + preset + worker count.
4. Retry with `Worker Count = 1`.
5. Cross-check `docs/TROUBLESHOOTING.md`.
