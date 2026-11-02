import { useEffect, useRef, useState } from 'react'
import { useIntl } from 'react-intl'
import type { TabKey } from '../agents/appAgents'
import type { MessageId } from '../i18n/messages'
import { storeOnboardingComplete } from '../onboardingStorage'

/**
 * The tour follows the job, not the tabs: choose a layout, add a source, preview it on a Steam
 * profile, upload. It stays on the Convert tab the whole time and points at real controls
 * (`data-onboarding-target`): two fields in the Convert form, then two buttons in the header.
 */
const ONBOARDING_STEPS: Array<{
  target: string
  title: MessageId
  body: MessageId
}> = [
  { target: 'preset', title: 'onboarding.preset.title', body: 'onboarding.preset.body' },
  { target: 'source', title: 'onboarding.source.title', body: 'onboarding.source.body' },
  { target: 'nav-library', title: 'onboarding.preview.title', body: 'onboarding.preview.body' },
  { target: 'nav-steam', title: 'onboarding.upload.title', body: 'onboarding.upload.body' },
]

/** Space kept between the highlighted control and the card, and around the highlight. */
const CARD_GAP = 12
const SPOTLIGHT_PADDING = 8
/** At or below this width the card is pinned to the bottom of the screen by CSS. */
const MOBILE_BREAKPOINT = 820

function queryTarget(name: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-onboarding-target="${name}"]`)
}

/** On narrow screens the header tabs are folded into the menu, so their steps point at its button. */
function findTarget(name: string): HTMLElement | null {
  const target = queryTarget(name)
  if (target && target.getClientRects().length === 0 && name.startsWith('nav-')) {
    return queryTarget('nav-menu') ?? target
  }
  return target
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** Bottom edge of the sticky header, measured so the tour never parks a control underneath it. */
function headerBottom(): number {
  return document.querySelector('.global-nav')?.getBoundingClientRect().bottom ?? 0
}

/** Brings a step's control into view. Header buttons stay put vertically; form fields scroll. */
function revealTarget(target: HTMLElement): void {
  const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth'
  if (target.closest('.global-nav')) {
    // The header is sticky; on narrow screens its tab row scrolls sideways.
    target.scrollIntoView({ behavior, block: 'nearest', inline: 'center' })
    return
  }

  const rect = target.getBoundingClientRect()
  const top = headerBottom()
  // On phones the card covers the bottom of the screen, so place the control just below the header.
  const lead = window.innerWidth <= MOBILE_BREAKPOINT ? 16 : Math.max(24, (window.innerHeight - top) * 0.2)
  window.scrollTo({ top: Math.max(0, rect.top + window.scrollY - top - lead), behavior })
}

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

  // Every step points at the Convert tab or the header, so the tour always runs on Convert.
  useEffect(() => {
    if (open) {
      onSelectTab('convert')
    }
  }, [open, onSelectTab])

  function close(): void {
    storeOnboardingComplete()
    onOpenChange(false)
  }

  /** Done hands the user straight to the first real action: picking a source file. */
  function finish(): void {
    close()
    const input = findTarget('source')?.querySelector<HTMLInputElement>('input[type="file"]')
    if (input) {
      revealTarget(input)
      input.focus({ preventScroll: true })
    }
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

    const position = (): void => {
      const spotlight = spotlightRef.current
      const card = cardRef.current
      const target = findTarget(ONBOARDING_STEPS[stepIndex].target)
      if (!spotlight || !card || !target) {
        if (spotlight) spotlight.style.opacity = '0'
        return
      }

      const rect = target.getBoundingClientRect()
      spotlight.style.opacity = '1'
      spotlight.style.transform = `translate(${rect.left - SPOTLIGHT_PADDING}px, ${rect.top - SPOTLIGHT_PADDING}px)`
      spotlight.style.width = `${rect.width + SPOTLIGHT_PADDING * 2}px`
      spotlight.style.height = `${rect.height + SPOTLIGHT_PADDING * 2}px`

      if (window.innerWidth <= MOBILE_BREAKPOINT) {
        card.style.removeProperty('top')
        card.style.removeProperty('left')
        card.style.removeProperty('right')
        return
      }

      // Below the control when it fits, otherwise above it; never on top of it.
      const cardRect = card.getBoundingClientRect()
      const highlightBottom = rect.bottom + SPOTLIGHT_PADDING
      const highlightTop = rect.top - SPOTLIGHT_PADDING
      const below = highlightBottom + CARD_GAP
      const above = highlightTop - CARD_GAP - cardRect.height
      const top =
        below + cardRect.height <= window.innerHeight - 16 || above < headerBottom() + 8
          ? below
          : above
      const left = Math.min(window.innerWidth - cardRect.width - 16, Math.max(16, rect.left - SPOTLIGHT_PADDING))
      card.style.top = `${top}px`
      card.style.left = `${left}px`
      card.style.right = 'auto'
    }

    const target = findTarget(step.target)
    if (target) {
      revealTarget(target)
    }

    position()
    const settle = window.setTimeout(position, prefersReducedMotion() ? 0 : 320)
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, { passive: true, capture: true })

    return () => {
      window.clearTimeout(settle)
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, { capture: true })
    }
  }, [open, onOpenChange, step.target, stepIndex])

  function goToStep(next: number): void {
    setStepIndex(Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, next)))
  }

  if (!open) {
    return null
  }

  return (
    <>
      <div ref={spotlightRef} className="onboarding-spotlight" aria-hidden="true" />
      <aside ref={cardRef} className="onboarding-card" aria-live="polite" aria-label="Onboarding guide">
        <div className="onboarding-card-head">
          <h2>{intl.formatMessage({ id: step.title })}</h2>
          <button type="button" className="onboarding-skip" onClick={close}>
            {intl.formatMessage({ id: 'onboarding.skip' })}
          </button>
        </div>
        <p>{intl.formatMessage({ id: step.body })}</p>
        <div className="onboarding-progress" aria-hidden="true">
          {ONBOARDING_STEPS.map((item, index) => (
            <span key={item.target} className={index <= stepIndex ? 'active' : ''} />
          ))}
        </div>
        <div className="onboarding-actions">
          <span className="onboarding-count">
            {intl.formatMessage(
              { id: 'onboarding.step' },
              { current: stepIndex + 1, total: ONBOARDING_STEPS.length },
            )}
          </span>
          <div className="onboarding-buttons">
            {!isFirst && (
              <button type="button" className="onboarding-secondary" onClick={() => goToStep(stepIndex - 1)}>
                {intl.formatMessage({ id: 'onboarding.back' })}
              </button>
            )}
            <button
              type="button"
              className="onboarding-primary"
              onClick={isLast ? finish : () => goToStep(stepIndex + 1)}
            >
              {intl.formatMessage({ id: isLast ? 'onboarding.done' : 'onboarding.next' })}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
