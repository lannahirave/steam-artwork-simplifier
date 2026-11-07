// When gifski fails to load, a modal explains why and reloads the page after a 10 s countdown,
// unless the user reloads right away or chooses to stay.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { IntlProvider } from 'react-intl'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeFailureDialog, RELOAD_DELAY_SECONDS } from './RuntimeFailureDialog'
import { dismissRuntimeFailure, reportRuntimeFailure } from '../lib/runtimeFailure'
import { messages } from '../i18n/messages'

// jsdom has no modal dialogs; opening is enough for these tests.
function openDialog(this: HTMLDialogElement) {
  this.setAttribute('open', '')
}

function renderDialog() {
  const onReload = vi.fn()
  render(
    <IntlProvider locale="en" messages={messages}>
      <RuntimeFailureDialog onReload={onReload} />
    </IntlProvider>,
  )
  return onReload
}

/** Advances one second at a time: each tick is scheduled by the render after the previous one. */
function tick(seconds: number) {
  for (let i = 0; i < seconds; i += 1) {
    act(() => vi.advanceTimersByTime(1000))
  }
}

function failGifski() {
  act(() => reportRuntimeFailure({ reason: 'gifski-load-failed', message: 'gifski failed to load: 404' }))
}

describe('RuntimeFailureDialog', () => {
  beforeAll(() => {
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = openDialog
    }
  })
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    act(() => dismissRuntimeFailure())
    vi.useRealTimers()
  })

  it('renders nothing until a runtime fails', () => {
    renderDialog()

    expect(screen.queryByText("The GIF encoder didn't load")).not.toBeInTheDocument()
  })

  it('explains the failure and shows the error details', () => {
    renderDialog()
    failGifski()

    expect(screen.getByRole('heading', { name: "The GIF encoder didn't load" })).toBeInTheDocument()
    expect(screen.getByText(/couldn't load gifski/)).toBeInTheDocument()
    expect(screen.getByText('gifski failed to load: 404')).toBeInTheDocument()
    expect(screen.getByText('Reloading the page in 10 seconds.')).toBeInTheDocument()
  })

  it('counts down and reloads after 10 seconds', () => {
    const onReload = renderDialog()
    failGifski()

    tick(1)
    expect(screen.getByText('Reloading the page in 9 seconds.')).toBeInTheDocument()

    tick(RELOAD_DELAY_SECONDS - 2)
    expect(screen.getByText('Reloading the page in 1 second.')).toBeInTheDocument()
    expect(onReload).not.toHaveBeenCalled()

    tick(1)
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('reloads immediately from the button', () => {
    const onReload = renderDialog()
    failGifski()

    fireEvent.click(screen.getByRole('button', { name: 'Reload now' }))

    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('stays on the page and stops the countdown', () => {
    const onReload = renderDialog()
    failGifski()

    fireEvent.click(screen.getByRole('button', { name: 'Stay on this page' }))
    tick(RELOAD_DELAY_SECONDS * 2)

    expect(screen.queryByText("The GIF encoder didn't load")).not.toBeInTheDocument()
    expect(onReload).not.toHaveBeenCalled()
  })

  it('shows again with a fresh countdown on the next failure', () => {
    renderDialog()
    failGifski()
    tick(4)
    fireEvent.click(screen.getByRole('button', { name: 'Stay on this page' }))

    failGifski()

    expect(screen.getByText('Reloading the page in 10 seconds.')).toBeInTheDocument()
  })
})
