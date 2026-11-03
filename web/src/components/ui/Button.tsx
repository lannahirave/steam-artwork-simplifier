import type { ComponentProps } from 'react'
import { buttonClassName, type ButtonStyleOptions } from './buttonStyles'

type ButtonProps = ComponentProps<'button'> & ButtonStyleOptions

/** A `<button>` with the shared styles. Defaults to `type="button"` so it never submits a form by accident. */
export function Button({ variant, size, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClassName({ variant, size, className })} {...props} />
}
