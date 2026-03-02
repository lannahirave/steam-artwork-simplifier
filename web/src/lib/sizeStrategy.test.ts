import { describe, expect, it } from 'vitest'
import { buildLossyCandidates, buildStandardCandidates, estimateFpsForKbTarget } from './sizeStrategy'

describe('size strategy', () => {
  it('prefers fps-only reduction before color ladder', () => {
    const candidates = buildStandardCandidates(15, 13)
    expect(candidates[0]).toEqual({ fps: 14, colors: 256 })
    expect(candidates[1]).toEqual({ fps: 13, colors: 256 })
    expect(candidates.some((candidate) => candidate.fps === 15 && candidate.colors === 224)).toBe(true)
    expect(candidates.some((candidate) => candidate.fps === 13 && candidate.colors === 32)).toBe(true)
  })

  it('caps lossy candidates to max attempts', () => {
    const candidates = buildLossyCandidates(15, 10, 3, 7)
    expect(candidates.length).toBe(7)
  })

  it('uses mild profile for level 1', () => {
    const candidates = buildLossyCandidates(15, 15, 1, 20)
    expect(candidates.every((candidate) => candidate.statsMode === 'single')).toBe(true)
    expect(candidates.every((candidate) => candidate.prefilter === '')).toBe(true)
  })

  it('can disable fps reduction while keeping color reduction', () => {
    const candidates = buildStandardCandidates(15, 10, {
      allowFpsDrop: false,
      allowColorDrop: true,
    })
    expect(candidates.every((candidate) => candidate.fps === 15)).toBe(true)
    expect(candidates.some((candidate) => candidate.colors === 96)).toBe(true)
  })

  it('can disable color reduction while keeping fps reduction', () => {
    const candidates = buildStandardCandidates(15, 13, {
      allowFpsDrop: true,
      allowColorDrop: false,
    })
    expect(candidates.every((candidate) => candidate.colors === 256)).toBe(true)
    expect(candidates.some((candidate) => candidate.fps === 13)).toBe(true)
  })

  it('estimates fps needed to hit target size from current size', () => {
    const fps = estimateFpsForKbTarget(34, 7830.1, 5000, 10)
    expect(fps).toBe(21)
  })

  it('respects min fps while estimating fps target', () => {
    const fps = estimateFpsForKbTarget(12, 12000, 1000, 8)
    expect(fps).toBe(8)
  })
})
