// Shared by <Button> and by links that look like buttons (see button.css).

/**
 * - `primary`: the blue call to action. At most one per group.
 * - `secondary`: the default grey pill (what a plain `<button>` looks like).
 * - `outline`: a quieter bordered pill, for actions next to a primary one in compact toolbars.
 * - `quiet`: no fill until hover, for dismiss-style actions such as Skip.
 * - `danger`: destructive actions (delete, purge).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'quiet' | 'danger'

/** `regular` is the 44px default; `medium` keeps 44px with smaller text; `small` is for dense toolbars. */
export type ButtonSize = 'regular' | 'medium' | 'small'

export interface ButtonStyleOptions {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}

/**
 * Class list for the shared button styles (`button.css`). Use it directly to style a link as a
 * button; use `<Button>` for real buttons.
 */
export function buttonClassName({ variant = 'secondary', size = 'regular', className }: ButtonStyleOptions = {}): string {
  return ['btn', variant !== 'secondary' && `btn-${variant}`, size !== 'regular' && `btn-${size}`, className]
    .filter(Boolean)
    .join(' ')
}
