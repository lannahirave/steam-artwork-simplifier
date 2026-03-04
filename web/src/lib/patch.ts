import type { EofPatchRequest, HeaderPatchRequest, PatchResult } from './types'
import { ensureRange, formatByteHex } from './validation'

const GIF_SIGNATURES = ['GIF87a', 'GIF89a']

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

function buildBlob(bytes: Uint8Array, originalType: string): Blob {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const buffer: ArrayBuffer = copy.buffer
  return new Blob([buffer], { type: originalType || 'application/octet-stream' })
}

export function patchLastByteBytes(bytes: Uint8Array, byteValue: number): { changed: boolean; bytes: Uint8Array } {
  const target = ensureRange(byteValue, 0, 255, 'EOF byte')
  if (bytes.length === 0) {
    throw new Error('Cannot patch empty file.')
  }

  const out = bytes.slice()
  const changed = out[out.length - 1] !== target
  out[out.length - 1] = target
  return { changed, bytes: out }
}

export function readGifDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 10) {
    throw new Error('File is too small to be a valid GIF.')
  }
  const signature = new TextDecoder().decode(bytes.slice(0, 6))
  if (!GIF_SIGNATURES.includes(signature)) {
    throw new Error('Not a GIF87a/GIF89a file.')
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    width: view.getUint16(6, true),
    height: view.getUint16(8, true),
  }
}

export function patchGifHeaderBytes(
  bytes: Uint8Array,
  width: number,
  height: number,
  eofPatchEnabled: boolean,
  eofByte: number,
): { changed: boolean; bytes: Uint8Array; oldWidth: number; oldHeight: number } {
  const safeWidth = ensureRange(width, 1, 65535, 'Width')
  const safeHeight = ensureRange(height, 1, 65535, 'Height')
  const dims = readGifDimensions(bytes)

  const out = bytes.slice()
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength)

  let changed = false
  if (dims.width !== safeWidth) {
    view.setUint16(6, safeWidth, true)
    changed = true
  }
  if (dims.height !== safeHeight) {
    view.setUint16(8, safeHeight, true)
    changed = true
  }

  if (eofPatchEnabled) {
    const patched = patchLastByteBytes(out, eofByte)
    changed = changed || patched.changed
    return {
      changed,
      bytes: patched.bytes,
      oldWidth: dims.width,
      oldHeight: dims.height,
    }
  }

  return {
    changed,
    bytes: out,
    oldWidth: dims.width,
    oldHeight: dims.height,
  }
}

export async function applyEofPatch(request: EofPatchRequest): Promise<PatchResult[]> {
  const safeByte = ensureRange(request.byte, 0, 255, 'EOF byte')

  return Promise.all(
    request.files.map(async (file) => {
      const bytes = await blobToBytes(file)
      const patched = patchLastByteBytes(bytes, safeByte)
      const oldByte = bytes.length > 0 ? bytes[bytes.length - 1] : 0
      return {
        fileName: file.name,
        changed: patched.changed,
        message: patched.changed
          ? `${file.name}: ${formatByteHex(oldByte)} -> ${formatByteHex(safeByte)}`
          : `${file.name}: unchanged`,
        blob: buildBlob(patched.bytes, file.type),
      }
    }),
  )
}

export async function applyHeaderPatch(request: HeaderPatchRequest): Promise<PatchResult[]> {
  return Promise.all(
    request.files.map(async (file) => {
      const bytes = await blobToBytes(file)
      const patched = patchGifHeaderBytes(
        bytes,
        request.width,
        request.height,
        request.eofPatchEnabled,
        request.eofByte,
      )

      return {
        fileName: file.name,
        changed: patched.changed,
        message: patched.changed
          ? `${file.name}: ${patched.oldWidth}x${patched.oldHeight} -> ${request.width}x${request.height}`
          : `${file.name}: unchanged`,
        blob: buildBlob(patched.bytes, file.type),
      }
    }),
  )
}
