import type { ChangeEvent, Dispatch, SetStateAction } from 'react'
import { getDefaultWorkerCount } from '../../lib/defaults'
import type { ConversionProgress } from '../../lib/conversion'
import type { ConversionConfig } from '../../lib/types'
import { parseHexByte } from '../../lib/validation'
import { type ArtifactView, formatElapsed } from '../../agents/appAgents'

interface ConvertPanelProps {
  config: ConversionConfig
  setConfig: Dispatch<SetStateAction<ConversionConfig>>
  sourceFile: File | null
  busy: boolean
  estimatingFps: boolean
  fpsEstimateInfo: string
  convertDisabled: boolean
  optimizationDisabled: boolean
  standardRetriesEffective: boolean
  retryControlsDisabled: boolean
  precheckEffective: boolean
  retryFpsEffective: boolean
  retryColorEffective: boolean
  lossyEffective: boolean
  progressPercent: number
  progressLabel: string
  elapsedMs: number
  lastElapsedMs: number | null
  warnings: string[]
  progress: ConversionProgress[]
  logs: string[]
  error: string
  artifactViews: ArtifactView[]
  isCompactStrip: boolean
  resultsGridClassName: string
  getColorReductionPercent: (finalColors: number) => number
  onUpdatePreset: (preset: ConversionConfig['preset']) => void
  onSourceFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onEstimateAndApplyFps: () => void
  onRunConversion: () => void
  onCancelConversion: () => void
  onDownloadZip: () => void
  onResetConvertState: () => void
  onDownloadBlob: (name: string, blob: Blob) => void
}

export function ConvertPanel(props: ConvertPanelProps) {
  const {
    config,
    setConfig,
    sourceFile,
    busy,
    estimatingFps,
    fpsEstimateInfo,
    convertDisabled,
    optimizationDisabled,
    standardRetriesEffective,
    retryControlsDisabled,
    precheckEffective,
    retryFpsEffective,
    retryColorEffective,
    lossyEffective,
    progressPercent,
    progressLabel,
    elapsedMs,
    lastElapsedMs,
    warnings,
    progress,
    logs,
    error,
    artifactViews,
    isCompactStrip,
    resultsGridClassName,
    getColorReductionPercent,
    onUpdatePreset,
    onSourceFileChange,
    onEstimateAndApplyFps,
    onRunConversion,
    onCancelConversion,
    onDownloadZip,
    onResetConvertState,
    onDownloadBlob,
  } = props

  return (
    <section className="panel">
      <h2>Media to GIF</h2>

      <div className="config-groups">
        <section className="config-group">
          <h3>Source and Layout</h3>
          <div className="form-grid">
            <label title="Select output mode: workshop splits into 5 equal slices, showcase splits into 506px + 100px, featured creates one wide GIF.">
              Preset
              <select value={config.preset} onChange={(event) => onUpdatePreset(event.target.value as ConversionConfig['preset'])}>
                <option value="workshop">Workshop (5x150 slices)</option>
                <option value="showcase">Artwork Showcase (506 + 100 split)</option>
                <option value="featured">Featured (single 630px)</option>
                <option value="guide">Guide (single 195x195)</option>
              </select>
            </label>

            <label title="Choose a source video or image file (GIF/PNG/WEBP/JPG/BMP) to convert to GIF output.">
              Source File
              <input
                type="file"
                accept="video/*,.gif,image/gif,.png,image/png,.webp,image/webp,.jpg,.jpeg,image/jpeg,.bmp,image/bmp"
                onChange={onSourceFileChange}
              />
            </label>

            {config.preset === 'workshop' && (
              <>
                <label title="Number of output slices for workshop preset.">
                  Parts
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
                  Part Width
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
                Featured Width
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
                Guide Size
                <input value="195x195 (fixed)" disabled />
              </label>
            )}

            {config.preset === 'showcase' && (
              <>
                <label title="Artwork showcase preset uses a fixed two-part split from a total width of 606 pixels.">
                  Showcase Split
                  <input value="506px + 100px (fixed)" disabled />
                </label>
                <label title="Total target width used before splitting the showcase output.">
                  Showcase Total Width
                  <input value="606px (fixed)" disabled />
                </label>
              </>
            )}
          </div>
        </section>

        <section className="config-group">
          <h3>Frame Rate and Size</h3>
          <div className="form-grid">
            <label title="Starting frame rate for the first encode pass.">
              GIF FPS
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
                  {estimatingFps ? 'Estimating...' : 'Estimate'}
                </button>
              </div>
              {fpsEstimateInfo && <small className="field-note">{fpsEstimateInfo}</small>}
            </label>

            <label title="Lowest FPS allowed during recompression attempts.">
              Min GIF FPS
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
              Max GIF KB
              <input
                type="number"
                min={1}
                disabled={optimizationDisabled}
                value={config.maxGifKb}
                onChange={(event) => setConfig((prev) => ({ ...prev, maxGifKb: Number.parseInt(event.target.value, 10) || 1 }))}
              />
            </label>

            <label title="Preferred output size target used by recompression attempts. Ignored when Disable Optimizations is enabled.">
              Target GIF KB
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
                Enable precheck
              </span>
            </label>
          </div>
        </section>

        <section className="config-group">
          <h3>Performance and Optimization</h3>
          <div className="form-grid">
            <label title="How many conversion jobs run in parallel (higher can be faster but less stable).">
              Worker Count
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
                {optimizationDisabled ? 'Enable Optimizations' : 'Disable Optimizations'}
              </button>
              <small className="field-note">
                {optimizationDisabled
                  ? 'Raw mode active: FPS/color retries and max-size limit are ignored.'
                  : 'Use raw mode when you want original encode behavior without optimization constraints.'}
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
              Enable standard retries
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
              Allow FPS reduction
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
              Allow color reduction
            </label>

            {optimizationDisabled && (
              <p className="config-note">
                Optimization controls are inactive because Disable Optimizations is on.
              </p>
            )}
            {!optimizationDisabled && !config.standardRetriesEnabled && (
              <p className="config-note">
                FPS/Color reduction toggles activate after enabling standard retries.
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
                Enable lossy oversize fallback
              </label>
              <small className="field-note lossy-group-note">
                {lossyEffective
                  ? 'Lossy mode can reduce palette and apply extra compression passes after standard optimization.'
                  : 'Lossy mode is off. Only standard optimization passes will run.'}
              </small>
              <div className="lossy-group-fields">
                <label title="Lossy fallback aggressiveness (1 mild, 2 balanced, 3 aggressive).">
                  Lossy Level
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
                  Lossy Attempts
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
          <h3>Output Patching</h3>
          <div className="form-grid">
            <label title="Hex byte value used for EOF patching (for example 21 = 0x21).">
              EOF Byte (hex)
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
              Patch EOF byte on outputs
            </label>

            <label className="toggle" title="Rewrite GIF header logical width/height metadata on outputs.">
              <input
                type="checkbox"
                checked={config.headerPatchEnabled}
                onChange={(event) => setConfig((prev) => ({ ...prev, headerPatchEnabled: event.target.checked }))}
              />
              Patch GIF header width/height
            </label>

            {config.headerPatchEnabled && (
              <>
                <label title="Width value written to GIF header bytes 6-7.">
                  Header Width
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
                  Header Height
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
          Run Conversion
        </button>
        <button disabled={!busy} onClick={onCancelConversion}>
          Cancel
        </button>
        <button onClick={onResetConvertState}>Reset Results</button>
      </div>

      {(busy || progressPercent > 0) && (
        <div className="progress-panel">
          <div className="progress-head">
            <span>{busy ? 'Converting GIFs...' : 'Last conversion'}</span>
            <strong>{Math.round(progressPercent)}%</strong>
          </div>
          <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPercent)}>
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          {progressLabel && <p className="progress-label">{progressLabel}</p>}
          {(busy || lastElapsedMs !== null) && (
            <p className="progress-time">
              Time: {busy ? formatElapsed(elapsedMs) : formatElapsed(lastElapsedMs ?? 0)}
            </p>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {warnings.length > 0 && (
        <div className="warn-box">
          <h3>Warnings</h3>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {progress.length > 0 && (
        <div className="log-box">
          <h3>Live Progress</h3>
          <pre>{progress.map((entry) => `[${entry.stage}] ${entry.message}`).join('\n')}</pre>
        </div>
      )}

      {logs.length > 0 && (
        <div className="log-box">
          <h3>Run Logs</h3>
          <pre>{logs.join('\n')}</pre>
        </div>
      )}

      {artifactViews.length > 0 && (
        <>
          {lastElapsedMs !== null && (
            <p className="result-timing">Output ready in {formatElapsed(lastElapsedMs)}.</p>
          )}
          <div className="results-actions-row">
            <button onClick={onDownloadZip}>
              Download all (ZIP archive)
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
                  <span>FPS: {item.artifact.finalFps}</span>
                  <span>Color reduction: {getColorReductionPercent(item.artifact.finalColors)}%</span>
                </div>
                <div className={isCompactStrip ? 'download-row compact' : 'download-row'}>
                  <span className="gif-size">{item.artifact.sizeKb.toFixed(1)}KB</span>
                  <button
                    className={isCompactStrip ? 'compact-download' : ''}
                    onClick={() => onDownloadBlob(item.artifact.name, item.artifact.blob)}
                  >
                    {isCompactStrip ? 'DL' : 'Download'}
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
