// A failed gifski download must not be cached: the next call downloads again.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const init = vi.fn<(path: string) => Promise<void>>()
vi.mock('gifski-wasm', () => ({ default: vi.fn(), init: (path: string) => init(path) }))

describe('ensureGifskiRuntimeLoaded', () => {
  beforeEach(() => {
    vi.resetModules()
    init.mockReset()
  })

  it('wraps a load failure in GifskiLoadError', async () => {
    init.mockRejectedValueOnce(new Error('404 Not Found'))
    const { ensureGifskiRuntimeLoaded, GifskiLoadError } = await import('./gifskiRuntime')

    const failure = ensureGifskiRuntimeLoaded()

    await expect(failure).rejects.toBeInstanceOf(GifskiLoadError)
    await expect(failure).rejects.toThrow('gifski failed to load: 404 Not Found')
  })

  it('retries the download after a failure', async () => {
    init.mockRejectedValueOnce(new Error('network error')).mockResolvedValueOnce(undefined)
    const { ensureGifskiRuntimeLoaded } = await import('./gifskiRuntime')

    await expect(ensureGifskiRuntimeLoaded()).rejects.toThrow('gifski failed to load: network error')
    await expect(ensureGifskiRuntimeLoaded()).resolves.toBeUndefined()
    expect(init).toHaveBeenCalledTimes(2)
  })

  it('loads only once after a success', async () => {
    init.mockResolvedValue(undefined)
    const { ensureGifskiRuntimeLoaded } = await import('./gifskiRuntime')

    await ensureGifskiRuntimeLoaded()
    await ensureGifskiRuntimeLoaded()
    expect(init).toHaveBeenCalledTimes(1)
  })
})
