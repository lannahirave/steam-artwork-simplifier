import { describe, expect, it } from 'vitest'
import { patchGifHeaderBytes, patchLastByteBytes, readGifDimensions } from './patch'

function buildMinimalGif(): Uint8Array {
  // Minimal valid GIF89a with 1x1 canvas and trailer.
  return new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
    0x01, 0x00, // width
    0x01, 0x00, // height
    0x80, // GCT follows
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0xff,
    0xff,
    0xff,
    0x2c,
    0x00,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0x02,
    0x02,
    0x4c,
    0x01,
    0x00,
    0x3b,
  ])
}

describe('patch tools', () => {
  it('patches last byte', () => {
    const input = new Uint8Array([0x01, 0x02, 0x03])
    const patched = patchLastByteBytes(input, 0x21)
    expect(patched.changed).toBe(true)
    expect(patched.bytes[2]).toBe(0x21)
  })

  it('reads gif dimensions', () => {
    const dims = readGifDimensions(buildMinimalGif())
    expect(dims).toEqual({ width: 1, height: 1 })
  })

  it('patches gif header width/height', () => {
    const input = buildMinimalGif()
    const patched = patchGifHeaderBytes(input, 1000, 1, true, 0x21)
    const dims = readGifDimensions(patched.bytes)

    expect(patched.changed).toBe(true)
    expect(dims.width).toBe(1000)
    expect(dims.height).toBe(1)
    expect(patched.bytes[patched.bytes.length - 1]).toBe(0x21)
  })
})
