import type { ConversionConfig } from './types'

export const LONG_MP4_SECONDS = 20
export const LONG_MP4_MIN_BYTES = 1024 * 1024

export interface SourceMediaMetadata {
  durationSec: number | null
  sizeBytes: number
  mimeType: string
  name: string
}

function isMp4Like(metadata: SourceMediaMetadata): boolean {
  const mime = metadata.mimeType.trim().toLowerCase()
  const name = metadata.name.trim().toLowerCase()
  return mime === 'video/mp4' || name.endsWith('.mp4') || name.endsWith('.m4v')
}

export function shouldShowLongMp4Memo(metadata: SourceMediaMetadata | null): boolean {
  if (!metadata || metadata.durationSec === null) {
    return false
  }
  return (
    isMp4Like(metadata) &&
    metadata.durationSec > LONG_MP4_SECONDS &&
    metadata.sizeBytes >= LONG_MP4_MIN_BYTES
  )
}

export function shouldShowWorkshopMemoryMemo(config: ConversionConfig): boolean {
  return config.preset === 'workshop' && config.workshopRows === 3
}
