'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

let bodyLockCount = 0
function lockBodyScroll() {
  if (typeof document === 'undefined') return
  if (bodyLockCount === 0) document.body.style.overflow = 'hidden'
  bodyLockCount += 1
}
function unlockBodyScroll() {
  if (typeof document === 'undefined') return
  bodyLockCount = Math.max(0, bodyLockCount - 1)
  if (bodyLockCount === 0) document.body.style.overflow = ''
}

interface DrawerProps {
  isOpen: boolean
  onClose: () => void
  title?: React.ReactNode
  children: React.ReactNode
  width?: 'md' | 'lg' | 'full'
  /** When true, backdrop/Escape/[ESC] ask before discarding unsaved edits. */
  dirty?: boolean
  discardTitle?: string
  discardMessage?: string
  discardConfirmLabel?: string
  discardCancelLabel?: string
}

/** Right-side full-height slide-over panel — for detail views that should not
 *  navigate the user away from the list they are working in. */
export function Drawer({
  isOpen,
  onClose,
  title,
  children,
  width = 'lg',
  dirty = false,
  discardTitle = 'DISCARD CHANGES?',
  discardMessage = 'YOU HAVE UNSAVED CHANGES. CLOSE WITHOUT SAVING?',
  discardConfirmLabel = 'DISCARD',
  discardCancelLabel = 'KEEP EDITING',
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) setConfirmOpen(false)
  }, [isOpen])

  const requestClose = useCallback(() => {
    if (dirty) setConfirmOpen(true)
    else onClose()
  }, [dirty, onClose])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (confirmOpen) {
        setConfirmOpen(false)
        return
      }
      requestClose()
    }
    if (isOpen) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, requestClose, confirmOpen])

  useEffect(() => {
    if (!isOpen) return
    lockBodyScroll()
    return () => unlockBodyScroll()
  }, [isOpen])

  if (!isOpen) return null

  const widths = {
    md: 'max-w-md',
    lg: 'max-w-2xl',
    full: 'max-w-full',
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-scrim" onClick={requestClose} aria-hidden />
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
              onClick={requestClose}
              className="text-grey-light hover:text-white font-mono text-xs uppercase transition-colors"
            >
              [ESC]
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1 p-4">{children}</div>
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-scrim p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmOpen(false)
          }}
        >
          <div className="bg-grey-dark border border-grey-mid w-full max-w-sm p-4 space-y-4">
            <h2 className="font-mono font-semibold uppercase tracking-wider text-sm">{discardTitle}</h2>
            <p className="font-mono text-xs uppercase text-grey-light">{discardMessage}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setConfirmOpen(false)
                  onClose()
                }}
              >
                {discardConfirmLabel}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmOpen(false)}>
                {discardCancelLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
