import { describe, expect, it, vi } from 'vitest'
import { readWithRetry } from './readWithRetry'

const noWait = () => Promise.resolve()

describe('readWithRetry', () => {
  it('retries while the entry is not written yet', async () => {
    const results: Array<string | null> = [null, null, 'entry']
    const read = vi.fn(async () => results.shift() ?? null)
    await expect(readWithRetry(read, [1, 1, 1, 1], noWait)).resolves.toBe('entry')
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('gives up with null after the last delay', async () => {
    const read = vi.fn(async (): Promise<string | null> => null)
    await expect(readWithRetry(read, [1, 1], noWait)).resolves.toBeNull()
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('lets storage errors through for the caller to report', async () => {
    const read = vi.fn(async (): Promise<string | null> => {
      throw new Error('blocked')
    })
    await expect(readWithRetry(read, [1], noWait)).rejects.toThrow('blocked')
  })
})
