import type { ReactNode } from 'react'
import { useIntl } from 'react-intl'
import {
  DEFAULT_APP_ID,
  DEFAULT_DELAY_SECONDS,
  MAX_DELAY_SECONDS,
  MIN_DELAY_SECONDS,
  SINGLE_SNIPPETS,
  STEAM_UPLOAD_URL,
  STEAM_VISIBILITIES,
  buildBatchSnippet,
  parseAppId,
  parseDelaySeconds,
  type SteamUploadType,
  type SteamVisibility,
} from '../../lib/steamSnippets'
import { useSteamHelpersContext, type SteamScriptKind } from '../../contexts/steamHelpersContext'
import type { MessageId } from '../../i18n/messages'

const UPLOAD_TYPES: SteamUploadType[] = ['workshop', 'featured', 'screenshot']

const TYPE_LABEL: Record<SteamUploadType, MessageId> = {
  workshop: 'steam.type.workshop',
  featured: 'steam.type.featured',
  screenshot: 'steam.type.screenshot',
}

const TYPE_DESCRIPTION: Record<SteamUploadType, MessageId> = {
  workshop: 'steam.type.workshop.desc',
  featured: 'steam.type.featured.desc',
  screenshot: 'steam.type.screenshot.desc',
}

const TYPE_EFFECT: Record<SteamUploadType, MessageId> = {
  workshop: 'steam.effect.workshop',
  featured: 'steam.effect.featured',
  screenshot: 'steam.effect.screenshot',
}

const BATCH_STEPS: MessageId[] = [
  'steam.batch.step.button',
  'steam.batch.step.order',
  'steam.batch.step.title',
  'steam.batch.step.direct',
  'steam.batch.step.result',
]

const SINGLE_STEPS: MessageId[] = [
  'steam.single.step.fill',
  'steam.single.step.finish',
  'steam.single.step.preview',
]

const VISIBILITY_LABEL: Record<SteamVisibility, MessageId> = {
  0: 'steam.settings.visibility.public',
  1: 'steam.settings.visibility.friends',
  2: 'steam.settings.visibility.private',
  3: 'steam.settings.visibility.unlisted',
}

const ISSUE_URL = 'https://github.com/lannahirave/steam-artwork-simplifier/issues/new'

const RUN_STEPS: MessageId[] = [
  'steam.run.console',
  'steam.run.allow',
  'steam.run.paste',
]

const richText = {
  code: (chunks: ReactNode[]) => <code>{chunks}</code>,
  kbd: (chunks: ReactNode[]) => <kbd>{chunks}</kbd>,
}

interface ScriptCardProps {
  kind: SteamScriptKind
  title: string
  lead: string
  steps: ReactNode[]
  script: string
  copyLabel: string
  primary?: boolean
  settings?: ReactNode
  copyBlockedReason?: string
}

function ScriptCard(props: ScriptCardProps) {
  const intl = useIntl()
  const { kind, title, lead, steps, script, copyLabel, primary, settings, copyBlockedReason } = props
  const { state, actions } = useSteamHelpersContext()
  const status = state.copyStatus?.kind === kind ? state.copyStatus : null
  const headingId = `steam-script-${kind}`

  return (
    <article className={`steam-script${primary ? ' steam-script-primary' : ''}`} aria-labelledby={headingId}>
      <header className="steam-script-head">
        <h3 id={headingId}>{title}</h3>
        <p>{lead}</p>
      </header>
      <h4>{intl.formatMessage({ id: 'steam.whatItDoes' })}</h4>
      <ul className="steam-script-steps">
        {steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ul>
      {settings}
      <div className="steam-script-actions">
        <button
          type="button"
          className={primary ? 'action-primary' : undefined}
          disabled={Boolean(copyBlockedReason)}
          onClick={() => actions.onCopyScript(kind, script)}
        >
          {copyLabel}
        </button>
        <p
          className={`steam-copy-status${status?.type === 'error' || copyBlockedReason ? ' is-error' : ''}`}
          role="status"
        >
          {copyBlockedReason}
          {!copyBlockedReason && status?.type === 'success' && intl.formatMessage({ id: 'steam.copyStatus' })}
          {!copyBlockedReason && status?.type === 'error' && intl.formatMessage({ id: 'steam.copyFailed' })}
        </p>
      </div>
      <details className="steam-script-code" open={status?.type === 'error' || undefined}>
        <summary>{intl.formatMessage({ id: 'steam.viewScript' })}</summary>
        <pre tabIndex={0}>
          <code>{script}</code>
        </pre>
      </details>
    </article>
  )
}

interface SteamHelpersPanelProps {
  onboardingTarget?: string
}

export function SteamHelpersPanel(props: SteamHelpersPanelProps) {
  const intl = useIntl()
  const { onboardingTarget } = props
  const { state, actions } = useSteamHelpersContext()
  const { uploadType, batchInputs, batchInputsAreDefault } = state

  const appId = parseAppId(batchInputs.appId)
  const delaySeconds = parseDelaySeconds(batchInputs.delaySeconds)
  const settingsValid = appId !== null && delaySeconds !== null
  const effectiveAppId = appId ?? DEFAULT_APP_ID[uploadType]
  const effectiveDelay = delaySeconds ?? DEFAULT_DELAY_SECONDS
  const visibilityLabel = intl.formatMessage({ id: VISIBILITY_LABEL[batchInputs.visibility] })

  const chooseLabel = intl.formatMessage({ id: 'steam.batch.button' })
  const batchScript = buildBatchSnippet(
    uploadType,
    { appId: effectiveAppId, visibility: batchInputs.visibility, delayMs: effectiveDelay * 1000 },
    {
      choose: chooseLabel,
      progress: intl.formatMessage({ id: 'steam.batch.progress' }),
      done: intl.formatMessage({ id: 'steam.batch.done' }),
      wrongPage: intl.formatMessage({ id: 'steam.batch.wrongPage' }),
    },
  )
  const batchEffect = intl.formatMessage({ id: TYPE_EFFECT[uploadType] }, { ...richText, appId: String(effectiveAppId) })
  const singleEffect = intl.formatMessage(
    { id: TYPE_EFFECT[uploadType] },
    { ...richText, appId: String(DEFAULT_APP_ID[uploadType]) },
  )

  const settings = (
    <fieldset className="steam-settings">
      <legend>{intl.formatMessage({ id: 'steam.settings.title' })}</legend>
      <div className="steam-settings-grid">
        <label className="steam-setting">
          <span className="steam-setting-label">{intl.formatMessage({ id: 'steam.settings.appId' })}</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            value={batchInputs.appId}
            aria-invalid={appId === null || undefined}
            aria-describedby="steam-setting-appid-note"
            onChange={(event) => actions.onChangeAppId(event.target.value)}
          />
          <span id="steam-setting-appid-note" className={`steam-setting-note${appId === null ? ' is-error' : ''}`}>
            {appId === null
              ? intl.formatMessage({ id: 'steam.settings.appId.invalid' })
              : intl.formatMessage(
                  {
                    id:
                      uploadType === 'workshop'
                        ? 'steam.settings.appId.note.workshop'
                        : 'steam.settings.appId.note.other',
                  },
                  { appId: String(DEFAULT_APP_ID[uploadType]) },
                )}
          </span>
        </label>
        <label className="steam-setting">
          <span className="steam-setting-label">{intl.formatMessage({ id: 'steam.settings.visibility' })}</span>
          <select
            value={batchInputs.visibility}
            aria-describedby="steam-setting-visibility-note"
            onChange={(event) => actions.onChangeVisibility(Number(event.target.value) as SteamVisibility)}
          >
            {STEAM_VISIBILITIES.map((option) => (
              <option key={option} value={option}>
                {intl.formatMessage({ id: VISIBILITY_LABEL[option] })}
              </option>
            ))}
          </select>
          <span id="steam-setting-visibility-note" className="steam-setting-note">
            {intl.formatMessage({ id: 'steam.settings.visibility.note' })}
          </span>
        </label>
        <label className="steam-setting">
          <span className="steam-setting-label">{intl.formatMessage({ id: 'steam.settings.delay' })}</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={batchInputs.delaySeconds}
            aria-invalid={delaySeconds === null || undefined}
            aria-describedby="steam-setting-delay-note"
            onChange={(event) => actions.onChangeDelaySeconds(event.target.value)}
          />
          <span
            id="steam-setting-delay-note"
            className={`steam-setting-note${delaySeconds === null ? ' is-error' : ''}`}
          >
            {intl.formatMessage(
              { id: delaySeconds === null ? 'steam.settings.delay.invalid' : 'steam.settings.delay.note' },
              { min: MIN_DELAY_SECONDS, max: MAX_DELAY_SECONDS, seconds: DEFAULT_DELAY_SECONDS },
            )}
          </span>
        </label>
      </div>
      <button
        type="button"
        className="steam-settings-reset"
        disabled={batchInputsAreDefault}
        onClick={actions.onResetBatchInputs}
      >
        {intl.formatMessage({ id: 'steam.settings.reset' })}
      </button>
    </fieldset>
  )

  return (
    <section className="panel panel-steam" data-onboarding-target={onboardingTarget}>
      <h2>{intl.formatMessage({ id: 'steam.title' })}</h2>
      <p className="panel-intro">{intl.formatMessage({ id: 'steam.intro' })}</p>

      <aside className="steam-paste-note" aria-labelledby="steam-paste-title">
        <span className="steam-paste-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
            <rect x="5.5" y="4.5" width="13" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M9 4.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v.5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12 9.5v4.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="16.6" r="1.05" fill="currentColor" />
          </svg>
        </span>
        <div className="steam-paste-content">
          <h3 id="steam-paste-title">{intl.formatMessage({ id: 'steam.paste.title' }, richText)}</h3>
          <p>{intl.formatMessage({ id: 'steam.paste.body' }, richText)}</p>
          <p className="steam-paste-safety">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
              <path
                d="M8 1.5 2.75 3.4v4.1c0 3.1 2.2 5.8 5.25 7 3.05-1.2 5.25-3.9 5.25-7V3.4L8 1.5Z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
              <path d="m5.6 8 1.7 1.7 3.1-3.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{intl.formatMessage({ id: 'steam.paste.safety' })}</span>
          </p>
        </div>
      </aside>

      <div className="steam-setup">
        <section className="steam-run" aria-labelledby="steam-run-title">
          <h3 id="steam-run-title">{intl.formatMessage({ id: 'steam.run.title' })}</h3>
          <ol className="steam-run-steps">
            <li>
              {intl.formatMessage({ id: 'steam.run.open' })}{' '}
              <a href={STEAM_UPLOAD_URL} target="_blank" rel="noreferrer">
                {intl.formatMessage({ id: 'steam.openUpload' })}
              </a>
            </li>
            {RUN_STEPS.map((id) => (
              <li key={id}>{intl.formatMessage({ id }, richText)}</li>
            ))}
          </ol>
        </section>

        <fieldset className="steam-type">
          <legend>{intl.formatMessage({ id: 'steam.type.legend' })}</legend>
          <div className="steam-type-options">
            {UPLOAD_TYPES.map((type) => (
              <label key={type} className="steam-type-option">
                <input
                  type="radio"
                  name="steam-upload-type"
                  value={type}
                  checked={uploadType === type}
                  onChange={() => actions.onSelectUploadType(type)}
                />
                <span className="steam-type-name">{intl.formatMessage({ id: TYPE_LABEL[type] })}</span>
                <span className="steam-type-desc">{intl.formatMessage({ id: TYPE_DESCRIPTION[type] })}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="steam-scripts">
        <ScriptCard
          kind="batch"
          primary
          title={intl.formatMessage({ id: 'steam.batch.title' })}
          lead={intl.formatMessage({ id: 'steam.batch.lead' })}
          steps={[
            intl.formatMessage({ id: BATCH_STEPS[0] }, { button: chooseLabel }),
            intl.formatMessage({ id: BATCH_STEPS[1] }, { seconds: effectiveDelay }),
            batchEffect,
            intl.formatMessage({ id: BATCH_STEPS[2] }, { visibility: visibilityLabel }),
            ...BATCH_STEPS.slice(3).map((id) => intl.formatMessage({ id })),
          ]}
          script={batchScript}
          settings={settings}
          copyBlockedReason={settingsValid ? undefined : intl.formatMessage({ id: 'steam.settings.invalid' })}
          copyLabel={intl.formatMessage({ id: 'steam.batch.copy' })}
        />
        <ScriptCard
          kind="single"
          title={intl.formatMessage({ id: 'steam.single.title' })}
          lead={intl.formatMessage({ id: 'steam.single.lead' })}
          steps={[singleEffect, ...SINGLE_STEPS.map((id) => intl.formatMessage({ id }))]}
          script={SINGLE_SNIPPETS[uploadType]}
          copyLabel={intl.formatMessage({ id: 'steam.single.copy' })}
        />
      </div>

      <p className="steam-footnote">
        {intl.formatMessage(
          { id: 'steam.footnote' },
          {
            link: (chunks: ReactNode[]) => (
              <a href={ISSUE_URL} target="_blank" rel="noreferrer">
                {chunks}
              </a>
            ),
          },
        )}
      </p>
    </section>
  )
}
