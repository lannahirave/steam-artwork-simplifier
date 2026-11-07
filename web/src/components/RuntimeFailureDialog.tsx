import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useIntl } from 'react-intl'
import {
  dismissRuntimeFailure,
  getRuntimeFailure,
  subscribeRuntimeFailure,
  type RuntimeFailure,
} from '../lib/runtimeFailure'
import { Button } from './ui/Button'

export const RELOAD_DELAY_SECONDS = 10

function reloadPage(): void {
  window.location.reload()
}

interface RuntimeFailureDialogProps {
  /** Replaced in tests. */
  onReload?: () => void
}

/** Explains a failed runtime load (gifski) and reloads the page after a countdown. */
export function RuntimeFailureDialog({ onReload = reloadPage }: RuntimeFailureDialogProps) {
  const failure = useSyncExternalStore(subscribeRuntimeFailure, getRuntimeFailure)
  if (!failure) {
    return null
  }
  return <RuntimeFailurePrompt failure={failure} onReload={onReload} />
}

function RuntimeFailurePrompt({ failure, onReload }: { failure: RuntimeFailure; onReload: () => void }) {
  const intl = useIntl()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const reloadRef = useRef<HTMLButtonElement>(null)
  const [secondsLeft, setSecondsLeft] = useState(RELOAD_DELAY_SECONDS)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open && typeof dialog.showModal === 'function') {
      dialog.showModal()
    }
    reloadRef.current?.focus()
  }, [])

  useEffect(() => {
    if (secondsLeft <= 0) {
      onReload()
      return
    }
    const timer = setTimeout(() => setSecondsLeft((seconds) => seconds - 1), 1000)
    return () => clearTimeout(timer)
  }, [secondsLeft, onReload])

  return (
    <dialog
      ref={dialogRef}
      className="runtime-failure"
      aria-labelledby="runtime-failure-title"
      aria-describedby="runtime-failure-body"
      onCancel={(event) => {
        event.preventDefault()
        dismissRuntimeFailure()
      }}
    >
      <h2 id="runtime-failure-title">{intl.formatMessage({ id: 'runtimeFailure.gifski.title' })}</h2>
      <p id="runtime-failure-body">{intl.formatMessage({ id: 'runtimeFailure.gifski.body' })}</p>
      <p className="runtime-failure-countdown">
        {intl.formatMessage({ id: 'runtimeFailure.countdown' }, { seconds: Math.max(secondsLeft, 0) })}
      </p>
      <div className="runtime-failure-actions">
        <Button variant="quiet" onClick={dismissRuntimeFailure}>
          {intl.formatMessage({ id: 'runtimeFailure.stay' })}
        </Button>
        <Button ref={reloadRef} variant="primary" onClick={onReload}>
          {intl.formatMessage({ id: 'runtimeFailure.reloadNow' })}
        </Button>
      </div>
      <details className="runtime-failure-details">
        <summary>{intl.formatMessage({ id: 'runtimeFailure.details' })}</summary>
        <pre>{failure.message}</pre>
      </details>
    </dialog>
  )
}
