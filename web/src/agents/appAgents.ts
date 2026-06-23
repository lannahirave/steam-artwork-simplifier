import type { ConversionArtifact } from '../lib/types'
import type { MessageId } from '../i18n/messages'
export { getQualityReductionPercent } from '../lib/gifskiQuality'

export type TabKey = 'convert' | 'patch' | 'steam' | 'guides'
export type ThemeMode = 'auto' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'steam-artwork-theme-mode'

export interface GuideSection {
  key: string
  title: MessageId
  badge: MessageId
  steps: MessageId[]
  tip?: MessageId
}

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    key: 'workshop',
    title: 'guides.workshop.title',
    badge: 'guides.badge.convert',
    steps: [
      'guides.workshop.step1',
      'guides.workshop.step2',
      'guides.workshop.step3',
      'guides.workshop.step4',
      'guides.workshop.step5',
    ],
    tip: 'guides.workshop.tip',
  },
  {
    key: 'featured',
    title: 'guides.featured.title',
    badge: 'guides.badge.convert',
    steps: [
      'guides.featured.step1',
      'guides.featured.step2',
      'guides.featured.step3',
      'guides.featured.step4',
      'guides.featured.step5',
    ],
    tip: 'guides.featured.tip',
  },
  {
    key: 'showcase',
    title: 'guides.showcase.title',
    badge: 'guides.badge.convert',
    steps: [
      'guides.showcase.step1',
      'guides.showcase.step2',
      'guides.showcase.step3',
      'guides.showcase.step4',
      'guides.showcase.step5',
    ],
    tip: 'guides.showcase.tip',
  },
  {
    key: 'guide',
    title: 'guides.guide.title',
    badge: 'guides.badge.convert',
    steps: [
      'guides.guide.step1',
      'guides.guide.step2',
      'guides.guide.step3',
      'guides.guide.step4',
      'guides.guide.step5',
    ],
    tip: 'guides.guide.tip',
  },
  {
    key: 'tuning',
    title: 'guides.tuning.title',
    badge: 'guides.badge.tuning',
    steps: [
      'guides.tuning.step1',
      'guides.tuning.step2',
      'guides.tuning.step3',
      'guides.tuning.step4',
      'guides.tuning.step5',
    ],
    tip: 'guides.tuning.tip',
  },
  {
    key: 'patch',
    title: 'guides.patch.title',
    badge: 'guides.badge.patch',
    steps: [
      'guides.patch.step1',
      'guides.patch.step2',
      'guides.patch.step3',
      'guides.patch.step4',
      'guides.patch.step5',
    ],
  },
  {
    key: 'steam',
    title: 'guides.steam.title',
    badge: 'guides.badge.upload',
    steps: [
      'guides.steam.step1',
      'guides.steam.step2',
      'guides.steam.step3',
      'guides.steam.step4',
      'guides.steam.step5',
    ],
    tip: 'guides.steam.tip',
  },
]

export interface ArtifactView {
  artifact: ConversionArtifact
  url: string
}

export interface OutputItem {
  name: string
  blob: Blob
  note: string
}

interface WorkerStageEvent {
  workerIndex: number
  stage: string
}

export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export function toFiles(fileList: FileList | null): File[] {
  if (!fileList) {
    return []
  }
  return Array.from(fileList)
}

export function toArtifactViews(artifacts: ConversionArtifact[]): ArtifactView[] {
  return artifacts.map((artifact) => ({
    artifact,
    url: URL.createObjectURL(artifact.blob),
  }))
}

export function cleanupArtifactViews(items: ArtifactView[]): void {
  for (const item of items) {
    URL.revokeObjectURL(item.url)
  }
}

export function parseWorkerStage(stage: string): WorkerStageEvent | null {
  const match = /^worker-(\d+):(.+)$/.exec(stage)
  if (!match) {
    return null
  }
  return {
    workerIndex: Number.parseInt(match[1], 10),
    stage: match[2],
  }
}

export function getBaseProgress(stage: string): number {
  if (stage === 'init') {
    return 4
  }
  if (stage === 'input') {
    return 10
  }
  if (stage === 'probe') {
    return 18
  }
  if (stage === 'precheck') {
    return 24
  }
  if (stage === 'convert') {
    return 30
  }
  if (stage === 'done') {
    return 100
  }
  return 0
}

export function getWorkerStageWeight(stage: string): number {
  if (stage === 'frames') {
    return 0.35
  }
  if (stage === 'gifski') {
    return 0.75
  }
  if (stage === 'convert') {
    return 0.5
  }
  if (stage === 'standard') {
    return 0.75
  }
  if (stage === 'lossy') {
    return 0.92
  }
  return 0.45
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
