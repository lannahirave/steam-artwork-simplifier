import {
  allItemsFit,
  buildQualityRecoveryCandidates,
  buildSharedFpsRecoveryCandidates,
  selectBatchRecoveryBudget,
} from './sizeStrategy'
import { clampGifskiQuality } from './gifskiQuality'
import type { FixedQualitySearch, WorkerArtifactData } from './types'

export interface SplitRecoveryOptions {
  items: WorkerArtifactData[]
  partOrder: number[]
  label: string
  targetGifKb: number
  maxGifKb: number
  originalFps: number
  retryAllowFpsDrop: boolean
  retryAllowQualityDrop: boolean
  runFixedSplitPart: (partIndex: number, fps: number, quality: number, label: string) => Promise<WorkerArtifactData>
  runFixedSplitPartQualitySearch: (
    partIndex: number,
    fps: number,
    search: FixedQualitySearch,
    budgetKb: number,
    label: string,
  ) => Promise<WorkerArtifactData>
  emit: (stage: string, message: string) => void
}

export function partIndexFromName(name: string): number {
  const match = /_part_(\d+)\.gif$/i.exec(name)
  return match ? Number.parseInt(match[1], 10) - 1 : 0
}

async function recoverPartQuality(
  current: WorkerArtifactData,
  partIndex: number,
  fps: number,
  budgetKb: number,
  options: SplitRecoveryOptions,
): Promise<WorkerArtifactData> {
  let accepted = current
  let acceptedQuality = clampGifskiQuality(current.finalQuality)
  const headroom = budgetKb - current.sizeKb

  if (acceptedQuality >= 100 || headroom <= 0) {
    return accepted
  }

  options.emit(
    'quality-recovery',
    `${options.label} quality recovery for ${current.name}: ${headroom.toFixed(1)}KB headroom.`,
  )

  const acceptAttempt = (attempt: WorkerArtifactData, kind: string): boolean => {
    const candidateQuality = clampGifskiQuality(attempt.finalQuality)
    if (candidateQuality <= acceptedQuality) {
      return false
    }
    if (attempt.sizeKb > budgetKb) {
      options.emit(
        'quality-recovery',
        `${options.label} ${kind} quality recovery rejected for ${current.name}: quality=${candidateQuality} produced ${attempt.sizeKb.toFixed(1)}KB over ${budgetKb}KB.`,
      )
      return false
    }

    accepted = {
      ...attempt,
      finalQuality: candidateQuality,
    }
    acceptedQuality = candidateQuality
    options.emit(
      'quality-recovery',
      `${options.label} accepted ${current.name} at quality=${candidateQuality}: ${attempt.sizeKb.toFixed(1)}KB.`,
    )
    return true
  }

  const searchQualityRange = async (acceptedLow: number, highInclusive: number): Promise<WorkerArtifactData | null> => {
    const low = clampGifskiQuality(acceptedLow)
    const high = clampGifskiQuality(highInclusive)
    if (high <= low) {
      return null
    }
    const attempt = await options.runFixedSplitPartQualitySearch(
      partIndex,
      fps,
      {
        lowExclusive: low,
        highInclusive: high,
      },
      budgetKb,
      `${options.label} quality recovery: binary searching ${current.name} quality ${low + 1}-${high}.`,
    )
    return acceptAttempt(attempt, 'range') ? attempt : null
  }

  const ladderCandidates = buildQualityRecoveryCandidates({
    fps,
    quality: acceptedQuality,
    allowQualityDrop: true,
  })

  for (const candidate of ladderCandidates) {
    const previousAcceptedQuality = acceptedQuality
    const fit = await searchQualityRange(previousAcceptedQuality, candidate.quality)
    if (!fit || acceptedQuality < candidate.quality) {
      break
    }
  }

  options.emit(
    'quality-recovery',
    `${options.label} final quality recovery for ${current.name}: quality=${accepted.finalQuality}, ${accepted.sizeKb.toFixed(1)}KB.`,
  )
  return accepted
}

export async function recoverSplitBatchQuality(options: SplitRecoveryOptions): Promise<WorkerArtifactData[]> {
  const budgetKb = selectBatchRecoveryBudget(options.items, options.targetGifKb, options.maxGifKb)
  if (budgetKb === null) {
    options.emit('quality-recovery', `${options.label} recovery skipped: at least one part still exceeds ${options.maxGifKb}KB.`)
    return options.items
  }

  let currentItems = [...options.items]
  let currentFps = Math.min(...currentItems.map((item) => item.finalFps))
  const budgetName = allItemsFit(options.items, options.targetGifKb) ? 'target' : 'max'
  options.emit(
    'quality-recovery',
    `${options.label} batch fit satisfied; using ${budgetName} recovery budget ${budgetKb}KB before quality recovery.`,
  )

  if (options.retryAllowFpsDrop && currentFps < options.originalFps) {
    for (const fps of buildSharedFpsRecoveryCandidates(currentFps, options.originalFps)) {
      const byIndex = new Map(currentItems.map((item) => [partIndexFromName(item.name), item]))
      const limiterPartIndex = options.partOrder[0]
      const limiterCurrent = byIndex.get(limiterPartIndex)
      const limiterAttempt = await options.runFixedSplitPart(
        limiterPartIndex,
        fps,
        limiterCurrent?.finalQuality ?? 100,
        `${options.label} FPS recovery probe: trying shared fps=${fps} on part ${limiterPartIndex + 1}.`,
      )
      if (limiterAttempt.sizeKb > budgetKb) {
        options.emit(
          'quality-recovery',
          `${options.label} FPS recovery stopped: shared fps=${fps} would make ${limiterAttempt.name} ${limiterAttempt.sizeKb.toFixed(1)}KB over ${budgetKb}KB.`,
        )
        break
      }

      const remainingAttempts = await Promise.all(
        options.partOrder
          .filter((partIndex) => partIndex !== limiterPartIndex)
          .map((partIndex) => {
            const current = byIndex.get(partIndex)
            const quality = current?.finalQuality ?? 100
            return options.runFixedSplitPart(
              partIndex,
              fps,
              quality,
              `${options.label} FPS recovery: trying shared fps=${fps} for part ${partIndex + 1}.`,
            )
          }),
      )
      const attempt = [limiterAttempt, ...remainingAttempts]
      if (!allItemsFit(attempt, budgetKb)) {
        const largest = attempt.reduce((current, item) => (item.sizeKb > current.sizeKb ? item : current))
        options.emit(
          'quality-recovery',
          `${options.label} FPS recovery stopped: shared fps=${fps} would make ${largest.name} ${largest.sizeKb.toFixed(1)}KB over ${budgetKb}KB.`,
        )
        break
      }
      currentItems = attempt
      currentFps = fps
      options.emit('quality-recovery', `${options.label} accepted shared fps=${fps}; all parts fit under ${budgetKb}KB.`)
    }
  }

  if (!options.retryAllowQualityDrop) {
    return currentItems
  }

  const byIndex = new Map(currentItems.map((item) => [partIndexFromName(item.name), item]))
  for (const partIndex of options.partOrder) {
    const current = byIndex.get(partIndex)
    if (!current) {
      continue
    }
    const recovered = await recoverPartQuality(current, partIndex, currentFps, budgetKb, options)
    byIndex.set(partIndex, recovered)
  }

  return Array.from(byIndex.entries())
    .sort(([left], [right]) => left - right)
    .map(([, item]) => item)
}
