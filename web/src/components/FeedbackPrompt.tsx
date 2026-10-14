import { useEffect, useRef } from 'react'
import { useIntl } from 'react-intl'

// Steam guide where users can leave feedback about this tool.
export const FEEDBACK_GUIDE_URL =
  'https://steamcommunity.com/sharedfiles/filedetails/?id=3813335509#-1'

interface FeedbackPromptProps {
  open: boolean
  onDismiss: () => void
}

// Non-intrusive corner popup shown once per session after a conversion
// finishes. It never blocks the workspace, keeps the page scrollable, and is
// dismissed by its own close button or the Escape key.
export function FeedbackPrompt(props: FeedbackPromptProps) {
  const intl = useIntl()
  const { open, onDismiss } = props
  const cardRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    // Move focus into the popup so keyboard users reach it without hunting.
    cardRef.current?.focus()

    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onDismiss()
      }
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open, onDismiss])

  if (!open) {
    return null
  }

  return (
    <aside
      ref={cardRef}
      className="feedback-prompt"
      role="status"
      tabIndex={-1}
      aria-label={intl.formatMessage({ id: 'feedback.ariaLabel' })}
    >
      <div className="feedback-prompt-head">
        <span className="feedback-prompt-kicker">
          {intl.formatMessage({ id: 'feedback.kicker' })}
        </span>
        <button
          type="button"
          className="feedback-prompt-close"
          aria-label={intl.formatMessage({ id: 'feedback.dismiss' })}
          title={intl.formatMessage({ id: 'feedback.dismiss' })}
          onClick={onDismiss}
        >
          &times;
        </button>
      </div>
      <h2>{intl.formatMessage({ id: 'feedback.title' })}</h2>
      <p>{intl.formatMessage({ id: 'feedback.body' })}</p>
      <div className="feedback-prompt-actions">
        <a
          className="feedback-prompt-primary"
          href={FEEDBACK_GUIDE_URL}
          target="_blank"
          rel="noreferrer"
          onClick={onDismiss}
        >
          {intl.formatMessage({ id: 'feedback.openGuide' })}
        </a>
        <button type="button" className="feedback-prompt-secondary" onClick={onDismiss}>
          {intl.formatMessage({ id: 'feedback.later' })}
        </button>
      </div>
    </aside>
  )
}