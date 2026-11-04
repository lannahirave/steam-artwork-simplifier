import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useIntl } from 'react-intl'
import type { MessageId } from '../../i18n/messages'
import {
  clearSteamCanvasSaved,
  deleteSteamCanvasSaved,
  listSteamCanvasSaved,
  steamCanvasDemoUrl,
  type SteamCanvasSavedEntry,
} from '../../lib/steamCanvasSaved'
import { Button } from '../ui/Button'
import { formatBytes } from './libraryFormat'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; entries: SteamCanvasSavedEntry[] }
  | { status: 'error' }

const PRESET_LABELS: Record<SteamCanvasSavedEntry['preset'], MessageId> = {
  workshop: 'convert.option.workshop',
  showcase: 'convert.option.showcase',
  featured: 'convert.option.featured',
}

function SavedCard({ entry, onDelete }: { entry: SteamCanvasSavedEntry; onDelete: (entry: SteamCanvasSavedEntry) => void }) {
  const intl = useIntl()
  const thumbnails = useMemo(
    () => entry.files.map((file, index) => ({ key: `${index}-${file.name}`, url: URL.createObjectURL(file.blob) })),
    [entry],
  )
  useEffect(() => () => thumbnails.forEach((thumb) => URL.revokeObjectURL(thumb.url)), [thumbnails])
  const columns = entry.preset === 'workshop' ? Math.max(1, Math.ceil(entry.files.length / entry.workshopRows)) : entry.files.length

  return (
    <article className="subpanel library-card">
      <div
        className={
          entry.preset === 'workshop'
            ? `library-thumbs is-workshop${entry.workshopRows === 2 ? ' is-two-rows' : ''}`
            : 'library-thumbs'
        }
        style={{ '--thumb-columns': Math.max(1, columns) } as CSSProperties}
      >
        {thumbnails.map((thumb) => (
          <img key={thumb.key} src={thumb.url} alt="" loading="lazy" />
        ))}
      </div>
      <div className="library-card-body">
        <h3 title={entry.title}>{entry.title}</h3>
        <p className="library-meta">
          {intl.formatMessage({ id: PRESET_LABELS[entry.preset] })}
          {entry.preset === 'workshop' &&
            ` · ${intl.formatMessage({ id: `convert.option.rows${entry.workshopRows}` as MessageId })}`}
          {' · '}
          {intl.formatMessage({ id: 'library.files' }, { count: entry.files.length })}
          {' · '}
          {formatBytes(entry.bytes)}
        </p>
        <p className="library-meta">
          <time dateTime={new Date(entry.savedAt).toISOString()}>
            {intl.formatDate(entry.savedAt, { dateStyle: 'medium', timeStyle: 'short' })}
          </time>
        </p>
        <div className="results-actions-row">
          <button type="button" onClick={() => window.open(steamCanvasDemoUrl(entry.sourceId), '_blank', 'noopener,noreferrer')}>
            {intl.formatMessage({ id: 'library.steamCanvas.open' })}
          </button>
          <Button variant="danger" onClick={() => onDelete(entry)}>
            {intl.formatMessage({ id: 'library.delete' })}
          </Button>
        </div>
      </div>
    </article>
  )
}

/** The demo examples SteamCanvas keeps in this browser, read and deleted through its /bridge/ page. */
export function SteamCanvasSavedSection({ revision }: { revision: number }) {
  const intl = useIntl()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [actionError, setActionError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    listSteamCanvasSaved()
      .then((entries) => {
        if (active) setState({ status: 'ready', entries })
      })
      .catch(() => {
        if (active) setState({ status: 'error' })
      })
    return () => {
      active = false
    }
  }, [revision, reload])

  const entries = state.status === 'ready' ? state.entries : []
  const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0)

  async function run(action: () => Promise<void>): Promise<void> {
    setActionError('')
    try {
      await action()
    } catch (error) {
      setActionError(
        intl.formatMessage({ id: 'library.actionFailed' }, { detail: error instanceof Error ? error.message : String(error) }),
      )
    }
    setReload((current) => current + 1)
  }

  function remove(entry: SteamCanvasSavedEntry): void {
    if (!window.confirm(intl.formatMessage({ id: 'library.steamCanvas.deleteConfirm' }, { name: entry.title }))) return
    void run(() => deleteSteamCanvasSaved(entry.id))
  }

  function purge(): void {
    if (!window.confirm(intl.formatMessage({ id: 'library.steamCanvas.purgeConfirm' }))) return
    void run(clearSteamCanvasSaved)
  }

  return (
    <section className="steam-canvas-saved" aria-labelledby="steam-canvas-saved-title">
      <h3 id="steam-canvas-saved-title">{intl.formatMessage({ id: 'library.steamCanvas.title' })}</h3>
      <p className="panel-intro">{intl.formatMessage({ id: 'library.steamCanvas.intro' })}</p>

      {(state.status === 'loading' || entries.length > 0) && (
        <div className="library-toolbar">
          <p className="library-meta" role="status">
            {state.status === 'loading'
              ? intl.formatMessage({ id: 'library.steamCanvas.loading' })
              : intl.formatMessage({ id: 'library.steamCanvas.summary' }, { count: entries.length, size: formatBytes(totalBytes) })}
          </p>
          {entries.length > 0 && (
            <Button variant="danger" onClick={purge}>
              {intl.formatMessage({ id: 'library.purge' })}
            </Button>
          )}
        </div>
      )}

      {actionError && (
        <p className="profile-preview-error" role="alert">
          {actionError}
        </p>
      )}
      {state.status === 'error' && (
        <div className="steam-canvas-saved-error" role="alert">
          <p className="profile-preview-error">{intl.formatMessage({ id: 'library.steamCanvas.unavailable' })}</p>
          <Button size="small" onClick={() => setReload((current) => current + 1)}>
            {intl.formatMessage({ id: 'library.steamCanvas.retry' })}
          </Button>
        </div>
      )}
      {state.status === 'ready' && entries.length === 0 && (
        <p className="library-empty">{intl.formatMessage({ id: 'library.steamCanvas.empty' })}</p>
      )}
      <div className="library-list">
        {entries.map((entry) => (
          <SavedCard key={entry.id} entry={entry} onDelete={remove} />
        ))}
      </div>
    </section>
  )
}
