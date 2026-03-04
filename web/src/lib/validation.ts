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

const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'mov',
  'avi',
  'mkv',
  'webm',
  'm4v',
  'mpeg',
  'mpg',
  'wmv',
  'ogv',
  'flv',
])

const IMAGE_EXTENSIONS = new Set([
  'gif',
  'png',
  'webp',
  'jpg',
  'jpeg',
  'bmp',
])

const IMAGE_MIME_TYPES = new Set([
  'image/gif',
  'image/png',
  'image/webp',
  'image/jpeg',
  'image/jpg',
  'image/bmp',
])

export function isLikelyImageSource(file: File): boolean {
  const mime = file.type.trim().toLowerCase()
  if (IMAGE_MIME_TYPES.has(mime)) {
    return true
  }

  const lowerName = file.name.trim().toLowerCase()
  const dot = lowerName.lastIndexOf('.')
  if (dot < 0 || dot === lowerName.length - 1) {
    return false
  }

  const ext = lowerName.slice(dot + 1)
  return IMAGE_EXTENSIONS.has(ext)
}

export function isSupportedConversionSource(file: File): boolean {
  const mime = file.type.trim().toLowerCase()
  if (mime.startsWith('video/') || IMAGE_MIME_TYPES.has(mime)) {
    return true
  }

  const lowerName = file.name.trim().toLowerCase()
  const dot = lowerName.lastIndexOf('.')
  if (dot < 0 || dot === lowerName.length - 1) {
    return false
  }

  const ext = lowerName.slice(dot + 1)
  return VIDEO_EXTENSIONS.has(ext) || IMAGE_EXTENSIONS.has(ext)
}
