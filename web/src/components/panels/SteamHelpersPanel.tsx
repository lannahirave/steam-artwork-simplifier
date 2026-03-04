import {
  FEATURED_SNIPPET,
  SCREENSHOT_SNIPPET,
  STEAM_HELPER_NOTES,
  WORKSHOP_SNIPPET,
} from '../../lib/steamSnippets'
import { useSteamHelpersContext } from '../../contexts/steamHelpersContext'

const WORKSHOP_UPLOAD_URL = 'https://steamcommunity.com/sharedfiles/editguide/?appid=760'
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

export function SteamHelpersPanel() {
  const { state, actions } = useSteamHelpersContext()
  const { copyStatus } = state
  const { onCopySnippet } = actions

  return (
    <section className="panel">
      <h2>Steam Upload Helpers</h2>
      <p>Copy and run these snippets in Steam upload page DevTools Console.</p>
      <ul>
        {STEAM_HELPER_NOTES.map((note) => (
          <li key={note}>{renderTextWithLinks(note)}</li>
        ))}
      </ul>

      <article className="subpanel">
        <div className="snippet-head">
          <h3>Workshop Snippet</h3>
          <button onClick={() => onCopySnippet('workshop')}>Copy</button>
        </div>
        <p className="snippet-upload-link">
          Upload page:{' '}
          <a href={WORKSHOP_UPLOAD_URL} target="_blank" rel="noreferrer">
            {WORKSHOP_UPLOAD_URL}
          </a>
        </p>
        <textarea readOnly value={WORKSHOP_SNIPPET} rows={14} />
      </article>

      <article className="subpanel">
        <div className="snippet-head">
          <h3>Artwork or Featured Artwork Snippet</h3>
          <button onClick={() => onCopySnippet('featured')}>Copy</button>
        </div>
        <p className="snippet-upload-link">
          Upload page:{' '}
          <a href={ARTWORK_UPLOAD_URL} target="_blank" rel="noreferrer">
            {ARTWORK_UPLOAD_URL}
          </a>
        </p>
        <textarea readOnly value={FEATURED_SNIPPET} rows={14} />
      </article>

      <article className="subpanel">
        <div className="snippet-head">
          <h3>Screenshot Snippet</h3>
          <button onClick={() => onCopySnippet('screenshot')}>Copy</button>
        </div>
        <p className="snippet-upload-link">
          Upload page:{' '}
          <a href={ARTWORK_UPLOAD_URL} target="_blank" rel="noreferrer">
            {ARTWORK_UPLOAD_URL}
          </a>
        </p>
        <textarea readOnly value={SCREENSHOT_SNIPPET} rows={16} />
      </article>

      {copyStatus && <p>{copyStatus}</p>}
    </section>
  )
}

