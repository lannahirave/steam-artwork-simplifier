export const WORKSHOP_ROW_LIGHT_RATIO = 0.5
export const WORKSHOP_ROW_GROWTH_RATIO = 0.2
export const WORKSHOP_ROW_BALANCE_PASSES = 2

export interface WorkshopRowBalanceResult {
  rowHeights: number[]
  changed: boolean
  lightRows: number[]
  largestRow: number
}

export function distributeEvenly(total: number, count: number): number[] {
  const safeCount = Math.max(1, Math.floor(count))
  const safeTotal = Math.max(safeCount, Math.floor(total))
  const base = Math.floor(safeTotal / safeCount)
  const remainder = safeTotal % safeCount
  return Array.from({ length: safeCount }, (_, index) => base + (index < remainder ? 1 : 0))
}

export function aggregateWorkshopRowSizes(
  items: Array<{ sizeKb: number }>,
  columns: number,
  rows: number,
): number[] {
  const safeColumns = Math.max(1, Math.floor(columns))
  const safeRows = Math.max(1, Math.floor(rows))
  const rowSizes = Array.from({ length: safeRows }, () => 0)
  items.forEach((item, index) => {
    const rowIndex = Math.min(safeRows - 1, Math.floor(index / safeColumns))
    rowSizes[rowIndex] += item.sizeKb
  })
  return rowSizes
}

export function balanceWorkshopRowHeights(
  rowHeights: number[],
  rowSizesKb: number[],
): WorkshopRowBalanceResult {
  const current = rowHeights.map((height) => Math.max(1, Math.floor(height)))
  if (current.length <= 1 || current.length !== rowSizesKb.length) {
    return {
      rowHeights: current,
      changed: false,
      lightRows: [],
      largestRow: 0,
    }
  }

  const largestRow = rowSizesKb.reduce((largest, size, index) =>
    size > rowSizesKb[largest] ? index : largest,
  0)
  const largestSize = rowSizesKb[largestRow]
  const lightRows = rowSizesKb
    .map((size, index) => ({ size, index }))
    .filter((row) => row.index !== largestRow && row.size < largestSize * WORKSHOP_ROW_LIGHT_RATIO)
    .map((row) => row.index)

  if (lightRows.length === 0) {
    return {
      rowHeights: current,
      changed: false,
      lightRows,
      largestRow,
    }
  }

  const donorRows = current
    .map((height, index) => ({ height, index }))
    .filter((row) => !lightRows.includes(row.index) && row.height > 1)
    .map((row) => row.index)
  const donorCapacity = donorRows.reduce((sum, index) => sum + current[index] - 1, 0)
  if (donorCapacity <= 0) {
    return {
      rowHeights: current,
      changed: false,
      lightRows,
      largestRow,
    }
  }

  const requestedPerLightRow = Math.max(1, Math.round(current[largestRow] * WORKSHOP_ROW_GROWTH_RATIO))
  const requestedTotal = requestedPerLightRow * lightRows.length
  const totalToMove = Math.min(requestedTotal, donorCapacity)
  const next = [...current]

  for (let moved = 0; moved < totalToMove; moved += 1) {
    next[lightRows[moved % lightRows.length]] += 1
  }

  for (let moved = 0; moved < totalToMove; moved += 1) {
    const donor = donorRows
      .filter((index) => next[index] > 1)
      .sort((left, right) => next[right] - next[left])[0]
    if (donor === undefined) {
      break
    }
    next[donor] -= 1
  }

  return {
    rowHeights: next,
    changed: next.some((height, index) => height !== current[index]),
    lightRows,
    largestRow,
  }
}
