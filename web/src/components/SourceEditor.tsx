import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useIntl } from 'react-intl'
import { computeCutLayout } from '../lib/cutPreview'
import {
  MIN_TRIM_SEC,
  centeredCropForAspect,
  dragCrop,
  normalizeCrop,
  normalizeTrim,
  type CropDragEdges,
  type CropRect,
  type SourceEdit,
} from '../lib/sourceEdit'
import type { ConversionConfig } from '../lib/types'

interface SourceEditorProps {
  sourceUrl: string
  isVideo: boolean
  srcWidth: number
  srcHeight: number
  config: ConversionConfig
  edit: SourceEdit | null
  onApply: (edit: SourceEdit | null) => void
  onClose: () => void
}

type AspectOption = 'free' | '1:1' | '4:3' | '16:9' | '9:16'

const ASPECT_RATIOS: Record<Exclude<AspectOption, 'free'>, number> = {
  '1:1': 1,
  '4:3': 4 / 3,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
}

const HANDLES: { name: string; edges: CropDragEdges; corner: boolean }[] = [
  { name: 'nw', edges: { left: true, right: false, top: true, bottom: false }, corner: true },
  { name: 'n', edges: { left: false, right: false, top: true, bottom: false }, corner: false },
  { name: 'ne', edges: { left: false, right: true, top: true, bottom: false }, corner: true },
  { name: 'e', edges: { left: false, right: true, top: false, bottom: false }, corner: false },
  { name: 'se', edges: { left: false, right: true, top: false, bottom: true }, corner: true },
  { name: 's', edges: { left: false, right: false, top: false, bottom: true }, corner: false },
  { name: 'sw', edges: { left: true, right: false, top: false, bottom: true }, corner: true },
  { name: 'w', edges: { left: true, right: false, top: false, bottom: false }, corner: false },
]

const MOVE_EDGES: CropDragEdges = { left: false, right: false, top: false, bottom: false }

interface DragState {
  pointerId: number
  clientX: number
  clientY: number
  crop: CropRect
  edges: CropDragEdges
}

function percent(value: number, total: number): string {
  return `${(value / total) * 100}%`
}

function formatSeconds(value: number): string {
  return value.toFixed(2)
}

/** Modal crop/trim editor for the picked source. Edits are applied by the conversion, not here. */
export function SourceEditor({
  sourceUrl,
  isVideo,
  srcWidth,
  srcHeight,
  config,
  edit,
  onApply,
  onClose,
}: SourceEditorProps) {
  const intl = useIntl()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const fullFrame: CropRect = { x: 0, y: 0, width: srcWidth, height: srcHeight }
  const [crop, setCrop] = useState<CropRect>(edit?.crop ?? fullFrame)
  const [aspect, setAspect] = useState<AspectOption>('free')
  const [duration, setDuration] = useState(0)
  const [trimStart, setTrimStart] = useState(edit?.trim?.startSec ?? 0)
  const [trimEnd, setTrimEnd] = useState<number | null>(edit?.trim?.endSec ?? null)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(true)
  const effectiveTrimEnd = trimEnd ?? duration
  const aspectRatio = aspect === 'free' ? null : ASPECT_RATIOS[aspect]

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open && typeof dialog.showModal === 'function') {
      dialog.showModal()
    }
  }, [])

  const layout = computeCutLayout(config, crop.width, crop.height)
  const firstPiece = layout?.pieces[0]

  function startDrag(event: ReactPointerEvent<HTMLElement>, edges: CropDragEdges): void {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      crop,
      edges,
    }
  }

  function moveDrag(event: ReactPointerEvent<HTMLElement>): void {
    const drag = dragRef.current
    const canvas = canvasRef.current
    if (!drag || drag.pointerId !== event.pointerId || !canvas) {
      return
    }
    const rect = canvas.getBoundingClientRect()
    const dx = ((event.clientX - drag.clientX) * srcWidth) / rect.width
    const dy = ((event.clientY - drag.clientY) * srcHeight) / rect.height
    setCrop(dragCrop(drag.crop, drag.edges, dx, dy, srcWidth, srcHeight, aspectRatio))
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>): void {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
    }
  }

  function changeAspect(next: AspectOption): void {
    setAspect(next)
    if (next !== 'free') {
      setCrop(centeredCropForAspect(ASPECT_RATIOS[next], srcWidth, srcHeight))
    }
  }

  function changeCropField(field: keyof CropRect, value: number): void {
    if (!Number.isFinite(value)) {
      return
    }
    const next = { ...crop, [field]: value }
    setCrop(normalizeCrop(next, srcWidth, srcHeight) ?? fullFrame)
  }

  function seek(time: number): void {
    const video = videoRef.current
    if (video) {
      video.currentTime = time
    }
    setCurrentTime(time)
  }

  function changeTrimStart(value: number): void {
    const next = Math.min(Math.max(0, value), effectiveTrimEnd - MIN_TRIM_SEC)
    setTrimStart(next)
    seek(next)
  }

  function changeTrimEnd(value: number): void {
    const next = Math.max(Math.min(duration, value), trimStart + MIN_TRIM_SEC)
    setTrimEnd(next)
    seek(Math.max(trimStart, next - 0.5))
  }

  function togglePlay(): void {
    const video = videoRef.current
    if (!video) {
      return
    }
    if (video.paused) {
      void video.play()
      setPlaying(true)
    } else {
      video.pause()
      setPlaying(false)
    }
  }

  function reset(): void {
    setCrop(fullFrame)
    setAspect('free')
    setTrimStart(0)
    setTrimEnd(null)
    seek(0)
  }

  function apply(): void {
    const nextCrop = normalizeCrop(crop, srcWidth, srcHeight)
    const nextTrim = isVideo ? normalizeTrim({ startSec: trimStart, endSec: effectiveTrimEnd }, duration) : null
    onApply(nextCrop || nextTrim ? { crop: nextCrop, trim: nextTrim } : null)
  }

  const canvasStyle = { '--source-editor-ratio': srcWidth / srcHeight } as CSSProperties
  const cropStyle: CSSProperties = {
    left: percent(crop.x, srcWidth),
    top: percent(crop.y, srcHeight),
    width: percent(crop.width, srcWidth),
    height: percent(crop.height, srcHeight),
  }

  return (
    <dialog
      ref={dialogRef}
      className="source-editor"
      aria-label={intl.formatMessage({ id: 'convert.editor.title' })}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="source-editor-head">
        <div>
          <h2>{intl.formatMessage({ id: 'convert.editor.title' })}</h2>
          <p>{intl.formatMessage({ id: isVideo ? 'convert.editor.bodyVideo' : 'convert.editor.bodyImage' })}</p>
        </div>
        <button
          type="button"
          className="source-editor-close"
          aria-label={intl.formatMessage({ id: 'convert.editor.cancel' })}
          title={intl.formatMessage({ id: 'convert.editor.cancel' })}
          onClick={onClose}
        >
          &times;
        </button>
      </div>

      <div className="source-editor-canvas" ref={canvasRef} style={canvasStyle}>
        {isVideo ? (
          <video
            ref={videoRef}
            className="source-editor-media"
            src={sourceUrl}
            autoPlay
            muted
            playsInline
            onLoadedMetadata={(event) => {
              const video = event.currentTarget
              setDuration(Number.isFinite(video.duration) ? video.duration : 0)
              video.currentTime = trimStart
            }}
            onTimeUpdate={(event) => {
              const video = event.currentTarget
              // Loop inside the trim so the preview shows exactly what gets converted.
              if (video.currentTime >= effectiveTrimEnd || video.currentTime < trimStart - 0.05) {
                video.currentTime = trimStart
              }
              setCurrentTime(video.currentTime)
            }}
            onEnded={(event) => {
              event.currentTarget.currentTime = trimStart
              void event.currentTarget.play()
            }}
          />
        ) : (
          <img className="source-editor-media" src={sourceUrl} alt="" draggable={false} />
        )}
        <div
          className="source-editor-crop"
          style={cropStyle}
          onPointerDown={(event) => startDrag(event, MOVE_EDGES)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {HANDLES.filter((handle) => handle.corner || aspectRatio === null).map((handle) => (
            <span
              key={handle.name}
              className={`source-editor-handle is-${handle.name}`}
              onPointerDown={(event) => startDrag(event, handle.edges)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            />
          ))}
        </div>
      </div>

      <div className="source-editor-controls">
        <fieldset className="source-editor-group">
          <legend>{intl.formatMessage({ id: 'convert.editor.crop' })}</legend>
          <label>
            {intl.formatMessage({ id: 'convert.editor.aspect' })}
            <select value={aspect} onChange={(event) => changeAspect(event.target.value as AspectOption)}>
              <option value="free">{intl.formatMessage({ id: 'convert.editor.aspectFree' })}</option>
              {Object.keys(ASPECT_RATIOS).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          {(['x', 'y', 'width', 'height'] as const).map((field) => (
            <label key={field}>
              {intl.formatMessage({ id: `convert.editor.${field}` })}
              <input
                type="number"
                min={0}
                max={field === 'x' || field === 'width' ? srcWidth : srcHeight}
                value={crop[field]}
                onChange={(event) => changeCropField(field, Number.parseInt(event.target.value, 10))}
              />
            </label>
          ))}
        </fieldset>

        {isVideo && duration > 0 && (
          <fieldset className="source-editor-group source-editor-trim">
            <legend>{intl.formatMessage({ id: 'convert.editor.trim' })}</legend>
            <div className="source-editor-playback">
              <button type="button" className="source-editor-secondary" onClick={togglePlay}>
                {intl.formatMessage({ id: playing ? 'convert.editor.pause' : 'convert.editor.play' })}
              </button>
              <input
                type="range"
                aria-label={intl.formatMessage({ id: 'convert.editor.position' })}
                min={0}
                max={duration}
                step={0.01}
                value={currentTime}
                onChange={(event) => seek(Number.parseFloat(event.target.value))}
              />
              <span>{formatSeconds(currentTime)}s</span>
            </div>
            <label>
              {intl.formatMessage({ id: 'convert.editor.trimStart' })}
              <input
                type="number"
                min={0}
                max={duration}
                step={0.01}
                value={formatSeconds(trimStart)}
                onChange={(event) => changeTrimStart(Number.parseFloat(event.target.value) || 0)}
              />
            </label>
            <label>
              {intl.formatMessage({ id: 'convert.editor.trimEnd' })}
              <input
                type="number"
                min={0}
                max={duration}
                step={0.01}
                value={formatSeconds(effectiveTrimEnd)}
                onChange={(event) => changeTrimEnd(Number.parseFloat(event.target.value) || duration)}
              />
            </label>
            <div className="source-editor-playback">
              <button type="button" className="source-editor-secondary" onClick={() => changeTrimStart(currentTime)}>
                {intl.formatMessage({ id: 'convert.editor.setStart' })}
              </button>
              <button type="button" className="source-editor-secondary" onClick={() => changeTrimEnd(currentTime)}>
                {intl.formatMessage({ id: 'convert.editor.setEnd' })}
              </button>
            </div>
          </fieldset>
        )}
      </div>

      <div className="source-editor-foot">
        <span className="source-editor-summary">
          {layout && firstPiece
            ? config.preset === 'guide'
              ? intl.formatMessage(
                  { id: 'convert.cutPreview.summaryGuide' },
                  { size: `${firstPiece.width}×${firstPiece.height}` },
                )
              : intl.formatMessage(
                  { id: 'convert.cutPreview.summary' },
                  { count: layout.pieces.length, size: `${layout.frameWidth}×${layout.frameHeight}` },
                )
            : null}
        </span>
        <div className="source-editor-actions">
          <button type="button" className="source-editor-secondary" onClick={reset}>
            {intl.formatMessage({ id: 'convert.editor.reset' })}
          </button>
          <button type="button" className="source-editor-secondary" onClick={onClose}>
            {intl.formatMessage({ id: 'convert.editor.cancel' })}
          </button>
          <button type="button" className="source-editor-primary" onClick={apply}>
            {intl.formatMessage({ id: 'convert.editor.apply' })}
          </button>
        </div>
      </div>
    </dialog>
  )
}
