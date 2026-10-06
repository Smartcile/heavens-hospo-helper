import { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Padding scale. `md` (p-3) is the standard panel; `lg` (p-4) for page-level. */
  padding?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /** `solid` = raised surface (default). `outline` = transparent bordered box. */
  variant?: 'solid' | 'outline'
}

const PADDING = {
  none: '',
  xs: 'p-2',
  sm: 'p-2.5',
  md: 'p-3',
  lg: 'p-4',
  xl: 'p-6',
} as const

const VARIANT = {
  solid: 'panel',
  outline: 'panel-outline',
} as const

/**
 * The single box container. Every bordered box should be a Panel — not a
 * hand-rolled `border border-grey-mid p-<n>` string. Compose spacing on top.
 */
export function Panel({
  padding = 'md',
  variant = 'solid',
  className,
  children,
  ...props
}: PanelProps) {
  return (
    <div className={cn(VARIANT[variant], PADDING[padding], className)} {...props}>
      {children}
    </div>
  )
}
