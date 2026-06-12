import { cn } from '@/lib/utils'

interface ProgressBarProps {
  value: number
  max?: number
  showLabel?: boolean
  variant?: 'success' | 'warning' | 'danger'
  className?: string
}

export function ProgressBar({
  value,
  max = 100,
  showLabel = false,
  variant,
  className,
}: ProgressBarProps) {
  const percent = Math.round((value / max) * 100)
  const auto = percent >= 75 ? 'success' : percent >= 40 ? 'warning' : 'danger'
  const color = variant ?? auto

  const colors = {
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex-1 bg-grey-mid h-1.5 overflow-hidden">
        <div
          className={cn('h-full transition-all duration-300', colors[color])}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showLabel && (
        <span className="font-mono text-xs text-grey-light whitespace-nowrap">{percent}%</span>
      )}
    </div>
  )
}
