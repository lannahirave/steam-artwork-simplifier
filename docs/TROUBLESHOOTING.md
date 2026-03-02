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

Checks:

1. Confirm input file has a valid video stream.
2. Retry with a hard refresh after a code change.
3. Inspect `Live Progress` ffmpeg tail in UI for exact ffmpeg output.

## 6.1KB Black GIF Outputs

Historical symptom:

- conversion reports success, but outputs are tiny black GIFs.

Current mitigation:

1. Suspicious tiny aborted outputs are rejected.
2. Encoder fallback chain retries:
   - single-pass palette
   - two-pass palette
   - direct GIF fallback

If issue returns:

1. Capture full `Live Progress` and `Run Logs`.
2. Note source filename and preset.
3. Test with `workerCount=1` to isolate concurrency issues.

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

## Second Run Behaves Differently

Sometimes stale wasm/dev cache affects behavior between runs.

Recommended reset:

1. stop dev server
2. start `npm run dev -- --force`
3. hard refresh browser
4. rerun conversion

## Invalid Source File Message

Symptom:

- `Unsupported source file. Use a video file or .gif.`

Fix:

1. Use supported video container or `.gif`.
2. If file MIME is missing, ensure extension is standard (`.mp4`, `.mov`, `.gif`, etc.).
