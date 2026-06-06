import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import { useIntl } from 'react-intl'
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
import type { MessageId } from './i18n/messages'

const APP_VERSION = __APP_VERSION__
const ONBOARDING_STORAGE_KEY = 'steam-artwork-studio:onboarding-complete'

const TAB_DETAILS: Record<
  TabKey,
  {
    label: MessageId
    eyebrow: MessageId
    summary: MessageId
    points: MessageId[]
  }
> = {
  convert: {
    label: 'app.nav.convert',
    eyebrow: 'app.tabs.convert.eyebrow',
    summary: 'app.tabs.convert.summary',
    points: [
      'app.tabs.convert.point1',
      'app.tabs.convert.point2',
      'app.tabs.convert.point3',
    ],
  },
  patch: {
    label: 'app.nav.patch',
    eyebrow: 'app.tabs.patch.eyebrow',
    summary: 'app.tabs.patch.summary',
    points: [
      'app.tabs.patch.point1',
      'app.tabs.patch.point2',
      'app.tabs.patch.point3',
    ],
  },
  steam: {
    label: 'app.nav.steam',
    eyebrow: 'app.tabs.steam.eyebrow',
    summary: 'app.tabs.steam.summary',
    points: [
      'app.tabs.steam.point1',
      'app.tabs.steam.point2',
      'app.tabs.steam.point3',
    ],
  },
  guides: {
    label: 'app.nav.guides',
    eyebrow: 'app.tabs.guides.eyebrow',
    summary: 'app.tabs.guides.summary',
    points: [
      'app.tabs.guides.point1',
      'app.tabs.guides.point2',
      'app.tabs.guides.point3',
    ],
  },
}

const STUDIO_SIGNALS = [
  {
    value: 'app.signals.browser.value',
    label: 'app.signals.browser.label',
  },
  {
    value: 'app.signals.workers.value',
    label: 'app.signals.workers.label',
    values: { count: MAX_SAFE_WASM_WORKERS },
  },
  {
    value: 'app.signals.guides.value',
    label: 'app.signals.guides.label',
    values: { count: GUIDE_SECTIONS.length },
  },
]

const QUICK_FACTS = [
  {
    title: 'app.quickFacts.purpose.title',
    body: 'app.quickFacts.purpose.body',
  },
  {
    title: 'app.quickFacts.workspace.title',
    body: 'app.quickFacts.workspace.body',
  },
]

const ONBOARDING_STEPS: Array<{
  tab?: TabKey
  title: MessageId
  body: MessageId
}> = [
  {
    title: 'onboarding.intro.title',
    body: 'onboarding.intro.body',
  },
  {
    tab: 'convert',
    title: 'onboarding.convert.title',
    body: 'onboarding.convert.body',
  },
  {
    tab: 'patch',
    title: 'onboarding.patch.title',
    body: 'onboarding.patch.body',
  },
  {
    tab: 'steam',
    title: 'onboarding.steam.title',
    body: 'onboarding.steam.body',
  },
  {
    tab: 'guides',
    title: 'onboarding.guides.title',
    body: 'onboarding.guides.body',
  },
]

function getStoredOnboardingComplete(): boolean {
  if (typeof window === 'undefined') {
    return true
  }

  try {
    return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true'
  } catch {
    return true
  }
}

function storeOnboardingComplete(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true')
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}

interface OnboardingTourProps {
  cardRef: Ref<HTMLElement>
  stepIndex: number
  onBack: () => void
  onNext: () => void
  onSkip: () => void
}

function OnboardingTour(props: OnboardingTourProps) {
  const intl = useIntl()
  const { cardRef, stepIndex, onBack, onNext, onSkip } = props
  const step = ONBOARDING_STEPS[stepIndex]
  const isFirst = stepIndex === 0
  const isLast = stepIndex === ONBOARDING_STEPS.length - 1

  return (
    <aside ref={cardRef} className="onboarding-card" aria-live="polite" aria-label="Onboarding guide">
      <div className="onboarding-card-head">
        <span className="onboarding-kicker">
          {intl.formatMessage(
            { id: 'onboarding.step' },
            { current: stepIndex + 1, total: ONBOARDING_STEPS.length },
          )}
        </span>
        <button type="button" className="onboarding-skip" onClick={onSkip}>
          {intl.formatMessage({ id: 'onboarding.skip' })}
        </button>
      </div>
      <h2>{intl.formatMessage({ id: step.title })}</h2>
      <p>{intl.formatMessage({ id: step.body })}</p>
      <div className="onboarding-progress" aria-hidden="true">
        {ONBOARDING_STEPS.map((item, index) => (
          <span key={item.tab ?? item.title} className={index === stepIndex ? 'active' : ''} />
        ))}
      </div>
      <div className="onboarding-actions">
        <button type="button" className="onboarding-secondary" onClick={onBack} disabled={isFirst}>
          {intl.formatMessage({ id: 'onboarding.back' })}
        </button>
        <button type="button" className="onboarding-primary" onClick={onNext}>
          {intl.formatMessage({ id: isLast ? 'onboarding.done' : 'onboarding.next' })}
        </button>
      </div>
    </aside>
  )
}

function App() {
  const intl = useIntl()
  const isolationState = useMemo(() => getIsolationState(), [])
  const [tab, setTab] = useState<TabKey>('convert')
  const [showOnboarding, setShowOnboarding] = useState(
    () => isolationState.ok && !getStoredOnboardingComplete(),
  )
  const [onboardingStep, setOnboardingStep] = useState(0)
  const onboardingCardRef = useRef<HTMLElement | null>(null)
  const onboardingSpotlightRef = useRef<HTMLDivElement | null>(null)
  const activeTab = TAB_DETAILS[tab]

  useEffect(() => {
    if (!showOnboarding) {
      return
    }

    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        storeOnboardingComplete()
        setShowOnboarding(false)
      }
    }

    const positionTourTarget = (): void => {
      const step = ONBOARDING_STEPS[onboardingStep]
      const spotlight = onboardingSpotlightRef.current
      const card = onboardingCardRef.current
      if (!spotlight || !card) {
        return
      }

      if (!step.tab) {
        spotlight.style.opacity = '0'
        if (window.innerWidth <= 820) {
          card.style.removeProperty('top')
          card.style.removeProperty('left')
          card.style.removeProperty('right')
          return
        }

        card.style.top = '4.25rem'
        card.style.right = 'max(1rem, calc((100vw - var(--content-width)) / 2))'
        card.style.removeProperty('left')
        return
      }

      const target = document.querySelector<HTMLElement>(
        `[data-onboarding-target="${step.tab}"]`,
      )
      if (!target) {
        return
      }

      const rect = target.getBoundingClientRect()
      const padding = 10
      const highlightTop = Math.max(56, rect.top - padding)
      const visibleBottom = Math.min(window.innerHeight - 16, rect.bottom + padding)
      const highlightHeight = Math.max(
        96,
        Math.min(rect.height + padding * 2, visibleBottom - highlightTop, 560),
      )
      spotlight.style.opacity = '1'
      spotlight.style.transform = `translate(${Math.max(8, rect.left - padding)}px, ${highlightTop}px)`
      spotlight.style.width = `${Math.min(window.innerWidth - 16, rect.width + padding * 2)}px`
      spotlight.style.height = `${highlightHeight}px`

      if (window.innerWidth <= 820) {
        card.style.removeProperty('top')
        card.style.removeProperty('left')
        card.style.removeProperty('right')
        return
      }

      const cardRect = card.getBoundingClientRect()
      const left = Math.min(
        window.innerWidth - cardRect.width - 16,
        Math.max(16, rect.right - cardRect.width),
      )
      const top = Math.min(
        window.innerHeight - cardRect.height - 16,
        Math.max(64, rect.top - cardRect.height - 14),
      )
      card.style.left = `${left}px`
      card.style.top = `${top}px`
      card.style.right = 'auto'
    }

    const step = ONBOARDING_STEPS[onboardingStep]
    if (step.tab) {
      const target = document.querySelector<HTMLElement>(
        `[data-onboarding-target="${step.tab}"]`,
      )
      target?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }

    const positionTimeout = window.setTimeout(positionTourTarget, 260)
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', positionTourTarget)
    window.addEventListener('scroll', positionTourTarget, { passive: true })

    return () => {
      window.clearTimeout(positionTimeout)
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', positionTourTarget)
      window.removeEventListener('scroll', positionTourTarget)
    }
  }, [onboardingStep, showOnboarding])

  function reopenOnboarding(): void {
    setOnboardingStep(0)
    setShowOnboarding(true)
  }

  function closeOnboarding(complete: boolean): void {
    if (complete) {
      storeOnboardingComplete()
    }
    setShowOnboarding(false)
  }

  function goToOnboardingStep(next: number): void {
    const bounded = Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, next))
    setOnboardingStep(bounded)
    const nextTab = ONBOARDING_STEPS[bounded].tab
    if (nextTab) {
      setTab(nextTab)
    }
  }

  function advanceOnboarding(): void {
    if (onboardingStep >= ONBOARDING_STEPS.length - 1) {
      closeOnboarding(true)
      return
    }

    goToOnboardingStep(onboardingStep + 1)
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

          <div className="hero-signals" aria-label="Studio signals">
            {STUDIO_SIGNALS.map((signal) => (
              <article key={signal.value} className="signal-card">
                <strong>{intl.formatMessage({ id: signal.value as MessageId }, signal.values)}</strong>
                <span>{intl.formatMessage({ id: signal.label as MessageId })}</span>
              </article>
            ))}
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
          <div className="hero-note-grid">
            {QUICK_FACTS.map((note) => (
              <article key={note.title} className="hero-note-card">
                <h3>{intl.formatMessage({ id: note.title as MessageId })}</h3>
                <p>{intl.formatMessage({ id: note.body as MessageId })}</p>
              </article>
            ))}
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

        {showOnboarding && (
          <>
            <div ref={onboardingSpotlightRef} className="onboarding-spotlight" aria-hidden="true" />
            <OnboardingTour
              cardRef={onboardingCardRef}
              stepIndex={onboardingStep}
              onBack={() => goToOnboardingStep(onboardingStep - 1)}
              onNext={advanceOnboarding}
              onSkip={() => closeOnboarding(true)}
            />
          </>
        )}

        {trademarkDisclaimer}
      </main>
    </div>
  )
}

export default App
