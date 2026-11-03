import { computeFrameFit, resolveCustomHeight, resolveFrameHeight, type FrameFit } from './frameFit'
import { GUIDE_SIZE, getPresetSplitWidths } from './presetPlan'
import type { ConversionConfig } from './types'
import { distributeEvenly } from './workshopRows'

export interface CutPiece {
  index: number
  x: number
  y: number
  width: number
  height: number
}

/**
 * Where each output GIF comes from, in the coordinates of the scaled source frame.
 * Mirrors the ffmpeg scale/crop filters in workers/workerGeometry.ts.
 */
export interface CutLayout {
  /** Size the whole source is scaled to before cutting. */
  frameWidth: number
  frameHeight: number
  /** Where the source sits in the frame: larger than the frame when cropped, smaller when letterboxed. */
  media: FrameFit
  pieces: CutPiece[]
}

export function computeCutLayout(config: ConversionConfig, srcWidth: number, srcHeight: number): CutLayout | null {
  if (srcWidth <= 0 || srcHeight <= 0) {
    return null
  }

  if (config.preset === 'guide') {
    // scale=…:force_original_aspect_ratio=increase, then a centered crop.
    const scale = Math.max(GUIDE_SIZE / srcWidth, GUIDE_SIZE / srcHeight)
    const frameWidth = Math.max(GUIDE_SIZE, Math.round(srcWidth * scale))
    const frameHeight = Math.max(GUIDE_SIZE, Math.round(srcHeight * scale))
    return {
      frameWidth,
      frameHeight,
      media: { scaledWidth: frameWidth, scaledHeight: frameHeight, x: 0, y: 0 },
      pieces: [
        {
          index: 0,
          x: Math.floor((frameWidth - GUIDE_SIZE) / 2),
          y: Math.floor((frameHeight - GUIDE_SIZE) / 2),
          width: GUIDE_SIZE,
          height: GUIDE_SIZE,
        },
      ],
    }
  }

  const splitWidths = getPresetSplitWidths(config)
  const frameWidth = splitWidths.reduce((sum, width) => sum + width, 0)
  const frameHeight = resolveFrameHeight(config, srcWidth, srcHeight, frameWidth)
  const media =
    resolveCustomHeight(config) !== null
      ? computeFrameFit(srcWidth, srcHeight, frameWidth, frameHeight, config.heightFit)
      : { scaledWidth: frameWidth, scaledHeight: frameHeight, x: 0, y: 0 }
  const rows = config.preset === 'workshop' ? config.workshopRows : 1
  const rowHeights = distributeEvenly(frameHeight, rows)
  const pieces: CutPiece[] = []

  let y = 0
  rowHeights.forEach((height) => {
    let x = 0
    splitWidths.forEach((width) => {
      pieces.push({ index: pieces.length, x, y, width, height })
      x += width
    })
    y += height
  })

  return { frameWidth, frameHeight, media, pieces }
}
