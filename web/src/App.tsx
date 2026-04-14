import { useMemo, useState, type ReactNode } from 'react'
import './App.css'
import {
  GUIDE_SECTIONS,
  MAX_SAFE_WASM_WORKERS,
  getIsolationState,
  type TabKey,
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
    eyebrow: 'Studio',
    summary: 'Turn source media into Steam-ready GIF layouts with tuned presets, size control, and deliberate post-processing.',
    points: [
      'Workshop, showcase, featured, and guide outputs in one surface.',
      'Live progress, previews, logs, and ZIP export after each run.',
      'Browser-side processing with worker-driven parallelism.',
    ],
  },
  patch: {
    label: 'Patch Tools',
    eyebrow: 'Utilities',
    summary: 'Repair existing GIFs without rerunning a conversion pass.',
    points: [
      'Batch EOF byte rewriting.',
      'Header width and height correction.',
      'Single downloads or ZIP bundles after patching.',
    ],
  },
  steam: {
    label: 'Steam Helpers',
    eyebrow: 'Upload',
    summary: 'Open the matching Steam page, copy the right helper snippet, and finish setup without guesswork.',
    points: [
      'Dedicated snippets for workshop, artwork, featured, and screenshot flows.',
      'Direct links to the intended upload destinations.',
      'One-click copy actions inside each helper panel.',
    ],
  },
  guides: {
    label: 'Guides',
    eyebrow: 'Reference',
    summary: 'Reference the fastest route through the toolkit when you need a preset-specific workflow or tuning reminder.',
    points: [
      'Preset-specific workflows for the common Steam paths.',
      'Quality and size tuning guidance.',
      'Patch and upload checklists without extra tooling.',
    ],
  },
}

const STUDIO_SIGNALS = [
  {
    value: 'Browser-Only',
    label: 'Source media stays local while the app converts and patches.',
  },
  {
    value: `${MAX_SAFE_WASM_WORKERS} Worker Ceiling`,
    label: 'Parallel processing tuned for browser stability instead of headline numbers.',
  },
  {
    value: `${GUIDE_SECTIONS.length} Built-In Guides`,
    label: 'Reference steps for common Steam artwork upload paths.',
  },
]

const QUICK_FACTS = [
  {
    title: 'Purpose-built',
    body: 'The presets, patch tools, and upload helpers are tuned for real Steam artwork workflows rather than generic GIF export.',
  },
  {
    title: 'Single workspace',
    body: 'Conversion, surgical patching, helper snippets, and reference guides stay in one browser workspace.',
  },
]

function App() {
  const isolationState = useMemo(() => getIsolationState(), [])
  const [tab, setTab] = useState<TabKey>('convert')
  const activeTab = TAB_DETAILS[tab]

  function openConvertWorkspace(): void {
    setTab('convert')
    document.getElementById('workspace')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
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
      <div className="apple-app">
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
              Local Vite dev and preview already include them. Production still needs the same headers at the server
              or CDN layer.
            </p>
          </section>
          {trademarkDisclaimer}
        </main>
      </div>
    )
  }

  const tabPanels: Record<TabKey, ReactNode> = {
    convert: <ConvertPanel />,
    patch: <PatchToolsPanel />,
    steam: <SteamHelpersPanel />,
    guides: <GuidesPanel guides={GUIDE_SECTIONS} />,
  }

  return (
    <div className="apple-app">
      <header className="global-nav">
        <div className="global-nav-inner">
          <button type="button" className="global-nav-brand" onClick={openConvertWorkspace}>
            Steam Artwork Studio
          </button>
          <nav className="global-nav-links" aria-label="Primary">
            {Object.entries(TAB_DETAILS).map(([key, item]) => (
              <button
                key={key}
                type="button"
                className={tab === key ? 'global-nav-link active' : 'global-nav-link'}
                aria-pressed={tab === key}
                onClick={() => setTab(key as TabKey)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="global-nav-actions">
            <span className="nav-version">V{APP_VERSION}</span>
            <a className="nav-source" href="https://github.com/lannahirave/steam-artwork-simplifier">
              GitHub
            </a>
          </div>
        </div>
      </header>

      <main className="shell">
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-meta-row">
              <p className="hero-eyebrow">Steam Artwork Studio</p>
              <span className="hero-chip">V{APP_VERSION}</span>
            </div>
            <h1>Steam artwork workflows, staged like a launch page.</h1>
            <p className="hero-summary">
              Convert source media, patch finished GIFs, and prepare Steam uploads from one controlled browser
              workstation.
            </p>
            <div className="hero-actions">
              <button type="button" className="hero-primary" onClick={openConvertWorkspace}>
                Open Convert
              </button>
              <a className="hero-link hero-link-pill" href="#workspace">
                Explore workflow
              </a>
              <a className="hero-link" href="https://github.com/lannahirave/steam-artwork-simplifier">
                Source Code
              </a>
            </div>
          </div>

          <div className="hero-signals" aria-label="Studio signals">
            {STUDIO_SIGNALS.map((signal) => (
              <article key={signal.value} className="signal-card">
                <strong>{signal.value}</strong>
                <span>{signal.label}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="overview-band" aria-label="Workbench overview">
          <div className="overview-copy">
            <p className="spotlight-eyebrow">{activeTab.eyebrow}</p>
            <h2>{activeTab.label}</h2>
            <p className="spotlight-copy">{activeTab.summary}</p>
            <ul className="spotlight-list">
              {activeTab.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
          <div className="hero-note-grid">
            {QUICK_FACTS.map((note) => (
              <article key={note.title} className="hero-note-card">
                <h3>{note.title}</h3>
                <p>{note.body}</p>
              </article>
            ))}
          </div>
        </section>

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
            <p className="hero-spotlight-label">Current focus</p>
            <h2>{activeTab.label}</h2>
            <p>{activeTab.summary}</p>
            <ul className="hero-spotlight-list">
              {activeTab.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </aside>
        </section>

        <section id="workspace" className="workspace-frame">
          <ConvertProvider>
            <PatchToolsProvider>
              <SteamHelpersProvider>{tabPanels[tab]}</SteamHelpersProvider>
            </PatchToolsProvider>
          </ConvertProvider>
        </section>

        {trademarkDisclaimer}
      </main>
    </div>
  )
}

export default App
