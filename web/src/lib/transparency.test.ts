import { describe, expect, it } from 'vitest'
import { outputKeepsAlpha, resolveAlphaHandling } from './transparency'

describe('resolveAlphaHandling', () => {
  it('leaves opaque sources untouched in auto and black modes', () => {
    expect(resolveAlphaHandling('auto', false)).toBeUndefined()
    expect(resolveAlphaHandling('black', false)).toBeUndefined()
  })

  it('keeps transparency from a transparent source in auto mode', () => {
    expect(resolveAlphaHandling('auto', true)).toBe('keep')
  })

  it('flattens a transparent source when black is chosen', () => {
    expect(resolveAlphaHandling('black', true)).toBe('flatten')
  })

  it('always keeps alpha when transparent is chosen, so letterbox bars are see-through', () => {
    expect(resolveAlphaHandling('transparent', false)).toBe('keep')
    expect(resolveAlphaHandling('transparent', true)).toBe('keep')
  })
})

describe('outputKeepsAlpha', () => {
  it('marks GIF, PNG and WebP outputs but never JPEG', () => {
    expect(outputKeepsAlpha('keep', 'clip_guide.gif')).toBe(true)
    expect(outputKeepsAlpha('keep', 'art_part_01.png')).toBe(true)
    expect(outputKeepsAlpha('keep', 'art_part_01.webp')).toBe(true)
    expect(outputKeepsAlpha('keep', 'photo_featured.jpg')).toBe(false)
    expect(outputKeepsAlpha('flatten', 'clip_guide.gif')).toBe(false)
    expect(outputKeepsAlpha(undefined, 'clip_guide.gif')).toBe(false)
  })
})
