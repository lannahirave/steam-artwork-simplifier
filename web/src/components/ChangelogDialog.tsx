import { useEffect, useId, useMemo, useRef } from 'react'
import { useIntl } from 'react-intl'
import changelogSource from 'virtual:changelog'
import type { MessageId } from '../i18n/messages'
import { parseChangelog, parseInline, type ChangeKind } from '../lib/changelog'

const APP_VERSION = __APP_VERSION__

const GROUP_LABELS: Record<ChangeKind, MessageId> = {
  added: 'changelog.group.added',
  changed: 'changelog.group.changed',
  fixed: 'changelog.group.fixed',
  removed: 'changelog.group.removed',
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, index) =>
        part.type === 'code' ? (
          <code key={index}>{part.text}</code>
        ) : part.type === 'strong' ? (
          <strong key={index}>{part.text}</strong>
        ) : (
          part.text
        ),
      )}
    </>
  )
}

/** Every release from CHANGELOG.md as a timeline, newest first. Loaded only when opened. */
export default function ChangelogDialog({ onClose }: { onClose: () => void }) {
  const intl = useIntl()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const releases = useMemo(() => parseChangelog(changelogSource), [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open && typeof dialog.showModal === 'function') {
      dialog.showModal()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="changelog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      // A click on the backdrop lands on the dialog element itself.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="changelog-head">
        <div>
          <h2 id={titleId}>{intl.formatMessage({ id: 'changelog.title' })}</h2>
          <p>{intl.formatMessage({ id: 'changelog.intro' })}</p>
        </div>
        <button
          type="button"
          className="changelog-close"
          aria-label={intl.formatMessage({ id: 'changelog.close' })}
          title={intl.formatMessage({ id: 'changelog.close' })}
          onClick={onClose}
        >
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>

      <ol className="changelog-timeline">
        {releases.map((release) => {
          const unreleased = release.version.toLowerCase() === 'unreleased'
          const current = release.version === APP_VERSION
          return (
            <li
              key={release.version}
              className={unreleased || current ? 'changelog-release is-current' : 'changelog-release'}
            >
              <div className="changelog-when">
                <h3>
                  {unreleased ? intl.formatMessage({ id: 'changelog.unreleased' }) : `v${release.version}`}
                </h3>
                {release.date && (
                  <time dateTime={release.date}>
                    {intl.formatDate(`${release.date}T00:00:00Z`, { dateStyle: 'medium', timeZone: 'UTC' })}
                  </time>
                )}
                {current && <span className="changelog-current">{intl.formatMessage({ id: 'changelog.current' })}</span>}
              </div>
              <div className="changelog-body">
                {release.summary && (
                  <p className="changelog-summary">
                    <Inline text={release.summary} />
                  </p>
                )}
                {release.groups.map((group) => (
                  <section key={group.kind} className="changelog-group">
                    <h4>{intl.formatMessage({ id: GROUP_LABELS[group.kind] })}</h4>
                    <ul>
                      {group.items.map((item, index) => (
                        <li key={index}>
                          <Inline text={item} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </li>
          )
        })}
      </ol>
    </dialog>
  )
}
