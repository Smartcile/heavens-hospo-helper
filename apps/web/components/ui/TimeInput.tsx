import { InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

/**
 * Native time picker with the shared `.field` control spec. Use this everywhere
 * instead of hand-rolling a `type="time"` input. For a labelled form field wrap
 * `<Input type="time" />` instead.
 */
export const TimeInput = forwardRef<HTMLInputElement, Props>(({ className, ...props }, ref) => (
  <input ref={ref} type="time" className={cn('field', className)} {...props} />
))
TimeInput.displayName = 'TimeInput'
