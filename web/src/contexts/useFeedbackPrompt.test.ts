import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FEEDBACK_ANSWERED_KEY,
  FEEDBACK_PROMPT_FALLBACK_MS,
  markFeedbackAnswered,
  useFeedbackPrompt,
} from './useFeedbackPrompt'

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useFeedbackPrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.removeItem(FEEDBACK_ANSWERED_KEY)
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays closed until a download arms it', () => {
    const { result } = renderHook(() => useFeedbackPrompt())
    act(() => {
      vi.advanceTimersByTime(FEEDBACK_PROMPT_FALLBACK_MS * 2)
    })
    expect(result.current.open).toBe(false)
  })

  it('opens when the user returns to the tab', () => {
    const { result } = renderHook(() => useFeedbackPrompt())
    act(() => result.current.arm())
    expect(result.current.open).toBe(false)
    act(() => setHidden(true))
    expect(result.current.open).toBe(false)
    act(() => setHidden(false))
    expect(result.current.open).toBe(true)
  })

  it('opens after the fallback delay', () => {
    const { result } = renderHook(() => useFeedbackPrompt())
    act(() => result.current.arm())
    act(() => {
      vi.advanceTimersByTime(FEEDBACK_PROMPT_FALLBACK_MS)
    })
    expect(result.current.open).toBe(true)
  })

  it('does not come back in the same session after a dismissal', () => {
    const { result } = renderHook(() => useFeedbackPrompt())
    act(() => result.current.arm())
    act(() => {
      vi.advanceTimersByTime(FEEDBACK_PROMPT_FALLBACK_MS)
    })
    act(() => result.current.dismiss())
    act(() => result.current.arm())
    act(() => {
      vi.advanceTimersByTime(FEEDBACK_PROMPT_FALLBACK_MS)
    })
    expect(result.current.open).toBe(false)
  })

  it('never asks again after an answer', () => {
    markFeedbackAnswered()
    const { result } = renderHook(() => useFeedbackPrompt())
    act(() => result.current.arm())
    act(() => {
      vi.advanceTimersByTime(FEEDBACK_PROMPT_FALLBACK_MS)
    })
    expect(result.current.open).toBe(false)
  })
})
