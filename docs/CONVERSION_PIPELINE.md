# Conversion Pipeline

## Supported Inputs

Validation is handled in `web/src/lib/validation.ts`.

Accepted sources:

- Video (`video/*` + common video extensions)
- Image (`.gif`, `.png`, `.webp`, `.jpg`, `.jpeg`, `.bmp`)

## Presets and Defaults

Defaults are in `web/src/lib/defaults.ts`.

### Workshop Showcase

- default parts: `5`
- default part width: `150`
- max/target: `5000KB / 4500KB`
- output names: `<source>_part_01.gif` ... `<source>_part_05.gif`

### Featured Showcase

- single output
- default width: `630`
- max/target: `4500KB / 4500KB`
- output name: `<source>_featured.gif`

### Artwork Showcase

- fixed split widths: `506 + 100`
- max/target: `5000KB / 4500KB`
- output names: `<source>_part_01.gif`, `<source>_part_02.gif`

### Guide

- fixed size: `195x195`
- max/target: `2000KB / 2000KB`
- output name: `<source>_guide.gif`

## End-to-End Flow

1. User chooses preset and source file.
2. Optional FPS estimate computes and applies a practical FPS.
3. `convertVideo` warms workers (`init`).
4. Probe (`probe`) resolves width/height/duration/fps and start offset.
5. Optional precheck estimates expected output size.
6. Conversion runs by preset:
   - split presets (`workshop`, `showcase`) -> `convertPart`
   - featured -> `convertFeatured`
   - guide -> `convertGuide`
7. Main thread applies optional post-patching:
   - GIF header patch
   - EOF byte patch
8. Artifacts are sorted, previewed, and made downloadable.

## Source-Type Behavior

### Still images

When source is image-like and duration is effectively zero:

- worker uses resize-only single-frame encode path
- no temporal frame sampling
- split presets still produce multiple sliced outputs

### Video / animated sources

- uses configured FPS sampling
- can execute retries/fallback ladders based on settings

## Geometry Rules

### Split presets (`workshop` / `showcase`)

1. Compute total target width (sum of split widths).
2. Scale while preserving aspect ratio.
3. Crop slices by horizontal offsets.

### Featured

1. Scale to `featuredWidth`.
2. Preserve aspect ratio.

### Guide

1. Scale to square with `force_original_aspect_ratio=increase`.
2. Center-crop to exact `195x195`.

## Encode and Retry Strategy

### Initial pass

- starts at `gifFps`
- starts with full palette (`256` colors)

### Standard retries (optional)

Controlled by:

- `standardRetriesEnabled`
- `retryAllowFpsDrop`
- `retryAllowColorDrop`

### FPS-fit step

When oversize and FPS drop is allowed, pipeline estimates direct next FPS to hit target/max bounds.

### FPS-priority oversize behavior

Pipeline prioritizes FPS reduction before color reduction when trying to recover size.

### Lossy fallback (optional)

If still oversize and `lossyOversize = true`, lossy candidates run using:

- `lossyLevel`
- `lossyMaxAttempts`

## Oversize Final Behavior

Outputs are not discarded if still above `maxGifKb`.

- Conversion finishes.
- Warning is emitted listing oversize files.
- Files remain visible and downloadable.

## WASM Stability Fallbacks

Inside `encodeGif` worker path:

1. single-pass palette graph
2. compatibility two-pass palette
3. direct GIF encode fallback

`Aborted()` logs with tiny output bytes are treated as suspicious and rejected.

## Progress and Logs

Typical stage tags:

- `[init]`
- `[probe]`
- `[precheck]`
- `[convert]`
- `[worker-x:ffmpeg]`
- `[worker-x:standard]`
- `[worker-x:lossy]`
- `[done]`

UI also shows:

- elapsed live timer (`Time: ...`)
- completion summary (`Output ready in ...`)

## Export

- Per-file download via object URLs.
- Conversion ZIP includes all current artifacts.
- ZIP filename is source-based: `<source>.zip`.
