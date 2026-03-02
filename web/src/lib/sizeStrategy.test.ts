import { describe, expect, it } from 'vitest'
import { buildLossyCandidates, buildStandardCandidates } from './sizeStrategy'

describe('size strategy', () => {
  it('builds standard candidates with descending fps and color ladder', () => {
    const candidates = buildStandardCandidates(15, 13)
    expect(candidates[0]).toEqual({ fps: 15, colors: 224 })
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
})
