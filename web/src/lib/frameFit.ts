import { computeTargetHeight } from './defaults'
import type { ConversionConfig, HeightFit } from './types'

/** Upper bound for a custom output height. Taller frames multiply worker memory and GIF size. */
export const MAX_OUTPUT_HEIGHT = 2000

/** Where the scaled source lands inside the output frame. Negative x/y means it is cropped. */
export interface FrameFit {
  scaledWidth: number
  scaledHeight: number
  x: number
  y: number
}

export function clampOutputHeight(height: number): number {
  if (!Number.isFinite(height) || height <= 0) {
    return 0
  }
  return Math.min(MAX_OUTPUT_HEIGHT, Math.max(1, Math.round(height)))
}

/** The custom height in pixels, or null when the height follows the source aspect ratio. */
export function resolveCustomHeight(config: Pick<ConversionConfig, 'preset' | 'outputHeight'>): number | null {
  if (config.preset === 'guide') {
    return null
  }
  const height = clampOutputHeight(config.outputHeight)
  return height > 0 ? height : null
}

/** Height of the whole output frame (before rows are split) for a frame of `frameWidth`. */
export function resolveFrameHeight(
  config: Pick<ConversionConfig, 'preset' | 'outputHeight'>,
  srcWidth: number,
  srcHeight: number,
  frameWidth: number,
): number {
  return resolveCustomHeight(config) ?? computeTargetHeight(srcWidth, srcHeight, frameWidth)
}

/**
 * Fit the source into a fixed frame. 'crop' fills the frame and trims the overflow evenly;
 * 'letterbox' shows the whole source and pads the rest with black.
 */
export function computeFrameFit(
  srcWidth: number,
  srcHeight: number,
  frameWidth: number,
  frameHeight: number,
  fit: HeightFit,
): FrameFit {
  if (srcWidth <= 0 || srcHeight <= 0) {
    return { scaledWidth: frameWidth, scaledHeight: frameHeight, x: 0, y: 0 }
  }
  const scaleX = frameWidth / srcWidth
  const scaleY = frameHeight / srcHeight
  const scale = fit === 'crop' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY)
  const clampSize = (value: number, frame: number) =>
    fit === 'crop' ? Math.max(frame, value) : Math.max(1, Math.min(frame, value))
  const scaledWidth = clampSize(Math.round(srcWidth * scale), frameWidth)
  const scaledHeight = clampSize(Math.round(srcHeight * scale), frameHeight)
  return {
    scaledWidth,
    scaledHeight,
    x: Math.floor((frameWidth - scaledWidth) / 2),
    y: Math.floor((frameHeight - scaledHeight) / 2),
  }
}

/** ffmpeg filters that turn the (edited) source into a `frameWidth`×`frameHeight` frame. */
export function buildFrameFilter(
  srcWidth: number,
  srcHeight: number,
  frameWidth: number,
  frameHeight: number,
  fit: HeightFit | undefined,
  scaleFlags: string,
): string {
  if (!fit) {
    return `scale=${frameWidth}:${frameHeight}:flags=${scaleFlags}`
  }
  const { scaledWidth, scaledHeight, x, y } = computeFrameFit(srcWidth, srcHeight, frameWidth, frameHeight, fit)
  const scale = `scale=${scaledWidth}:${scaledHeight}:flags=${scaleFlags}`
  if (scaledWidth === frameWidth && scaledHeight === frameHeight) {
    return scale
  }
  return fit === 'crop'
    ? `${scale},crop=${frameWidth}:${frameHeight}:${-x}:${-y}`
    : `${scale},pad=${frameWidth}:${frameHeight}:${x}:${y}:color=black`
}
