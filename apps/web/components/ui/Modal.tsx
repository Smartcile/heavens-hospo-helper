'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

// Reference-counted body scroll lock so a nested confirm dialog never unlocks
// the page while the modal underneath is still open.
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

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: React.ReactNode
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  /** When true, backdrop/Escape/[ESC] ask before discarding unsaved edits. */
  dirty?: boolean
  discardTitle?: string
  discardMessage?: string
  discardConfirmLabel?: string
  discardCancelLabel?: string
  zClassName?: string
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  dirty = false,
  discardTitle = 'DISCARD CHANGES?',
  discardMessage = 'YOU HAVE UNSAVED CHANGES. CLOSE WITHOUT SAVING?',
  discardConfirmLabel = 'DISCARD',
  discardCancelLabel = 'KEEP EDITING',
  zClassName,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
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

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-5xl',
    full: 'max-w-none w-full h-full',
  }

  return (
    <div
      ref={overlayRef}
      className={cn('fixed inset-0 flex items-center justify-center bg-scrim p-4', zClassName ?? 'z-50')}
      onClick={(e) => {
        if (e.target === overlayRef.current) requestClose()
      }}
    >
      <div
        className={cn(
          'bg-grey-dark border border-grey-mid w-full flex flex-col max-h-[90vh]',
          sizes[size]
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
