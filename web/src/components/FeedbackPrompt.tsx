import { useEffect, useState } from 'react'
import { useIntl } from 'react-intl'
import { markFeedbackAnswered } from '../contexts/useFeedbackPrompt'
import type { MessageId } from '../i18n/messages'
import { trackFeedback, type FeedbackOutcome } from '../lib/trackFeedback'
import { Button } from './ui/Button'
import { buttonClassName } from './ui/buttonStyles'

// Steam guide where users can rate this tool or leave a comment.
export const FEEDBACK_GUIDE_URL =
  'https://steamcommunity.com/sharedfiles/filedetails/?id=3833799727'

interface FeedbackPromptProps {
  open: boolean
  onDismiss: () => void
}

type Step = 'ask' | 'worked' | 'problem' | 'reported'

const REASONS: Array<{ outcome: FeedbackOutcome; label: MessageId }> = [
  { outcome: 'problem-rejected', label: 'feedback.problem.rejected' },
  { outcome: 'problem-looks-wrong', label: 'feedback.problem.looksWrong' },
  { outcome: 'problem-quality', label: 'feedback.problem.quality' },
  { outcome: 'problem-other', label: 'feedback.problem.other' },
]

// Non-intrusive corner popup. It never blocks the workspace or takes focus,
// and is dismissed by its own buttons or the Escape key.
export function FeedbackPrompt({ open, onDismiss }: FeedbackPromptProps) {
  return open ? <FeedbackCard onDismiss={onDismiss} /> : null
}

function FeedbackCard({ onDismiss }: { onDismiss: () => void }) {
  const intl = useIntl()
  const [step, setStep] = useState<Step>('ask')
  const text = (id: MessageId): string => intl.formatMessage({ id })

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onDismiss()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onDismiss])

  const answer = (outcome: FeedbackOutcome, next: Step): void => {
    trackFeedback(outcome)
    markFeedbackAnswered()
    setStep(next)
  }

  const guideLink = (label: MessageId) => (
    <a
      className={buttonClassName({ variant: 'primary', size: 'small' })}
      href={FEEDBACK_GUIDE_URL}
      target="_blank"
      rel="noreferrer"
      onClick={onDismiss}
    >
      {text(label)}
    </a>
  )

  const titles: Record<Step, MessageId> = {
    ask: 'feedback.ask.title',
    worked: 'feedback.worked.title',
    problem: 'feedback.problem.title',
    reported: 'feedback.reported.title',
  }

  return (
    <aside className="feedback-prompt" role="status" aria-label={text('feedback.ariaLabel')}>
      <div className="feedback-prompt-head">
        <h2 className="feedback-prompt-title">{text(titles[step])}</h2>
        <button
          type="button"
          className="feedback-prompt-close"
          aria-label={text('feedback.dismiss')}
          title={text('feedback.dismiss')}
          onClick={onDismiss}
        >
          &times;
        </button>
      </div>

      {step === 'ask' && (
        <>
          <p>{text('feedback.ask.body')}</p>
          <div className="feedback-prompt-actions">
            <Button variant="primary" size="small" onClick={() => answer('worked', 'worked')}>
              {text('feedback.ask.worked')}
            </Button>
            <Button variant="outline" size="small" onClick={() => answer('problem', 'problem')}>
              {text('feedback.ask.problem')}
            </Button>
            <Button variant="quiet" size="small" onClick={onDismiss}>
              {text('feedback.ask.notYet')}
            </Button>
          </div>
        </>
      )}

      {step === 'worked' && (
        <>
          <p>{text('feedback.worked.body')}</p>
          <div className="feedback-prompt-actions">
            {guideLink('feedback.worked.rate')}
            <Button variant="quiet" size="small" onClick={onDismiss}>
              {text('feedback.worked.close')}
            </Button>
          </div>
        </>
      )}

      {step === 'problem' && (
        <div className="feedback-prompt-reasons">
          {REASONS.map((reason) => (
            <Button
              key={reason.outcome}
              variant="outline"
              size="small"
              onClick={() => answer(reason.outcome, 'reported')}
            >
              {text(reason.label)}
            </Button>
          ))}
        </div>
      )}

      {step === 'reported' && (
        <>
          <p>{text('feedback.reported.body')}</p>
          <div className="feedback-prompt-actions">
            {guideLink('feedback.reported.comment')}
            <Button variant="quiet" size="small" onClick={onDismiss}>
              {text('feedback.reported.close')}
            </Button>
          </div>
        </>
      )}
    </aside>
  )
}
