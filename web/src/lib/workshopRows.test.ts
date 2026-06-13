import { describe, expect, it } from 'vitest'
import {
  aggregateWorkshopRowSizes,
  balanceWorkshopRowHeights,
  distributeEvenly,
} from './workshopRows'

describe('workshop row helpers', () => {
  it('distributes target height while preserving the total', () => {
    expect(distributeEvenly(422, 3)).toEqual([141, 141, 140])
    expect(distributeEvenly(2, 3)).toEqual([1, 1, 1])
  })

  it('aggregates cell sizes by row', () => {
    expect(
      aggregateWorkshopRowSizes(
        [
          { sizeKb: 10 },
          { sizeKb: 20 },
          { sizeKb: 30 },
          { sizeKb: 40 },
          { sizeKb: 50 },
          { sizeKb: 60 },
        ],
        3,
        2,
      ),
    ).toEqual([60, 150])
  })

  it('gives light rows more height while preserving total height', () => {
    const result = balanceWorkshopRowHeights([140, 140, 140], [1000, 2400, 900])

    expect(result.changed).toBe(true)
    expect(result.largestRow).toBe(1)
    expect(result.lightRows).toEqual([0, 2])
    expect(result.rowHeights.reduce((sum, height) => sum + height, 0)).toBe(420)
    expect(result.rowHeights[0]).toBeGreaterThan(140)
    expect(result.rowHeights[2]).toBeGreaterThan(140)
  })

  it('does not change rows that are within the light threshold', () => {
    const result = balanceWorkshopRowHeights([140, 140, 140], [1300, 2000, 1200])

    expect(result.changed).toBe(false)
    expect(result.rowHeights).toEqual([140, 140, 140])
  })
})
