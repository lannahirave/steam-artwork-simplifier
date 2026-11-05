import type { AlphaHandling, BackgroundMode } from './types'

export const BACKGROUND_MODES = ['auto', 'transparent', 'black'] as const satisfies readonly BackgroundMode[]

/**
 * How the workers treat alpha. 'auto' keeps transparency only when the source has it, so ordinary
 * videos convert exactly as before; 'transparent' also makes letterbox bars see-through.
 */
export function resolveAlphaHandling(background: BackgroundMode, sourceHasAlpha: boolean): AlphaHandling | undefined {
  if (background === 'transparent') {
    return 'keep'
  }
  if (!sourceHasAlpha) {
    return undefined
  }
  return background === 'black' ? 'flatten' : 'keep'
}

/** True when an output file can carry the transparency (JPEG cannot). */
export function outputKeepsAlpha(alpha: AlphaHandling | undefined, fileName: string): boolean {
  return alpha === 'keep' && !/\.jpe?g$/i.test(fileName)
}
