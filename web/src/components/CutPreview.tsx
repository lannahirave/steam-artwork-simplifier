import { useEffect, useId, useState, type CSSProperties } from 'react'
import { useIntl } from 'react-intl'
import { computeCutLayout } from '../lib/cutPreview'
import { SHADOW_BLACK_POINTS } from '../lib/shadowDarkening'
import type { ConversionConfig } from '../lib/types'

interface CutPreviewProps {
  file: File
  config: ConversionConfig
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

/** Shows the picked source with the cut lines of the current preset drawn on top. */
export function CutPreview({ file, config }: CutPreviewProps) {
  const intl = useIntl()
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [size, setSize] = useState<SourceSize | null>(null)
  const [failed, setFailed] = useState(false)
  const isVideo = isVideoFile(file)
  const shadowFilterId = `cut-preview-shadows-${useId().replace(/:/g, '')}`
  const blackPoint = SHADOW_BLACK_POINTS[config.shadowDarkening] ?? 0

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSourceUrl(url)
    setSize(null)
    setFailed(false)
    return () => URL.revokeObjectURL(url)
  }, [file])

  if (!sourceUrl) {
    return null
  }

  const layout = size ? computeCutLayout(config, size.width, size.height) : null
  const isGuide = config.preset === 'guide'
  const firstPiece = layout?.pieces[0]

  const stageStyle = layout
    ? ({ '--cut-preview-ratio': layout.frameWidth / layout.frameHeight } as CSSProperties)
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
  const mediaStyle: CSSProperties | undefined =
    blackPoint > 0 ? { filter: `url(#${shadowFilterId})` } : undefined

  const media = isVideo ? (
    <video
      className="cut-preview-media"
      style={mediaStyle}
      src={sourceUrl}
      autoPlay
      muted
      loop
      playsInline
      onLoadedMetadata={(event) =>
        setSize({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })
      }
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
      </div>

      {failed ? (
        <p className="cut-preview-note">{intl.formatMessage({ id: 'convert.cutPreview.unavailable' })}</p>
      ) : (
        <div className={`cut-preview-stage${isGuide ? ' is-trimmed' : ''}`} style={stageStyle}>
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
      )}

      {layout && config.preset === 'workshop' && config.workshopRows > 1 && (
        <p className="cut-preview-note">{intl.formatMessage({ id: 'convert.cutPreview.rowsNote' })}</p>
      )}
    </section>
  )
}
