import { useState } from 'react'
import { useIntl } from 'react-intl'
import { getDefaultWorkerCount } from '../../lib/defaults'
import type { ConversionConfig } from '../../lib/types'
import { parseHexByte } from '../../lib/validation'
import { formatElapsed } from '../../agents/appAgents'
import { useConvertContext } from '../../contexts/convertContext'

interface ConvertPanelProps {
  onboardingTarget?: string
}

export function ConvertPanel(props: ConvertPanelProps) {
  const intl = useIntl()
  const { onboardingTarget } = props
  const { state, actions, meta } = useConvertContext()
  const [copiedSection, setCopiedSection] = useState<'progress' | 'logs' | null>(null)
  const {
    config,
    sourceFile,
    busy,
    estimatingFps,
    fpsEstimateInfo,
    progressPercent,
    progressLabel,
    elapsedMs,
    lastElapsedMs,
    warnings,
    progress,
    logs,
    error,
    artifactViews,
  } = state
  const {
    setConfig,
    onUpdatePreset,
    onSourceFileChange,
    onEstimateAndApplyFps,
    onRunConversion,
    onCancelConversion,
    onDownloadZip,
    onResetConvertState,
  } = actions
  const {
    convertDisabled,
    optimizationDisabled,
    standardRetriesEffective,
    retryControlsDisabled,
    precheckEffective,
    retryFpsEffective,
    retryColorEffective,
    lossyEffective,
    isCompactStrip,
    resultsGridClassName,
    getColorReductionPercent,
    downloadBlob: onDownloadBlob,
  } = meta
  const progressText = progress.map((entry) => `[${entry.stage}] ${entry.message}`).join('\n')
  const runLogsText = logs.join('\n')

  async function copyText(section: 'progress' | 'logs', text: string): Promise<void> {
    if (!text) {
      return
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'absolute'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopiedSection(section)
      window.setTimeout(() => {
        setCopiedSection((prev) => (prev === section ? null : prev))
      }, 1600)
    } catch {
      setCopiedSection(null)
    }
  }

  return (
    <section className="panel panel-convert" data-onboarding-target={onboardingTarget}>
      <h2>{intl.formatMessage({ id: 'convert.title' })}</h2>
      <p className="panel-intro">{intl.formatMessage({ id: 'convert.intro' })}</p>

      <div className="config-groups">
        <section className="config-group">
          <h3>{intl.formatMessage({ id: 'convert.sourceLayout' })}</h3>
          <div className="form-grid">
            <label title="Select output mode: workshop splits into 5 equal slices, showcase splits into 506px + 100px, featured creates one wide GIF.">
              {intl.formatMessage({ id: 'convert.preset' })}
              <select value={config.preset} onChange={(event) => onUpdatePreset(event.target.value as ConversionConfig['preset'])}>
                <option value="workshop">{intl.formatMessage({ id: 'convert.option.workshop' })}</option>
                <option value="showcase">{intl.formatMessage({ id: 'convert.option.showcase' })}</option>
                <option value="featured">{intl.formatMessage({ id: 'convert.option.featured' })}</option>
                <option value="guide">{intl.formatMessage({ id: 'convert.option.guide' })}</option>
              </select>
            </label>

            <label title="Choose a source video or image file (GIF/PNG/WEBP/JPG/BMP) to convert to GIF output.">
              {intl.formatMessage({ id: 'convert.sourceFile' })}
              <input
                type="file"
                accept="video/*,.gif,image/gif,.png,image/png,.webp,image/webp,.jpg,.jpeg,image/jpeg,.bmp,image/bmp"
                onChange={onSourceFileChange}
              />
            </label>

            {config.preset === 'workshop' && (
              <>
                <label title="Number of output slices for workshop preset.">
                  {intl.formatMessage({ id: 'convert.parts' })}
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={config.parts}
                    onChange={(event) =>
                      setConfig((prev) => ({
                        ...prev,
                        parts: Number.parseInt(event.target.value, 10) || 1,
                        workerCount: getDefaultWorkerCount(Number.parseInt(event.target.value, 10) || 1),
                      }))
                    }
                  />
                </label>
                <label title="Width in pixels of each workshop slice.">
                  {intl.formatMessage({ id: 'convert.partWidth' })}
                  <input
                    type="number"
                    min={1}
                    value={config.partWidth}
                    onChange={(event) =>
                      setConfig((prev) => ({ ...prev, partWidth: Number.parseInt(event.target.value, 10) || 1 }))
                    }
                  />
                </label>
              </>
            )}

            {config.preset === 'featured' && (
              <label title="Width in pixels of the featured output GIF.">
                {intl.formatMessage({ id: 'convert.featuredWidth' })}
                <input
                  type="number"
                  min={1}
                  value={config.featuredWidth}
                  onChange={(event) =>
                    setConfig((prev) => ({ ...prev, featuredWidth: Number.parseInt(event.target.value, 10) || 1 }))
                  }
                />
              </label>
            )}

            {config.preset === 'guide' && (
              <label title="Guide preset outputs a centered square GIF at 195x195.">
                {intl.formatMessage({ id: 'convert.guideSize' })}
                <input value={intl.formatMessage({ id: 'convert.fixed.guideSize' })} disabled />
              </label>
            )}

            {config.preset === 'showcase' && (
              <>
                <label title="Artwork showcase preset uses a fixed two-part split from a total width of 606 pixels.">
                  {intl.formatMessage({ id: 'convert.showcaseSplit' })}
                  <input value={intl.formatMessage({ id: 'convert.fixed.showcaseSplit' })} disabled />
                </label>
                <label title="Total target width used before splitting the showcase output.">
                  {intl.formatMessage({ id: 'convert.showcaseTotalWidth' })}
                  <input value={intl.formatMessage({ id: 'convert.fixed.showcaseWidth' })} disabled />
                </label>
              </>
            )}
          </div>
        </section>

        <section className="config-group">
          <h3>{intl.formatMessage({ id: 'convert.frameSize' })}</h3>
          <div className="form-grid">
            <label title="Starting frame rate for the first encode pass.">
              {intl.formatMessage({ id: 'convert.gifFps' })}
              <div className="field-input-row">
                <input
                  type="number"
                  min={1}
                  value={config.gifFps}
                  onChange={(event) => setConfig((prev) => ({ ...prev, gifFps: Number.parseInt(event.target.value, 10) || 1 }))}
                />
                <button
                  type="button"
                  className="inline-action"
                  title="Estimate and apply a practical GIF FPS from source resolution, duration, and current size target."
                  disabled={!sourceFile || busy || estimatingFps}
                  onClick={onEstimateAndApplyFps}
                >
                  {intl.formatMessage({ id: estimatingFps ? 'convert.estimating' : 'convert.estimate' })}
                </button>
              </div>
              {fpsEstimateInfo && <small className="field-note">{fpsEstimateInfo}</small>}
            </label>

            <label title="Lowest FPS allowed during recompression attempts.">
              {intl.formatMessage({ id: 'convert.minGifFps' })}
              <input
                type="number"
                min={1}
                value={config.minGifFps}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, minGifFps: Number.parseInt(event.target.value, 10) || 1 }))
                }
              />
            </label>

            <label title="Hard output size limit per GIF in kilobytes. Ignored when Disable Optimizations is enabled.">
              {intl.formatMessage({ id: 'convert.maxGifKb' })}
              <input
                type="number"
                min={1}
                disabled={optimizationDisabled}
                value={config.maxGifKb}
                onChange={(event) => setConfig((prev) => ({ ...prev, maxGifKb: Number.parseInt(event.target.value, 10) || 1 }))}
              />
            </label>

            <label title="Preferred output size target used by recompression attempts. Ignored when Disable Optimizations is enabled.">
              {intl.formatMessage({ id: 'convert.targetGifKb' })}
              <input
                type="number"
                min={1}
                disabled={optimizationDisabled}
                value={config.targetGifKb}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, targetGifKb: Number.parseInt(event.target.value, 10) || 1 }))
                }
              />
            </label>

            <label title="Estimate output size before encoding and stop early if likely too large.">
              <span className="toggle-row">
                <input
                  type="checkbox"
                  checked={precheckEffective}
                  disabled={optimizationDisabled}
                  onChange={(event) => setConfig((prev) => ({ ...prev, precheckEnabled: event.target.checked }))}
                />
                {intl.formatMessage({ id: 'convert.enablePrecheck' })}
              </span>
            </label>
          </div>
        </section>

        <section className="config-group">
          <h3>{intl.formatMessage({ id: 'convert.performance' })}</h3>
          <div className="form-grid">
            <label title="How many conversion jobs run in parallel (higher can be faster but less stable).">
              {intl.formatMessage({ id: 'convert.workerCount' })}
              <input
                type="number"
                min={1}
                max={3}
                value={config.workerCount}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, workerCount: Number.parseInt(event.target.value, 10) || 1 }))
                }
              />
            </label>

            <div className="raw-mode-card" title="Raw mode skips retry ladders and ignores max/target size checks.">
              <button
                type="button"
                className={optimizationDisabled ? 'raw-mode-btn active' : 'raw-mode-btn'}
                onClick={() =>
                  setConfig((prev) => ({
                    ...prev,
                    disableOptimizations: !prev.disableOptimizations,
                  }))
                }
              >
                {intl.formatMessage({
                  id: optimizationDisabled ? 'convert.enableOptimizations' : 'convert.disableOptimizations',
                })}
              </button>
              <small className="field-note">
                {intl.formatMessage({
                  id: optimizationDisabled ? 'convert.rawModeActive' : 'convert.rawModeInactive',
                })}
              </small>
            </div>

            <label className="toggle" title="Enable standard recompression retries after initial encode.">
              <input
                type="checkbox"
                checked={standardRetriesEffective}
                disabled={optimizationDisabled}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, standardRetriesEnabled: event.target.checked }))
                }
              />
              {intl.formatMessage({ id: 'convert.standardRetries' })}
            </label>

            <label
              className="toggle"
              title="Allow standard retries to reduce FPS from GIF FPS down to Min GIF FPS."
            >
              <input
                type="checkbox"
                checked={retryFpsEffective}
                disabled={retryControlsDisabled}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, retryAllowFpsDrop: event.target.checked }))
                }
              />
              {intl.formatMessage({ id: 'convert.fpsReduction' })}
            </label>

            <label
              className="toggle"
              title="Allow standard retries to reduce palette colors for smaller output."
            >
              <input
                type="checkbox"
                checked={retryColorEffective}
                disabled={retryControlsDisabled}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, retryAllowColorDrop: event.target.checked }))
                }
              />
              {intl.formatMessage({ id: 'convert.colorReduction' })}
            </label>

            {optimizationDisabled && (
              <p className="config-note">
                {intl.formatMessage({ id: 'convert.optimizationInactive' })}
              </p>
            )}
            {!optimizationDisabled && !config.standardRetriesEnabled && (
              <p className="config-note">
                {intl.formatMessage({ id: 'convert.retriesNeedStandard' })}
              </p>
            )}

            <div
              className="lossy-group"
              title="Extra lossy profiles used only when output is still above max GIF size."
            >
              <label className="toggle lossy-group-toggle" title="Enable extra lossy profiles when GIF is still above max size.">
                <input
                  type="checkbox"
                  checked={lossyEffective}
                  disabled={optimizationDisabled}
                  onChange={(event) => setConfig((prev) => ({ ...prev, lossyOversize: event.target.checked }))}
                />
                {intl.formatMessage({ id: 'convert.lossyFallback' })}
              </label>
              <small className="field-note lossy-group-note">
                {intl.formatMessage({ id: lossyEffective ? 'convert.lossyOn' : 'convert.lossyOff' })}
              </small>
              <div className="lossy-group-fields">
                <label title="Lossy fallback aggressiveness (1 mild, 2 balanced, 3 aggressive).">
                  {intl.formatMessage({ id: 'convert.lossyLevel' })}
                  <input
                    type="number"
                    min={1}
                    max={3}
                    disabled={optimizationDisabled || !lossyEffective}
                    value={config.lossyLevel}
                    onChange={(event) => setConfig((prev) => ({ ...prev, lossyLevel: Number.parseInt(event.target.value, 10) || 1 }))}
                  />
                </label>

                <label title="Maximum lossy attempts when output is still above max GIF size.">
                    {intl.formatMessage({ id: 'convert.lossyAttempts' })}
                  <input
                    type="number"
                    min={1}
                    disabled={optimizationDisabled || !lossyEffective}
                    value={config.lossyMaxAttempts}
                    onChange={(event) =>
                      setConfig((prev) => ({ ...prev, lossyMaxAttempts: Number.parseInt(event.target.value, 10) || 1 }))
                    }
                  />
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="config-group">
          <h3>{intl.formatMessage({ id: 'convert.outputPatching' })}</h3>
          <div className="form-grid">
            <label title="Hex byte value used for EOF patching (for example 21 = 0x21).">
              {intl.formatMessage({ id: 'convert.eofByte' })}
              <input
                value={config.eofByte.toString(16).toUpperCase()}
                onChange={(event) => {
                  try {
                    const byte = parseHexByte(event.target.value)
                    setConfig((prev) => ({ ...prev, eofByte: byte }))
                  } catch {
                    // ignore transient invalid text
                  }
                }}
              />
            </label>

            <label className="toggle" title="Patch the last byte of each output file with the configured EOF byte.">
              <input
                type="checkbox"
                checked={config.eofPatchEnabled}
                onChange={(event) => setConfig((prev) => ({ ...prev, eofPatchEnabled: event.target.checked }))}
              />
              {intl.formatMessage({ id: 'convert.patchOutputEof' })}
            </label>

            <label className="toggle" title="Rewrite GIF header logical width/height metadata on outputs.">
              <input
                type="checkbox"
                checked={config.headerPatchEnabled}
                onChange={(event) => setConfig((prev) => ({ ...prev, headerPatchEnabled: event.target.checked }))}
              />
              {intl.formatMessage({ id: 'convert.patchHeader' })}
            </label>

            {config.headerPatchEnabled && (
              <>
                <label title="Width value written to GIF header bytes 6-7.">
                  {intl.formatMessage({ id: 'convert.headerWidth' })}
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={config.headerWidth}
                    onChange={(event) =>
                      setConfig((prev) => ({ ...prev, headerWidth: Number.parseInt(event.target.value, 10) || 1 }))
                    }
                  />
                </label>
                <label title="Height value written to GIF header bytes 8-9.">
                  {intl.formatMessage({ id: 'convert.headerHeight' })}
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={config.headerHeight}
                    onChange={(event) =>
                      setConfig((prev) => ({ ...prev, headerHeight: Number.parseInt(event.target.value, 10) || 1 }))
                    }
                  />
                </label>
              </>
            )}
          </div>
        </section>
      </div>

      <div className="actions">
        <button disabled={convertDisabled} onClick={onRunConversion}>
          {intl.formatMessage({ id: 'convert.run' })}
        </button>
        <button disabled={!busy} onClick={onCancelConversion}>
          {intl.formatMessage({ id: 'convert.cancel' })}
        </button>
        <button onClick={onResetConvertState}>{intl.formatMessage({ id: 'convert.reset' })}</button>
      </div>

      {(busy || progressPercent > 0) && (
        <div className="progress-panel">
          <div className="progress-head">
            <span>{intl.formatMessage({ id: busy ? 'convert.converting' : 'convert.lastConversion' })}</span>
            <strong>{Math.round(progressPercent)}%</strong>
          </div>
          <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPercent)}>
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          {progressLabel && <p className="progress-label">{progressLabel}</p>}
          {(busy || lastElapsedMs !== null) && (
            <p className="progress-time">
              {intl.formatMessage({ id: 'convert.time' })} {busy ? formatElapsed(elapsedMs) : formatElapsed(lastElapsedMs ?? 0)}
            </p>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {warnings.length > 0 && (
        <div className="warn-box">
          <h3>{intl.formatMessage({ id: 'convert.warnings' })}</h3>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {progress.length > 0 && (
        <div className="log-box">
          <div className="log-head">
            <h3>{intl.formatMessage({ id: 'convert.liveProgress' })}</h3>
            <button type="button" className="inline-action" onClick={() => void copyText('progress', progressText)}>
              {intl.formatMessage({ id: copiedSection === 'progress' ? 'convert.copied' : 'convert.copyLogs' })}
            </button>
          </div>
          <pre>{progressText}</pre>
        </div>
      )}

      {logs.length > 0 && (
        <div className="log-box">
          <div className="log-head">
            <h3>{intl.formatMessage({ id: 'convert.runLogs' })}</h3>
            <button type="button" className="inline-action" onClick={() => void copyText('logs', runLogsText)}>
              {intl.formatMessage({ id: copiedSection === 'logs' ? 'convert.copied' : 'convert.copyLogs' })}
            </button>
          </div>
          <pre>{runLogsText}</pre>
        </div>
      )}

      {artifactViews.length > 0 && (
        <>
          {lastElapsedMs !== null && (
            <p className="result-timing">
              {intl.formatMessage({ id: 'convert.outputReady' }, { time: formatElapsed(lastElapsedMs) })}
            </p>
          )}
          <div className="results-actions-row">
            <button onClick={onDownloadZip}>
              {intl.formatMessage({ id: 'convert.downloadZip' })}
            </button>
          </div>
          <section className={resultsGridClassName}>
            {artifactViews.map((item) => (
              <article className="result-card" key={item.artifact.name}>
                {!isCompactStrip && (
                  <>
                    <h3>{item.artifact.name}</h3>
                    <p>
                      {item.artifact.width}x{item.artifact.height} | {item.artifact.status}
                    </p>
                  </>
                )}
                {isCompactStrip && (
                  <p className="compact-caption">
                    {item.artifact.name} | {item.artifact.width}x{item.artifact.height}
                  </p>
                )}
                <img
                  src={item.url}
                  alt={item.artifact.name}
                  loading="lazy"
                  style={
                    isCompactStrip
                      ? {
                          width: `${item.artifact.width}px`,
                          height: `${item.artifact.height}px`,
                        }
                      : undefined
                  }
                />
                <div className={isCompactStrip ? 'gif-meta compact' : 'gif-meta'}>
                  <span>{intl.formatMessage({ id: 'convert.fpsMeta' }, { fps: item.artifact.finalFps })}</span>
                  <span>
                    {intl.formatMessage(
                      { id: 'convert.colorReduction' },
                      { percent: getColorReductionPercent(item.artifact.finalColors) },
                    )}
                  </span>
                </div>
                <div className={isCompactStrip ? 'download-row compact' : 'download-row'}>
                  <span className="gif-size">{item.artifact.sizeKb.toFixed(1)}KB</span>
                  <button
                    className={isCompactStrip ? 'compact-download' : ''}
                    onClick={() => onDownloadBlob(item.artifact.name, item.artifact.blob)}
                  >
                    {intl.formatMessage({ id: isCompactStrip ? 'convert.downloadShort' : 'convert.download' })}
                  </button>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </section>
  )
}
