import { describe, expect, it } from 'vitest'
import { outputMimeType, resolveStillImageFormat } from './stillImage'

function fileOf(name: string, type: string): Pick<File, 'name' | 'type'> {
  return { name, type }
}

describe('resolveStillImageFormat', () => {
  it('keeps the source format for Steam-compatible images', () => {
    expect(resolveStillImageFormat(fileOf('a.png', 'image/png'))).toBe('png')
    expect(resolveStillImageFormat(fileOf('a.jpeg', 'image/jpeg'))).toBe('jpg')
    expect(resolveStillImageFormat(fileOf('a.webp', 'image/webp'))).toBe('webp')
    expect(resolveStillImageFormat(fileOf('a.gif', 'image/gif'))).toBe('gif')
  })

  it('falls back to the extension when the MIME type is missing', () => {
    expect(resolveStillImageFormat(fileOf('photo.JPG', ''))).toBe('jpg')
  })

  it('writes BMP and unknown sources as PNG', () => {
    expect(resolveStillImageFormat(fileOf('a.bmp', 'image/bmp'))).toBe('png')
    expect(resolveStillImageFormat(fileOf('noext', ''))).toBe('png')
  })
})

describe('outputMimeType', () => {
  it('maps output names to their MIME type', () => {
    expect(outputMimeType('x_part_01.png')).toBe('image/png')
    expect(outputMimeType('x_featured.jpg')).toBe('image/jpeg')
    expect(outputMimeType('x_guide.webp')).toBe('image/webp')
    expect(outputMimeType('x_part_01.gif')).toBe('image/gif')
  })
})
