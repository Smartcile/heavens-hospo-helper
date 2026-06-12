import { SelectHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="font-mono text-xs uppercase text-grey-light tracking-wider">
            {label}
          </label>
        )}
        <select
          ref={ref}
          className={cn(
            'bg-grey-dark border border-grey-mid text-white font-sans text-sm px-3 py-2 w-full outline-none focus:border-white transition-colors',
            error ? 'border-danger' : '',
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="font-mono text-xs text-danger">{error}</p>}
      </div>
    )
  }
)

Select.displayName = 'Select'
