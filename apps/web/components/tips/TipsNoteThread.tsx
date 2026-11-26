'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CommentThread, type CommentThreadItem } from '@/components/ui/CommentThread'
import { TIPS_NOTE_MAX_LENGTH } from '@/lib/tips'

/**
 * One history thread per person × period (#180), anchored to the TipsShare row
 * so manual (staffId: null) people keep theirs too. The source is always
 * MANAGER (admin-only panel) and comments stay writable on a locked period.
 */
export function TipsNoteThread({
  periodId,
  shareId,
  onChanged,
}: {
  periodId: string
  shareId: string
  /** Called with the live note count after load and after each mutation. */
  onChanged?: (count: number) => void
}) {
  const endpoint = `/api/admin/tips/${periodId}/shares/${shareId}/notes`
  const [notes, setNotes] = useState<CommentThreadItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [canAdd, setCanAdd] = useState(false)
  const onChangedRef = useRef(onChanged)
  useEffect(() => { onChangedRef.current = onChanged }, [onChanged])

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(endpoint).catch(() => null)
    if (!r || !r.ok) {
      setLoading(false)
      setError('COULD NOT LOAD NOTES')
      return
    }
    const d = await r.json().catch(() => ({}))
    const next = Array.isArray(d.notes) ? (d.notes as CommentThreadItem[]) : []
    setNotes(next)
    setCanAdd(d.canAdd !== false)
    setLoading(false)
    onChangedRef.current?.(next.length)
  }, [endpoint])

  useEffect(() => {
    void load()
  }, [load])

  const add = useCallback(
    async (text: string): Promise<boolean> => {
      setError('')
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      }).catch(() => null)
      if (!r || !r.ok) {
        const d = r ? await r.json().catch(() => ({})) : {}
        setError((d.error ?? 'COULD NOT ADD THE NOTE').toUpperCase())
        return false
      }
      await load()
      return true
    },
    [endpoint, load],
  )

  const remove = useCallback(
    async (id: string) => {
      setError('')
      const r = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }).catch(() => null)
      if (!r || !r.ok) {
        const d = r ? await r.json().catch(() => ({})) : {}
        setError((d.error ?? 'COULD NOT DELETE THE NOTE').toUpperCase())
        return
      }
      await load()
    },
    [endpoint, load],
  )

  return (
    <CommentThread
      comments={notes}
      loading={loading}
      error={error}
      canAdd={canAdd}
      maxLength={TIPS_NOTE_MAX_LENGTH}
      onAdd={add}
      onDelete={remove}
      caption="NOTES STAY EDITABLE AFTER THE PERIOD IS LOCKED — THEY NEVER CHANGE A PAYOUT."
    />
  )
}
