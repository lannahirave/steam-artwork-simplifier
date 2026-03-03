import { DEFAULTS } from '../lib/defaults'
import type { ConversionArtifact, ConversionConfig } from '../lib/types'

export type TabKey = 'convert' | 'patch' | 'steam' | 'guides'
export type ThemeMode = 'auto' | 'light' | 'dark'

export const MAX_SAFE_WASM_WORKERS = 3
export const THEME_STORAGE_KEY = 'steam-artwork-theme-mode'
export const GUIDE_SIZE = 195

const ESTIMATE_BPPF_BASELINES: Record<ConversionConfig['preset'], number> = {
  workshop: 0.16,
  featured: 0.18,
  guide: 0.21,
  showcase: 0.16,
}

export interface GuideSection {
  key: string
  title: string
  badge: string
  steps: string[]
  tip?: string
}

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    key: 'workshop',
    title: 'Workshop GIFs (5 parts)',
    badge: 'Convert',
    steps: [
      'Open Convert tab and keep preset as Workshop (5x150 slices).',
      'Upload your source media file.',
      'Set GIF FPS and Min GIF FPS, or click Estimate for auto FPS.',
      'Click Run Conversion and wait for Output ready in...',
      'Review all 5 previews, then download single files or ZIP.',
    ],
    tip: 'If quality drops, keep FPS reduction enabled so frame-rate changes are tried before color reduction.',
  },
  {
    key: 'featured',
    title: 'Featured GIF (single wide)',
    badge: 'Convert',
    steps: [
      'Switch preset to Featured (single 630px).',
      'Upload source media (video, gif, png, webp, jpg, jpeg, bmp).',
      'Tune Featured Width and FPS if needed.',
      'Run conversion and check size/FPS/color metadata under output.',
      'Download featured.gif directly or as part of ZIP.',
    ],
    tip: 'Start with lower FPS before increasing lossy settings for better visual quality.',
  },
  {
    key: 'showcase',
    title: 'Artwork Showcase (506 + 100)',
    badge: 'Convert',
    steps: [
      'Switch preset to Artwork Showcase (fixed 506px + 100px split).',
      'Upload source media and tune FPS/size limits as needed.',
      'Run conversion and verify both split outputs in preview.',
      'Open Steam Helpers tab and copy either Artwork/Featured or Screenshot snippet (only one).',
      'Run one snippet in Steam Console to prefill invisible title and agreement checkbox.',
    ],
    tip: 'Use this flow only for the 506 + 100 showcase preset.',
  },
  {
    key: 'tuning',
    title: 'Fix size or quality issues',
    badge: 'Tuning',
    steps: [
      'Keep Allow FPS reduction enabled.',
      'Set realistic Max GIF KB and Target GIF KB.',
      'Leave standard retries off for speed-first behavior.',
      'Enable standard retries if you want extra target-size chasing.',
      'Use Worker Count 2-3 for speed, or 1 for stability debugging.',
    ],
    tip: 'Current pipeline prioritizes FPS drops first and only reduces colors later if still oversize.',
  },
  {
    key: 'patch',
    title: 'Patch existing files',
    badge: 'Patch',
    steps: [
      'Open Patch Tools tab.',
      'Use EOF Patch to rewrite last byte (default 0x21).',
      'Use GIF Header Patch to set logical width/height bytes.',
      'Optionally combine header + EOF in one run.',
      'Download patched outputs from the result list.',
    ],
  },
  {
    key: 'steam',
    title: 'Steam upload autofill',
    badge: 'Upload',
    steps: [
      'Open Steam Helpers tab and click Copy for workshop, artwork/featured, or screenshot snippet.',
      'Open the Steam upload page in your browser.',
      'Open DevTools Console.',
      'Paste one snippet and run it.',
      'Verify fields and finish upload.',
    ],
    tip: 'Snippets are intended for Steam upload pages only.',
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

export interface IsolationState {
  ok: boolean
  reason?: string
}

interface WorkerStageEvent {
  workerIndex: number
  stage: string
}

export function getIsolationState(): IsolationState {
  const params = new URLSearchParams(window.location.search)
  if (params.get('noiso') === '1') {
    return {
      ok: false,
      reason: 'Simulation mode enabled via ?noiso=1.',
    }
  }

  if (window.isSecureContext && window.crossOriginIsolated) {
    return { ok: true }
  }

  return {
    ok: false,
    reason:
      'This app requires cross-origin isolation to run ffmpeg.wasm multithread core (SharedArrayBuffer).',
  }
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

export function getColorReductionPercent(finalColors: number): number {
  const clamped = Math.min(256, Math.max(0, finalColors))
  return Math.max(0, Math.round((1 - clamped / 256) * 100))
}

export function resolveEstimateBppf(config: ConversionConfig): number {
  return Math.max(config.precheckBppf, ESTIMATE_BPPF_BASELINES[config.preset])
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
  if (config.preset === 'workshop' || config.preset === 'showcase') {
    return getPresetSplitWidths(config).length
  }
  return 1
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
  if (stage === 'ffmpeg') {
    return 0.35
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

