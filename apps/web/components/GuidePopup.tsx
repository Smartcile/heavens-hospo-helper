'use client'

// A referenced guide opened in place: a centred Modal on the admin side, a
// full-screen overlay with a ← BACK bar on the worker side. Fetching is scoped
// per platform (the worker JWT cannot call the admin route), but both render the
// same GuideReaderContent so a preview can never drift from the phone.

import { useEffect, useState } from 'react'
import { GuideReaderContent, type GuideReaderGuide } from '@/components/GuideReaderContent'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

export type GuidePopupVariant = 'admin' | 'worker'

export function GuidePopup({
  guideId,
  variant,
  onClose,
}: {
  guideId: string | null
  variant: GuidePopupVariant
  onClose: () => void
}) {
  const [guide, setGuide] = useState<GuideReaderGuide | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!guideId) {
      setGuide(null)
      setError('')
      return
    }
    let alive = true
    setLoading(true)
    setError('')
    setGuide(null)
    const url = variant === 'worker' ? `/api/worker/guides/${guideId}/read` : `/api/admin/guides/${guideId}`
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data) => { if (alive) setGuide(data as GuideReaderGuide) })
      .catch(() => { if (alive) setError('COULD NOT OPEN THIS GUIDE') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [guideId, variant])

  if (!guideId) return null

  const body = (
    <>
      {loading && <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>}
      {error && <p className="font-mono text-xs text-danger">{error}</p>}
      {guide && <GuideReaderContent guide={guide} variant={variant} />}
    </>
  )

  if (variant === 'worker') {
    return (
      <div className="fixed inset-0 z-[70] bg-black flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 border-b border-grey-mid">
          <button onClick={onClose} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">
            ← BACK
          </button>
          <span className="font-mono text-xs uppercase tracking-widest text-grey-light">GUIDE</span>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 space-y-6">{body}</div>
      </div>
    )
  }

  return (
    <Modal isOpen onClose={onClose} title={guide?.title ?? 'GUIDE'} size="xl">
      <div className="space-y-6">{body}</div>
    </Modal>
  )
}

/**
 * Confirm-then-open helper. `requestGuide` asks the user before opening;
 * `nodes` must be rendered once by the caller.
 */
export function useGuidePopup(variant: GuidePopupVariant) {
  const [pending, setPending] = useState<{ id: string; title: string | null } | null>(null)
  const [open, setOpen] = useState<{ id: string; title: string | null } | null>(null)

  function requestGuide(id: string, title?: string | null) {
    setPending({ id, title: title ?? null })
  }

  const nodes = (
    <>
      <ConfirmDialog
        isOpen={!!pending}
        message={pending ? `OPEN "${pending.title ?? 'THIS GUIDE'}" IN A POPUP?` : undefined}
        confirmLabel="OPEN"
        onConfirm={() => { setOpen(pending); setPending(null) }}
        onClose={() => setPending(null)}
      />
      <GuidePopup guideId={open?.id ?? null} variant={variant} onClose={() => setOpen(null)} />
    </>
  )

  return { requestGuide, nodes }
}
