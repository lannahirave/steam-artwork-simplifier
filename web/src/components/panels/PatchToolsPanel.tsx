import { usePatchToolsContext } from '../../contexts/patchToolsContext'

export function PatchToolsPanel() {
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
    <section className="panel panel-patch">
      <h2>Patch Tools</h2>
      <p className="panel-intro">
        Rewrite EOF bytes and logical GIF dimensions in batches when you need surgical fixes without re-encoding.
      </p>

      <div className="patch-grid">
        <article className="subpanel">
          <h3>EOF Patch</h3>
          <label title="Choose files for EOF patching.">
            Files
            <input type="file" multiple onChange={onEofFilesChange} />
          </label>
          <label title="Hex byte to write as the final file byte.">
            EOF Byte (hex)
            <input value={eofByteInput} onChange={(event) => onEofByteInputChange(event.target.value)} />
          </label>
          <button disabled={eofFilesCount === 0} onClick={onRunEofPatch}>
            Apply EOF Patch
          </button>
          <button disabled={eofOutputs.length === 0} onClick={onDownloadEofZip}>
            Download all (ZIP archive)
          </button>
          {eofError && <p className="error">{eofError}</p>}
          <ul className="output-list">
            {eofOutputs.map((item) => (
              <li key={`${item.name}-${item.note}`}>
                <span>{item.note}</span>
                <button onClick={() => onDownloadBlob(item.name, item.blob)}>Download</button>
              </li>
            ))}
          </ul>
        </article>

        <article className="subpanel">
          <h3>GIF Header Patch</h3>
          <label title="Choose GIF files for header width/height patching.">
            GIF Files
            <input type="file" accept=".gif,image/gif" multiple onChange={onHeaderFilesChange} />
          </label>
          <label title="Width value to write to GIF header bytes 6-7.">
            Width
            <input type="number" min={1} max={65535} value={headerWidth} onChange={(event) => onHeaderWidthChange(event.target.value)} />
          </label>
          <label title="Height value to write to GIF header bytes 8-9.">
            Height
            <input type="number" min={1} max={65535} value={headerHeight} onChange={(event) => onHeaderHeightChange(event.target.value)} />
          </label>
          <label title="Hex byte to use for optional EOF patch in header tool.">
            EOF Byte (hex)
            <input value={headerByteInput} onChange={(event) => onHeaderByteInputChange(event.target.value)} />
          </label>
          <label className="toggle" title="Also patch EOF byte while applying header width/height changes.">
            <input
              type="checkbox"
              checked={headerEofEnabled}
              onChange={(event) => onHeaderEofEnabledChange(event.target.checked)}
            />
            Patch EOF byte
          </label>
          <button disabled={headerFilesCount === 0} onClick={onRunHeaderPatch}>
            Apply Header Patch
          </button>
          <button disabled={headerOutputs.length === 0} onClick={onDownloadHeaderZip}>
            Download all (ZIP archive)
          </button>
          {headerError && <p className="error">{headerError}</p>}
          <ul className="output-list">
            {headerOutputs.map((item) => (
              <li key={`${item.name}-${item.note}`}>
                <span>{item.note}</span>
                <button onClick={() => onDownloadBlob(item.name, item.blob)}>Download</button>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  )
}
