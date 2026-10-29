import { useEffect, useId, useState, type CSSProperties } from 'react'
import { useIntl } from 'react-intl'
import { computeCutLayout } from '../lib/cutPreview'
import { SHADOW_BLACK_POINTS } from '../lib/shadowDarkening'
import type { SourceEdit } from '../lib/sourceEdit'
import type { ConversionConfig } from '../lib/types'
import { SourceEditor } from './SourceEditor'

interface CutPreviewProps {
  file: File
  config: ConversionConfig
  edit: SourceEdit | null
  onEditChange: (edit: SourceEdit | null) => void
  disabled?: boolean
}

interface SourceSize {
  width: number
  height: number
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mp4|m4v|mov|webm|mkv|avi|ogv)$/i.test(file.name)
}

function percent(value: number, total: number): string {
  return `${(value / total) * 100}%`
}

/**
 * Shows the picked source at the real output size with the cut lines of the current preset drawn
 * on top. Clicking it opens the crop/trim editor.
 */
export function CutPreview({ file, config, edit, onEditChange, disabled = false }: CutPreviewProps) {
  const intl = useIntl()
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [size, setSize] = useState<SourceSize | null>(null)
  const [failed, setFailed] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const isVideo = isVideoFile(file)
  const shadowFilterId = `cut-preview-shadows-${useId().replace(/:/g, '')}`
  const blackPoint = SHADOW_BLACK_POINTS[config.shadowDarkening] ?? 0

  useEffect(() => {
    const url = URL.createObjectURL(file)
    // The object URL is an external resource that must be revoked on cleanup, so it lives in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSourceUrl(url)
    setSize(null)
    setFailed(false)
    setEditorOpen(false)
    return () => URL.revokeObjectURL(url)
  }, [file])

  if (!sourceUrl) {
    return null
  }

  const crop = edit?.crop ?? null
  const trim = edit?.trim ?? null
  const editedWidth = crop?.width ?? size?.width ?? 0
  const editedHeight = crop?.height ?? size?.height ?? 0
  const layout = size ? computeCutLayout(config, editedWidth, editedHeight) : null
  const isGuide = config.preset === 'guide'
  const firstPiece = layout?.pieces[0]
  const canEdit = Boolean(size) && !failed && !disabled

  // The stage is the scaled (edited) frame at real pixel size, so each piece shows at the size
  // Steam displays the GIF.
  const stageStyle = layout
    ? ({ width: `${layout.frameWidth}px`, height: `${layout.frameHeight}px` } as CSSProperties)
    : undefined

  // Same math as ffmpeg's colorlevels black point: out = (in - b) / (1 - b), clipped.
  const shadowSlope = 1 / (1 - blackPoint)
  const shadowIntercept = -blackPoint / (1 - blackPoint)
  const shadowFilter =
    blackPoint > 0 ? (
      <svg className="cut-preview-filter-defs" aria-hidden="true" focusable="false">
        <filter id={shadowFilterId} colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR type="linear" slope={shadowSlope} intercept={shadowIntercept} />
            <feFuncG type="linear" slope={shadowSlope} intercept={shadowIntercept} />
            <feFuncB type="linear" slope={shadowSlope} intercept={shadowIntercept} />
          </feComponentTransfer>
        </filter>
      </svg>
    ) : null

  // With a crop, the full media is enlarged and shifted so only the cropped area fills the stage.
  const mediaStyle: CSSProperties = {
    ...(blackPoint > 0 ? { filter: `url(#${shadowFilterId})` } : {}),
    ...(crop && size
      ? {
          left: percent(-crop.x, crop.width),
          top: percent(-crop.y, crop.height),
          width: percent(size.width, crop.width),
          height: percent(size.height, crop.height),
        }
      : {}),
  }

  const media = isVideo ? (
    <video
      className="cut-preview-media"
      style={mediaStyle}
      src={sourceUrl}
      autoPlay
      muted
      loop={!trim}
      playsInline
      onLoadedMetadata={(event) => {
        setSize({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })
        if (trim) {
          event.currentTarget.currentTime = trim.startSec
        }
      }}
      onTimeUpdate={(event) => {
        const video = event.currentTarget
        // Loop inside the trim so the preview matches the converted part.
        if (trim && (video.currentTime >= trim.endSec || video.currentTime < trim.startSec - 0.05)) {
          video.currentTime = trim.startSec
        }
      }}
      onEnded={(event) => {
        if (trim) {
          event.currentTarget.currentTime = trim.startSec
          void event.currentTarget.play()
        }
      }}
      onError={() => setFailed(true)}
    />
  ) : (
    <img
      className="cut-preview-media"
      style={mediaStyle}
      src={sourceUrl}
      alt=""
      onLoad={(event) =>
        setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
      }
      onError={() => setFailed(true)}
    />
  )

  const editNotes: string[] = []
  if (crop) {
    editNotes.push(intl.formatMessage({ id: 'convert.cutPreview.editedCrop' }, { size: `${crop.width}×${crop.height}` }))
  }
  if (trim) {
    editNotes.push(
      intl.formatMessage(
        { id: 'convert.cutPreview.editedTrim' },
        { start: trim.startSec.toFixed(2), end: trim.endSec.toFixed(2) },
      ),
    )
  }

  return (
    <section className="cut-preview" aria-label={intl.formatMessage({ id: 'convert.cutPreview.title' })}>
      <div className="cut-preview-head">
        <strong>{intl.formatMessage({ id: 'convert.cutPreview.title' })}</strong>
        {layout && firstPiece && (
          <span>
            {isGuide
              ? intl.formatMessage(
                  { id: 'convert.cutPreview.summaryGuide' },
                  { size: `${firstPiece.width}×${firstPiece.height}` },
                )
              : intl.formatMessage(
                  { id: 'convert.cutPreview.summary' },
                  { count: layout.pieces.length, size: `${layout.frameWidth}×${layout.frameHeight}` },
                )}
          </span>
        )}
        <div className="cut-preview-actions">
          <button
            type="button"
            className="cut-preview-button"
            disabled={!canEdit}
            onClick={() => setEditorOpen(true)}
          >
            {intl.formatMessage({ id: 'convert.cutPreview.edit' })}
          </button>
          {edit && (
            <button
              type="button"
              className="cut-preview-button"
              disabled={disabled}
              onClick={() => onEditChange(null)}
            >
              {intl.formatMessage({ id: 'convert.cutPreview.clearEdit' })}
            </button>
          )}
        </div>
      </div>

      {editNotes.length > 0 && <p className="cut-preview-edited">{editNotes.join(' · ')}</p>}

      {failed ? (
        <p className="cut-preview-note">{intl.formatMessage({ id: 'convert.cutPreview.unavailable' })}</p>
      ) : (
        <div className="cut-preview-scroll">
          <div
            className={`cut-preview-stage${isGuide ? ' is-trimmed' : ''}${canEdit ? ' is-editable' : ''}`}
            style={stageStyle}
            role={canEdit ? 'button' : undefined}
            tabIndex={canEdit ? 0 : undefined}
            aria-label={canEdit ? intl.formatMessage({ id: 'convert.cutPreview.edit' }) : undefined}
            onClick={() => canEdit && setEditorOpen(true)}
            onKeyDown={(event) => {
              if (canEdit && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault()
                setEditorOpen(true)
              }
            }}
          >
            {shadowFilter}
            {media}
            {layout?.pieces.map((piece) => (
              <div
                key={piece.index}
                className="cut-preview-piece"
                style={{
                  left: percent(piece.x, layout.frameWidth),
                  top: percent(piece.y, layout.frameHeight),
                  width: percent(piece.width, layout.frameWidth),
                  height: percent(piece.height, layout.frameHeight),
                }}
              >
                <span className="cut-preview-label">
                  {layout.pieces.length > 1 && <b>{piece.index + 1}</b>}
                  {piece.width}×{piece.height}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {layout && <p className="cut-preview-note">{intl.formatMessage({ id: 'convert.cutPreview.realSizeHint' })}</p>}

      {layout && config.preset === 'workshop' && config.workshopRows > 1 && (
        <p className="cut-preview-note">{intl.formatMessage({ id: 'convert.cutPreview.rowsNote' })}</p>
      )}

      {editorOpen && size && (
        <SourceEditor
          sourceUrl={sourceUrl}
          isVideo={isVideo}
          srcWidth={size.width}
          srcHeight={size.height}
          config={config}
          edit={edit}
          onApply={(next) => {
            onEditChange(next)
            setEditorOpen(false)
          }}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </section>
  )
}
