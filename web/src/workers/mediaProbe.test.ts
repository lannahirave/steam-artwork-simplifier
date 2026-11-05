import type { FFmpeg } from '@ffmpeg/ffmpeg'
import { describe, expect, it, vi } from 'vitest'
import { parseWebmAlphaDecoder, pngMayHaveAlpha, runProbe } from './mediaProbe'

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width, false)
  view.setUint32(20, height, false)
  return bytes
}

function fakeFfmpeg(introExec: () => Promise<number>) {
  return {
    writeFile: vi.fn(async () => true),
    readFile: vi.fn(async () => pngHeader(612, 408)),
    deleteFile: vi.fn(async () => true),
    exec: vi.fn<() => Promise<number>>().mockResolvedValueOnce(0).mockImplementationOnce(introExec),
  }
}

const payload = { fileName: 'dalmatians.jpg', fileBytes: new Uint8Array([1, 2, 3]) }

describe('runProbe', () => {
  it('keeps the parsed dimensions when the optional dark-intro step crashes the core', async () => {
    const ffmpeg = fakeFfmpeg(() => Promise.reject('RuntimeError: index out of bounds'))
    const result = await runProbe(ffmpeg as unknown as FFmpeg, 'req', payload, [])
    expect(result).toMatchObject({ width: 612, height: 408, startOffsetSec: 0 })
  })

  it('still fails the probe for ordinary errors in the dark-intro step', async () => {
    const ffmpeg = fakeFfmpeg(() => Promise.reject(new Error('unexpected failure')))
    await expect(runProbe(ffmpeg as unknown as FFmpeg, 'req', payload, [])).rejects.toThrow('unexpected failure')
  })
})

describe('alpha detection helpers', () => {
  it('asks for libvpx when a WebM stream carries alpha', () => {
    const vp9 = [
      "Input #0, matroska,webm, from 'a.webm':",
      '  Stream #0:0: Video: vp9 (Profile 0), yuv420p(tv, progressive), 320x180, 20 fps',
      '    Metadata:',
      '      alpha_mode      : 1',
      'Stream mapping:',
    ]
    expect(parseWebmAlphaDecoder(vp9)).toBe('libvpx-vp9')
    expect(parseWebmAlphaDecoder(vp9.map((line) => line.replace('vp9 (Profile 0)', 'vp8')))).toBe('libvpx')
  })

  it('ignores WebM without alpha and alpha_mode lines after the input section', () => {
    expect(
      parseWebmAlphaDecoder(['  Stream #0:0: Video: vp9 (Profile 0), yuv420p, 320x180', 'Stream mapping:', '      alpha_mode      : 1']),
    ).toBeUndefined()
    expect(parseWebmAlphaDecoder(['  Stream #0:0: Video: h264 (High), yuv420p, 320x180'])).toBeUndefined()
  })

  function pngWithColorType(colorType: number, extraChunk?: string): Uint8Array {
    const bytes: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    const chunk = (type: string, data: number[]) => {
      bytes.push(0, 0, 0, data.length, ...[...type].map((char) => char.charCodeAt(0)), ...data, 0, 0, 0, 0)
    }
    chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, colorType, 0, 0, 0])
    if (extraChunk) {
      chunk(extraChunk, [0])
    }
    chunk('IDAT', [0])
    return new Uint8Array(bytes)
  }

  it('reads alpha from the PNG colour type or a tRNS chunk', () => {
    expect(pngMayHaveAlpha(pngWithColorType(6))).toBe(true)
    expect(pngMayHaveAlpha(pngWithColorType(4))).toBe(true)
    expect(pngMayHaveAlpha(pngWithColorType(2))).toBe(false)
    expect(pngMayHaveAlpha(pngWithColorType(3, 'tRNS'))).toBe(true)
    expect(pngMayHaveAlpha(pngWithColorType(3, 'PLTE'))).toBe(false)
  })
})
