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
        {label && (
          <label className="font-mono text-xs uppercase text-grey-light tracking-wider">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn(
            'bg-grey-dark border border-grey-mid text-white font-sans text-sm px-3 py-2 w-full outline-none focus:border-white transition-colors placeholder:text-grey-light',
            error ? 'border-danger' : '',
            className
          )}
          {...props}
        />
        {error && <p className="font-mono text-xs text-danger">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
