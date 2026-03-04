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

  it('switches to showcase fixed split defaults', () => {
    const workshop = getDefaultConfig('workshop')
    const showcase = applyPreset(workshop, 'showcase')
    const resolved = resolvePresetSettings(showcase)

    expect(showcase.preset).toBe('showcase')
    expect(resolved.parts).toBe(2)
    expect(resolved.partWidth).toBe(506)
    expect(showcase.maxGifKb).toBe(5000)
    expect(showcase.targetGifKb).toBe(4500)
  })

  it('uses 2000KB limits for guide preset', () => {
    const workshop = getDefaultConfig('workshop')
    const guideFromPresetSwitch = applyPreset(workshop, 'guide')
    const guideFromDefault = getDefaultConfig('guide')

    expect(guideFromPresetSwitch.maxGifKb).toBe(2000)
    expect(guideFromPresetSwitch.targetGifKb).toBe(2000)
    expect(guideFromDefault.maxGifKb).toBe(2000)
    expect(guideFromDefault.targetGifKb).toBe(2000)
  })

  it('computes target height with preserved ratio', () => {
    expect(computeTargetHeight(1920, 1080, 750)).toBe(422)
  })
})
