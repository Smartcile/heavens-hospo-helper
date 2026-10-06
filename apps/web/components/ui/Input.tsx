import { InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && <label className="label">{label}</label>}
        <input
          ref={ref}
          className={cn('field', error && 'border-danger', className)}
          {...props}
        />
        {error && <p className="font-mono text-xs text-danger">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
