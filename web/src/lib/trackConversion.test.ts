// Unit tests for the aggregate conversion beacon. It must post an empty
// beacon to /api/track exactly when production is running, sendBeacon is
// available, and never let beacon failures affect the conversion flow.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { trackConversionComplete } from './trackConversion'

const sendBeacon = vi.fn()

afterEach(() => {
  sendBeacon.mockReset()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('trackConversionComplete', () => {
  it('posts an empty beacon to /api/track in production', () => {
    vi.stubEnv('DEV', false)
    vi.stubGlobal('navigator', { sendBeacon })

    trackConversionComplete()

    expect(sendBeacon).toHaveBeenCalledWith('/api/track')
  })

  it('is skipped when development mode is running', () => {
    vi.stubEnv('DEV', true)
    vi.stubGlobal('navigator', { sendBeacon })

    trackConversionComplete()

    expect(sendBeacon).not.toHaveBeenCalled()
  })

  it('is skipped when sendBeacon is not available', () => {
    vi.stubEnv('DEV', false)
    vi.stubGlobal('navigator', {})

    trackConversionComplete()

    expect(sendBeacon).not.toHaveBeenCalled()
  })

  it('swallows beacon failures', () => {
    vi.stubEnv('DEV', false)
    vi.stubGlobal('navigator', {
      sendBeacon: vi.fn(() => {
        throw new Error('beacon failed')
      }),
    })

    expect(() => trackConversionComplete()).not.toThrow()
  })
})
