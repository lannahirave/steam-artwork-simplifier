# Troubleshooting

## Cross-Origin Isolation Error Screen

Symptom:

- App shows a blocking message about isolation requirements.

Fix:

1. Ensure both headers are present on HTML/assets:
   - `Cross-Origin-Opener-Policy: same-origin`
   - `Cross-Origin-Embedder-Policy: require-corp`
2. For Cloudflare deployment, verify `web/cloudflare/worker.ts` is active and `run_worker_first = true`.

## Probe Failures

Symptoms:

- `Unable to parse source dimensions ...`
- `ffmpeg probe failed ...`
- `ffprobe failed to inspect input video ...`

Checks:

1. Confirm source file is readable and non-empty.
2. Confirm source type is supported (`video/*`, `.gif`, `.png`, `.webp`, `.jpg`, `.jpeg`, `.bmp`).
3. Retry with hard refresh after code changes.
4. Inspect `Live Progress` ffmpeg tail in UI for exact probe output.

## Tiny or Black GIF Outputs

Historical symptom:

- conversion reports success, but outputs are tiny black GIFs (for example near `6.1KB` each).

Current mitigation:

1. Suspicious tiny aborted outputs are rejected.
2. Encoder fallback chain retries:
   - single-pass palette
   - two-pass palette
   - direct GIF fallback

If issue returns:

1. Capture full `Live Progress` and `Run Logs`.
2. Note source filename, preset, and worker count.
3. Re-run with `workerCount=1` to isolate concurrency effects.

## Output Looks Bad Due To Color Reduction

Symptom:

- output quality drops because palette/colors are reduced too early.

Current behavior:

1. Pipeline now prioritizes FPS reduction first.
2. If still oversize, it runs an explicit FPS-priority sweep (colors fixed at `256`) before color-reduction ladders.

Checks:

1. Keep `Allow FPS reduction` enabled.
2. Raise `Max GIF KB` if platform limits allow it.
3. Lower initial `GIF FPS` so fewer aggressive fallback steps are needed.

## `Aborted()` in Worker Logs

Important:

- `Aborted()` may appear in wasm logs even when fallback output is valid.
- The app now accepts output only when byte-level checks pass.

Treat `Aborted()` as suspicious, not automatically fatal.

## Vite Worker Optimization Error

Symptom:

- missing `.vite/deps/worker.js?worker_file&type=module`

Fix:

1. Ensure ffmpeg packages are excluded from optimizeDeps in `vite.config.ts`.
2. Restart with forced optimization refresh:

```bash
npm run dev -- --force
```

## No CPU Utilization During Conversion

Checks:

1. Ensure conversion has passed probe and started worker tasks.
2. Confirm `workerCount` is not clamped too low for your current task.
3. Watch `Live Progress` for `Starting initial encode...` lines.
4. For static image sources, expected CPU load is lower than long video encodes.

## Second Run Behaves Differently

Sometimes stale wasm/dev cache affects behavior between runs.

Recommended reset:

1. Stop dev server.
2. Start `npm run dev -- --force`.
3. Hard refresh browser.
4. Re-run conversion.

## Invalid Source File Message

Symptom:

- `Unsupported source file. Use a video file or image (.gif, .png, .webp, .jpg, .jpeg, .bmp).`

Fix:

1. Use a supported source extension/MIME type.
2. If MIME is empty, keep a standard extension in filename (`.mp4`, `.gif`, `.webp`, etc.).
