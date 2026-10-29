// Crop and trim picked in the Cut Preview editor. They are applied as ffmpeg filters in front of
// the preset scale/crop chain, so the conversion reads the edited video without an extra lossy
// re-encode of the source.

import type { SourceProbe } from './types'

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface TrimRange {
  startSec: number
  endSec: number
}

export interface SourceEdit {
  /** In source pixels. Null keeps the full frame. */
  crop: CropRect | null
  /** In seconds of the original timeline. Null keeps the full duration (and the dark intro skip). */
  trim: TrimRange | null
}

export const EMPTY_SOURCE_EDIT: SourceEdit = { crop: null, trim: null }

/** Smallest crop side in source pixels. */
export const MIN_CROP_SIZE = 16
/** Shortest trim in seconds. */
export const MIN_TRIM_SEC = 0.1

export function hasSourceEdit(edit: SourceEdit | null | undefined): edit is SourceEdit {
  return Boolean(edit && (edit.crop || edit.trim))
}

/** Rounds the crop to whole pixels inside the source frame. Returns null for a full-frame crop. */
export function normalizeCrop(crop: CropRect, srcWidth: number, srcHeight: number): CropRect | null {
  const minWidth = Math.min(MIN_CROP_SIZE, srcWidth)
  const minHeight = Math.min(MIN_CROP_SIZE, srcHeight)
  const width = Math.round(Math.min(srcWidth, Math.max(minWidth, crop.width)))
  const height = Math.round(Math.min(srcHeight, Math.max(minHeight, crop.height)))
  const x = Math.round(Math.min(srcWidth - width, Math.max(0, crop.x)))
  const y = Math.round(Math.min(srcHeight - height, Math.max(0, crop.y)))
  if (x === 0 && y === 0 && width === srcWidth && height === srcHeight) {
    return null
  }
  return { x, y, width, height }
}

/** Keeps the trim inside the source duration. Returns null when it covers the whole video. */
export function normalizeTrim(trim: TrimRange, durationSec: number): TrimRange | null {
  if (!(durationSec > 0)) {
    return null
  }
  const startSec = Math.min(Math.max(0, trim.startSec), Math.max(0, durationSec - MIN_TRIM_SEC))
  const endSec = Math.min(durationSec, Math.max(startSec + MIN_TRIM_SEC, trim.endSec))
  const round = (value: number) => Math.round(value * 1000) / 1000
  if (startSec <= 0.0005 && endSec >= durationSec - 0.0005) {
    return null
  }
  return { startSec: round(startSec), endSec: round(endSec) }
}

/** Largest centered rectangle of the given aspect ratio (width / height) inside the frame. */
export function centeredCropForAspect(aspect: number, srcWidth: number, srcHeight: number): CropRect {
  let width = srcWidth
  let height = width / aspect
  if (height > srcHeight) {
    height = srcHeight
    width = height * aspect
  }
  return {
    x: Math.round((srcWidth - width) / 2),
    y: Math.round((srcHeight - height) / 2),
    width: Math.round(width),
    height: Math.round(height),
  }
}

/**
 * ffmpeg filters for the edit, placed in front of the preset chain. The trim start is applied as
 * an input seek (startOffsetSec), so only the length is cut here.
 */
export function buildSourceEditFilter(edit: SourceEdit | null | undefined, isStillImage: boolean): string | undefined {
  if (!edit) {
    return undefined
  }
  const filters: string[] = []
  if (edit.trim && !isStillImage) {
    filters.push(`trim=duration=${(edit.trim.endSec - edit.trim.startSec).toFixed(3)}`)
  }
  if (edit.crop) {
    const { x, y, width, height } = edit.crop
    filters.push(`crop=${width}:${height}:${x}:${y}`)
  }
  return filters.length > 0 ? filters.join(',') : undefined
}

/** The probe as the conversion sees it after the edit: cropped size, trimmed length and start. */
export function applySourceEditToProbe(
  probe: SourceProbe,
  edit: SourceEdit | null | undefined,
  isStillImage: boolean,
): SourceProbe {
  if (!edit) {
    return probe
  }
  const trim = isStillImage ? null : edit.trim
  return {
    ...probe,
    width: edit.crop?.width ?? probe.width,
    height: edit.crop?.height ?? probe.height,
    duration: trim ? Math.max(0, trim.endSec - trim.startSec) : probe.duration,
    // A manual trim replaces the automatic dark intro skip.
    startOffsetSec: trim ? trim.startSec : probe.startOffsetSec,
  }
}

/** Which edges a drag moves. All false means the whole box moves. */
export interface CropDragEdges {
  left: boolean
  right: boolean
  top: boolean
  bottom: boolean
}

/**
 * The crop after dragging by (dx, dy) source pixels from `start`. With an aspect ratio, only
 * corner drags are expected; the corner opposite the dragged one stays fixed.
 */
export function dragCrop(
  start: CropRect,
  edges: CropDragEdges,
  dx: number,
  dy: number,
  srcWidth: number,
  srcHeight: number,
  aspect: number | null,
): CropRect {
  const minW = Math.min(MIN_CROP_SIZE, srcWidth)
  const minH = Math.min(MIN_CROP_SIZE, srcHeight)
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

  if (!edges.left && !edges.right && !edges.top && !edges.bottom) {
    return {
      ...start,
      x: Math.round(clamp(start.x + dx, 0, srcWidth - start.width)),
      y: Math.round(clamp(start.y + dy, 0, srcHeight - start.height)),
    }
  }

  const right = start.x + start.width
  const bottom = start.y + start.height

  if (aspect && (edges.left || edges.right) && (edges.top || edges.bottom)) {
    // Room from the fixed corner to the frame edge in the drag direction.
    const maxW = edges.left ? right : srcWidth - start.x
    const maxH = edges.top ? bottom : srcHeight - start.y
    let width = clamp(start.width + (edges.left ? -dx : dx), minW, maxW)
    let height = width / aspect
    if (height > maxH) {
      height = maxH
      width = height * aspect
    }
    if (height < minH) {
      height = minH
      width = Math.min(maxW, height * aspect)
    }
    return {
      x: Math.round(edges.left ? right - width : start.x),
      y: Math.round(edges.top ? bottom - height : start.y),
      width: Math.round(width),
      height: Math.round(height),
    }
  }

  let x = start.x
  let y = start.y
  let width = start.width
  let height = start.height
  if (edges.left) {
    x = clamp(start.x + dx, 0, right - minW)
    width = right - x
  } else if (edges.right) {
    width = clamp(start.width + dx, minW, srcWidth - start.x)
  }
  if (edges.top) {
    y = clamp(start.y + dy, 0, bottom - minH)
    height = bottom - y
  } else if (edges.bottom) {
    height = clamp(start.height + dy, minH, srcHeight - start.y)
  }
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }
}
