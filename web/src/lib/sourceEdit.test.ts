import { describe, expect, it } from 'vitest'
import {
  applySourceEditToProbe,
  buildSourceEditFilter,
  centeredCropForAspect,
  dragCrop,
  normalizeCrop,
  normalizeTrim,
} from './sourceEdit'

const PROBE = { width: 1920, height: 1080, duration: 10, fps: 30, startOffsetSec: 0.5 }
const NONE = { left: false, right: false, top: false, bottom: false }

describe('normalizeCrop', () => {
  it('rounds and clamps the crop inside the frame', () => {
    expect(normalizeCrop({ x: -10, y: 900.4, width: 400.6, height: 400 }, 1920, 1080)).toEqual({
      x: 0,
      y: 680,
      width: 401,
      height: 400,
    })
  })

  it('returns null for a full-frame crop', () => {
    expect(normalizeCrop({ x: 0, y: 0, width: 1920, height: 1080 }, 1920, 1080)).toBeNull()
  })
})

describe('normalizeTrim', () => {
  it('keeps the trim inside the duration', () => {
    expect(normalizeTrim({ startSec: 2, endSec: 12 }, 10)).toEqual({ startSec: 2, endSec: 10 })
  })

  it('returns null when the trim covers the whole video', () => {
    expect(normalizeTrim({ startSec: 0, endSec: 10 }, 10)).toBeNull()
  })
})

describe('buildSourceEditFilter', () => {
  it('cuts the trimmed length, then crops', () => {
    const edit = { crop: { x: 10, y: 20, width: 300, height: 200 }, trim: { startSec: 1.5, endSec: 4 } }
    expect(buildSourceEditFilter(edit, false)).toBe('trim=duration=2.500,crop=300:200:10:20')
  })

  it('ignores the trim for still images', () => {
    const edit = { crop: { x: 0, y: 0, width: 300, height: 200 }, trim: { startSec: 1, endSec: 2 } }
    expect(buildSourceEditFilter(edit, true)).toBe('crop=300:200:0:0')
  })

  it('returns undefined without edits', () => {
    expect(buildSourceEditFilter({ crop: null, trim: null }, false)).toBeUndefined()
  })
})

describe('applySourceEditToProbe', () => {
  it('uses the cropped size, trimmed length and trim start', () => {
    const edit = { crop: { x: 0, y: 0, width: 800, height: 600 }, trim: { startSec: 2, endSec: 5 } }
    expect(applySourceEditToProbe(PROBE, edit, false)).toEqual({
      ...PROBE,
      width: 800,
      height: 600,
      duration: 3,
      startOffsetSec: 2,
    })
  })

  it('keeps the dark intro skip when only cropping', () => {
    const edit = { crop: { x: 0, y: 0, width: 800, height: 600 }, trim: null }
    expect(applySourceEditToProbe(PROBE, edit, false).startOffsetSec).toBe(0.5)
  })
})

describe('centeredCropForAspect', () => {
  it('fits a square in a landscape frame', () => {
    expect(centeredCropForAspect(1, 1920, 1080)).toEqual({ x: 420, y: 0, width: 1080, height: 1080 })
  })
})

describe('dragCrop', () => {
  const start = { x: 100, y: 100, width: 400, height: 300 }

  it('moves the box and keeps it inside the frame', () => {
    expect(dragCrop(start, NONE, 5000, -50, 1920, 1080, null)).toEqual({ x: 1520, y: 50, width: 400, height: 300 })
  })

  it('resizes from the left edge with the right edge fixed', () => {
    expect(dragCrop(start, { ...NONE, left: true }, -150, 0, 1920, 1080, null)).toEqual({
      x: 0,
      y: 100,
      width: 500,
      height: 300,
    })
  })

  it('keeps the aspect ratio on corner drags', () => {
    const result = dragCrop(start, { ...NONE, right: true, bottom: true }, 200, 0, 1920, 1080, 1)
    expect(result).toEqual({ x: 100, y: 100, width: 600, height: 600 })
  })

  it('limits an aspect-locked drag to the frame', () => {
    const result = dragCrop(start, { ...NONE, right: true, bottom: true }, 5000, 0, 1920, 1080, 1)
    expect(result).toEqual({ x: 100, y: 100, width: 980, height: 980 })
  })
})
