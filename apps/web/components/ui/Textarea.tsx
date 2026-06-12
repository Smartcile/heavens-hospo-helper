import { TextareaHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="font-mono text-xs uppercase text-grey-light tracking-wider">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={cn(
            'bg-grey-dark border border-grey-mid text-white font-sans text-sm px-3 py-2 w-full outline-none focus:border-white transition-colors placeholder:text-grey-light resize-y min-h-[80px]',
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

Textarea.displayName = 'Textarea'
