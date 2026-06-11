import {
  allItemsFit,
  buildQualityRecoveryCandidates,
  buildSharedFpsRecoveryCandidates,
  selectBatchRecoveryBudget,
} from './sizeStrategy'
import type { WorkerArtifactData } from './types'

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
  let acceptedQuality = current.finalQuality
  const headroom = budgetKb - current.sizeKb

  if (acceptedQuality >= 100 || headroom <= 0) {
    return accepted
  }

  options.emit(
    'quality-recovery',
    `${options.label} quality recovery for ${current.name}: ${headroom.toFixed(1)}KB headroom.`,
  )

  const tryCandidate = async (quality: number, kind: string): Promise<boolean> => {
    const attempt = await options.runFixedSplitPart(
      partIndex,
      fps,
      quality,
      `${options.label} quality recovery: trying ${current.name} at quality=${quality}.`,
    )
    if (attempt.sizeKb > budgetKb) {
      options.emit(
        'quality-recovery',
        `${options.label} ${kind} quality recovery rejected for ${current.name}: quality=${quality} produced ${attempt.sizeKb.toFixed(1)}KB over ${budgetKb}KB.`,
      )
      return false
    }

    accepted = attempt
    acceptedQuality = quality
    options.emit(
      'quality-recovery',
      `${options.label} accepted ${current.name} at quality=${quality}: ${attempt.sizeKb.toFixed(1)}KB.`,
    )
    return true
  }

  const refineBetweenAcceptedAndRejected = async (acceptedLow: number, rejectedHigh: number): Promise<void> => {
    let low = acceptedLow
    let high = rejectedHigh

    while (high - low > 1) {
      const quality = Math.floor((low + high) / 2)
      const fit = await tryCandidate(quality, 'intermediate')
      if (fit) {
        low = quality
      } else {
        high = quality
      }
    }
  }

  const ladderCandidates = buildQualityRecoveryCandidates({
    fps,
    quality: acceptedQuality,
    allowQualityDrop: true,
  })

  for (const candidate of ladderCandidates) {
    const previousAcceptedQuality = acceptedQuality
    const fit = await tryCandidate(candidate.quality, 'ladder')
    if (!fit) {
      await refineBetweenAcceptedAndRejected(previousAcceptedQuality, candidate.quality)
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
      const attempt = await Promise.all(
        options.partOrder.map((partIndex) => {
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
