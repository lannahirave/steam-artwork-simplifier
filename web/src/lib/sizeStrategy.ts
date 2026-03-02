export interface StandardCandidate {
  fps: number
  colors: number
}

export interface LossyCandidate {
  fps: number
  colors: number
  dither: string
  statsMode: 'single' | 'diff'
  prefilter: string
}

const STANDARD_COLORS = [224, 192, 160, 128, 96, 64, 48, 32] as const

export interface StandardCandidateOptions {
  allowFpsDrop?: boolean
  allowColorDrop?: boolean
}

export function buildStandardCandidates(
  baseFps: number,
  minGifFps: number,
  options: StandardCandidateOptions = {},
): StandardCandidate[] {
  const allowFpsDrop = options.allowFpsDrop ?? true
  const allowColorDrop = options.allowColorDrop ?? true

  if (!allowFpsDrop && !allowColorDrop) {
    return []
  }

  const fpsFloor = Math.max(1, minGifFps)
  const fpsCandidates: number[] = []
  if (allowFpsDrop) {
    for (let fps = baseFps; fps >= fpsFloor; fps -= 1) {
      fpsCandidates.push(fps)
    }
    if (fpsCandidates.length === 0) {
      fpsCandidates.push(baseFps)
    }
  } else {
    fpsCandidates.push(baseFps)
  }

  const colorsCandidates = allowColorDrop ? [...STANDARD_COLORS] : [256]

  const unique = new Set<string>()
  const out: StandardCandidate[] = []
  for (const fps of fpsCandidates) {
    for (const colors of colorsCandidates) {
      if (fps === baseFps && colors === 256) {
        // Initial encode already uses this combination.
        continue
      }
      const key = `${fps}:${colors}`
      if (unique.has(key)) {
        continue
      }
      unique.add(key)
      out.push({ fps, colors })
    }
  }
  return out
}

export function buildLossyCandidates(
  baseFps: number,
  minGifFps: number,
  lossyLevel: number,
  maxAttempts: number,
): LossyCandidate[] {
  const fpsFloor = Math.max(1, minGifFps)
  const fpsCandidates: number[] = []
  for (let fps = baseFps; fps >= fpsFloor; fps -= 1) {
    fpsCandidates.push(fps)
  }
  if (fpsCandidates.length === 0) {
    fpsCandidates.push(baseFps)
  }

  const level = Math.min(3, Math.max(1, lossyLevel))

  const colorsCandidates =
    level === 1 ? [64, 48, 32, 24] : level === 2 ? [64, 48, 32, 24, 16] : [64, 48, 32, 24, 16, 12]
  const ditherCandidates =
    level === 1
      ? ['bayer:bayer_scale=5', 'none']
      : ['bayer:bayer_scale=5', 'bayer:bayer_scale=3', 'none']
  const statsModes: Array<'single' | 'diff'> = level === 1 ? ['single'] : ['single', 'diff']
  const prefilters = level === 3 ? ['', 'gblur=sigma=0.3', 'gblur=sigma=0.6'] : level === 2 ? ['', 'gblur=sigma=0.3'] : ['']

  const out: LossyCandidate[] = []
  const unique = new Set<string>()

  for (const fps of fpsCandidates) {
    for (const prefilter of prefilters) {
      for (const statsMode of statsModes) {
        for (const dither of ditherCandidates) {
          for (const colors of colorsCandidates) {
            const key = `${fps}:${colors}:${dither}:${statsMode}:${prefilter}`
            if (unique.has(key)) {
              continue
            }
            unique.add(key)
            out.push({
              fps,
              colors,
              dither,
              statsMode,
              prefilter,
            })
            if (out.length >= maxAttempts) {
              return out
            }
          }
        }
      }
    }
  }

  return out
}
