// Still image sources keep their own format: they are only scaled and cropped to the
// preset dimensions, never turned into a GIF. Static GIFs stay on the GIF pipeline.

export type StillImageFormat = 'gif' | 'png' | 'jpg' | 'webp'

const FORMAT_BY_MIME: Record<string, StillImageFormat> = {
  'image/gif': 'gif',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  // Steam does not accept BMP, so BMP becomes a lossless PNG.
  'image/bmp': 'png',
}

const FORMAT_BY_EXTENSION: Record<string, StillImageFormat> = {
  gif: 'gif',
  png: 'png',
  jpg: 'jpg',
  jpeg: 'jpg',
  webp: 'webp',
  bmp: 'png',
}

const MIME_BY_EXTENSION: Record<StillImageFormat, string> = {
  gif: 'image/gif',
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
}

/** The output format for a still image source. Unknown sources fall back to PNG. */
export function resolveStillImageFormat(file: Pick<File, 'name' | 'type'>): StillImageFormat {
  const byMime = FORMAT_BY_MIME[file.type.trim().toLowerCase()]
  if (byMime) {
    return byMime
  }
  const lowerName = file.name.trim().toLowerCase()
  const dot = lowerName.lastIndexOf('.')
  const ext = dot >= 0 ? lowerName.slice(dot + 1) : ''
  return FORMAT_BY_EXTENSION[ext] ?? 'png'
}

/** MIME type for an output file name produced by the converter. */
export function outputMimeType(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase() as StillImageFormat
  return MIME_BY_EXTENSION[ext] ?? 'image/gif'
}
