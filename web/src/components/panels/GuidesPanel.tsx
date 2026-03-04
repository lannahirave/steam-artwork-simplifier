import type { GuideSection } from '../../agents/appAgents'

interface GuidesPanelProps {
  guides: GuideSection[]
}

export function GuidesPanel(props: GuidesPanelProps) {
  const { guides } = props

  return (
    <section className="panel">
      <h2>Guides</h2>
      <p className="guides-intro">
        Step-by-step workflows for common tasks in this toolkit.
      </p>

      <div className="guides-grid">
        {guides.map((guide) => (
          <article key={guide.key} className="guide-card">
            <div className="guide-head">
              <span className="guide-badge">{guide.badge}</span>
              <h3>{guide.title}</h3>
            </div>
            <ol className="guide-steps">
              {guide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {guide.tip && <p className="guide-tip">{guide.tip}</p>}
          </article>
        ))}
      </div>
    </section>
  )
}

