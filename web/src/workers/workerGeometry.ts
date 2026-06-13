import { computeTargetHeight } from '../lib/defaults'
import type { ConvertFeaturedPayload, ConvertGuidePayload, ConvertPartPayload } from '../lib/types'
import { distributeEvenly } from '../lib/workshopRows'

const SCALE_FLAGS = 'bicubic'

export interface PartGeometry {
  baseFilter: string
  outputWidth: number
  targetHeight: number
}

export interface SingleGeometry {
  baseFilter: string
  width: number
  height: number
}

export function buildPartGeometry(payload: ConvertPartPayload): PartGeometry {
  const requestedSplitWidths = payload.splitWidths
  const splitWidths =
    requestedSplitWidths && requestedSplitWidths.length > 0
      ? requestedSplitWidths.map((width) => Math.max(1, Math.floor(width)))
      : Array.from({ length: payload.parts }, () => payload.partWidth)
  const columns = Math.max(1, Math.floor(payload.splitColumns ?? splitWidths.length))
  const rows = Math.max(1, Math.floor(payload.splitRows ?? 1))
  const totalTargetWidth = splitWidths.reduce((sum, width) => sum + width, 0)
  const totalTargetHeight = computeTargetHeight(payload.srcWidth, payload.srcHeight, totalTargetWidth)
  const requestedRowHeights = payload.splitRowHeights
  const rowHeights =
    requestedRowHeights && requestedRowHeights.length === rows
      ? requestedRowHeights.map((height) => Math.max(1, Math.floor(height)))
      : distributeEvenly(totalTargetHeight, rows)
  const columnIndex = payload.partIndex % columns
  const rowIndex = Math.min(rows - 1, Math.floor(payload.partIndex / columns))
  const outputWidth = splitWidths[columnIndex] ?? payload.partWidth
  const outputHeight = rowHeights[rowIndex] ?? totalTargetHeight
  const cropX = splitWidths
    .slice(0, columnIndex)
    .reduce((sum, width) => sum + width, 0)
  const cropY = rowHeights
    .slice(0, rowIndex)
    .reduce((sum, height) => sum + height, 0)
  const baseFilter =
    `scale=${totalTargetWidth}:${totalTargetHeight}:flags=${SCALE_FLAGS},` +
    `crop=${outputWidth}:${outputHeight}:${cropX}:${cropY}`

  return {
    baseFilter,
    outputWidth,
    targetHeight: outputHeight,
  }
}

export function buildFeaturedGeometry(payload: ConvertFeaturedPayload): SingleGeometry {
  const targetHeight = computeTargetHeight(payload.srcWidth, payload.srcHeight, payload.featuredWidth)
  return {
    baseFilter: `scale=${payload.featuredWidth}:${targetHeight}:flags=${SCALE_FLAGS}`,
    width: payload.featuredWidth,
    height: targetHeight,
  }
}

export function buildGuideGeometry(payload: ConvertGuidePayload): SingleGeometry {
  return {
    baseFilter:
      `scale=${payload.guideSize}:${payload.guideSize}:flags=${SCALE_FLAGS}:force_original_aspect_ratio=increase,` +
      `crop=${payload.guideSize}:${payload.guideSize}`,
    width: payload.guideSize,
    height: payload.guideSize,
  }
}
