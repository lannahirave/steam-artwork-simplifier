import type { FFmpeg } from '@ffmpeg/ffmpeg'
import { describe, expect, it, vi } from 'vitest'
import { buildStillFilter, encodeStillImage, type StillEncodeOptions } from './stillImageEncoder'
import type { CoreWatch } from './ffmpegCoreHealth'

function setup(overrides: Partial<StillEncodeOptions> = {}, outputBytes = 10 * 1024) {
  const execArgs: string[][] = []
  const deleted: string[] = []
  const ffmpeg = {
    exec: vi.fn(async (args: string[]) => {
      execArgs.push(args)
      return 0
    }),
    readFile: vi.fn(async () => new Uint8Array(outputBytes)),
    deleteFile: vi.fn(async (path: string) => {
      deleted.push(path)
      return true
    }),
  }
  const options: StillEncodeOptions = {
    ffmpeg: ffmpeg as unknown as FFmpeg,
    ffmpegLogBuffer: [],
    postProgress: () => undefined,
    requestId: 'req',
    inputName: 'req.jpg',
    baseFilter: 'scale=750:750,crop=150:750:0:0',
    format: 'jpg',
    maxKb: 1,
    disableOptimizations: false,
    ...overrides,
  }
  return { ffmpeg, options, execArgs, deleted }
}

describe('encodeStillImage', () => {
  it('uses standard Huffman tables on every JPG quality step', async () => {
    // Output is always above maxKb, so the whole ladder runs.
    const { options, execArgs } = setup()
    const result = await encodeStillImage(options)

    expect(execArgs).toHaveLength(5)
    for (const args of execArgs) {
      const codec = args.indexOf('-c:v')
      expect(args[codec + 1]).toBe('mjpeg')
      expect(args[args.indexOf('-huffman') + 1]).toBe('default')
    }
    expect(execArgs.map((args) => args[args.indexOf('-q:v') + 1])).toEqual(['2', '4', '6', '9', '13'])
    expect(result.finalQuality).toBe(60)
  })

  it('routes every exec through the provided core watchdog', async () => {
    const deadlines: number[] = []
    const watchCore: CoreWatch = (task, timeoutMs) => {
      deadlines.push(timeoutMs)
      return task
    }
    const { options } = setup({ watchCore, disableOptimizations: true })
    await encodeStillImage(options)
    expect(deadlines).toHaveLength(1)
    expect(deadlines[0]).toBeGreaterThan(0)
  })

  it('propagates a core crash and still attempts output cleanup', async () => {
    const { ffmpeg, options, deleted } = setup()
    ffmpeg.exec.mockRejectedValueOnce('RuntimeError: index out of bounds')

    await expect(encodeStillImage(options)).rejects.toBe('RuntimeError: index out of bounds')
    expect(deleted).toEqual(['req.still-0.jpg'])
  })
})

describe('buildStillFilter', () => {
  const flatten = 'format=rgba,premultiply=inplace=1,format=rgb24'

  it('leaves opaque sources and kept alpha in PNG/WebP alone', () => {
    expect(buildStillFilter('scale=195:195', 'png', undefined)).toBe('scale=195:195')
    expect(buildStillFilter('scale=195:195', 'png', 'keep')).toBe('scale=195:195')
    expect(buildStillFilter('scale=195:195', 'webp', 'keep')).toBe('scale=195:195')
  })

  it('flattens onto black when asked, and always for JPEG', () => {
    expect(buildStillFilter('scale=195:195', 'png', 'flatten')).toBe(`scale=195:195,${flatten}`)
    expect(buildStillFilter('scale=195:195', 'jpg', 'keep')).toBe(`scale=195:195,${flatten}`)
  })
})
