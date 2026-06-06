import { useIntl } from 'react-intl'
import type { GuideSection } from '../../agents/appAgents'

interface GuidesPanelProps {
  guides: GuideSection[]
  onboardingTarget?: string
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

export function GuidesPanel(props: GuidesPanelProps) {
  const intl = useIntl()
  const { guides, onboardingTarget } = props

  return (
    <section className="panel panel-guides" data-onboarding-target={onboardingTarget}>
      <h2>{intl.formatMessage({ id: 'guides.title' })}</h2>
      <p className="panel-intro guides-intro">{intl.formatMessage({ id: 'guides.intro' })}</p>

      <div className="guides-grid">
        {guides.map((guide) => (
          <article key={guide.key} className="guide-card">
            <div className="guide-head">
              <span className="guide-badge">{guide.badge}</span>
              <h3>{guide.title}</h3>
            </div>
            <ol className="guide-steps">
              {guide.steps.map((step) => (
                <li key={step}>{renderTextWithLinks(step)}</li>
              ))}
            </ol>
            {guide.tip && <p className="guide-tip">{renderTextWithLinks(guide.tip)}</p>}
          </article>
        ))}
      </div>
    </section>
  )
}

