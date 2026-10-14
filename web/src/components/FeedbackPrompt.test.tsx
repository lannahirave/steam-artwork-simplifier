// The post-conversion feedback nudge is a non-intrusive corner popup: it
// renders nothing while closed, links to the Steam guide in a new tab, and
// dismisses itself from every exit path.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IntlProvider } from 'react-intl'
import { describe, expect, it, vi } from 'vitest'
import { FeedbackPrompt, FEEDBACK_GUIDE_URL } from './FeedbackPrompt'
import { messages } from '../i18n/messages'

function renderPrompt(open: boolean, onDismiss = vi.fn()) {
  render(
    <IntlProvider locale="en" messages={messages}>
      <FeedbackPrompt open={open} onDismiss={onDismiss} />
    </IntlProvider>,
  )
  return onDismiss
}

describe('FeedbackPrompt', () => {
  it('renders nothing while closed', () => {
    renderPrompt(false)

    expect(screen.queryByLabelText('Feedback request')).not.toBeInTheDocument()
  })

  it('links to the Steam guide in a new tab', () => {
    renderPrompt(true)

    const link = screen.getByRole('link', { name: 'Leave feedback' })
    expect(link).toHaveAttribute('href', FEEDBACK_GUIDE_URL)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('dismisses when the close button is used', async () => {
    const onDismiss = renderPrompt(true)

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('dismisses when the secondary action is used', async () => {
    const onDismiss = renderPrompt(true)

    await userEvent.click(screen.getByRole('button', { name: 'Maybe later' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('dismisses on Escape', async () => {
    const onDismiss = renderPrompt(true)

    await userEvent.keyboard('{Escape}')

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('dismisses after the guide link is opened', async () => {
    const onDismiss = renderPrompt(true)

    await userEvent.click(screen.getByRole('link', { name: 'Leave feedback' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})