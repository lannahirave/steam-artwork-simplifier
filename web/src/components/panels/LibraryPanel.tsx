import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useIntl } from 'react-intl'
import { downloadBlob } from '../../agents/appAgents'
import {
  clearLibrary,
  deleteLibraryEntry,
  enforceLibraryLimit,
  estimateStorageUsage,
  getLibraryLimitBytes,
  LIBRARY_LIMIT_OPTIONS_BYTES,
  pickEntriesToEvict,
  setLibraryLimitBytes,
  LIBRARY_CHANGED_EVENT,
  libraryEntryArtifacts,
  libraryEntryBytes,
  libraryEntryLayout,
  listLibraryEntries,
  LIBRARY_NOTES_MAX_LENGTH,
  normalizeLibraryNotes,
  updateLibraryEntryNotes,
  type LibraryEntry,
  type StorageUsage,
} from '../../lib/artworkLibrary'
import { canPreviewOnProfile, previewBlobOf, profilePreviewUrl } from '../../lib/profileHandoff'
import { createZip } from '../../lib/zip'
import { toArchiveBaseName } from '../../contexts/conversionSession'
import type { MessageId } from '../../i18n/messages'
import { Button } from '../ui/Button'
import { formatBytes } from './libraryFormat'
import { SteamCanvasSavedSection } from './SteamCanvasSavedSection'

interface LibraryPanelProps {
  onboardingTarget?: string
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; entries: LibraryEntry[] }
  | { status: 'error'; detail: string }

const PRESET_LABELS: Record<LibraryEntry['preset'], MessageId> = {
  workshop: 'convert.option.workshop',
  showcase: 'convert.option.showcase',
  featured: 'convert.option.featured',
  guide: 'convert.option.guide',
}

type NotesStatus = 'idle' | 'saving' | 'saved' | 'error'

/** The entry's notes. Saved when the field loses focus; later changes from other tabs show up unless you are typing. */
function LibraryNotes({ entry }: { entry: LibraryEntry }) {
  const intl = useIntl()
  const fieldId = useId()
  const statusId = `${fieldId}-status`
  const stored = entry.notes ?? ''
  const [draft, setDraft] = useState(stored)
  const [status, setStatus] = useState<NotesStatus>('idle')
  const editing = useRef(false)

  useEffect(() => {
    if (!editing.current) setDraft(stored)
  }, [stored])

  async function save(): Promise<void> {
    editing.current = false
    const next = normalizeLibraryNotes(draft)
    setDraft(next)
    if (next === stored) return
    setStatus('saving')
    try {
      const found = await updateLibraryEntryNotes(entry.id, next)
      setStatus(found ? 'saved' : 'error')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="library-notes">
      <label htmlFor={fieldId}>{intl.formatMessage({ id: 'library.notes.label' })}</label>
      <textarea
        id={fieldId}
        value={draft}
        rows={2}
        maxLength={LIBRARY_NOTES_MAX_LENGTH}
        placeholder={intl.formatMessage({ id: 'library.notes.placeholder' })}
        aria-describedby={statusId}
        onFocus={() => {
          editing.current = true
        }}
        onChange={(event) => {
          setDraft(event.target.value)
          setStatus('idle')
        }}
        onBlur={() => void save()}
      />
      <p id={statusId} className={status === 'error' ? 'library-notes-status is-error' : 'library-notes-status'} role="status">
        {status === 'saving' && intl.formatMessage({ id: 'library.notes.saving' })}
        {status === 'saved' && intl.formatMessage({ id: 'library.notes.saved' })}
        {status === 'error' && intl.formatMessage({ id: 'library.notes.failed' })}
      </p>
    </div>
  )
}

function LibraryCard({ entry, onDelete }: { entry: LibraryEntry; onDelete: (entry: LibraryEntry) => void }) {
  const intl = useIntl()
  const [zipping, setZipping] = useState(false)
  const artifacts = useMemo(() => libraryEntryArtifacts(entry), [entry])
  const thumbnails = useMemo(
    () => entry.files.map((file) => ({ name: file.name, url: URL.createObjectURL(previewBlobOf(file)) })),
    [entry],
  )
  useEffect(() => () => thumbnails.forEach((thumb) => URL.revokeObjectURL(thumb.url)), [thumbnails])

  const thumbColumns =
    entry.preset === 'workshop'
      ? Math.max(1, Math.ceil(entry.files.length / entry.workshopRows))
      : Math.max(1, entry.files.length)
  const canPreview = canPreviewOnProfile(libraryEntryLayout(entry), artifacts)
  const title = entry.sourceName || intl.formatMessage({ id: 'library.untitled' })

  async function downloadZip(): Promise<void> {
    setZipping(true)
    try {
      const zip = await createZip(
        entry.files.map((file) => ({ name: file.name, blob: file.blob })),
        `${toArchiveBaseName(entry.sourceName)}.zip`,
      )
      downloadBlob(zip.name, zip.blob)
    } finally {
      setZipping(false)
    }
  }

  return (
    <article className="subpanel library-card">
      <div
        className={
          entry.preset === 'workshop'
            ? `library-thumbs is-workshop${entry.workshopRows === 2 ? ' is-two-rows' : ''}`
            : 'library-thumbs'
        }
        style={{ '--thumb-columns': thumbColumns } as CSSProperties}
      >
        {thumbnails.map((thumb) => (
          <img key={thumb.name} src={thumb.url} alt="" loading="lazy" />
        ))}
      </div>
      <div className="library-card-body">
        <h3 title={title}>{title}</h3>
        <p className="library-meta">
          {intl.formatMessage({ id: PRESET_LABELS[entry.preset] })}
          {entry.preset === 'workshop' &&
            ` · ${intl.formatMessage({ id: `convert.option.rows${entry.workshopRows}` as MessageId })}`}
          {' · '}
          {intl.formatMessage({ id: 'library.files' }, { count: entry.files.length })}
          {' · '}
          {formatBytes(libraryEntryBytes(entry))}
        </p>
        <p className="library-meta">
          <time dateTime={new Date(entry.createdAt).toISOString()}>
            {intl.formatDate(entry.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
          </time>
          {!entry.complete && (
            <span className="library-badge">{intl.formatMessage({ id: 'library.incomplete' })}</span>
          )}
        </p>
        <LibraryNotes entry={entry} />
        <div className="results-actions-row">
          <button type="button" onClick={() => void downloadZip()} disabled={zipping}>
            {intl.formatMessage({ id: 'library.downloadZip' })}
          </button>
          {canPreview && (
            <button
              type="button"
              title={intl.formatMessage({ id: 'convert.profilePreview.hint' })}
              onClick={() => window.open(profilePreviewUrl(entry.id), '_blank', 'noopener,noreferrer')}
            >
              {intl.formatMessage({ id: 'convert.profilePreview.open' })}
            </button>
          )}
          <Button variant="danger" onClick={() => onDelete(entry)}>
            {intl.formatMessage({ id: 'library.delete' })}
          </Button>
        </div>
        <details className="library-files">
          <summary>{intl.formatMessage({ id: 'library.showFiles' })}</summary>
          <ul>
            {entry.files.map((file) => (
              <li key={file.name}>
                <span>
                  {file.name} · {file.width}×{file.height} · {formatBytes(file.blob.size)}
                </span>
                <button type="button" onClick={() => downloadBlob(file.name, file.blob)}>
                  {intl.formatMessage({ id: 'convert.download' })}
                </button>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </article>
  )
}

export function LibraryPanel({ onboardingTarget }: LibraryPanelProps) {
  const intl = useIntl()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [actionError, setActionError] = useState('')
  const [limitBytes, setLimitBytes] = useState(getLibraryLimitBytes)

  // Bumped when the library changes here or the tab becomes visible (another tab may have changed it).
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    listLibraryEntries()
      .then((entries) => {
        if (active) setState({ status: 'ready', entries })
      })
      .catch((error: unknown) => {
        if (active) setState({ status: 'error', detail: error instanceof Error ? error.message : String(error) })
      })
    estimateStorageUsage()
      .catch(() => null)
      .then((nextUsage) => {
        if (active) setUsage(nextUsage)
      })
    return () => {
      active = false
    }
  }, [revision])

  useEffect(() => {
    const bump = () => setRevision((current) => current + 1)
    const onVisible = () => {
      if (document.visibilityState === 'visible') bump()
    }
    window.addEventListener(LIBRARY_CHANGED_EVENT, bump)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener(LIBRARY_CHANGED_EVENT, bump)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  async function run(action: () => Promise<void>): Promise<void> {
    setActionError('')
    try {
      await action()
    } catch (error) {
      setActionError(
        intl.formatMessage(
          { id: 'library.actionFailed' },
          { detail: error instanceof Error ? error.message : String(error) },
        ),
      )
    }
  }

  function remove(entry: LibraryEntry): void {
    const name = entry.sourceName || intl.formatMessage({ id: 'library.untitled' })
    if (!window.confirm(intl.formatMessage({ id: 'library.deleteConfirm' }, { name }))) return
    void run(() => deleteLibraryEntry(entry.id))
  }

  function purge(): void {
    if (!window.confirm(intl.formatMessage({ id: 'library.purgeConfirm' }))) return
    void run(clearLibrary)
  }

  function changeLimit(nextLimit: number): void {
    const evicted = pickEntriesToEvict(entries, nextLimit)
    if (
      evicted.length > 0 &&
      !window.confirm(
        intl.formatMessage(
          { id: 'library.limit.shrinkConfirm' },
          { count: evicted.length, limit: formatBytes(nextLimit) },
        ),
      )
    ) {
      return
    }
    setLibraryLimitBytes(nextLimit)
    setLimitBytes(nextLimit)
    if (evicted.length > 0) void run(async () => void (await enforceLibraryLimit(nextLimit)))
  }

  const entries = state.status === 'ready' ? state.entries : []
  const totalBytes = entries.reduce((sum, entry) => sum + libraryEntryBytes(entry), 0)
  const usedShare = Math.min(1, totalBytes / limitBytes)
  const limitOptions = LIBRARY_LIMIT_OPTIONS_BYTES.includes(limitBytes)
    ? LIBRARY_LIMIT_OPTIONS_BYTES
    : [...LIBRARY_LIMIT_OPTIONS_BYTES, limitBytes].sort((a, b) => a - b)

  return (
    <section className="panel panel-library" data-onboarding-target={onboardingTarget}>
      <h2>{intl.formatMessage({ id: 'library.title' })}</h2>
      <p className="panel-intro">{intl.formatMessage({ id: 'library.intro' })}</p>

      <div className="library-toolbar">
        <p className="library-meta" role="status">
          {intl.formatMessage(
            { id: 'library.summary' },
            { count: entries.length, size: formatBytes(totalBytes) },
          )}
          {usage &&
            ` · ${intl.formatMessage(
              { id: 'library.storage' },
              { used: formatBytes(usage.usedBytes), quota: formatBytes(usage.quotaBytes) },
            )}`}
        </p>
        <Button variant="danger" onClick={purge} disabled={entries.length === 0}>
          {intl.formatMessage({ id: 'library.purge' })}
        </Button>
      </div>

      <div className={usedShare >= 0.9 ? 'library-limit is-near-full' : 'library-limit'}>
        <div className="library-limit-head">
          <p>
            {intl.formatMessage(
              { id: 'library.limit.usage' },
              { used: formatBytes(totalBytes), limit: formatBytes(limitBytes) },
            )}
          </p>
          <label>
            {intl.formatMessage({ id: 'library.limit.label' })}
            <select value={limitBytes} onChange={(event) => changeLimit(Number(event.target.value))}>
              {limitOptions.map((bytes) => (
                <option key={bytes} value={bytes}>
                  {formatBytes(bytes)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          className="library-limit-bar"
          role="progressbar"
          aria-label={intl.formatMessage({ id: 'library.limit.label' })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(usedShare * 100)}
        >
          <span style={{ width: `${usedShare * 100}%` }} />
        </div>
        <p className="library-limit-note">{intl.formatMessage({ id: 'library.limit.note' })}</p>
      </div>

      {actionError && (
        <p className="profile-preview-error" role="alert">
          {actionError}
        </p>
      )}
      {state.status === 'loading' && <p className="library-meta">{intl.formatMessage({ id: 'library.loading' })}</p>}
      {state.status === 'error' && (
        <p className="profile-preview-error" role="alert">
          {intl.formatMessage({ id: 'library.loadFailed' }, { detail: state.detail })}
        </p>
      )}
      {state.status === 'ready' && entries.length === 0 && (
        <p className="library-empty">{intl.formatMessage({ id: 'library.empty' })}</p>
      )}
      <div className="library-list">
        {entries.map((entry) => (
          <LibraryCard key={entry.id} entry={entry} onDelete={remove} />
        ))}
      </div>

      <SteamCanvasSavedSection revision={revision} />
    </section>
  )
}
