'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CommentThread } from '@/components/ui/CommentThread'
import { AVAILABILITY_COMMENT_MAX_LENGTH } from '@/lib/availability-comments'

export interface AvailabilityCommentItem {
  id: string
  body: string
  source: string
  authorId: string | null
  authorName: string | null
  createdAt: string
  canDelete: boolean
}

/**
 * One compact comment history per staff member + day, shared by the admin
 * availability panel and the worker day editor. This half owns the availability
 * fetch/mutation contract; the presentation is the shared `CommentThread`
 * (#180). The server decides `canDelete` (managers always, staff only when the
 * venue toggle allows and it is their own comment).
 */
export function AvailabilityCommentThread({
  mode,
  staffId,
  venueId,
  dateKey,
  seriesId,
  dateKeys,
  legacyReason,
  caption,
  canAdd = true,
  onChanged,
  onMutated,
}: {
  mode: 'admin' | 'worker'
  /** Admin only — ignored by the worker route (own staff always). */
  staffId?: string | null
  /** Admin only — the venue the page is working in (before a cookie exists). */
  venueId?: string | null
  dateKey: string
  seriesId?: string | null
  /** Series declarations: post the same comment to every affected day. */
  dateKeys?: string[]
  /** Legacy request reason shown only when no loaded comment already says it. */
  legacyReason?: string | null
  /** Optional scope hint, e.g. a series save stores the comment on the anchor day. */
  caption?: string
  canAdd?: boolean
  /** Called with the newest live comment (and newest-first full list). */
  onChanged?: (latest: AvailabilityCommentItem | null, all: AvailabilityCommentItem[]) => void
  /** Called after a successful add/delete so the parent can refresh its data. */
  onMutated?: () => void
}) {
  const endpoint = mode === 'admin' ? '/api/admin/availability/comments' : '/api/worker/availability/comments'
  const canQuery = mode === 'worker' || !!staffId
  const [comments, setComments] = useState<AvailabilityCommentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Admin capability is server-driven (restricted managers may be read-only);
  // a worker may always add to their own day.
  const [serverCanAdd, setServerCanAdd] = useState(mode === 'worker')
  const onChangedRef = useRef(onChanged)
  const onMutatedRef = useRef(onMutated)
  useEffect(() => { onChangedRef.current = onChanged }, [onChanged])
  useEffect(() => { onMutatedRef.current = onMutated }, [onMutated])

  const postDates = useCallback(() => {
    const list = dateKeys && dateKeys.length > 0 ? dateKeys : [dateKey]
    return [...new Set(list.filter(Boolean))]
  }, [dateKeys, dateKey])

  const load = useCallback(async () => {
    if (!canQuery) {
      setComments([])
      setLoading(false)
      return
    }
    setLoading(true)
    const params = new URLSearchParams({ date: dateKey })
    if (mode === 'admin' && staffId) params.set('staffId', staffId)
    if (mode === 'admin' && venueId) params.set('venueId', venueId)
    const r = await fetch(`${endpoint}?${params.toString()}`)
    if (!r.ok) {
      setLoading(false)
      setError('COULD NOT LOAD COMMENTS')
      return
    }
    const d = await r.json().catch(() => ({}))
    const next = Array.isArray(d.comments) ? (d.comments as AvailabilityCommentItem[]) : []
    setComments(next)
    setServerCanAdd(d.canAdd !== false)
    setLoading(false)
    onChangedRef.current?.(next[0] ?? null, next)
  }, [endpoint, mode, staffId, venueId, dateKey, canQuery])

  useEffect(() => {
    void load()
  }, [load])

  const add = useCallback(async (text: string): Promise<boolean> => {
    setError('')
    // Multi-day declarations fan out one POST per day. There is deliberately no
    // rollback: a partial failure leaves the comment on the days that succeeded,
    // then reloads and reports the error so the user can retry the rest.
    const results = await Promise.all(postDates().map((date) => {
      const payload: Record<string, unknown> = { date, body: text, seriesId: seriesId ?? null }
      if (mode === 'admin') {
        payload.staffId = staffId ?? null
        if (venueId) payload.venueId = venueId
      }
      return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }))
    const failed = results.find((r) => !r.ok)
    if (failed) {
      const d = await failed.json().catch(() => ({}))
      setError((d.error ?? 'COULD NOT ADD THE COMMENT').toUpperCase())
      await load()
      return false
    }
    await load()
    onMutatedRef.current?.()
    return true
  }, [endpoint, mode, staffId, venueId, seriesId, postDates, load])

  const remove = useCallback(async (id: string) => {
    setError('')
    const r = await fetch(endpoint, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mode === 'admin' && venueId ? { id, venueId } : { id }),
    })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError((d.error ?? 'COULD NOT DELETE THE COMMENT').toUpperCase())
      return
    }
    await load()
    onMutatedRef.current?.()
  }, [endpoint, mode, venueId, load])

  return (
    <CommentThread
      comments={comments}
      loading={loading}
      error={error}
      canAdd={canAdd && serverCanAdd && canQuery}
      maxLength={AVAILABILITY_COMMENT_MAX_LENGTH}
      onAdd={add}
      onDelete={remove}
      caption={caption}
      legacyReason={legacyReason}
    />
  )
}
