import { computeTargetHeight } from '../lib/defaults'
import type { ConvertFeaturedPayload, ConvertGuidePayload, ConvertPartPayload } from '../lib/types'

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
    requestedSplitWidths && requestedSplitWidths.length === payload.parts
      ? requestedSplitWidths.map((width) => Math.max(1, Math.floor(width)))
      : Array.from({ length: payload.parts }, () => payload.partWidth)
  const totalTargetWidth = splitWidths.reduce((sum, width) => sum + width, 0)
  const targetHeight = computeTargetHeight(payload.srcWidth, payload.srcHeight, totalTargetWidth)
  const outputWidth = splitWidths[payload.partIndex] ?? payload.partWidth
  const cropX = splitWidths
    .slice(0, payload.partIndex)
    .reduce((sum, width) => sum + width, 0)
  const baseFilter =
    `scale=${totalTargetWidth}:${targetHeight}:flags=${SCALE_FLAGS},` +
    `crop=${outputWidth}:${targetHeight}:${cropX}:0`

  return {
    baseFilter,
    outputWidth,
    targetHeight,
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
