'use client'

// A small, themed "are you sure?" prompt. Used to confirm opening a referenced
// guide in a popup — native window.confirm() is unstyled and cannot follow the
// dark/light tokens.

import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

interface ConfirmDialogProps {
  isOpen: boolean
  title?: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  isOpen,
  title = 'OPEN IN A POPUP?',
  message,
  confirmLabel = 'OPEN',
  cancelLabel = 'CANCEL',
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        {message && <p className="font-mono text-xs uppercase text-grey-light">{message}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={onConfirm}>{confirmLabel}</Button>
          <Button size="sm" variant="ghost" onClick={onClose}>{cancelLabel}</Button>
        </div>
      </div>
    </Modal>
  )
}
