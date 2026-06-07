import { describe, expect, it } from 'vitest'
import { applyPreset, getDefaultConfig } from './defaults'
import {
  computePresetTargetHeight,
  getPresetJobCount,
  getPresetSplitWidths,
  resolvePresetPlan,
} from './presetPlan'

describe('preset plan', () => {
  it('resolves workshop split invariants from config', () => {
    const config = getDefaultConfig('workshop')
    const plan = resolvePresetPlan(config)

    expect(plan).toMatchObject({
      preset: 'workshop',
      label: 'Workshop',
      isSplit: true,
      isSingleOutput: false,
      jobCount: 5,
      partWidth: 150,
      totalTargetWidth: 750,
      sampleGifWidth: 150,
      effectiveWorkerCount: config.workerCount,
    })
    expect(getPresetSplitWidths(config)).toEqual([150, 150, 150, 150, 150])
    expect(getPresetJobCount(config)).toBe(5)
  })

  it('resolves fixed showcase split widths', () => {
    const config = applyPreset(getDefaultConfig('workshop'), 'showcase')
    const plan = resolvePresetPlan(config)

    expect(plan).toMatchObject({
      label: 'Showcase',
      isSplit: true,
      jobCount: 2,
      partWidth: 506,
      splitWidths: [506, 100],
      totalTargetWidth: 606,
      sampleGifWidth: 506,
    })
  })

  it('resolves single-output featured and guide geometry inputs', () => {
    const featured = applyPreset(getDefaultConfig('workshop'), 'featured')
    const guide = applyPreset(getDefaultConfig('workshop'), 'guide')

    expect(resolvePresetPlan(featured)).toMatchObject({
      label: 'Featured',
      isSingleOutput: true,
      jobCount: 1,
      partWidth: featured.featuredWidth,
      effectiveWorkerCount: 1,
    })
    expect(resolvePresetPlan(guide)).toMatchObject({
      label: 'Guide',
      isSingleOutput: true,
      jobCount: 1,
      partWidth: 195,
      guideSize: 195,
      effectiveWorkerCount: 1,
    })
  })

  it('computes preset target height from the resolved plan', () => {
    const workshop = getDefaultConfig('workshop')
    const guide = applyPreset(workshop, 'guide')

    expect(computePresetTargetHeight(workshop, 1920, 1080)).toBe(422)
    expect(computePresetTargetHeight(guide, 1920, 1080)).toBe(195)
  })
})
