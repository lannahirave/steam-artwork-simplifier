import {
  allItemsFit,
  buildIntermediateColorRecoveryCandidates,
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
  retryAllowColorDrop: boolean
  runFixedSplitPart: (partIndex: number, fps: number, colors: number, label: string) => Promise<WorkerArtifactData>
  emit: (stage: string, message: string) => void
}

export function partIndexFromName(name: string): number {
  const match = /_part_(\d+)\.gif$/i.exec(name)
  return match ? Number.parseInt(match[1], 10) - 1 : 0
}

async function recoverPartColors(
  current: WorkerArtifactData,
  partIndex: number,
  fps: number,
  budgetKb: number,
  options: SplitRecoveryOptions,
): Promise<WorkerArtifactData> {
  let accepted = current
  let acceptedColors = current.finalColors
  const headroom = budgetKb - current.sizeKb

  if (acceptedColors >= 256 || headroom <= 0) {
    return accepted
  }

  options.emit(
    'quality-recovery',
    `${options.label} color recovery for ${current.name}: ${headroom.toFixed(1)}KB headroom.`,
  )

  const tryCandidate = async (colors: number, kind: string): Promise<boolean> => {
    const attempt = await options.runFixedSplitPart(
      partIndex,
      fps,
      colors,
      `${options.label} color recovery: trying ${current.name} at colors=${colors}.`,
    )
    if (attempt.sizeKb > budgetKb) {
      options.emit(
        'quality-recovery',
        `${options.label} ${kind} color recovery rejected for ${current.name}: colors=${colors} produced ${attempt.sizeKb.toFixed(1)}KB over ${budgetKb}KB.`,
      )
      return false
    }

    accepted = attempt
    acceptedColors = colors
    options.emit(
      'quality-recovery',
      `${options.label} accepted ${current.name} at colors=${colors}: ${attempt.sizeKb.toFixed(1)}KB.`,
    )
    return true
  }

  const ladderCandidates = buildQualityRecoveryCandidates({
    fps,
    colors: acceptedColors,
    allowColorDrop: true,
  })

  for (const candidate of ladderCandidates) {
    const previousAcceptedColors = acceptedColors
    const fit = await tryCandidate(candidate.colors, 'ladder')
    if (!fit) {
      for (const colors of buildIntermediateColorRecoveryCandidates(previousAcceptedColors, candidate.colors)) {
        await tryCandidate(colors, 'intermediate')
      }
      break
    }
  }

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
  options.emit(
    'quality-recovery',
    `${options.label} batch fit satisfied under ${budgetKb}KB; trying shared FPS recovery before color recovery.`,
  )

  if (options.retryAllowFpsDrop && currentFps < options.originalFps) {
    for (const fps of buildSharedFpsRecoveryCandidates(currentFps, options.originalFps)) {
      const byIndex = new Map(currentItems.map((item) => [partIndexFromName(item.name), item]))
      const attempt = await Promise.all(
        options.partOrder.map((partIndex) => {
          const current = byIndex.get(partIndex)
          const colors = current?.finalColors ?? 256
          return options.runFixedSplitPart(
            partIndex,
            fps,
            colors,
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

  if (!options.retryAllowColorDrop) {
    return currentItems
  }

  const byIndex = new Map(currentItems.map((item) => [partIndexFromName(item.name), item]))
  for (const partIndex of options.partOrder) {
    const current = byIndex.get(partIndex)
    if (!current) {
      continue
    }
    const recovered = await recoverPartColors(current, partIndex, currentFps, budgetKb, options)
    byIndex.set(partIndex, recovered)
  }

  return Array.from(byIndex.entries())
    .sort(([left], [right]) => left - right)
    .map(([, item]) => item)
}
