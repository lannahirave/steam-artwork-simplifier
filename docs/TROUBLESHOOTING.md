# Troubleshooting

## Cross-Origin Isolation Blocking Screen

Symptom:

- App shows isolation-required screen and conversion is unavailable.

Fix:

1. Ensure both headers are returned by host for HTML/assets:
   - `Cross-Origin-Opener-Policy: same-origin`
   - `Cross-Origin-Embedder-Policy: require-corp`
2. For local dev/preview, use this repo's `vite.config.ts` setup.
3. For production, verify host or worker injects headers.

## Unsupported Source File

Symptom:

- `Unsupported source file...`

Fix:

1. Use supported formats:
   - video (`video/*`)
   - `.gif`, `.png`, `.webp`, `.jpg`, `.jpeg`, `.bmp`
2. Keep a standard extension when MIME is missing.

## Probe Failures

Symptoms:

- Probe fails to parse dimensions/duration.

Checks:

1. Confirm file is readable and non-empty.
2. Retry after hard refresh.
3. Review `Live Progress` + `Run Logs` for ffmpeg error lines.
4. Retry with smaller/known-good source to isolate source corruption.

## Outputs Above Max Size

Symptom:

- Warning appears that outputs still exceed max KB.

Current behavior:

- This is warning-only.
- Outputs remain visible and downloadable.

What to adjust:

1. Lower `GIF FPS`.
2. Enable/keep `Allow FPS reduction`.
3. Enable standard retries for extra attempts.
4. Keep lossy fallback enabled for hard cases.
5. Increase `Max GIF KB` only if your Steam use-case allows it.

## Quality Too Low

Symptom:

- Visible quality drop after retries.

Checks:

1. Start from lower FPS to reduce need for aggressive fallback.
2. Increase `Target GIF KB` and `Max GIF KB` if possible.
3. Disable color reduction if you prefer motion-loss over palette-loss.

## gifski Encode Failures

Important:

- GIF encoding is handled by gifski.wasm after ffmpeg frame extraction.
- There is no runtime fallback to ffmpeg GIF encoding.

If failures persist:

1. Re-run with `Worker Count = 1`.
2. Capture `Live Progress` stages (`worker-x:frames`, `worker-x:gifski`) and `Run Logs`.
3. Note source file + preset + config.

## Vite Worker Dependency Errors

Symptom:

- Missing `.vite/deps/*worker*` module errors.

Fix:

```bash
cd web
npm run dev -- --force
```

Also verify ffmpeg packages remain excluded in `vite.config.ts` optimizeDeps.

## Second Run Behaves Differently

Possible cause:

- stale worker/dev cache state.

Reset flow:

1. Stop dev server.
2. Start with `npm run dev -- --force`.
3. Hard refresh browser.
4. Re-run conversion.

## Performance Is Slower Than Expected

Checks:

1. Use split presets with `Worker Count` between `2-3`.
2. Confirm conversion reached worker encode stages (`worker-x:*`).
3. Large/static differences are expected (static images encode differently).
4. Reduce retries/disable standard retries for speed-first flow.
