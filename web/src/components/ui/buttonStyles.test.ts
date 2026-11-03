import { describe, expect, it } from 'vitest'
import { buttonClassName } from './buttonStyles'

describe('buttonClassName', () => {
  it('gives the plain secondary look by default', () => {
    expect(buttonClassName()).toBe('btn')
  })

  it('adds the variant and size classes', () => {
    expect(buttonClassName({ variant: 'primary', size: 'small' })).toBe('btn btn-primary btn-small')
    expect(buttonClassName({ variant: 'outline', size: 'medium' })).toBe('btn btn-outline btn-medium')
  })

  it('keeps a feature class for layout', () => {
    expect(buttonClassName({ variant: 'quiet', className: 'onboarding-skip' })).toBe('btn btn-quiet onboarding-skip')
  })
})
