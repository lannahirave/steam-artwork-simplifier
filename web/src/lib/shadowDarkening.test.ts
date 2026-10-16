import { describe, expect, it } from 'vitest'
import { buildShadowDarkeningFilter, withShadowDarkening } from './shadowDarkening'

describe('shadow darkening filter', () => {
  it('adds nothing when off or unset', () => {
    expect(buildShadowDarkeningFilter('off')).toBeNull()
    expect(buildShadowDarkeningFilter(undefined)).toBeNull()
    expect(withShadowDarkening('scale=150:300:flags=bicubic', 'off')).toBe('scale=150:300:flags=bicubic')
  })

  it('raises the black point per level', () => {
    expect(buildShadowDarkeningFilter('low')).toBe('colorlevels=rimin=0.04:gimin=0.04:bimin=0.04')
    expect(buildShadowDarkeningFilter('medium')).toBe('colorlevels=rimin=0.08:gimin=0.08:bimin=0.08')
    expect(buildShadowDarkeningFilter('high')).toBe('colorlevels=rimin=0.12:gimin=0.12:bimin=0.12')
  })

  it('appends after the scale/crop chain so every slice gets the same grade', () => {
    expect(withShadowDarkening('scale=750:300:flags=bicubic,crop=150:300:0:0', 'medium')).toBe(
      'scale=750:300:flags=bicubic,crop=150:300:0:0,colorlevels=rimin=0.08:gimin=0.08:bimin=0.08',
    )
  })
})
