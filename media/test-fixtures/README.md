# MP4 Test Fixtures

This folder contains deterministic MP4 fixtures for conversion testing.

## Files

| File | Resolution | FPS | Duration |
|---|---:|---:|---:|
| `fixture01_square_576x576_25fps_13s.mp4` | 576x576 | 25 | 13s |
| `fixture02_landscape_1280x720_30fps_8s.mp4` | 1280x720 | 30 | 8s |
| `fixture03_portrait_720x1280_30fps_8s.mp4` | 720x1280 | 30 | 8s |
| `fixture04_small_320x240_12fps_6s.mp4` | 320x240 | 12 | 6s |
| `fixture05_long_640x360_24fps_20s.mp4` | 640x360 | 24 | 20s |
| `fixture06_highfps_854x480_60fps_6s.mp4` | 854x480 | 60 | 6s |
| `fixture07_dark_640x360_24fps_10s.mp4` | 640x360 | 24 | 10s |
| `fixture08_large_square_1024x1024_30fps_5s.mp4` | 1024x1024 | 30 | 5s |

## Regenerate

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\media\test-fixtures\generate_fixtures.ps1
```
