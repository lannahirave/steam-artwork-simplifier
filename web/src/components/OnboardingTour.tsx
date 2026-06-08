import { useEffect, useRef, useState } from 'react'
import { useIntl } from 'react-intl'
import type { TabKey } from '../agents/appAgents'
import type { MessageId } from '../i18n/messages'
import { storeOnboardingComplete } from '../onboardingStorage'

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
const TOUR_SCROLL_TOP_OFFSET = 76

interface OnboardingTourProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectTab: (tab: TabKey) => void
}

export function OnboardingTour(props: OnboardingTourProps) {
  const intl = useIntl()
  const { open, onOpenChange, onSelectTab } = props
  const [stepIndex, setStepIndex] = useState(0)
  const cardRef = useRef<HTMLElement | null>(null)
  const spotlightRef = useRef<HTMLDivElement | null>(null)
  const step = ONBOARDING_STEPS[stepIndex]
  const isFirst = stepIndex === 0
  const isLast = stepIndex === ONBOARDING_STEPS.length - 1

  function close(complete: boolean): void {
    if (complete) {
      storeOnboardingComplete()
    }
    onOpenChange(false)
  }

  useEffect(() => {
    if (!open) {
      return
    }

    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        storeOnboardingComplete()
        onOpenChange(false)
      }
    }

    const positionTourTarget = (): void => {
      const currentStep = ONBOARDING_STEPS[stepIndex]
      const spotlight = spotlightRef.current
      const card = cardRef.current
      if (!spotlight || !card) {
        return
      }

      if (!currentStep.tab) {
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
        `[data-onboarding-target="${currentStep.tab}"]`,
      )
      if (!target) {
        return
      }

      const rect = target.getBoundingClientRect()
      const padding = 10
      const highlightTop = Math.max(56, rect.top - padding)
      const visibleBottom = Math.min(window.innerHeight - 16, rect.bottom + padding)
      const highlightHeight = Math.max(96, visibleBottom - highlightTop)
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

    if (step.tab) {
      const target = document.querySelector<HTMLElement>(
        `[data-onboarding-target="${step.tab}"]`,
      )
      if (target) {
        const targetTop = target.getBoundingClientRect().top + window.scrollY - TOUR_SCROLL_TOP_OFFSET
        window.scrollTo({
          top: Math.max(0, targetTop),
          behavior: 'smooth',
        })
      }
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
  }, [open, onOpenChange, step.tab, stepIndex])

  function goToStep(next: number): void {
    const bounded = Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, next))
    setStepIndex(bounded)
    const nextTab = ONBOARDING_STEPS[bounded].tab
    if (nextTab) {
      onSelectTab(nextTab)
    }
  }

  function advance(): void {
    if (stepIndex >= ONBOARDING_STEPS.length - 1) {
      close(true)
      return
    }

    goToStep(stepIndex + 1)
  }

  if (!open) {
    return null
  }

  return (
    <>
      <div ref={spotlightRef} className="onboarding-spotlight" aria-hidden="true" />
      <aside ref={cardRef} className="onboarding-card" aria-live="polite" aria-label="Onboarding guide">
        <div className="onboarding-card-head">
          <span className="onboarding-kicker">
            {intl.formatMessage(
              { id: 'onboarding.step' },
              { current: stepIndex + 1, total: ONBOARDING_STEPS.length },
            )}
          </span>
          <button type="button" className="onboarding-skip" onClick={() => close(true)}>
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
          <button type="button" className="onboarding-secondary" onClick={() => goToStep(stepIndex - 1)} disabled={isFirst}>
            {intl.formatMessage({ id: 'onboarding.back' })}
          </button>
          <button type="button" className="onboarding-primary" onClick={advance}>
            {intl.formatMessage({ id: isLast ? 'onboarding.done' : 'onboarding.next' })}
          </button>
        </div>
      </aside>
    </>
  )
}
