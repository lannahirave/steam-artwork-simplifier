export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function parseHexByte(input: string): number {
  const raw = input.trim().toLowerCase().replace(/^0x/, '')
  if (!/^[0-9a-f]{1,2}$/i.test(raw)) {
    throw new Error('Hex byte must be 1-2 hex chars (00..FF).')
  }
  return Number.parseInt(raw, 16)
}

export function ensureRange(value: number, min: number, max: number, label: string): number {
  if (Number.isNaN(value) || value < min || value > max) {
    throw new Error(`${label} must be in range ${min}..${max}.`)
  }
  return value
}

export function formatByteHex(byteValue: number): string {
  return byteValue.toString(16).toUpperCase().padStart(2, '0')
}
