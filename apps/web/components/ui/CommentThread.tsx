'use client'

import { useState } from 'react'
import { formatDateDMY, localDayKey } from '@/lib/date-nav'

export interface CommentThreadItem {
  id: string
  body: string
  source: string
  authorName: string | null
  createdAt: string
  canDelete: boolean
}

const SOURCE_LABEL: Record<string, string> = {
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
 * Presentational comment history: newest first, one line until expanded, author
 * · source · time · body, optional delete. Extracted from
 * `AvailabilityCommentThread` (#180) with the markup, text and aria-labels kept
 * frozen so the availability panels are unchanged. Each caller owns fetching and
 * the add/delete mutations; this component owns the draft, expansion and busy
 * state only.
 */
export function CommentThread({
  comments,
  loading,
  error,
  canAdd,
  maxLength,
  onAdd,
  onDelete,
  caption,
  legacyReason,
}: {
  comments: CommentThreadItem[]
  loading: boolean
  error: string
  /** Final capability — the server's verdict AND the caller's own gate. */
  canAdd: boolean
  maxLength: number
  /** Resolve true only when the comment was saved (clears the draft). */
  onAdd: (text: string) => Promise<boolean>
  onDelete: (id: string) => Promise<void>
  caption?: string
  legacyReason?: string | null
}) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

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
    const ok = await onAdd(text)
    setBusy(false)
    if (ok) setBody('')
  }

  async function remove(id: string) {
    if (busy) return
    setBusy(true)
    await onDelete(id)
    setBusy(false)
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

      {canAdd && (
        <div className="flex items-center gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add() } }}
            maxLength={maxLength}
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
