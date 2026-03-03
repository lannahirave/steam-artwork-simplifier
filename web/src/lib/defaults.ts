import type { ConversionConfig, Preset, ResolvedPresetSettings } from './types'

export const DEFAULTS = {
  gifFps: 15,
  minGifFps: 10,
  workshop: {
    parts: 5,
    partWidth: 150,
    maxGifKb: 5000,
    targetGifKb: 4500,
  },
  featured: {
    width: 630,
    maxGifKb: 4500,
    targetGifKb: 4500,
  },
  guide: {
    size: 195,
    maxGifKb: 5000,
    targetGifKb: 4500,
  },
  showcase: {
    splitWidths: [506, 100],
    maxGifKb: 5000,
    targetGifKb: 4500,
  },
  disableOptimizations: false,
  standardRetriesEnabled: false,
  retryAllowFpsDrop: true,
  retryAllowColorDrop: true,
  precheckEnabled: false,
  precheckBppf: 0.1,
  precheckMarginPct: 10,
  lossyOversize: true,
  lossyLevel: 2,
  lossyMaxAttempts: 24,
  eofPatchEnabled: true,
  eofByte: 0x21,
  headerPatchEnabled: false,
  headerWidth: 1000,
  headerHeight: 1,
} as const

export function getDefaultWorkerCount(parts: number, hardwareConcurrency?: number): number {
  const hw = hardwareConcurrency ?? (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4) ?? 4
  const half = Math.floor(hw / 2)
  const suggested = Math.max(2, half)
  return Math.max(1, Math.min(parts, 3, suggested))
}

export function resolvePresetSettings(config: ConversionConfig): ResolvedPresetSettings {
  if (config.preset === 'featured') {
    return {
      parts: 1,
      partWidth: config.featuredWidth,
      maxGifKb: DEFAULTS.featured.maxGifKb,
      targetGifKb: DEFAULTS.featured.targetGifKb,
    }
  }

  if (config.preset === 'guide') {
    return {
      parts: 1,
      partWidth: DEFAULTS.guide.size,
      maxGifKb: DEFAULTS.guide.maxGifKb,
      targetGifKb: DEFAULTS.guide.targetGifKb,
    }
  }

  if (config.preset === 'showcase') {
    return {
      parts: DEFAULTS.showcase.splitWidths.length,
      partWidth: DEFAULTS.showcase.splitWidths[0],
      maxGifKb: DEFAULTS.showcase.maxGifKb,
      targetGifKb: DEFAULTS.showcase.targetGifKb,
    }
  }

  return {
    parts: config.parts,
    partWidth: config.partWidth,
    maxGifKb: DEFAULTS.workshop.maxGifKb,
    targetGifKb: DEFAULTS.workshop.targetGifKb,
  }
}

export function getDefaultConfig(preset: Preset = 'workshop'): ConversionConfig {
  const parts =
    preset === 'workshop'
      ? DEFAULTS.workshop.parts
      : preset === 'showcase'
        ? DEFAULTS.showcase.splitWidths.length
        : 1

  return {
    preset,
    gifFps: DEFAULTS.gifFps,
    minGifFps: DEFAULTS.minGifFps,
    parts: preset === 'showcase' ? DEFAULTS.showcase.splitWidths.length : DEFAULTS.workshop.parts,
    partWidth: preset === 'showcase' ? DEFAULTS.showcase.splitWidths[0] : DEFAULTS.workshop.partWidth,
    featuredWidth: DEFAULTS.featured.width,
    disableOptimizations: DEFAULTS.disableOptimizations,
    maxGifKb:
      preset === 'featured'
        ? DEFAULTS.featured.maxGifKb
        : preset === 'guide'
          ? DEFAULTS.guide.maxGifKb
          : preset === 'showcase'
            ? DEFAULTS.showcase.maxGifKb
          : DEFAULTS.workshop.maxGifKb,
    targetGifKb:
      preset === 'featured'
        ? DEFAULTS.featured.targetGifKb
        : preset === 'guide'
          ? DEFAULTS.guide.targetGifKb
          : preset === 'showcase'
            ? DEFAULTS.showcase.targetGifKb
          : DEFAULTS.workshop.targetGifKb,
    standardRetriesEnabled: DEFAULTS.standardRetriesEnabled,
    retryAllowFpsDrop: DEFAULTS.retryAllowFpsDrop,
    retryAllowColorDrop: DEFAULTS.retryAllowColorDrop,
    lossyOversize: DEFAULTS.lossyOversize,
    lossyLevel: DEFAULTS.lossyLevel,
    lossyMaxAttempts: DEFAULTS.lossyMaxAttempts,
    precheckEnabled: DEFAULTS.precheckEnabled,
    precheckBppf: DEFAULTS.precheckBppf,
    precheckMarginPct: DEFAULTS.precheckMarginPct,
    eofPatchEnabled: DEFAULTS.eofPatchEnabled,
    eofByte: DEFAULTS.eofByte,
    headerPatchEnabled: DEFAULTS.headerPatchEnabled,
    headerWidth: DEFAULTS.headerWidth,
    headerHeight: DEFAULTS.headerHeight,
    workerCount: getDefaultWorkerCount(parts),
  }
}

export function applyPreset(config: ConversionConfig, preset: Preset): ConversionConfig {
  const next = { ...config, preset }
  if (preset === 'featured') {
    return {
      ...next,
      workerCount: getDefaultWorkerCount(1),
      maxGifKb: DEFAULTS.featured.maxGifKb,
      targetGifKb: DEFAULTS.featured.targetGifKb,
    }
  }

  if (preset === 'guide') {
    return {
      ...next,
      workerCount: getDefaultWorkerCount(1),
      maxGifKb: DEFAULTS.guide.maxGifKb,
      targetGifKb: DEFAULTS.guide.targetGifKb,
    }
  }

  if (preset === 'showcase') {
    return {
      ...next,
      parts: DEFAULTS.showcase.splitWidths.length,
      partWidth: DEFAULTS.showcase.splitWidths[0],
      workerCount: getDefaultWorkerCount(DEFAULTS.showcase.splitWidths.length),
      maxGifKb: DEFAULTS.showcase.maxGifKb,
      targetGifKb: DEFAULTS.showcase.targetGifKb,
    }
  }

  return {
    ...next,
    workerCount: getDefaultWorkerCount(config.parts),
    maxGifKb: DEFAULTS.workshop.maxGifKb,
    targetGifKb: DEFAULTS.workshop.targetGifKb,
  }
}

export function computeTargetHeight(srcWidth: number, srcHeight: number, totalTargetWidth: number): number {
  if (srcWidth <= 0) {
    return 1
  }
  return Math.max(1, Math.round(srcHeight * (totalTargetWidth / srcWidth)))
}
