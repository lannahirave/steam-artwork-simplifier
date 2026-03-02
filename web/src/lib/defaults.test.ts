import { describe, expect, it } from 'vitest'
import { applyPreset, computeTargetHeight, getDefaultConfig, resolvePresetSettings } from './defaults'

describe('preset defaults', () => {
  it('builds workshop defaults', () => {
    const config = getDefaultConfig('workshop')
    expect(config.preset).toBe('workshop')
    expect(config.parts).toBe(5)
    expect(config.partWidth).toBe(150)
  })

  it('switches to featured limits and worker count', () => {
    const workshop = getDefaultConfig('workshop')
    const featured = applyPreset(workshop, 'featured')
    const resolved = resolvePresetSettings(featured)

    expect(resolved.parts).toBe(1)
    expect(resolved.partWidth).toBe(featured.featuredWidth)
    expect(featured.maxGifKb).toBe(4500)
  })

  it('computes target height with preserved ratio', () => {
    expect(computeTargetHeight(1920, 1080, 750)).toBe(422)
  })
})
