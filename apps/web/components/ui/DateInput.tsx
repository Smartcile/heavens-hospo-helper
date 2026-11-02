import { InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

/**
 * Native date picker with the shared `.field` control spec. Use this everywhere
 * instead of hand-rolling a `type="date"` input. For a labelled form field wrap
 * `<Input type="date" />` instead.
 */
export const DateInput = forwardRef<HTMLInputElement, Props>(({ className, ...props }, ref) => (
  <input ref={ref} type="date" className={cn('field', className)} {...props} />
))
DateInput.displayName = 'DateInput'
