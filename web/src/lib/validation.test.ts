import { describe, expect, it } from 'vitest'
import { isLikelyImageSource, isSupportedConversionSource } from './validation'

function fileOf(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type })
}

describe('validation source support', () => {
  it('supports webp conversion sources', () => {
    expect(isSupportedConversionSource(fileOf('a.webp', 'image/webp'))).toBe(true)
  })

  it('supports jpg conversion sources by extension fallback', () => {
    expect(isSupportedConversionSource(fileOf('photo.jpg', ''))).toBe(true)
  })

  it('detects likely image sources', () => {
    expect(isLikelyImageSource(fileOf('still.png', 'image/png'))).toBe(true)
    expect(isLikelyImageSource(fileOf('clip.mp4', 'video/mp4'))).toBe(false)
  })
})
