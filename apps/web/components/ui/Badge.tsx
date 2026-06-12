import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'danger' | 'warning'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  const variants = {
    default: 'text-accent border-grey-mid',
    success: 'text-success border-success',
    danger: 'text-danger border-danger',
    warning: 'text-warning border-warning',
  }

  return (
    <span
      className={cn(
        'font-mono text-xs uppercase border px-2 py-0.5 tracking-wider',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
