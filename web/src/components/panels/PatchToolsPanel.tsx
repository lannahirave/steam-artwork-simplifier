import { useIntl } from 'react-intl'
import { usePatchToolsContext } from '../../contexts/patchToolsContext'

interface PatchToolsPanelProps {
  onboardingTarget?: string
}

export function PatchToolsPanel(props: PatchToolsPanelProps) {
  const intl = useIntl()
  const { onboardingTarget } = props
  const { state, actions, meta } = usePatchToolsContext()
  const {
    eofFiles,
    eofByteInput,
    eofOutputs,
    eofError,
    headerFiles,
    headerWidth,
    headerHeight,
    headerEofEnabled,
    headerByteInput,
    headerOutputs,
    headerError,
  } = state
  const {
    onEofFilesChange,
    onEofByteInputChange,
    onRunEofPatch,
    onHeaderFilesChange,
    onHeaderWidthChange,
    onHeaderHeightChange,
    onHeaderEofEnabledChange,
    onHeaderByteInputChange,
    onRunHeaderPatch,
    onDownloadEofZip,
    onDownloadHeaderZip,
  } = actions
  const { downloadBlob: onDownloadBlob } = meta

  const eofFilesCount = eofFiles.length
  const headerFilesCount = headerFiles.length

  return (
    <section className="panel panel-patch" data-onboarding-target={onboardingTarget}>
      <h2>{intl.formatMessage({ id: 'patch.title' })}</h2>
      <p className="panel-intro">{intl.formatMessage({ id: 'patch.intro' })}</p>

      <div className="patch-grid">
        <article className="subpanel">
          <h3>{intl.formatMessage({ id: 'patch.eof.title' })}</h3>
          <label title="Choose files for EOF patching.">
            {intl.formatMessage({ id: 'patch.files' })}
            <input type="file" multiple onChange={onEofFilesChange} />
          </label>
          <label title="Hex byte to write as the final file byte.">
            {intl.formatMessage({ id: 'patch.eofByte' })}
            <input value={eofByteInput} onChange={(event) => onEofByteInputChange(event.target.value)} />
          </label>
          <button disabled={eofFilesCount === 0} onClick={onRunEofPatch}>
            {intl.formatMessage({ id: 'patch.applyEof' })}
          </button>
          <button disabled={eofOutputs.length === 0} onClick={onDownloadEofZip}>
            {intl.formatMessage({ id: 'patch.downloadZip' })}
          </button>
          {eofError && <p className="error">{eofError}</p>}
          <ul className="output-list">
            {eofOutputs.map((item) => (
              <li key={`${item.name}-${item.note}`}>
                <span>{item.note}</span>
                <button onClick={() => onDownloadBlob(item.name, item.blob)}>
                  {intl.formatMessage({ id: 'patch.download' })}
                </button>
              </li>
            ))}
          </ul>
        </article>

        <article className="subpanel">
          <h3>{intl.formatMessage({ id: 'patch.header.title' })}</h3>
          <label title="Choose GIF files for header width/height patching.">
            {intl.formatMessage({ id: 'patch.gifFiles' })}
            <input type="file" accept=".gif,image/gif" multiple onChange={onHeaderFilesChange} />
          </label>
          <label title="Width value to write to GIF header bytes 6-7.">
            {intl.formatMessage({ id: 'patch.width' })}
            <input type="number" min={1} max={65535} value={headerWidth} onChange={(event) => onHeaderWidthChange(event.target.value)} />
          </label>
          <label title="Height value to write to GIF header bytes 8-9.">
            {intl.formatMessage({ id: 'patch.height' })}
            <input type="number" min={1} max={65535} value={headerHeight} onChange={(event) => onHeaderHeightChange(event.target.value)} />
          </label>
          <label title="Hex byte to use for optional EOF patch in header tool.">
            {intl.formatMessage({ id: 'patch.eofByte' })}
            <input value={headerByteInput} onChange={(event) => onHeaderByteInputChange(event.target.value)} />
          </label>
          <label className="toggle" title="Also patch EOF byte while applying header width/height changes.">
            <input
              type="checkbox"
              checked={headerEofEnabled}
              onChange={(event) => onHeaderEofEnabledChange(event.target.checked)}
            />
            {intl.formatMessage({ id: 'patch.eofToggle' })}
          </label>
          <button disabled={headerFilesCount === 0} onClick={onRunHeaderPatch}>
            {intl.formatMessage({ id: 'patch.applyHeader' })}
          </button>
          <button disabled={headerOutputs.length === 0} onClick={onDownloadHeaderZip}>
            {intl.formatMessage({ id: 'patch.downloadZip' })}
          </button>
          {headerError && <p className="error">{headerError}</p>}
          <ul className="output-list">
            {headerOutputs.map((item) => (
              <li key={`${item.name}-${item.note}`}>
                <span>{item.note}</span>
                <button onClick={() => onDownloadBlob(item.name, item.blob)}>
                  {intl.formatMessage({ id: 'patch.download' })}
                </button>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  )
}
