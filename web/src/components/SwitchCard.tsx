interface SwitchCardProps {
  checked: boolean
  disabled?: boolean
  label: string
  title: string
  className?: string
  onChange: (checked: boolean) => void
}

export function SwitchCard(props: SwitchCardProps) {
  const { checked, disabled, label, title, className = '', onChange } = props
  return (
    <label className={`switch-card ${className}`.trim()} title={title}>
      <span className="switch-card-label">{label}</span>
      <span className="switch-control">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="switch-track" aria-hidden="true">
          <span className="switch-thumb" />
        </span>
      </span>
    </label>
  )
}
