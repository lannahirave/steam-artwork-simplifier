import { useEffect, useMemo, useState, type ReactNode } from 'react'
import './App.css'
import {
  GUIDE_SECTIONS,
  THEME_STORAGE_KEY,
  getIsolationState,
  type TabKey,
  type ThemeMode,
} from './agents/appAgents'
import { ConvertPanel } from './components/panels/ConvertPanel'
import { GuidesPanel } from './components/panels/GuidesPanel'
import { PatchToolsPanel } from './components/panels/PatchToolsPanel'
import { SteamHelpersPanel } from './components/panels/SteamHelpersPanel'
import { ConvertProvider } from './contexts/convertContext'
import { PatchToolsProvider } from './contexts/patchToolsContext'
import { SteamHelpersProvider } from './contexts/steamHelpersContext'

const APP_VERSION = __APP_VERSION__

function App() {
  const isolationState = useMemo(() => getIsolationState(), [])
  const [tab, setTab] = useState<TabKey>('convert')
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') {
      return 'auto'
    }
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto'
  })
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)').matches : false,
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent): void => {
      setSystemPrefersDark(event.matches)
    }
    media.addEventListener('change', onChange)
    return () => {
      media.removeEventListener('change', onChange)
    }
  }, [])

  const effectiveTheme = themeMode === 'auto' ? (systemPrefersDark ? 'dark' : 'light') : themeMode

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme)
  }, [effectiveTheme])

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode)
  }, [themeMode])

  function cycleThemeMode(): void {
    setThemeMode((prev) => {
      if (prev === 'auto') {
        return 'dark'
      }
      if (prev === 'dark') {
        return 'light'
      }
      return 'auto'
    })
  }

  const trademarkDisclaimer = (
    <footer className="app-disclaimer" role="contentinfo">
      <p>
        Steam and the Steam logo are trademarks and/or registered trademarks of Valve Corporation in the United
        States and/or other countries.
      </p>
      <p>
        This project is an independent, unofficial tool and is not affiliated with, endorsed by, sponsored by, or
        approved by Valve Corporation.
      </p>
    </footer>
  )

  if (!isolationState.ok) {
    return (
      <main className="shell">
        <section className="panel panel-blocking">
          <h1>Cross-Origin Isolation Required</h1>
          <p>{isolationState.reason}</p>
          <p>
            Serve this app with these response headers:
            <code>Cross-Origin-Opener-Policy: same-origin</code>
            <code>Cross-Origin-Embedder-Policy: require-corp</code>
          </p>
          <p>
            For local Vite dev/preview this project already sets them. For production, configure the web server or CDN
            to send the same headers.
          </p>
        </section>
        {trademarkDisclaimer}
      </main>
    )
  }

  const tabPanels: Record<TabKey, ReactNode> = {
    convert: <ConvertPanel />,
    patch: <PatchToolsPanel />,
    steam: <SteamHelpersPanel />,
    guides: <GuidesPanel guides={GUIDE_SECTIONS} />,
  }

  return (
    <main className="shell">
      <header className="masthead">
        <div className="masthead-top">
          <h1>
            Steam Artwork Studio <span className="app-version">V{APP_VERSION}</span>
          </h1>
          <button type="button" className="theme-switch" onClick={cycleThemeMode}>
            Theme: {themeMode === 'auto' ? `Auto (${effectiveTheme})` : themeMode}
          </button>
        </div>
        <p>Turn videos and images into Steam-ready artwork in your browser, with fast multithreaded processing.</p>
      </header>

      <nav className="tabs" aria-label="Sections">
        <button className={tab === 'convert' ? 'tab active' : 'tab'} onClick={() => setTab('convert')}>
          Convert
        </button>
        <button className={tab === 'patch' ? 'tab active' : 'tab'} onClick={() => setTab('patch')}>
          Patch Tools
        </button>
        <button className={tab === 'steam' ? 'tab active' : 'tab'} onClick={() => setTab('steam')}>
          Steam Helpers
        </button>
        <button className={tab === 'guides' ? 'tab active' : 'tab'} onClick={() => setTab('guides')}>
          Guides
        </button>
      </nav>

      <ConvertProvider>
        <PatchToolsProvider>
          <SteamHelpersProvider>{tabPanels[tab]}</SteamHelpersProvider>
        </PatchToolsProvider>
      </ConvertProvider>

      {trademarkDisclaimer}
    </main>
  )
}

export default App
