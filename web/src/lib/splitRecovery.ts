import {
  allItemsFit,
  buildQualityRecoveryCandidates,
  buildSharedFpsRecoveryCandidates,
  selectBatchRecoveryBudget,
} from './sizeStrategy'
import {
  clampGifskiQuality,
  createQualityBinarySearch,
  nextQualityBinaryProbe,
  recordQualityBinaryProbe,
  type QualityBinarySearchState,
} from './gifskiQuality'
import { FinishCurrentConversionError } from './conversionWorkerPool'
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
  splitColumns?: number
  runFixedSplitPart: (partIndex: number, fps: number, quality: number, label: string) => Promise<WorkerArtifactData>
  runFixedSplitPartQualityProbe: (
    partIndex: number,
    fps: number,
    quality: number,
    budgetKb: number,
    label: string,
  ) => Promise<WorkerArtifactData>
  shouldFinishCurrent?: () => boolean
  onCheckpoint?: (items: WorkerArtifactData[]) => void
  emit: (stage: string, message: string) => void
}

function ensureNotFinishing(options: SplitRecoveryOptions): void {
  if (options.shouldFinishCurrent?.() === true) {
    throw new FinishCurrentConversionError()
  }
}

interface QualityRecoveryState {
  partIndex: number
  current: WorkerArtifactData
  search: QualityBinarySearchState
  accepted: WorkerArtifactData
  acceptedQuality: number
  activeHigh: number
  ladderHighs: number[]
  ladderIndex: number
  done: boolean
}

export function partIndexFromName(name: string, columns = 1): number {
  const gridMatch = /_row_(\d+)_part_(\d+)\.gif$/i.exec(name)
  if (gridMatch) {
    const row = Number.parseInt(gridMatch[1], 10) - 1
    const column = Number.parseInt(gridMatch[2], 10) - 1
    return row * Math.max(1, columns) + column
  }
  const match = /_part_(\d+)\.gif$/i.exec(name)
  return match ? Number.parseInt(match[1], 10) - 1 : 0
}

function createQualityRecoveryState(
  current: WorkerArtifactData,
  partIndex: number,
  budgetKb: number,
  options: SplitRecoveryOptions,
): QualityRecoveryState | null {
  const acceptedQuality = clampGifskiQuality(current.finalQuality)
  const headroom = budgetKb - current.sizeKb

  if (acceptedQuality >= 100 || headroom <= 0) {
    return null
  }

  const ladderHighs = buildQualityRecoveryCandidates({
    fps: current.finalFps,
    quality: acceptedQuality,
    allowQualityDrop: options.retryAllowQualityDrop,
  }).map((candidate) => candidate.quality)

  if (ladderHighs.length === 0) {
    return null
  }

  options.emit(
    'quality-recovery',
    `${options.label} quality recovery for ${current.name}: ${headroom.toFixed(1)}KB headroom; searching quality ${acceptedQuality}->${ladderHighs[0]}.`,
  )

  return {
    partIndex,
    current,
    search: createQualityBinarySearch(acceptedQuality, ladderHighs[0]),
    accepted: current,
    acceptedQuality,
    activeHigh: ladderHighs[0],
    ladderHighs,
    ladderIndex: 0,
    done: false,
  }
}

function advanceQualityRecoveryRange(state: QualityRecoveryState, options: SplitRecoveryOptions): void {
  if (state.done || nextQualityBinaryProbe(state.search) !== null) {
    return
  }

  if (state.acceptedQuality < state.activeHigh) {
    state.done = true
    return
  }

  const nextIndex = state.ladderHighs.findIndex((quality, index) =>
    index > state.ladderIndex && quality > state.acceptedQuality,
  )
  if (nextIndex === -1) {
    state.done = true
    return
  }

  const nextHigh = state.ladderHighs[nextIndex]
  options.emit(
    'quality-recovery',
    `${options.label} quality recovery expanding ${state.current.name}: searching quality ${state.acceptedQuality}->${nextHigh}.`,
  )
  state.ladderIndex = nextIndex
  state.activeHigh = nextHigh
  state.search = createQualityBinarySearch(state.acceptedQuality, nextHigh)
}

async function recoverPartQualityWave(
  states: QualityRecoveryState[],
  fps: number,
  budgetKb: number,
  options: SplitRecoveryOptions,
  checkpoint: () => void,
): Promise<void> {
  let wave = 1

  while (true) {
    ensureNotFinishing(options)
    const probes = states
      .filter((state) => !state.done)
      .map((state) => ({
        state,
        quality: nextQualityBinaryProbe(state.search),
      }))
      .filter((probe): probe is { state: QualityRecoveryState; quality: number } => probe.quality !== null)

    if (probes.length === 0) {
      break
    }

    options.emit('quality-recovery', `${options.label} quality recovery wave ${wave}: probing ${probes.length} part(s).`)
    const attempts = await Promise.all(probes.map(({ state, quality }) =>
      options.runFixedSplitPartQualityProbe(
        state.partIndex,
        fps,
        quality,
        budgetKb,
        `${options.label} quality recovery wave ${wave}: probing ${state.current.name} at quality=${quality}.`,
      ).then((attempt) => ({ state, quality, attempt })),
    ))

    for (const { state, quality, attempt } of attempts) {
      const candidateQuality = clampGifskiQuality(attempt.finalQuality)
      const accepted = candidateQuality > state.acceptedQuality && attempt.sizeKb <= budgetKb
      state.search = recordQualityBinaryProbe(state.search, quality, accepted)

      if (!accepted) {
        options.emit(
          'quality-recovery',
          `${options.label} quality probe rejected for ${state.current.name}: quality=${candidateQuality} produced ${attempt.sizeKb.toFixed(1)}KB over ${budgetKb}KB.`,
        )
        continue
      }

      state.accepted = {
        ...attempt,
        finalQuality: candidateQuality,
      }
      state.acceptedQuality = candidateQuality
      options.emit(
        'quality-recovery',
        `${options.label} quality probe accepted for ${state.current.name}: quality=${candidateQuality}, ${attempt.sizeKb.toFixed(1)}KB.`,
      )
    }

    for (const state of states) {
      advanceQualityRecoveryRange(state, options)
    }

    checkpoint()

    wave += 1
  }

  for (const state of states) {
    options.emit(
      'quality-recovery',
      `${options.label} final quality recovery for ${state.current.name}: quality=${state.accepted.finalQuality}, ${state.accepted.sizeKb.toFixed(1)}KB.`,
    )
  }
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
      ensureNotFinishing(options)
      const byIndex = new Map(currentItems.map((item) => [partIndexFromName(item.name, options.splitColumns), item]))
      const limiterEntry = Array.from(byIndex.entries()).reduce((largest, entry) =>
        entry[1].sizeKb > largest[1].sizeKb ? entry : largest,
      )
      const limiterPartIndex = limiterEntry[0]
      const limiterCurrent = limiterEntry[1]
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
      options.onCheckpoint?.([...currentItems])
      options.emit('quality-recovery', `${options.label} accepted shared fps=${fps}; all parts fit under ${budgetKb}KB.`)
    }
  }

  if (!options.retryAllowQualityDrop) {
    return currentItems
  }

  const byIndex = new Map(currentItems.map((item) => [partIndexFromName(item.name, options.splitColumns), item]))
  const recoveryStates: QualityRecoveryState[] = []
  for (const partIndex of options.partOrder) {
    ensureNotFinishing(options)
    const current = byIndex.get(partIndex)
    if (!current) {
      continue
    }
    const state = createQualityRecoveryState(current, partIndex, budgetKb, options)
    if (state) {
      recoveryStates.push(state)
    }
  }

  ensureNotFinishing(options)
  const checkpointQualityRecovery = (): void => {
    for (const state of recoveryStates) {
      byIndex.set(state.partIndex, state.accepted)
    }
    options.onCheckpoint?.(
      Array.from(byIndex.entries())
        .sort(([left], [right]) => left - right)
        .map(([, item]) => item),
    )
  }
  await recoverPartQualityWave(recoveryStates, currentFps, budgetKb, options, checkpointQualityRecovery)
  for (const state of recoveryStates) {
    byIndex.set(state.partIndex, state.accepted)
  }

  return Array.from(byIndex.entries())
    .sort(([left], [right]) => left - right)
    .map(([, item]) => item)
}
