import { describe, expect, it, vi } from 'vitest'
import type { HandoffLookup } from '../lib/profileHandoff'
import { readHandoffWithRetry } from './readWithRetry'

const noWait = () => Promise.resolve()

describe('readHandoffWithRetry', () => {
  it('retries while the record is not written yet', async () => {
    const results: HandoffLookup[] = [{ status: 'not-found' }, { status: 'not-found' }, { status: 'expired' }]
    const read = vi.fn(async () => results.shift() as HandoffLookup)
    await expect(readHandoffWithRetry(read, [1, 1, 1, 1], noWait)).resolves.toEqual({ status: 'expired' })
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('gives up with not-found after the last delay', async () => {
    const read = vi.fn(async (): Promise<HandoffLookup> => ({ status: 'not-found' }))
    await expect(readHandoffWithRetry(read, [1, 1], noWait)).resolves.toEqual({ status: 'not-found' })
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('lets storage errors through for the caller to report', async () => {
    const read = vi.fn(async (): Promise<HandoffLookup> => {
      throw new Error('blocked')
    })
    await expect(readHandoffWithRetry(read, [1], noWait)).rejects.toThrow('blocked')
  })
})
