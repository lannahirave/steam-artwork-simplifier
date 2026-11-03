import { describe, expect, it } from 'vitest'
import { getDefaultConfig } from './defaults'
import { MAX_OUTPUT_HEIGHT, clampOutputHeight, computeFrameFit, resolveFrameHeight } from './frameFit'
import { computeCutLayout } from './cutPreview'

describe('frame fit', () => {
  it('follows the source shape until a height is set', () => {
    const config = getDefaultConfig('workshop')
    expect(resolveFrameHeight(config, 1920, 1080, 750)).toBe(422)
    expect(resolveFrameHeight({ ...config, outputHeight: 300 }, 1920, 1080, 750)).toBe(300)
  })

  it('keeps the Guide preset square', () => {
    const guide = { ...getDefaultConfig('guide'), outputHeight: 600 }
    const layout = computeCutLayout(guide, 1920, 1080)
    expect(layout?.pieces[0]).toMatchObject({ width: 195, height: 195 })
  })

  it('clamps heights to a safe range', () => {
    expect(clampOutputHeight(Number.NaN)).toBe(0)
    expect(clampOutputHeight(-5)).toBe(0)
    expect(clampOutputHeight(99_999)).toBe(MAX_OUTPUT_HEIGHT)
  })

  it('crops overflow evenly or letterboxes inside the frame', () => {
    expect(computeFrameFit(1920, 1080, 750, 750, 'crop')).toEqual({ scaledWidth: 1333, scaledHeight: 750, x: -292, y: 0 })
    expect(computeFrameFit(1920, 1080, 750, 750, 'letterbox')).toEqual({ scaledWidth: 750, scaledHeight: 422, x: 0, y: 164 })
  })

  it('shows the custom height in the cut preview', () => {
    const config = { ...getDefaultConfig('workshop'), outputHeight: 600, heightFit: 'letterbox' as const }
    const layout = computeCutLayout(config, 1920, 1080)
    expect(layout).toMatchObject({ frameWidth: 750, frameHeight: 600, media: { scaledHeight: 422, y: 89 } })
    expect(layout?.pieces.every((piece) => piece.height === 600)).toBe(true)
  })
})
