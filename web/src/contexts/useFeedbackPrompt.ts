import { useCallback, useEffect, useRef, useState } from 'react'

export const FEEDBACK_ANSWERED_KEY = 'steam-artwork-studio:feedback-answered'
export const FEEDBACK_PROMPT_FALLBACK_MS = 60_000

export function hasAnsweredFeedback(): boolean {
  try {
    return window.localStorage.getItem(FEEDBACK_ANSWERED_KEY) !== null
  } catch {
    return false
  }
}

export function markFeedbackAnswered(): void {
  try {
    window.localStorage.setItem(FEEDBACK_ANSWERED_KEY, 'true')
  } catch {
    // Without storage the popup can only come back in a later session.
  }
}

/**
 * Asks once per session, and never again after an answer. A download arms the prompt; it
 * opens when the user comes back to this tab (they went to Steam) or after a minute.
 */
export function useFeedbackPrompt(): { open: boolean; arm: () => void; dismiss: () => void } {
  const [open, setOpen] = useState(false)
  const armedRef = useRef(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => () => cleanupRef.current?.(), [])

  const arm = useCallback(() => {
    if (armedRef.current || hasAnsweredFeedback()) {
      return
    }
    armedRef.current = true

    let leftTab = document.hidden
    const show = (): void => {
      cleanupRef.current?.()
      setOpen(true)
    }
    const onVisibilityChange = (): void => {
      if (document.hidden) {
        leftTab = true
      } else if (leftTab) {
        show()
      }
    }
    const timer = window.setTimeout(show, FEEDBACK_PROMPT_FALLBACK_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
    cleanupRef.current = () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      cleanupRef.current = null
    }
  }, [])

  const dismiss = useCallback(() => setOpen(false), [])

  return { open, arm, dismiss }
}
