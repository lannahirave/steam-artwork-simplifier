import type { FFmpeg } from '@ffmpeg/ffmpeg'

export function tailLogOutput(logs: string[], lineCount = 24): string {
  const trimmed = logs
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const tail = trimmed.slice(-lineCount)
  return tail.length > 0 ? tail.join('\n') : '(no ffmpeg output was captured)'
}

export function parsePngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) {
    return null
  }
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (let i = 0; i < sig.length; i += 1) {
    if (bytes[i] !== sig[i]) {
      return null
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16, false)
  const height = view.getUint32(20, false)
  if (width <= 0 || height <= 0) {
    return null
  }
  return { width, height }
}

export function extensionOf(fileName: string): string {
  const parts = fileName.split('.')
  if (parts.length < 2) {
    return 'mp4'
  }
  return parts.pop() ?? 'mp4'
}

export function sourceBaseName(fileName: string): string {
  const trimmed = fileName.trim()
  if (!trimmed) {
    return 'output'
  }
  const dotIndex = trimmed.lastIndexOf('.')
  if (dotIndex <= 0) {
    return trimmed
  }
  return trimmed.slice(0, dotIndex)
}

export async function safeDelete(ffmpeg: FFmpeg, path: string): Promise<void> {
  try {
    await ffmpeg.deleteFile(path)
  } catch {
    // ignore cleanup failures
  }
}
