import { useEffect, useMemo, useState, type ReactNode } from 'react'
import './App.css'
import {
  GUIDE_SECTIONS,
  MAX_SAFE_WASM_WORKERS,
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

const TAB_DETAILS: Record<
  TabKey,
  {
    label: string
    eyebrow: string
    summary: string
    points: string[]
  }
> = {
  convert: {
    label: 'Convert',
    eyebrow: 'Primary',
    summary: 'Convert media into Steam-ready GIF layouts with control over speed, size, retries, and patching.',
    points: [
      'Workshop, showcase, featured, and guide presets.',
      'Live progress, logs, previews, and ZIP export.',
      'Browser-only processing with parallel workers.',
    ],
  },
  patch: {
    label: 'Patch Tools',
    eyebrow: 'Utilities',
    summary: 'Patch existing GIF files without rerunning conversion.',
    points: [
      'Batch EOF rewriting.',
      'Header width and height patching.',
      'Single-file downloads or ZIP bundles.',
    ],
  },
  steam: {
    label: 'Steam Helpers',
    eyebrow: 'Upload',
    summary: 'Open the right Steam page, copy the matching helper snippet, and finish upload setup faster.',
    points: [
      'Separate snippets for workshop, artwork, featured, and screenshots.',
      'Direct links to the intended Steam upload pages.',
      'Copy actions built into each helper section.',
    ],
  },
  guides: {
    label: 'Guides',
    eyebrow: 'Reference',
    summary: 'Reference the fastest path through the tool when you need preset-specific steps or tuning guidance.',
    points: [
      'Preset-specific workflows.',
      'Quality and size tuning tips.',
      'Patch and upload checklists.',
    ],
  },
}

const STUDIO_SIGNALS = [
  {
    value: 'Local Processing',
    label: 'Source media stays in the browser during conversion.',
  },
  {
    value: `${MAX_SAFE_WASM_WORKERS} Max Workers`,
    label: 'Parallel conversion tuned for browser stability.',
  },
  {
    value: `${GUIDE_SECTIONS.length} Built-In Guides`,
    label: 'Reference workflows for common Steam upload paths.',
  },
]

const QUICK_FACTS = [
  {
    title: 'Why it is useful',
    body: 'Presets, patching, and helper snippets are aligned to actual Steam artwork workflows instead of generic media conversion.',
  },
  {
    title: 'What is here',
    body: 'Conversion, patch tools, upload helpers, and guides are all available in one place without leaving the page.',
  },
]

function getThemeLabel(themeMode: ThemeMode, effectiveTheme: 'light' | 'dark'): string {
  if (themeMode === 'auto') {
    return `Auto / ${effectiveTheme === 'dark' ? 'Night' : 'Day'}`
  }
  return themeMode === 'dark' ? 'Night' : 'Day'
}

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
  const activeTab = TAB_DETAILS[tab]
  const themeLabel = getThemeLabel(themeMode, effectiveTheme)

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
      <p>
        Source code: <a href="https://github.com/lannahirave/steam-artwork-simplifier">GitHub</a> | License:{' '}
        <a href="/LICENSE.txt">AGPL-3.0-or-later</a> | Third-party notices:{' '}
        <a href="/THIRD_PARTY_NOTICES.txt">View</a>
      </p>
    </footer>
  )

  if (!isolationState.ok) {
    return (
      <main className="shell shell-blocking">
        <section className="panel panel-blocking">
          <p className="hero-eyebrow">Setup Required</p>
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
      <header className="hero">
        <div className="hero-copy">
          <div className="hero-meta-row">
            <p className="hero-eyebrow">Steam Artwork Studio</p>
            <span className="hero-chip">V{APP_VERSION}</span>
          </div>
          <h1>Practical Steam artwork tools in one browser workspace.</h1>
          <p className="hero-summary">
            Convert media, patch finished GIFs, and prepare Steam uploads without leaving the app.
          </p>
          <div className="hero-actions">
            <button type="button" className="hero-primary" onClick={() => setTab('convert')}>
              Open Convert
            </button>
            <button type="button" className="theme-switch" onClick={cycleThemeMode}>
              Theme: {themeLabel}
            </button>
            <a className="hero-link" href="https://github.com/lannahirave/steam-artwork-simplifier">
              Source Code
            </a>
          </div>
          <div className="hero-signals" aria-label="Studio signals">
            {STUDIO_SIGNALS.map((signal) => (
              <article key={signal.value} className="signal-card">
                <strong>{signal.value}</strong>
                <span>{signal.label}</span>
              </article>
            ))}
          </div>
        </div>

        <aside className="hero-aside" aria-label="Workbench overview">
          <section className="hero-spotlight">
            <p className="hero-spotlight-label">{activeTab.eyebrow}</p>
            <h2>{activeTab.label}</h2>
            <p>{activeTab.summary}</p>
            <ul className="hero-spotlight-list">
              {activeTab.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
          <div className="hero-note-grid">
            {QUICK_FACTS.map((note) => (
              <article key={note.title} className="hero-note-card">
                <h3>{note.title}</h3>
                <p>{note.body}</p>
              </article>
            ))}
          </div>
        </aside>
      </header>

      <section className="control-deck">
        <nav className="tab-rail" aria-label="Sections">
          {Object.entries(TAB_DETAILS).map(([key, item]) => (
            <button
              key={key}
              type="button"
              className={tab === key ? 'tab active' : 'tab'}
              aria-pressed={tab === key}
              onClick={() => setTab(key as TabKey)}
            >
              <span className="tab-eyebrow">{item.eyebrow}</span>
              <span className="tab-title">{item.label}</span>
              <span className="tab-summary">{item.summary}</span>
            </button>
          ))}
        </nav>

        <aside className="spotlight-panel" aria-live="polite">
          <p className="spotlight-eyebrow">{activeTab.eyebrow}</p>
          <h2>{activeTab.label}</h2>
          <p className="spotlight-copy">{activeTab.summary}</p>
          <ul className="spotlight-list">
            {activeTab.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </aside>
      </section>

      <ConvertProvider>
        <PatchToolsProvider>
          <SteamHelpersProvider>
            <section id="workspace" className="workspace-frame">
              {tabPanels[tab]}
            </section>
          </SteamHelpersProvider>
        </PatchToolsProvider>
      </ConvertProvider>

      {trademarkDisclaimer}
    </main>
  )
}

export default App
