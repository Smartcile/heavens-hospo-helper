'use client'

import { cn } from '@/lib/utils'

interface ListBoxProps {
  title?: string
  count?: number
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}

export function ListBox({ title, count, action, children, className, bodyClassName }: ListBoxProps) {
  return (
    <div className={cn('border border-grey-mid', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-grey-mid">
          <div className="flex items-center gap-2">
            {title && <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">{title}</span>}
            {count != null && <span className="font-mono text-[10px] text-grey-light">({count})</span>}
          </div>
          {action}
        </div>
      )}
      <div className={cn('divide-y divide-grey-mid', bodyClassName)}>{children}</div>
    </div>
  )
}

interface ListRowProps {
  children: React.ReactNode
  active?: boolean
  onClick?: () => void
  className?: string
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnter?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
}

export function ListRow({ children, active, onClick, className, draggable, onDragStart, onDragEnter, onDragEnd }: ListRowProps) {
  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragEnd={onDragEnd}
      className={cn(
        'flex items-center gap-3 px-3 py-2 transition-colors',
        active && 'bg-grey-mid/20',
        onClick && 'cursor-pointer hover:bg-grey-mid/10',
        className
      )}
    >
      {children}
    </div>
  )
}
