import { useMemo, useState, type ReactNode } from 'react'
import { useIntl } from 'react-intl'
import './App.css'
import {
  GUIDE_SECTIONS,
  getIsolationState,
  type TabKey,
} from './agents/appAgents'
import { TAB_DETAILS } from './appShellCatalog'
import { OnboardingTour } from './components/OnboardingTour'
import { ConvertPanel } from './components/panels/ConvertPanel'
import { GuidesPanel } from './components/panels/GuidesPanel'
import { PatchToolsPanel } from './components/panels/PatchToolsPanel'
import { SteamHelpersPanel } from './components/panels/SteamHelpersPanel'
import { ConvertProvider } from './contexts/convertContext'
import { PatchToolsProvider } from './contexts/patchToolsContext'
import { SteamHelpersProvider } from './contexts/steamHelpersContext'
import { getStoredOnboardingComplete } from './onboardingStorage'

const APP_VERSION = __APP_VERSION__

function App() {
  const intl = useIntl()
  const isolationState = useMemo(() => getIsolationState(), [])
  const [tab, setTab] = useState<TabKey>('convert')
  const [showOnboarding, setShowOnboarding] = useState(
    () => isolationState.ok && !getStoredOnboardingComplete(),
  )
  const [onboardingRun, setOnboardingRun] = useState(0)
  const activeTab = TAB_DETAILS[tab]

  function reopenOnboarding(): void {
    setOnboardingRun((current) => current + 1)
    setShowOnboarding(true)
  }

  function openConvertWorkspace(): void {
    setTab('convert')
    document.getElementById('workspace')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  const trademarkDisclaimer = (
    <footer className="app-disclaimer" role="contentinfo">
      <p>{intl.formatMessage({ id: 'app.footer.trademark1' })}</p>
      <p>{intl.formatMessage({ id: 'app.footer.trademark2' })}</p>
      <p>
        {intl.formatMessage({ id: 'app.footer.sourceCode' })}{' '}
        <a href="https://github.com/lannahirave/steam-artwork-simplifier">
          {intl.formatMessage({ id: 'app.nav.github' })}
        </a>{' '}
        | {intl.formatMessage({ id: 'app.footer.license' })}{' '}
        <a href="/LICENSE.txt">AGPL-3.0-or-later</a> | {intl.formatMessage({ id: 'app.footer.notices' })}{' '}
        <a href="/THIRD_PARTY_NOTICES.txt">{intl.formatMessage({ id: 'app.footer.view' })}</a>
      </p>
    </footer>
  )

  if (!isolationState.ok) {
    return (
      <div className="apple-app">
        <main className="shell shell-blocking">
          <section className="panel panel-blocking">
            <p className="hero-eyebrow">{intl.formatMessage({ id: 'app.blocking.eyebrow' })}</p>
            <h1>{intl.formatMessage({ id: 'app.blocking.title' })}</h1>
            <p>{isolationState.reason}</p>
            <p>
              {intl.formatMessage({ id: 'app.blocking.headers' })}
              <code>Cross-Origin-Opener-Policy: same-origin</code>
              <code>Cross-Origin-Embedder-Policy: require-corp</code>
            </p>
            <p>{intl.formatMessage({ id: 'app.blocking.note' })}</p>
          </section>
          {trademarkDisclaimer}
        </main>
      </div>
    )
  }

  const tabPanels: Record<TabKey, ReactNode> = {
    convert: <ConvertPanel onboardingTarget="convert" />,
    patch: <PatchToolsPanel onboardingTarget="patch" />,
    steam: <SteamHelpersPanel onboardingTarget="steam" />,
    guides: <GuidesPanel guides={GUIDE_SECTIONS} onboardingTarget="guides" />,
  }

  return (
    <div className="apple-app">
      <header className="global-nav">
        <div className="global-nav-inner">
          <button type="button" className="global-nav-brand" onClick={openConvertWorkspace}>
            {intl.formatMessage({ id: 'app.brand' })}
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
                {intl.formatMessage({ id: item.label })}
              </button>
            ))}
          </nav>
          <div className="global-nav-actions">
            <span className="nav-version">V{APP_VERSION}</span>
            <button type="button" className="nav-help" onClick={reopenOnboarding}>
              {intl.formatMessage({ id: 'app.nav.help' })}
            </button>
            <a className="nav-source" href="https://github.com/lannahirave/steam-artwork-simplifier">
              {intl.formatMessage({ id: 'app.nav.github' })}
            </a>
          </div>
        </div>
      </header>

      <main className="shell">
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-meta-row">
              <span className="hero-chip">V{APP_VERSION}</span>
            </div>
            <h1>{intl.formatMessage({ id: 'app.brand' })}</h1>
            <p className="hero-summary">{intl.formatMessage({ id: 'app.hero.summary' })}</p>
            <div className="hero-actions">
              <button type="button" className="hero-primary" onClick={openConvertWorkspace}>
                {intl.formatMessage({ id: 'app.hero.openConvert' })}
              </button>
              <a className="hero-link hero-link-pill" href="#workspace">
                {intl.formatMessage({ id: 'app.hero.exploreWorkflow' })}
              </a>
              <a className="hero-link" href="https://github.com/lannahirave/steam-artwork-simplifier">
                {intl.formatMessage({ id: 'app.hero.sourceCode' })}
              </a>
            </div>
          </div>
        </section>

        <section className="overview-band" aria-label="Workbench overview">
          <div className="overview-copy">
            <p className="spotlight-eyebrow">{intl.formatMessage({ id: activeTab.eyebrow })}</p>
            <h2>{intl.formatMessage({ id: activeTab.label })}</h2>
            <p className="spotlight-copy">{intl.formatMessage({ id: activeTab.summary })}</p>
            <ul className="spotlight-list">
              {activeTab.points.map((point) => (
                <li key={point}>{intl.formatMessage({ id: point })}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="control-deck">
          <nav className="tab-rail" aria-label={intl.formatMessage({ id: 'app.tab.sections' })}>
            {Object.entries(TAB_DETAILS).map(([key, item]) => (
              <button
                key={key}
                type="button"
                className={tab === key ? 'tab active' : 'tab'}
                aria-pressed={tab === key}
                data-open-label={intl.formatMessage({ id: 'app.tab.open' })}
                onClick={() => setTab(key as TabKey)}
              >
                <span className="tab-eyebrow">{intl.formatMessage({ id: item.eyebrow })}</span>
                <span className="tab-title">{intl.formatMessage({ id: item.label })}</span>
                <span className="tab-summary">{intl.formatMessage({ id: item.summary })}</span>
              </button>
            ))}
          </nav>

          <aside className="spotlight-panel" aria-live="polite">
            <p className="hero-spotlight-label">{intl.formatMessage({ id: 'app.overview.currentFocus' })}</p>
            <h2>{intl.formatMessage({ id: activeTab.label })}</h2>
            <p>{intl.formatMessage({ id: activeTab.summary })}</p>
            <ul className="hero-spotlight-list">
              {activeTab.points.map((point) => (
                <li key={point}>{intl.formatMessage({ id: point })}</li>
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

        <OnboardingTour
          key={onboardingRun}
          open={showOnboarding}
          onOpenChange={setShowOnboarding}
          onSelectTab={setTab}
        />

        {trademarkDisclaimer}
      </main>
    </div>
  )
}

export default App
