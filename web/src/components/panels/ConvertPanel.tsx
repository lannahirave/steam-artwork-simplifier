import { useState, type CSSProperties } from 'react'
import { useIntl } from 'react-intl'
import type { ConversionConfig, OptimizationMode } from '../../lib/types'
import { countAdvancedConfigOverrides } from '../../lib/defaults'
import { MAX_SAFE_WASM_WORKERS } from '../../lib/presetPlan'
import { parseHexByte } from '../../lib/validation'
import { formatElapsed } from '../../agents/appAgents'
import { useConvertContext } from '../../contexts/convertContext'
import { SwitchCard } from '../SwitchCard'
import { MemoryDebugPanel } from './MemoryDebugPanel'

interface ConvertPanelProps {
  onboardingTarget?: string
}

export function ConvertPanel(props: ConvertPanelProps) {
  const intl = useIntl()
  const { onboardingTarget } = props
  const { state, actions, meta } = useConvertContext()
  const [copiedSection, setCopiedSection] = useState<'progress' | 'diagnostics' | null>(null)
  const {
    config,
    sourceFile,
    busy,
    finishingCurrent,
    estimatingFps,
    fpsEstimateInfo,
    progressPercent,
    progressLabel,
    elapsedMs,
    lastElapsedMs,
    warnings,
    progress,
    error,
    artifactViews,
    memoryDebug,
  } = state
  const {
    setConfig,
    onUpdatePreset,
    onSourceFileChange,
    onEstimateAndApplyFps,
    onRunConversion,
    onCancelConversion,
    onFinishCurrentConversion,
    onDownloadZip,
    onResetConvertState,
    onUpdateWorkshopParts,
    onUpdateWorkshopRows,
  } = actions
  const {
    convertDisabled,
    optimizationDisabled,
    standardRetriesEffective,
    retryControlsDisabled,
    precheckEffective,
    retryFpsEffective,
    retryQualityEffective,
    lossyEffective,
    isCompactStrip,
    resultsGridClassName,
    getQualityReductionPercent,
    downloadBlob: onDownloadBlob,
    presetPlan,
    showLongMp4Memo,
    showWorkshopMemoryMemo,
    browserSupport,
  } = meta
  const progressText = progress.map((entry) => `[${entry.time}] [${entry.stage}] ${entry.message}`).join('\n')
  const diagnosticText = browserSupport.diagnosticLog.join('\n')
  const showMemoryDebug = import.meta.env.DEV
  const resultsGridStyle = resultsGridClassName.includes('workshop-grid')
    ? ({ '--workshop-columns': config.parts } as CSSProperties)
    : undefined
  const advancedOverrideCount = countAdvancedConfigOverrides(config)

  async function copyText(section: 'progress' | 'diagnostics', text: string): Promise<void> {
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

      {!browserSupport.supported && (
        <section className="browser-support-warning" aria-live="polite">
          <div className="browser-support-head">
            <div>
              <p className="browser-support-kicker">
                {intl.formatMessage({ id: 'convert.browserSupport.kicker' })}
              </p>
              <h3>{intl.formatMessage({ id: 'convert.browserSupport.title' })}</h3>
            </div>
            <button
              type="button"
              className="inline-action"
              onClick={() => void copyText('diagnostics', diagnosticText)}
            >
              {intl.formatMessage({
                id: copiedSection === 'diagnostics' ? 'convert.copied' : 'convert.browserSupport.copy',
              })}
            </button>
          </div>
          <p>{browserSupport.summary}</p>
          <ul>
            {browserSupport.reasons.map((reason) => (
              <li key={reason.code}>
                <strong>{reason.label}</strong>
                <span>{reason.detail}</span>
              </li>
            ))}
          </ul>
          <details className="browser-support-details">
            <summary>{intl.formatMessage({ id: 'convert.browserSupport.details' })}</summary>
            <pre>{diagnosticText}</pre>
          </details>
        </section>
      )}

      <div className="config-groups">
        <section className="config-group">
          <h3>{intl.formatMessage({ id: 'convert.sourceLayout' })}</h3>
          <div className="form-grid form-grid-source">
            <label
              className="field-preset"
              title="Select output mode: workshop splits into 5 equal slices, showcase splits into 506px + 100px, featured creates one wide GIF."
            >
              {intl.formatMessage({ id: 'convert.preset' })}
              <select value={config.preset} onChange={(event) => onUpdatePreset(event.target.value as ConversionConfig['preset'])}>
                <option value="workshop">{intl.formatMessage({ id: 'convert.option.workshop' })}</option>
                <option value="showcase">{intl.formatMessage({ id: 'convert.option.showcase' })}</option>
                <option value="featured">{intl.formatMessage({ id: 'convert.option.featured' })}</option>
                <option value="guide">{intl.formatMessage({ id: 'convert.option.guide' })}</option>
              </select>
            </label>

            {presetPlan.preset === 'workshop' && (
              <>
                <label className="field-layout" title="Number of output slices for workshop preset.">
                  {intl.formatMessage({ id: 'convert.parts' })}
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={config.parts}
                    onChange={(event) =>
                      onUpdateWorkshopParts(Number.parseInt(event.target.value, 10) || 1)
                    }
                  />
                </label>
                <label className="field-layout" title="Width in pixels of each workshop slice.">
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
                <label
                  className="field-layout"
                  title="Split the Workshop layout vertically. 1 row is the fastest, lowest-RAM default; 2-3 rows create a taller showcase grid, but multiply GIF count, conversion time, and memory use."
                >
                  {intl.formatMessage({ id: 'convert.workshopRows' })}
                  <select
                    value={config.workshopRows}
                    onChange={(event) =>
                      onUpdateWorkshopRows(Number.parseInt(event.target.value, 10) as ConversionConfig['workshopRows'])
                    }
                  >
                    <option value={1}>{intl.formatMessage({ id: 'convert.option.rows1' })}</option>
                    <option value={2}>{intl.formatMessage({ id: 'convert.option.rows2' })}</option>
                    <option value={3}>{intl.formatMessage({ id: 'convert.option.rows3' })}</option>
                  </select>
                </label>
              </>
            )}

            {showWorkshopMemoryMemo && (
              <div className="advisory-memo memory high-memory-advisory">
                <strong>{intl.formatMessage({ id: 'convert.memoryMemo.title' })}</strong>
                <p>{intl.formatMessage({ id: 'convert.memoryMemo.body' })}</p>
              </div>
            )}

            {presetPlan.preset === 'featured' && (
              <label className="field-layout" title="Width in pixels of the featured output GIF.">
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

            {presetPlan.preset === 'guide' && (
              <label className="field-layout" title="Guide preset outputs a centered square GIF at 195x195.">
                {intl.formatMessage({ id: 'convert.guideSize' })}
                <input value={intl.formatMessage({ id: 'convert.fixed.guideSize' })} disabled />
              </label>
            )}

            {presetPlan.preset === 'showcase' && (
              <>
                <label className="field-layout-wide" title="Artwork showcase preset uses a fixed two-part split from a total width of 606 pixels.">
                  {intl.formatMessage({ id: 'convert.showcaseSplit' })}
                  <input value={intl.formatMessage({ id: 'convert.fixed.showcaseSplit' })} disabled />
                </label>
                <label className="field-layout-wide" title="Total target width used before splitting the showcase output.">
                  {intl.formatMessage({ id: 'convert.showcaseTotalWidth' })}
                  <input value={intl.formatMessage({ id: 'convert.fixed.showcaseWidth' })} disabled />
                </label>
              </>
            )}

            <label className="field-source" title="Choose a source video or image file (GIF/PNG/WEBP/JPG/BMP) to convert to GIF output.">
              {intl.formatMessage({ id: 'convert.sourceFile' })}
              <input
                type="file"
                accept="video/*,.gif,image/gif,.png,image/png,.webp,image/webp,.jpg,.jpeg,image/jpeg,.bmp,image/bmp"
                onChange={onSourceFileChange}
              />
            </label>

            {showLongMp4Memo && (
              <div className="advisory-memo source-advisory">
                <strong>{intl.formatMessage({ id: 'convert.longMp4Memo.title' })}</strong>
                <p>{intl.formatMessage({ id: 'convert.longMp4Memo.body' })}</p>
              </div>
            )}
          </div>
        </section>

        <section className="config-group">
          <h3>{intl.formatMessage({ id: 'convert.frameSize' })}</h3>
          <div className="form-grid form-grid-budget">
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

            <label className="field-fps" title="Starting frame rate for the first encode pass.">
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

            <label title="Choose how the optimizer balances speed, size, and quality.">
              {intl.formatMessage({ id: 'convert.optimizationMode' })}
              <select
                disabled={optimizationDisabled}
                value={config.optimizationMode}
                onChange={(event) =>
                  setConfig((prev) => ({
                    ...prev,
                    optimizationMode: event.target.value as OptimizationMode,
                  }))
                }
              >
                <option value="hybrid">{intl.formatMessage({ id: 'convert.optimizationMode.hybrid' })}</option>
                <option value="quality-first">{intl.formatMessage({ id: 'convert.optimizationMode.qualityFirst' })}</option>
                <option value="fast-fit">{intl.formatMessage({ id: 'convert.optimizationMode.fastFit' })}</option>
              </select>
            </label>

            {optimizationDisabled && (
              <p className="config-note budget-note">
                {intl.formatMessage({ id: 'convert.rawModeActive' })}
              </p>
            )}
          </div>
        </section>
      </div>

        <div className="actions">
          <button className="action-primary" disabled={convertDisabled} onClick={onRunConversion}>
            {intl.formatMessage({ id: 'convert.run' })}
          </button>
          <button disabled={!busy} onClick={onCancelConversion}>
            {intl.formatMessage({ id: 'convert.cancel' })}
          </button>
          <button disabled={!busy || finishingCurrent} onClick={onFinishCurrentConversion}>
            {intl.formatMessage({ id: finishingCurrent ? 'convert.finishingCurrent' : 'convert.finishCurrent' })}
          </button>
          <button onClick={onResetConvertState}>{intl.formatMessage({ id: 'convert.reset' })}</button>
        </div>

        <details className="advanced-options" data-testid="advanced-options">
          <summary data-testid="advanced-options-summary">
            <span className="advanced-options-heading">
              <strong>{intl.formatMessage({ id: 'convert.advancedOptions' })}</strong>
              <small>{intl.formatMessage({ id: 'convert.advancedOptions.description' })}</small>
            </span>
            <span className="advanced-options-status">
              {advancedOverrideCount === 0
                ? intl.formatMessage({ id: 'convert.advancedOptions.defaults' })
                : intl.formatMessage(
                    { id: 'convert.advancedOptions.custom' },
                    { count: advancedOverrideCount },
                  )}
            </span>
          </summary>

          <div className="config-groups advanced-options-groups">
        <section className="config-group">
          <h3>{intl.formatMessage({ id: 'convert.performance' })}</h3>
          <div className="form-grid form-grid-performance">
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

            <SwitchCard
              checked={precheckEffective}
              disabled={optimizationDisabled}
              label={intl.formatMessage({ id: 'convert.enablePrecheck' })}
              title="Estimate output size before encoding and stop early if likely too large."
              onChange={(checked) => setConfig((prev) => ({ ...prev, precheckEnabled: checked }))}
            />

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

            <label title="How many conversion jobs run in parallel (higher can be faster but less stable).">
              {intl.formatMessage({ id: 'convert.workerCount' })}
              <input
                type="number"
                min={1}
                max={MAX_SAFE_WASM_WORKERS}
                value={config.workerCount}
                onChange={(event) => {
                  const requestedWorkerCount = Number.parseInt(event.target.value, 10) || 1
                  const workerCount = Math.max(1, Math.min(MAX_SAFE_WASM_WORKERS, requestedWorkerCount))
                  setConfig((prev) => ({ ...prev, workerCount }))
                }}
              />
            </label>

            <div className="form-cluster retry-controls">
              <SwitchCard
                checked={standardRetriesEffective}
                disabled={optimizationDisabled}
                label={intl.formatMessage({ id: 'convert.standardRetries' })}
                title="Enable standard recompression retries after initial encode."
                onChange={(checked) => setConfig((prev) => ({ ...prev, standardRetriesEnabled: checked }))}
              />

              <SwitchCard
                checked={retryFpsEffective}
                disabled={retryControlsDisabled}
                label={intl.formatMessage({ id: 'convert.fpsReduction' })}
                title="Allow standard retries to reduce FPS from GIF FPS down to Min GIF FPS."
                onChange={(checked) => setConfig((prev) => ({ ...prev, retryAllowFpsDrop: checked }))}
              />

              <SwitchCard
                checked={retryQualityEffective}
                disabled={retryControlsDisabled}
                label={intl.formatMessage({ id: 'convert.qualityReduction' })}
                title="Allow standard retries to reduce gifski quality for smaller output."
                onChange={(checked) => setConfig((prev) => ({ ...prev, retryAllowQualityDrop: checked }))}
              />

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
            </div>

            <div
              className="lossy-group"
              title="Extra lossy profiles used only when output is still above max GIF size."
            >
              <SwitchCard
                className="lossy-group-toggle"
                checked={lossyEffective}
                disabled={optimizationDisabled}
                label={intl.formatMessage({ id: 'convert.lossyFallback' })}
                title="Enable extra lossy profiles when GIF is still above max size."
                onChange={(checked) => setConfig((prev) => ({ ...prev, lossyOversize: checked }))}
              />
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

            <SwitchCard
              checked={config.eofPatchEnabled}
              label={intl.formatMessage({ id: 'convert.patchOutputEof' })}
              title="Patch the last byte of each output file with the configured EOF byte."
              onChange={(checked) => setConfig((prev) => ({ ...prev, eofPatchEnabled: checked }))}
            />

            <SwitchCard
              checked={config.headerPatchEnabled}
              label={intl.formatMessage({ id: 'convert.patchHeader' })}
              title="Rewrite GIF header logical width/height metadata on outputs."
              onChange={(checked) => setConfig((prev) => ({ ...prev, headerPatchEnabled: checked }))}
            />

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

      </details>

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

      {showMemoryDebug && <MemoryDebugPanel memoryDebug={memoryDebug} busy={busy} />}

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
          <section className={resultsGridClassName} style={resultsGridStyle}>
            {artifactViews.map((item) => (
              <article
                className="result-card"
                key={item.artifact.name}
                style={isCompactStrip ? { width: `${item.artifact.width}px` } : undefined}
              >
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
                      { id: 'convert.qualityReductionMeta' },
                      { percent: getQualityReductionPercent(item.artifact.finalQuality) },
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
