import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useIntl } from 'react-intl'
import type { TabKey } from '../agents/appAgents'
import type { MessageId } from '../i18n/messages'
import { storeOnboardingComplete } from '../onboardingStorage'
import { Button } from './ui/Button'

/**
 * The tour follows the job: choose a layout, add a clip, fit it in Edit source, then the tabs that come
 * after a conversion. It stays on the Convert tab and points at real controls (`data-onboarding-target`).
 *
 * - `source` waits until a clip is loaded (a file or Use sample clip), then moves on by itself.
 * - `edit` waits for Edit source to open, and its primary button opens it.
 * - `editor` steps run inside the Edit source dialog. Closing the dialog moves on to the tabs.
 */
type StepId =
  | 'preset'
  | 'source'
  | 'edit'
  | 'editor-crop'
  | 'editor-trim'
  | 'editor-actions'
  | 'library'
  | 'patch'
  | 'steam'
  | 'guides'

interface TourStep {
  id: StepId
  target: string
  title: MessageId
  body: MessageId
  /** Shown inside the Edit source dialog. */
  inEditor?: boolean
}

const STEPS: TourStep[] = [
  { id: 'preset', target: 'preset', title: 'onboarding.preset.title', body: 'onboarding.preset.body' },
  { id: 'source', target: 'source', title: 'onboarding.source.title', body: 'onboarding.source.body' },
  { id: 'edit', target: 'source-preview', title: 'onboarding.sourceReady.title', body: 'onboarding.sourceReady.body' },
  {
    id: 'editor-crop',
    target: 'editor-crop',
    title: 'onboarding.editorCrop.title',
    body: 'onboarding.editorCrop.body',
    inEditor: true,
  },
  {
    id: 'editor-trim',
    target: 'editor-trim',
    title: 'onboarding.editorTrim.title',
    body: 'onboarding.editorTrim.body',
    inEditor: true,
  },
  {
    id: 'editor-actions',
    target: 'editor-actions',
    title: 'onboarding.editorActions.title',
    body: 'onboarding.editorActions.body',
    inEditor: true,
  },
  { id: 'library', target: 'nav-library', title: 'onboarding.preview.title', body: 'onboarding.preview.body' },
  { id: 'patch', target: 'nav-patch', title: 'onboarding.patch.title', body: 'onboarding.patch.body' },
  { id: 'steam', target: 'nav-steam', title: 'onboarding.upload.title', body: 'onboarding.upload.body' },
  { id: 'guides', target: 'nav-guides', title: 'onboarding.guides.title', body: 'onboarding.guides.body' },
]

const FIRST_TAB_STEP: StepId = 'library'

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

function openEditorDialog(): HTMLDialogElement | null {
  return document.querySelector<HTMLDialogElement>('dialog.source-editor[open]')
}

function clickAction(name: string): void {
  openEditorDialog()?.querySelector<HTMLButtonElement>(`[data-onboarding-action="${name}"]`)?.click()
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** Bottom edge of the sticky header, measured so the tour never parks a control underneath it. */
function headerBottom(): number {
  return document.querySelector('.global-nav')?.getBoundingClientRect().bottom ?? 0
}

/** Brings a step's control into view. Header buttons stay put vertically; form fields scroll. */
function revealTarget(target: HTMLElement, roomAbove = 0): void {
  const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth'
  if (target.closest('.global-nav')) {
    // The header is sticky; on narrow screens its tab row scrolls sideways.
    target.scrollIntoView({ behavior, block: 'nearest', inline: 'center' })
    return
  }

  const rect = target.getBoundingClientRect()
  const top = headerBottom()
  // On phones the card covers the bottom of the screen, so place the control just below the header.
  const lead =
    window.innerWidth <= MOBILE_BREAKPOINT
      ? 16
      : Math.max(24, roomAbove, (window.innerHeight - top) * 0.2)
  window.scrollTo({ top: Math.max(0, rect.top + window.scrollY - top - lead), behavior })
}

/**
 * Inside Edit source the card is docked to the bottom of the dialog (CSS, sticky), so the control is
 * scrolled up to the top of the dialog, clear of the card.
 */
function revealInEditor(dialog: HTMLDialogElement, target: HTMLElement): void {
  const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth'
  const offset = target.getBoundingClientRect().top - dialog.getBoundingClientRect().top
  dialog.scrollTo({ top: Math.max(0, dialog.scrollTop + offset - CARD_GAP - SPOTLIGHT_PADDING), behavior })
}

interface OnboardingTourProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectTab: (tab: TabKey) => void
}

export function OnboardingTour(props: OnboardingTourProps) {
  const intl = useIntl()
  const { open, onOpenChange, onSelectTab } = props
  const [stepId, setStepId] = useState<StepId>('preset')
  /** Read out by the live region when the step changes; empty on open, where focus does the job. */
  const [announcement, setAnnouncement] = useState('')
  const cardRef = useRef<HTMLElement | null>(null)
  const spotlightRef = useRef<HTMLDivElement | null>(null)
  const primaryRef = useRef<HTMLButtonElement | null>(null)
  /** Whatever had focus when the tour opened (usually Help), so Skip and Escape can hand it back. */
  const openerRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const bodyId = useId()

  /** What the page shows right now, kept in sync by a MutationObserver. */
  const [sourceReady, setSourceReady] = useState(false)
  const [sourceIsVideo, setSourceIsVideo] = useState(true)
  const [canEdit, setCanEdit] = useState(false)
  const [editorDialog, setEditorDialog] = useState<HTMLDialogElement | null>(null)
  const editorOpen = editorDialog !== null

  // A still image has nothing to trim, so its tour has one step fewer.
  const steps = STEPS.filter((item) => item.id !== 'editor-trim' || sourceIsVideo)
  const stepIndex = Math.max(0, steps.findIndex((item) => item.id === stepId))
  const step = steps[stepIndex]
  const docked = Boolean(step.inEditor && editorDialog)
  const cardAbove = step.id === 'edit'
  const isFirst = stepIndex === 0
  const isLast = stepIndex === steps.length - 1

  // Every step points at the Convert tab or the header, so the tour always runs on Convert.
  useEffect(() => {
    if (open) {
      onSelectTab('convert')
    }
  }, [open, onSelectTab])

  // Opening moves focus into the card, which reads its title and text to screen readers.
  useEffect(() => {
    if (!open) {
      return
    }
    const active = document.activeElement
    // Effects can run twice (StrictMode); never record the card itself as the opener.
    if (active instanceof HTMLElement && active !== document.body && !cardRef.current?.contains(active)) {
      openerRef.current = active
    }
    cardRef.current?.focus({ preventScroll: true })
  }, [open])

  // The card moves into the Edit source dialog and back out (a remount), so focus follows it there.
  useEffect(() => {
    if (open) {
      cardRef.current?.focus({ preventScroll: true })
    }
  }, [open, docked])

  // Watch for a clip being added or cleared, and for Edit source opening and closing.
  useEffect(() => {
    if (!open) {
      return
    }
    const sync = (): void => {
      const preview = queryTarget('source-preview')
      setSourceReady(preview !== null)
      if (preview) {
        setSourceIsVideo(preview.querySelector('video') !== null)
      }
      setCanEdit(queryTarget('edit-source')?.hasAttribute('disabled') === false)
      setEditorDialog(openEditorDialog())
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.querySelector('main') ?? document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'disabled'],
    })
    return () => observer.disconnect()
  }, [open])

  function announce(next: StepId, list = steps): void {
    const index = list.findIndex((item) => item.id === next)
    const target = list[index]
    if (!target) {
      return
    }
    setAnnouncement(
      `${intl.formatMessage({ id: 'onboarding.step' }, { current: index + 1, total: list.length })}. ${intl.formatMessage({
        id: target.title,
      })}. ${intl.formatMessage({ id: target.body })}`,
    )
  }

  function goTo(next: StepId): void {
    const backHadFocus = document.activeElement?.classList.contains('onboarding-secondary') ?? false
    setStepId(next)
    announce(next)
    // Back disappears on the first step; keep keyboard focus in the card instead of losing it.
    if (next === steps[0].id && backHadFocus) {
      window.requestAnimationFrame(() => primaryRef.current?.focus())
    }
  }

  /** Where Back and the dialog closing should land; set before the tour closes the dialog itself. */
  const afterEditorRef = useRef<StepId | null>(null)

  // The tour waits for the user: a loaded clip moves Add your clip on, an open editor moves Make it fit on,
  // and a closed editor (Apply, Cancel or Escape) moves on to the tabs.
  const previous = useRef({ sourceReady, editorOpen })
  useEffect(() => {
    const was = previous.current
    previous.current = { sourceReady, editorOpen }
    if (!open) {
      return
    }
    if (stepId === 'source' && sourceReady && !was.sourceReady) {
      goTo('edit')
    } else if (stepId === 'edit' && editorOpen && !was.editorOpen) {
      goTo('editor-crop')
    } else if (step.inEditor && !editorOpen) {
      const next = afterEditorRef.current ?? FIRST_TAB_STEP
      afterEditorRef.current = null
      goTo(next)
    } else if (stepId === 'edit' && !sourceReady) {
      goTo('source')
    }
    // goTo only reads state that is listed here.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [open, stepId, sourceReady, editorOpen])

  function restoreFocus(): void {
    const opener = openerRef.current
    if (opener?.isConnected && opener.getClientRects().length > 0) {
      opener.focus({ preventScroll: true })
    }
  }

  function close(): void {
    storeOnboardingComplete()
    onOpenChange(false)
    restoreFocus()
  }

  /** Done hands the user to the next real action: Run Conversion once a clip is in, else the file picker. */
  function finish(): void {
    close()
    const run = queryTarget('run')
    const input = findTarget('source')?.querySelector<HTMLInputElement>('input[type="file"]')
    const next = run && !run.hasAttribute('disabled') ? run : input
    if (next) {
      revealTarget(next)
      next.focus({ preventScroll: true })
    }
  }

  function goNext(): void {
    if (step.id === 'edit') {
      if (canEdit) {
        // The step moves on when the dialog opens.
        queryTarget('edit-source')?.click()
      } else {
        goTo(FIRST_TAB_STEP)
      }
      return
    }
    if (step.id === 'editor-actions') {
      afterEditorRef.current = FIRST_TAB_STEP
      clickAction('editor-apply')
      return
    }
    goTo(steps[stepIndex + 1].id)
  }

  function goBack(): void {
    const prior = steps[stepIndex - 1]
    if (!prior) {
      return
    }
    // Leaving the editor from its first step closes it without keeping changes.
    if (step.inEditor && !prior.inEditor) {
      afterEditorRef.current = prior.id
      clickAction('editor-cancel')
      return
    }
    // Coming back from the tabs with the editor closed skips its steps.
    if (prior.inEditor && !editorOpen) {
      goTo('edit')
      return
    }
    goTo(prior.id)
  }

  useEffect(() => {
    if (!open) {
      return
    }

    const closeOnEscape = (event: KeyboardEvent): void => {
      // The phone menu and the source editor dialog handle their own Escape first.
      if (
        event.key === 'Escape' &&
        !document.querySelector('.global-nav-menu.open') &&
        !document.querySelector('dialog[open]')
      ) {
        storeOnboardingComplete()
        onOpenChange(false)
        restoreFocus()
      }
    }

    const position = (): void => {
      const spotlight = spotlightRef.current
      const card = cardRef.current
      const target = findTarget(step.target)
      if (!spotlight || !card || !target) {
        if (spotlight) spotlight.style.opacity = '0'
        return
      }

      const rect = target.getBoundingClientRect()
      spotlight.style.opacity = '1'
      spotlight.style.transform = `translate(${rect.left - SPOTLIGHT_PADDING}px, ${rect.top - SPOTLIGHT_PADDING}px)`
      spotlight.style.width = `${rect.width + SPOTLIGHT_PADDING * 2}px`
      spotlight.style.height = `${rect.height + SPOTLIGHT_PADDING * 2}px`

      // Docked in the editor, or pinned to the bottom on phones: CSS places the card.
      if (docked || window.innerWidth <= MOBILE_BREAKPOINT) {
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
      const fitsAbove = above >= headerBottom() + 8
      const fitsBelow = below + cardRect.height <= window.innerHeight - 16
      const top = cardAbove ? (fitsAbove || !fitsBelow ? above : below) : fitsBelow || !fitsAbove ? below : above
      const left = Math.min(window.innerWidth - cardRect.width - 16, Math.max(16, rect.left - SPOTLIGHT_PADDING))
      card.style.top = `${top}px`
      card.style.left = `${left}px`
      card.style.right = 'auto'
    }

    const target = findTarget(step.target)
    if (target && docked && editorDialog) {
      revealInEditor(editorDialog, target)
    } else if (target) {
      // A card placed above the control needs that much clear space under the header.
      const roomAbove = cardAbove
        ? (cardRef.current?.getBoundingClientRect().height ?? 0) + CARD_GAP + SPOTLIGHT_PADDING + 24
        : 0
      revealTarget(target, roomAbove)
    }

    position()
    // The trim controls appear once the video's length is known, and media can resize the dialog.
    const settle = window.setTimeout(position, prefersReducedMotion() ? 0 : 320)
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position)
    if (target) resizeObserver?.observe(target)
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, { passive: true, capture: true })

    return () => {
      window.clearTimeout(settle)
      resizeObserver?.disconnect()
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, { capture: true })
    }
  }, [open, onOpenChange, step.target, cardAbove, docked, editorDialog, sourceReady])

  if (!open) {
    return null
  }

  const waitingForSource = step.id === 'source' && !sourceReady
  let primaryLabel: MessageId = 'onboarding.next'
  if (isLast) primaryLabel = 'onboarding.done'
  else if (waitingForSource) primaryLabel = 'onboarding.source.waiting'
  else if (step.id === 'edit' && canEdit) primaryLabel = 'onboarding.openEditor'
  else if (step.id === 'editor-actions') primaryLabel = 'onboarding.applyContinue'

  const layers = (
    <>
      <div ref={spotlightRef} className="onboarding-spotlight" aria-hidden="true" />
      <aside
        ref={cardRef}
        className={docked ? 'onboarding-card is-docked' : 'onboarding-card'}
        tabIndex={-1}
        aria-label={intl.formatMessage({ id: 'onboarding.label' })}
        aria-describedby={`${titleId} ${bodyId}`}
      >
        <span className="visually-hidden" aria-live="polite">
          {announcement}
        </span>
        <div className="onboarding-card-head">
          <h2 id={titleId}>{intl.formatMessage({ id: step.title })}</h2>
          <Button variant="quiet" size="medium" className="onboarding-skip" onClick={close}>
            {intl.formatMessage({ id: 'onboarding.skip' })}
          </Button>
        </div>
        <p id={bodyId}>{intl.formatMessage({ id: step.body })}</p>
        <div className="onboarding-progress" aria-hidden="true">
          {steps.map((item, index) => (
            <span key={item.id} className={index <= stepIndex ? 'active' : ''} />
          ))}
        </div>
        <div className="onboarding-actions">
          <span className="onboarding-count">
            {intl.formatMessage({ id: 'onboarding.step' }, { current: stepIndex + 1, total: steps.length })}
          </span>
          <div className="onboarding-buttons">
            {!isFirst && (
              <Button size="medium" className="onboarding-secondary" onClick={goBack}>
                {intl.formatMessage({ id: 'onboarding.back' })}
              </Button>
            )}
            <Button
              ref={primaryRef}
              variant="primary"
              size="medium"
              disabled={waitingForSource}
              onClick={isLast ? finish : goNext}
            >
              {intl.formatMessage({ id: primaryLabel })}
            </Button>
          </div>
        </div>
      </aside>
    </>
  )

  // A modal dialog makes the rest of the page inert, so inside Edit source the tour lives in the dialog.
  return docked && editorDialog ? createPortal(layers, editorDialog) : layers
}
