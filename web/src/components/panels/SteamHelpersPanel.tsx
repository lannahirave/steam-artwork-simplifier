import { useIntl } from 'react-intl'
import {
  FEATURED_SNIPPET,
  SCREENSHOT_SNIPPET,
  STEAM_HELPER_NOTES,
  WORKSHOP_SNIPPET,
} from '../../lib/steamSnippets'
import { useSteamHelpersContext } from '../../contexts/steamHelpersContext'

const WORKSHOP_UPLOAD_URL = 'https://steamcommunity.com/sharedfiles/edititem/767/3/#'
const ARTWORK_UPLOAD_URL = 'https://steamcommunity.com/sharedfiles/edititem/767/3/#'
const URL_PARTS_PATTERN = /(https?:\/\/[^\s]+)/g
const URL_WHOLE_PATTERN = /^https?:\/\/[^\s]+$/

function renderTextWithLinks(text: string) {
  return text.split(URL_PARTS_PATTERN).map((part, index) =>
    URL_WHOLE_PATTERN.test(part) ? (
      <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">
        {part}
      </a>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  )
}

interface SteamHelpersPanelProps {
  onboardingTarget?: string
}

export function SteamHelpersPanel(props: SteamHelpersPanelProps) {
  const intl = useIntl()
  const { onboardingTarget } = props
  const { state, actions } = useSteamHelpersContext()
  const { copyStatus } = state
  const { onCopySnippet } = actions

  return (
    <section className="panel panel-steam" data-onboarding-target={onboardingTarget}>
      <h2>{intl.formatMessage({ id: 'steam.title' })}</h2>
      <p className="panel-intro">{intl.formatMessage({ id: 'steam.intro' })}</p>
      <ul>
        {STEAM_HELPER_NOTES.map((note) => (
          <li key={note}>{renderTextWithLinks(note)}</li>
        ))}
      </ul>

      <article className="subpanel">
        <div className="snippet-head">
          <h3>{intl.formatMessage({ id: 'steam.workshopSnippet' })}</h3>
          <button onClick={() => onCopySnippet('workshop')}>{intl.formatMessage({ id: 'steam.copy' })}</button>
        </div>
        <p className="snippet-upload-link">
          {intl.formatMessage({ id: 'steam.uploadPage' })}{' '}
          <a href={WORKSHOP_UPLOAD_URL} target="_blank" rel="noreferrer">
            {WORKSHOP_UPLOAD_URL}
          </a>
        </p>
        <textarea readOnly value={WORKSHOP_SNIPPET} rows={14} />
      </article>

      <article className="subpanel">
        <div className="snippet-head">
          <h3>{intl.formatMessage({ id: 'steam.artworkSnippet' })}</h3>
          <button onClick={() => onCopySnippet('featured')}>{intl.formatMessage({ id: 'steam.copy' })}</button>
        </div>
        <p className="snippet-upload-link">
          {intl.formatMessage({ id: 'steam.uploadPage' })}{' '}
          <a href={ARTWORK_UPLOAD_URL} target="_blank" rel="noreferrer">
            {ARTWORK_UPLOAD_URL}
          </a>
        </p>
        <textarea readOnly value={FEATURED_SNIPPET} rows={14} />
      </article>

      <article className="subpanel">
        <div className="snippet-head">
          <h3>{intl.formatMessage({ id: 'steam.screenshotSnippet' })}</h3>
          <button onClick={() => onCopySnippet('screenshot')}>{intl.formatMessage({ id: 'steam.copy' })}</button>
        </div>
        <p className="snippet-upload-link">
          {intl.formatMessage({ id: 'steam.uploadPage' })}{' '}
          <a href={ARTWORK_UPLOAD_URL} target="_blank" rel="noreferrer">
            {ARTWORK_UPLOAD_URL}
          </a>
        </p>
        <textarea readOnly value={SCREENSHOT_SNIPPET} rows={16} />
      </article>

      {copyStatus && (
        <p>
          {copyStatus.type === 'success'
            ? intl.formatMessage({ id: 'steam.copyStatus' }, { label: copyStatus.label })
            : intl.formatMessage({ id: 'steam.copyFailed' })}
        </p>
      )}
    </section>
  )
}

