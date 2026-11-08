// The feedback popup: one tap records an answer, then it invites a Steam guide
// rating or comment. It renders nothing while closed and dismisses from every exit.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IntlProvider } from 'react-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FeedbackPrompt, FEEDBACK_GUIDE_URL } from './FeedbackPrompt'
import { FEEDBACK_ANSWERED_KEY } from '../contexts/useFeedbackPrompt'
import { messages } from '../i18n/messages'
import { trackFeedback } from '../lib/trackFeedback'

vi.mock('../lib/trackFeedback', () => ({ trackFeedback: vi.fn() }))

function renderPrompt(open: boolean, onDismiss = vi.fn()) {
  render(
    <IntlProvider locale="en" messages={messages}>
      <FeedbackPrompt open={open} onDismiss={onDismiss} />
    </IntlProvider>,
  )
  return onDismiss
}

describe('FeedbackPrompt', () => {
  beforeEach(() => {
    vi.mocked(trackFeedback).mockClear()
    window.localStorage.removeItem(FEEDBACK_ANSWERED_KEY)
  })

  it('renders nothing while closed', () => {
    renderPrompt(false)

    expect(screen.queryByLabelText('Feedback request')).not.toBeInTheDocument()
  })

  it('records a positive answer and invites a guide rating', async () => {
    const onDismiss = renderPrompt(true)

    await userEvent.click(screen.getByRole('button', { name: 'Yes, they worked' }))

    expect(trackFeedback).toHaveBeenCalledExactlyOnceWith('worked')
    expect(window.localStorage.getItem(FEEDBACK_ANSWERED_KEY)).toBe('true')
    const link = screen.getByRole('link', { name: 'Rate the guide on Steam' })
    expect(link).toHaveAttribute('href', FEEDBACK_GUIDE_URL)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')

    await userEvent.click(link)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('records a problem and its reason, then points at the guide comments', async () => {
    renderPrompt(true)

    await userEvent.click(screen.getByRole('button', { name: 'I had a problem' }))
    expect(trackFeedback).toHaveBeenLastCalledWith('problem')

    await userEvent.click(screen.getByRole('button', { name: 'Steam rejected the upload' }))
    expect(trackFeedback).toHaveBeenLastCalledWith('problem-rejected')
    expect(screen.getByRole('link', { name: 'Comment on the Steam guide' })).toHaveAttribute('href', FEEDBACK_GUIDE_URL)
  })

  it('records nothing for "Not uploaded yet"', async () => {
    const onDismiss = renderPrompt(true)

    await userEvent.click(screen.getByRole('button', { name: 'Not uploaded yet' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(trackFeedback).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(FEEDBACK_ANSWERED_KEY)).toBeNull()
  })

  it('dismisses when the close button is used', async () => {
    const onDismiss = renderPrompt(true)

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('dismisses on Escape', async () => {
    const onDismiss = renderPrompt(true)

    await userEvent.keyboard('{Escape}')

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
