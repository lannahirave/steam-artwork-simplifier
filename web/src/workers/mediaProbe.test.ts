import type { FFmpeg } from '@ffmpeg/ffmpeg'
import { describe, expect, it, vi } from 'vitest'
import { runProbe } from './mediaProbe'

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
