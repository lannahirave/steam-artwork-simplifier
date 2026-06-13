import { DEFAULTS, computeTargetHeight } from './defaults'
import type { ConversionConfig, Preset } from './types'

export const GUIDE_SIZE = DEFAULTS.guide.size
export const MAX_SAFE_WASM_WORKERS = 3

const ESTIMATE_BPPF_BASELINES: Record<Preset, number> = {
  workshop: 0.16,
  featured: 0.18,
  guide: 0.21,
  showcase: 0.16,
}

export interface PresetPlan {
  preset: Preset
  label: 'Workshop' | 'Featured' | 'Guide' | 'Showcase'
  isSplit: boolean
  isSingleOutput: boolean
  jobCount: number
  partWidth: number
  splitWidths?: number[]
  splitColumns: number
  splitRows: number
  totalTargetWidth: number
  sampleGifWidth: number
  maxGifKb: number
  targetGifKb: number
  guideSize: number
  effectiveWorkerCount: number
  estimateBppf: number
}

export function getPresetSplitWidths(config: ConversionConfig): number[] {
  if (config.preset === 'showcase') {
    return [...DEFAULTS.showcase.splitWidths]
  }
  if (config.preset === 'workshop') {
    return Array.from({ length: config.parts }, () => config.partWidth)
  }
  if (config.preset === 'featured') {
    return [config.featuredWidth]
  }
  return [GUIDE_SIZE]
}

export function getPresetJobCount(config: ConversionConfig): number {
  const splitWidths = getPresetSplitWidths(config)
  return config.preset === 'workshop'
    ? splitWidths.length * config.workshopRows
    : splitWidths.length
}

export function resolveEstimateBppf(config: ConversionConfig): number {
  return Math.max(config.precheckBppf, ESTIMATE_BPPF_BASELINES[config.preset])
}

export function resolvePresetPlan(config: ConversionConfig): PresetPlan {
  const splitWidths = getPresetSplitWidths(config)
  const isSplit = config.preset === 'workshop' || config.preset === 'showcase'
  const isSingleOutput = !isSplit
  const splitColumns = splitWidths.length
  const splitRows = config.preset === 'workshop' ? config.workshopRows : 1
  const jobCount = splitColumns * splitRows
  const partWidth = splitWidths[0] ?? 1
  const totalTargetWidth = splitWidths.reduce((sum, width) => sum + width, 0)
  const effectiveWorkerCount = isSplit
    ? Math.max(1, Math.min(config.workerCount, MAX_SAFE_WASM_WORKERS, jobCount))
    : 1

  return {
    preset: config.preset,
    label:
      config.preset === 'showcase'
        ? 'Showcase'
        : config.preset === 'featured'
          ? 'Featured'
          : config.preset === 'guide'
            ? 'Guide'
            : 'Workshop',
    isSplit,
    isSingleOutput,
    jobCount,
    partWidth,
    splitWidths: config.preset === 'showcase' || config.preset === 'workshop' ? splitWidths : undefined,
    splitColumns,
    splitRows,
    totalTargetWidth,
    sampleGifWidth: Math.max(...splitWidths),
    maxGifKb: config.maxGifKb,
    targetGifKb: config.targetGifKb,
    guideSize: GUIDE_SIZE,
    effectiveWorkerCount,
    estimateBppf: resolveEstimateBppf(config),
  }
}

export function computePresetTargetHeight(
  config: ConversionConfig,
  srcWidth: number,
  srcHeight: number,
): number {
  const plan = resolvePresetPlan(config)
  if (config.preset === 'guide') {
    return GUIDE_SIZE
  }
  return computeTargetHeight(srcWidth, srcHeight, plan.totalTargetWidth)
}
