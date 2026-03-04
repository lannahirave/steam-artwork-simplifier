/* eslint-disable react-refresh/only-export-components */
import { createContext, use, useState, type ChangeEvent, type ReactNode } from 'react'
import { applyEofPatch, applyHeaderPatch } from '../lib/patch'
import type { PatchResult } from '../lib/types'
import { createZip } from '../lib/zip'
import { parseHexByte } from '../lib/validation'
import { downloadBlob, toFiles, type OutputItem } from '../agents/appAgents'

interface PatchToolsState {
  eofFiles: File[]
  eofByteInput: string
  eofOutputs: OutputItem[]
  eofError: string
  headerFiles: File[]
  headerWidth: string
  headerHeight: string
  headerEofEnabled: boolean
  headerByteInput: string
  headerOutputs: OutputItem[]
  headerError: string
}

interface PatchToolsActions {
  onEofFilesChange: (event: ChangeEvent<HTMLInputElement>) => void
  onEofByteInputChange: (value: string) => void
  onRunEofPatch: () => void
  onHeaderFilesChange: (event: ChangeEvent<HTMLInputElement>) => void
  onHeaderWidthChange: (value: string) => void
  onHeaderHeightChange: (value: string) => void
  onHeaderEofEnabledChange: (enabled: boolean) => void
  onHeaderByteInputChange: (value: string) => void
  onRunHeaderPatch: () => void
  onDownloadEofZip: () => void
  onDownloadHeaderZip: () => void
}

interface PatchToolsMeta {
  downloadBlob: (name: string, blob: Blob) => void
}

export interface PatchToolsContextValue {
  state: PatchToolsState
  actions: PatchToolsActions
  meta: PatchToolsMeta
}

const PatchToolsContext = createContext<PatchToolsContextValue | null>(null)

export function usePatchToolsContext(): PatchToolsContextValue {
  const context = use(PatchToolsContext)
  if (!context) {
    throw new Error('usePatchToolsContext must be used within PatchToolsProvider.')
  }
  return context
}

export function PatchToolsProvider({ children }: { children: ReactNode }) {
  const [eofFiles, setEofFiles] = useState<File[]>([])
  const [eofByteInput, setEofByteInput] = useState('21')
  const [eofOutputs, setEofOutputs] = useState<OutputItem[]>([])
  const [eofError, setEofError] = useState('')

  const [headerFiles, setHeaderFiles] = useState<File[]>([])
  const [headerWidth, setHeaderWidth] = useState('1000')
  const [headerHeight, setHeaderHeight] = useState('1')
  const [headerEofEnabled, setHeaderEofEnabled] = useState(true)
  const [headerByteInput, setHeaderByteInput] = useState('21')
  const [headerOutputs, setHeaderOutputs] = useState<OutputItem[]>([])
  const [headerError, setHeaderError] = useState('')

  async function runEofPatch(): Promise<void> {
    setEofError('')
    setEofOutputs([])
    try {
      const byte = parseHexByte(eofByteInput)
      const patched = await applyEofPatch({
        files: eofFiles,
        byte,
      })
      setEofOutputs(
        patched.map((item) => ({
          name: item.fileName,
          blob: item.blob,
          note: item.message,
        })),
      )
    } catch (patchError) {
      const message = patchError instanceof Error ? patchError.message : String(patchError)
      setEofError(message)
    }
  }

  async function runHeaderPatch(): Promise<void> {
    setHeaderError('')
    setHeaderOutputs([])
    try {
      const width = Number.parseInt(headerWidth, 10)
      const height = Number.parseInt(headerHeight, 10)
      const byte = parseHexByte(headerByteInput)
      const patched = await applyHeaderPatch({
        files: headerFiles,
        width,
        height,
        eofPatchEnabled: headerEofEnabled,
        eofByte: byte,
      })
      setHeaderOutputs(
        patched.map((item: PatchResult) => ({
          name: item.fileName,
          blob: item.blob,
          note: item.message,
        })),
      )
    } catch (patchError) {
      const message = patchError instanceof Error ? patchError.message : String(patchError)
      setHeaderError(message)
    }
  }

  async function downloadPatchZip(items: OutputItem[], archiveName: string): Promise<void> {
    if (items.length === 0) {
      return
    }

    const zip = await createZip(
      items.map((item) => ({
        name: item.name,
        blob: item.blob,
      })),
      archiveName,
    )
    downloadBlob(zip.name, zip.blob)
  }

  const value: PatchToolsContextValue = {
    state: {
      eofFiles,
      eofByteInput,
      eofOutputs,
      eofError,
      headerFiles,
      headerWidth,
      headerHeight,
      headerEofEnabled,
      headerByteInput,
      headerOutputs,
      headerError,
    },
    actions: {
      onEofFilesChange: (event) => setEofFiles(toFiles(event.target.files)),
      onEofByteInputChange: setEofByteInput,
      onRunEofPatch: () => void runEofPatch(),
      onHeaderFilesChange: (event) => setHeaderFiles(toFiles(event.target.files)),
      onHeaderWidthChange: setHeaderWidth,
      onHeaderHeightChange: setHeaderHeight,
      onHeaderEofEnabledChange: setHeaderEofEnabled,
      onHeaderByteInputChange: setHeaderByteInput,
      onRunHeaderPatch: () => void runHeaderPatch(),
      onDownloadEofZip: () => void downloadPatchZip(eofOutputs, 'eof-patch-output.zip'),
      onDownloadHeaderZip: () => void downloadPatchZip(headerOutputs, 'header-patch-output.zip'),
    },
    meta: {
      downloadBlob,
    },
  }

  return <PatchToolsContext value={value}>{children}</PatchToolsContext>
}
