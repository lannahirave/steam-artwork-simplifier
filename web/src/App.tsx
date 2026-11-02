import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useIntl } from 'react-intl'
import './App.css'
import {
  GUIDE_SECTIONS,
  type TabKey,
} from './agents/appAgents'
import { TAB_DETAILS } from './appShellCatalog'
import { OnboardingTour } from './components/OnboardingTour'
import { ConvertPanel } from './components/panels/ConvertPanel'
import { GuidesPanel } from './components/panels/GuidesPanel'
import { LibraryPanel } from './components/panels/LibraryPanel'
import { PatchToolsPanel } from './components/panels/PatchToolsPanel'
import { SteamHelpersPanel } from './components/panels/SteamHelpersPanel'
import { ConvertProvider } from './contexts/convertContext'
import { PatchToolsProvider } from './contexts/patchToolsContext'
import { SteamHelpersProvider } from './contexts/steamHelpersContext'
import { SUPPORTED_LOCALES, localeLabels, type AppLocale } from './i18n/messages'
import { getStoredOnboardingComplete } from './onboardingStorage'
import { ThemeIcon } from './components/ThemeIcon'
import type { AppTheme } from './theme'

const APP_VERSION = __APP_VERSION__

interface AppProps {
  locale: AppLocale
  onLocaleChange: (locale: AppLocale) => void
  theme: AppTheme
  onThemeToggle: () => void
}

function App({ locale, onLocaleChange, theme, onThemeToggle }: AppProps) {
  const intl = useIntl()
  const [tab, setTab] = useState<TabKey>('convert')
  const [showOnboarding, setShowOnboarding] = useState(
    () => !getStoredOnboardingComplete(),
  )
  const [onboardingRun, setOnboardingRun] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const headerRef = useRef<HTMLElement | null>(null)
  const menuToggleRef = useRef<HTMLButtonElement | null>(null)
  const activeTab = TAB_DETAILS[tab]

  // The narrow-screen menu closes on Escape or on a tap anywhere outside the header.
  useEffect(() => {
    if (!menuOpen) {
      return
    }

    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        // Focus was inside the panel that is about to hide; hand it back to the button.
        if (document.getElementById('global-nav-menu')?.contains(document.activeElement)) {
          menuToggleRef.current?.focus()
        }
        setMenuOpen(false)
      }
    }
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      if (!headerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    window.addEventListener('keydown', closeOnEscape)
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
    }
  }, [menuOpen])

  function selectTab(next: TabKey): void {
    setTab(next)
    setMenuOpen(false)
  }

  function reopenOnboarding(): void {
    setMenuOpen(false)
    setOnboardingRun((current) => current + 1)
    setShowOnboarding(true)
  }

  function openConvertWorkspace(): void {
    setMenuOpen(false)
    setTab('convert')
    document.getElementById('workspace')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  function openLibrary(): void {
    setTab('library')
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

  const tabPanels: Record<TabKey, ReactNode> = {
    convert: <ConvertPanel onboardingTarget="convert" onOpenLibrary={openLibrary} />,
    library: <LibraryPanel onboardingTarget="library" />,
    patch: <PatchToolsPanel onboardingTarget="patch" />,
    steam: <SteamHelpersPanel onboardingTarget="steam" />,
    guides: <GuidesPanel guides={GUIDE_SECTIONS} onboardingTarget="guides" />,
  }

  return (
    <div className="apple-app">
      <header ref={headerRef} className="global-nav">
        <div className="global-nav-inner">
          <button type="button" className="global-nav-brand" onClick={openConvertWorkspace}>
            {intl.formatMessage({ id: 'app.brand' })}
          </button>
          {/* Shown at 980px and below, where the tabs and settings fold into one menu. */}
          <button
            ref={menuToggleRef}
            type="button"
            className="nav-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="global-nav-menu"
            aria-label={intl.formatMessage({ id: menuOpen ? 'app.nav.menuClose' : 'app.nav.menu' })}
            data-onboarding-target="nav-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="nav-menu-current">{intl.formatMessage({ id: activeTab.label })}</span>
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
              {menuOpen ? (
                <path d="M5 5l10 10M15 5L5 15" />
              ) : (
                <path d="M3 6h14M3 10h14M3 14h14" />
              )}
            </svg>
          </button>
          <div id="global-nav-menu" className={menuOpen ? 'global-nav-menu open' : 'global-nav-menu'}>
            <nav className="global-nav-links" aria-label={intl.formatMessage({ id: 'app.nav.primary' })}>
              {Object.entries(TAB_DETAILS).map(([key, item]) => (
                <button
                  key={key}
                  type="button"
                  className={tab === key ? 'global-nav-link active' : 'global-nav-link'}
                  aria-pressed={tab === key}
                  data-onboarding-target={`nav-${key}`}
                  onClick={() => selectTab(key as TabKey)}
                >
                  {intl.formatMessage({ id: item.label })}
                </button>
              ))}
            </nav>
            <div className="global-nav-actions">
              <span className="nav-version">V{APP_VERSION}</span>
              <select
                className="nav-language"
                aria-label={intl.formatMessage({ id: 'app.nav.language' })}
                value={locale}
                onChange={(event) => onLocaleChange(event.target.value as AppLocale)}
              >
                {SUPPORTED_LOCALES.map((item) => (
                  <option key={item} value={item}>
                    {localeLabels[item]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="nav-theme"
                aria-label={intl.formatMessage({
                  id: theme === 'dark' ? 'app.nav.theme.toLight' : 'app.nav.theme.toDark',
                })}
                title={intl.formatMessage({
                  id: theme === 'dark' ? 'app.nav.theme.toLight' : 'app.nav.theme.toDark',
                })}
                onClick={onThemeToggle}
              >
                <ThemeIcon theme={theme} />
              </button>
              <button type="button" className="nav-help" onClick={reopenOnboarding}>
                {intl.formatMessage({ id: 'app.nav.help' })}
              </button>
              <a className="nav-source" href="https://github.com/lannahirave/steam-artwork-simplifier">
                {intl.formatMessage({ id: 'app.nav.github' })}
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="shell">
        {/* First in <main> so the tour card is the next Tab stop after the header. */}
        <OnboardingTour
          key={onboardingRun}
          open={showOnboarding}
          onOpenChange={setShowOnboarding}
          onSelectTab={setTab}
        />

        <section className="hero">
          <div className="hero-copy">
            <h1>{intl.formatMessage({ id: 'app.brand' })}</h1>
            <p className="hero-summary">{intl.formatMessage({ id: 'app.hero.summary' })}</p>
            <div className="hero-actions">
              <button type="button" className="hero-primary" onClick={openConvertWorkspace}>
                {intl.formatMessage({ id: 'app.hero.openConvert' })}
              </button>
              <a
                className="hero-link hero-link-pill hero-link-guide"
                href="https://steamcommunity.com/sharedfiles/filedetails/?id=3813335509"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg className="hero-link-star" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
                  <path d="M10 1.8l2.47 5.2 5.7.68-4.2 3.92 1.1 5.63L10 14.42l-5.07 2.81 1.1-5.63-4.2-3.92 5.7-.68z" />
                </svg>
                {intl.formatMessage({ id: 'app.hero.openGuide' })}
              </a>
              <a className="hero-link" href="https://github.com/lannahirave/steam-artwork-simplifier">
                {intl.formatMessage({ id: 'app.hero.sourceCode' })}
              </a>
            </div>
          </div>
        </section>

        <section className="overview-band" aria-label={intl.formatMessage({ id: 'app.overview.label' })}>
          <div className="overview-copy">
            <h2>{intl.formatMessage({ id: activeTab.label })}</h2>
            <p className="spotlight-copy">{intl.formatMessage({ id: activeTab.summary })}</p>
            <ul className="spotlight-list">
              {activeTab.points.map((point) => (
                <li key={point}>{intl.formatMessage({ id: point })}</li>
              ))}
            </ul>
          </div>
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
