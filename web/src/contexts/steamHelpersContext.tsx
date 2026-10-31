/* eslint-disable react-refresh/only-export-components */
import { createContext, use, useState, type ReactNode } from 'react'
import {
  DEFAULT_APP_ID,
  DEFAULT_DELAY_SECONDS,
  DEFAULT_VISIBILITY,
  type SteamUploadType,
  type SteamVisibility,
} from '../lib/steamSnippets'

export type SteamScriptKind = 'batch' | 'single'

type CopyStatus =
  | { type: 'success'; kind: SteamScriptKind }
  | { type: 'error'; kind: SteamScriptKind }
  | null

export interface SteamBatchInputs {
  appId: string
  visibility: SteamVisibility
  delaySeconds: string
}

interface SteamHelpersState {
  copyStatus: CopyStatus
  uploadType: SteamUploadType
  batchInputs: SteamBatchInputs
  batchInputsAreDefault: boolean
}

interface SteamHelpersActions {
  onCopyScript: (kind: SteamScriptKind, text: string) => void
  onSelectUploadType: (type: SteamUploadType) => void
  onChangeAppId: (value: string) => void
  onChangeVisibility: (value: SteamVisibility) => void
  onChangeDelaySeconds: (value: string) => void
  onResetBatchInputs: () => void
}

type SteamHelpersMeta = Record<string, never>

export interface SteamHelpersContextValue {
  state: SteamHelpersState
  actions: SteamHelpersActions
  meta: SteamHelpersMeta
}

const SteamHelpersContext = createContext<SteamHelpersContextValue | null>(null)

export function useSteamHelpersContext(): SteamHelpersContextValue {
  const context = use(SteamHelpersContext)
  if (!context) {
    throw new Error('useSteamHelpersContext must be used within SteamHelpersProvider.')
  }
  return context
}

export function SteamHelpersProvider({ children }: { children: ReactNode }) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>(null)
  const [uploadType, setUploadType] = useState<SteamUploadType>('workshop')
  const [customAppId, setCustomAppId] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<SteamVisibility>(DEFAULT_VISIBILITY)
  const [delaySeconds, setDelaySeconds] = useState<string>(String(DEFAULT_DELAY_SECONDS))

  const batchInputs: SteamBatchInputs = {
    appId: customAppId ?? String(DEFAULT_APP_ID[uploadType]),
    visibility,
    delaySeconds,
  }

  async function copyScript(kind: SteamScriptKind, text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus({ type: 'success', kind })
    } catch {
      setCopyStatus({ type: 'error', kind })
    }
  }

  function changed<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setCopyStatus(null)
    }
  }

  const value: SteamHelpersContextValue = {
    state: {
      copyStatus,
      uploadType,
      batchInputs,
      batchInputsAreDefault:
        customAppId === null &&
        visibility === DEFAULT_VISIBILITY &&
        delaySeconds === String(DEFAULT_DELAY_SECONDS),
    },
    actions: {
      onCopyScript: (kind, text) => void copyScript(kind, text),
      onSelectUploadType: changed(setUploadType),
      onChangeAppId: changed((next: string) =>
        setCustomAppId(next === String(DEFAULT_APP_ID[uploadType]) ? null : next),
      ),
      onChangeVisibility: changed(setVisibility),
      onChangeDelaySeconds: changed(setDelaySeconds),
      onResetBatchInputs: () => {
        setCustomAppId(null)
        setVisibility(DEFAULT_VISIBILITY)
        setDelaySeconds(String(DEFAULT_DELAY_SECONDS))
        setCopyStatus(null)
      },
    },
    meta: {},
  }

  return <SteamHelpersContext value={value}>{children}</SteamHelpersContext>
}
