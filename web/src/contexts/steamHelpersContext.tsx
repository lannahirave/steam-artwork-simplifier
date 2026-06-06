/* eslint-disable react-refresh/only-export-components */
import { createContext, use, useState, type ReactNode } from 'react'
import { FEATURED_SNIPPET, SCREENSHOT_SNIPPET, WORKSHOP_SNIPPET } from '../lib/steamSnippets'

type CopyLabel = 'workshop' | 'featured' | 'screenshot'
type CopyStatus =
  | { type: 'success'; label: CopyLabel }
  | { type: 'error' }
  | null

interface SteamHelpersState {
  copyStatus: CopyStatus
}

interface SteamHelpersActions {
  onCopySnippet: (label: CopyLabel) => void
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

  async function copySnippet(label: CopyLabel): Promise<void> {
    const text =
      label === 'workshop'
        ? WORKSHOP_SNIPPET
        : label === 'featured'
          ? FEATURED_SNIPPET
          : SCREENSHOT_SNIPPET
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus({ type: 'success', label })
    } catch {
      setCopyStatus({ type: 'error' })
    }
  }

  const value: SteamHelpersContextValue = {
    state: {
      copyStatus,
    },
    actions: {
      onCopySnippet: (label) => void copySnippet(label),
    },
    meta: {},
  }

  return <SteamHelpersContext value={value}>{children}</SteamHelpersContext>
}
