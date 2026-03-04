import {
  FEATURED_SNIPPET,
  SCREENSHOT_SNIPPET,
  STEAM_HELPER_NOTES,
  WORKSHOP_SNIPPET,
} from '../../lib/steamSnippets'

interface SteamHelpersPanelProps {
  copyStatus: string
  onCopySnippet: (label: 'workshop' | 'featured' | 'screenshot') => void
}

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

export function SteamHelpersPanel(props: SteamHelpersPanelProps) {
  const { copyStatus, onCopySnippet } = props

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
        <textarea readOnly value={WORKSHOP_SNIPPET} rows={14} />
      </article>

      <article className="subpanel">
        <div className="snippet-head">
          <h3>Artwork or Featured Artwork Snippet</h3>
          <button onClick={() => onCopySnippet('featured')}>Copy</button>
        </div>
        <textarea readOnly value={FEATURED_SNIPPET} rows={14} />
      </article>

      <article className="subpanel">
        <div className="snippet-head">
          <h3>Screenshot Snippet</h3>
          <button onClick={() => onCopySnippet('screenshot')}>Copy</button>
        </div>
        <textarea readOnly value={SCREENSHOT_SNIPPET} rows={16} />
      </article>

      {copyStatus && <p>{copyStatus}</p>}
    </section>
  )
}

