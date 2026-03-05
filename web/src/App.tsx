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
    label: 'Conversion Atelier',
    eyebrow: 'Primary Workflow',
    summary: 'Shape raw media into Steam-ready GIF systems with aggressive control over size, speed, and output fidelity.',
    points: [
      'Workshop strips, featured canvases, showcase splits, and guide squares in one flow.',
      'Adaptive worker scheduling and retry ladders for practical browser-side throughput.',
      'Live progress, logs, previews, and single-click ZIP export once output is ready.',
    ],
  },
  patch: {
    label: 'Patch Lab',
    eyebrow: 'File Surgery',
    summary: 'Repair or rewrite existing GIF metadata without rerunning the full conversion pipeline.',
    points: [
      'Batch EOF rewriting for legacy-compatible endings.',
      'Header width and height patching for Steam-specific presentation tricks.',
      'Direct downloads or ZIP bundles for cleaned output sets.',
    ],
  },
  steam: {
    label: 'Upload Console',
    eyebrow: 'Steam Helpers',
    summary: 'Prepare upload sessions faster with ready-to-run console snippets for the exact Steam screens you need.',
    points: [
      'Dedicated snippets for workshop, artwork/featured, and screenshot uploads.',
      'Built-in copy actions and direct links to the correct Steam pages.',
      'Notes that keep the helper workflow constrained to the intended upload surfaces.',
    ],
  },
  guides: {
    label: 'Field Manual',
    eyebrow: 'Operational Guides',
    summary: 'Reference the fastest working paths through the toolkit when you need to move from source file to uploadable artwork.',
    points: [
      'Preset-specific playbooks for workshop, showcase, featured, and guide output.',
      'Tuning recommendations for size pressure, retries, and quality tradeoffs.',
      'Patch and upload walkthroughs for the full end-to-end Steam workflow.',
    ],
  },
}

const STUDIO_SIGNALS = [
  {
    value: '100% Local',
    label: 'Media stays in your browser while the pipeline runs.',
  },
  {
    value: `${MAX_SAFE_WASM_WORKERS} Workers`,
    label: 'Parallel conversion tuned for browser stability.',
  },
  {
    value: `${GUIDE_SECTIONS.length} Guides`,
    label: 'Reference workflows for the common Steam publishing paths.',
  },
]

const WORKBENCH_NOTES = [
  {
    title: 'Built For Steam Constraints',
    body: 'Preset geometry, patching, and helper snippets are aligned with the weird edges of Steam artwork workflows.',
  },
  {
    title: 'Not A Toy Converter',
    body: 'Retry ladders, precheck toggles, and lossy fallback controls make this feel more like a mastering desk than a file uploader.',
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
          <h1>Steam artwork tooling with the atmosphere of a finished product.</h1>
          <p className="hero-summary">
            Convert, patch, and prep upload flows in one browser workspace with a sharper visual hierarchy and no
            external processing dependency.
          </p>
          <div className="hero-actions">
            <button type="button" className="hero-primary" onClick={() => setTab('convert')}>
              Open Conversion Studio
            </button>
            <button type="button" className="theme-switch" onClick={cycleThemeMode}>
              Palette: {themeLabel}
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
          </section>
          <div className="hero-note-grid">
            {WORKBENCH_NOTES.map((note) => (
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
