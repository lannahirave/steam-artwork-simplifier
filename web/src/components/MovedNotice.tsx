import { useEffect, useRef } from 'react'
import { useIntl } from 'react-intl'

export const NEW_APP_HOST = 'artworkstudio.lannahirave.com'
export const NEW_APP_URL = `https://${NEW_APP_HOST}`
export const NEW_GUIDE_URL =
  'https://steamcommunity.com/sharedfiles/filedetails/?id=3833799727'

interface MovedNoticeProps {
  open: boolean
  onDismiss: () => void
}

// Modal shown on every page load of the legacy deployment, pointing users at
// the new domain and the new Steam guide. Uses the native <dialog> so focus is
// trapped and Escape closes it without extra wiring.
export function MovedNotice({ open, onDismiss }: MovedNoticeProps) {
  const intl = useIntl()
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const primaryRef = useRef<HTMLAnchorElement | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !open || dialog.open) {
      return
    }
    if (typeof dialog.showModal === 'function') {
      dialog.showModal()
    } else {
      dialog.setAttribute('open', '')
    }
    // Start on the main action rather than the close button.
    primaryRef.current?.focus()
  }, [open])

  if (!open) {
    return null
  }

  return (
    <dialog
      ref={dialogRef}
      className="moved-notice"
      aria-labelledby="moved-notice-title"
      aria-describedby="moved-notice-body"
      onClose={onDismiss}
      onCancel={(event) => {
        event.preventDefault()
        onDismiss()
      }}
      onClick={(event) => {
        // Clicking the backdrop (the dialog element itself) dismisses.
        if (event.target === event.currentTarget) {
          onDismiss()
        }
      }}
    >
      <div className="moved-notice-card">
        <div className="moved-notice-head">
          <span className="moved-notice-kicker">
            {intl.formatMessage({ id: 'moved.kicker' })}
          </span>
          <button
            type="button"
            className="moved-notice-close"
            aria-label={intl.formatMessage({ id: 'moved.dismiss' })}
            title={intl.formatMessage({ id: 'moved.dismiss' })}
            onClick={onDismiss}
          >
            &times;
          </button>
        </div>
        <h2 id="moved-notice-title">{intl.formatMessage({ id: 'moved.title' })}</h2>
        <p id="moved-notice-body">{intl.formatMessage({ id: 'moved.body' })}</p>
        <a className="moved-notice-domain" href={NEW_APP_URL}>
          {NEW_APP_HOST}
        </a>
        <p className="moved-notice-guide-copy">
          {intl.formatMessage({ id: 'moved.guideBody' })}
        </p>
        <div className="moved-notice-actions">
          <a ref={primaryRef} className="moved-notice-primary" href={NEW_APP_URL}>
            {intl.formatMessage({ id: 'moved.openNew' })}
          </a>
          <a
            className="moved-notice-secondary"
            href={NEW_GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {intl.formatMessage({ id: 'moved.openGuide' })}
          </a>
        </div>
        <button type="button" className="moved-notice-stay" onClick={onDismiss}>
          {intl.formatMessage({ id: 'moved.stay' })}
        </button>
      </div>
    </dialog>
  )
}
