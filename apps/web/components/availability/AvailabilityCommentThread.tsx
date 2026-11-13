'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDateDMY, localDayKey } from '@/lib/date-nav'
import {
  AVAILABILITY_COMMENT_MAX_LENGTH,
  type AvailabilityCommentSource,
} from '@/lib/availability-comments'

export interface AvailabilityCommentItem {
  id: string
  body: string
  source: AvailabilityCommentSource
  authorId: string | null
  authorName: string | null
  createdAt: string
  canDelete: boolean
}

const SOURCE_LABEL: Record<AvailabilityCommentSource, string> = {
  WORKER_APP: 'VIA APP',
  MANAGER: 'MANAGER',
  SYSTEM: 'SYSTEM',
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', hour12: true })
  return `${formatDateDMY(localDayKey(d))} ${time}`
}

/**
 * One compact comment history per staff member + day, shared by the admin
 * availability panel and the worker day editor. Newest first; each row is a
 * single line until expanded. The server decides `canDelete` (managers always,
 * staff only when the venue toggle allows and it is their own comment).
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
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
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

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function add() {
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)
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
    setBusy(false)
    const failed = results.find((r) => !r.ok)
    if (failed) {
      const d = await failed.json().catch(() => ({}))
      setError((d.error ?? 'COULD NOT ADD THE COMMENT').toUpperCase())
      await load()
      return
    }
    setBody('')
    await load()
    onMutatedRef.current?.()
  }

  async function remove(id: string) {
    if (busy) return
    setBusy(true)
    setError('')
    const r = await fetch(endpoint, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mode === 'admin' && venueId ? { id, venueId } : { id }),
    })
    setBusy(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError((d.error ?? 'COULD NOT DELETE THE COMMENT').toUpperCase())
      return
    }
    await load()
    onMutatedRef.current?.()
  }

  return (
    <div className="border border-grey-mid p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-2xs uppercase tracking-wider text-grey-light">COMMENTS</span>
        <span className="font-mono text-2xs uppercase text-grey-light">{comments.length}</span>
      </div>

      {caption && (
        <p className="font-mono text-2xs uppercase text-grey-mid">{caption}</p>
      )}

      {!loading && legacyReason?.trim() && !comments.some((c) => c.body.trim() === legacyReason.trim()) && (
        <p className="font-mono text-2xs uppercase text-grey-light border-l border-grey-mid pl-2">
          LEGACY REASON: {legacyReason.trim()}
        </p>
      )}

      {loading ? (
        <p className="font-mono text-2xs uppercase text-grey-light loading-cursor">LOADING</p>
      ) : comments.length === 0 ? (
        <p className="font-mono text-2xs uppercase text-grey-light">NO COMMENTS YET.</p>
      ) : (
        <div className="space-y-1">
          {comments.map((c) => {
            const open = expanded.has(c.id)
            return (
              <div key={c.id} className="border border-grey-mid/60 bg-black/20">
                <div className="flex items-start gap-2 px-2 py-1">
                  <button
                    type="button"
                    onClick={() => toggle(c.id)}
                    aria-label={`Toggle comment ${c.id}`}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block font-mono text-2xs uppercase text-grey-light">
                      {(c.authorName ?? 'UNKNOWN').toUpperCase()} · {SOURCE_LABEL[c.source] ?? c.source} · {formatWhen(c.createdAt)}
                    </span>
                    <span className={`block font-mono text-2xs text-white ${open ? 'whitespace-pre-wrap' : 'truncate'}`}>
                      {c.body}
                    </span>
                  </button>
                  {c.canDelete && (
                    <button
                      type="button"
                      onClick={() => void remove(c.id)}
                      disabled={busy}
                      aria-label={`Delete comment ${c.id}`}
                      title="DELETE COMMENT"
                      className="shrink-0 h-6 w-6 border border-grey-mid font-mono text-2xs text-grey-light hover:border-danger hover:text-danger disabled:opacity-40"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {canAdd && serverCanAdd && canQuery && (
        <div className="flex items-center gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add() } }}
            maxLength={AVAILABILITY_COMMENT_MAX_LENGTH}
            placeholder="ADD A COMMENT"
            aria-label="Add comment"
            className="field flex-1 min-w-0"
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={busy || !body.trim()}
            className="h-9 px-3 border border-accent text-accent font-mono text-xs uppercase hover:bg-accent hover:text-black transition-colors disabled:opacity-40"
          >
            ADD
          </button>
        </div>
      )}

      {error && <p className="font-mono text-2xs uppercase text-danger">{error}</p>}
    </div>
  )
}
