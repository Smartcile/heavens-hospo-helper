'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface DrawerProps {
  isOpen: boolean
  onClose: () => void
  title?: React.ReactNode
  children: React.ReactNode
  width?: 'md' | 'lg' | 'full'
}

/** Right-side full-height slide-over panel — for detail views that should not
 *  navigate the user away from the list they are working in. */
export function Drawer({ isOpen, onClose, title, children, width = 'lg' }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKey)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const widths = {
    md: 'max-w-md',
    lg: 'max-w-2xl',
    full: 'max-w-full',
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        className={cn(
          'absolute right-0 top-0 h-full w-full bg-grey-dark border-l border-grey-mid shadow-2xl flex flex-col',
          widths[width],
        )}
      >
        {title && (
          <div className="flex items-center justify-between p-4 border-b border-grey-mid">
            <h2 className="font-mono font-semibold uppercase tracking-wider text-sm">{title}</h2>
            <button
              onClick={onClose}
              className="text-grey-light hover:text-white font-mono text-xs uppercase transition-colors"
            >
              [ESC]
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1 p-4">{children}</div>
      </div>
    </div>
  )
}
