'use client'

import { useEffect, useState } from 'react'
import { MultiImagePicker } from '@/components/ui/MultiImagePicker'
import { thumbUrl } from '@/lib/image-thumb'
import { formatDateDMY } from '@/lib/date-nav'

export interface TaskThreadComment {
  id: string
  body: string
  imageUrls: string[]
  authorId: string
  authorName: string | null
  createdAt: string
  canDelete: boolean
}

export interface TaskThreadProps {
  taskId: string
  /** `/api/admin/tasks` or `/api/worker/tasks`. */
  basePath: string
  /** `/api/admin/upload` or `/api/worker/upload`. */
  uploadEndpoint: string
  /** Seeded from the task payload; the GET refines it. */
  initialClosed?: boolean
  onClosedChange?: (closed: boolean) => void
}

/**
 * A task thread (#145 Wave B): oldest-first comments with optional photos, a
 * composer, and CLOSE THREAD / REOPEN for anyone allowed to sign off. Shared by
 * the admin task editor and the worker task modal.
 */
export function TaskThread({
  taskId,
  basePath,
  uploadEndpoint,
  initialClosed = false,
  onClosedChange,
}: TaskThreadProps) {
  const [comments, setComments] = useState<TaskThreadComment[]>([])
  const [closed, setClosed] = useState(initialClosed)
  const [canAdd, setCanAdd] = useState(false)
  const [canSignOff, setCanSignOff] = useState(false)
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const url = `${basePath}/${taskId}/comments`

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active) return
        setComments(Array.isArray(data?.comments) ? data.comments : [])
        setClosed(!!data?.threadClosedAt)
        setCanAdd(!!data?.canAdd)
        setCanSignOff(!!data?.canSignOff)
      })
      .catch(() => { /* leave empty on a failed load */ })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [url])

  async function submit() {
    if (!body.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, imageUrls: images }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setError(d.error ?? 'COULD NOT POST')
        return
      }
      const data = await r.json()
      if (data?.comment) setComments((prev) => [...prev, data.comment as TaskThreadComment])
      setBody('')
      setImages([])
    } catch {
      setError('COULD NOT CONNECT')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    setError('')
    const r = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? 'COULD NOT DELETE')
      return
    }
    setComments((prev) => prev.filter((c) => c.id !== id))
  }

  async function toggleSignOff() {
    setError('')
    const next = !closed
    const r = await fetch(`${basePath}/${taskId}/sign-off`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closed: next }),
    })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? 'COULD NOT UPDATE THE THREAD')
      return
    }
    setClosed(next)
    setCanAdd(!next)
    onClosedChange?.(next)
  }

  const timeOf = (iso: string) => {
    const date = new Date(iso)
    return `${formatDateDMY(iso.slice(0, 10))} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }

  return (
    <div className="border border-grey-mid" data-testid="task-thread">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-grey-mid">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs uppercase tracking-wider text-white">TASK THREAD</span>
          <span className={`font-mono text-xs uppercase border px-1.5 py-0.5 ${closed ? 'text-grey-light border-grey-mid' : 'text-success border-success/50'}`}>
            {closed ? 'SIGNED OFF' : 'OPEN'}
          </span>
        </div>
        {canSignOff && (
          <button
            type="button"
            onClick={toggleSignOff}
            className={`font-mono text-xs uppercase border px-2 py-1 transition-colors ${closed ? 'border-success text-success hover:bg-success hover:text-black' : 'border-grey-mid text-grey-light hover:border-white hover:text-white'}`}
          >
            {closed ? 'REOPEN' : 'CLOSE THREAD'}
          </button>
        )}
      </div>

      {closed && (
        <p className="px-3 py-2 font-mono text-xs uppercase text-grey-light border-b border-grey-mid">
          THREAD SIGNED OFF — REOPEN TO ADD MORE.
        </p>
      )}

      <div className="divide-y divide-grey-mid" data-testid="task-thread-comments">
        {loading ? (
          <p className="px-3 py-2 font-mono text-xs text-grey-light loading-cursor">LOADING</p>
        ) : comments.length === 0 ? (
          <p className="px-3 py-2 font-mono text-xs uppercase text-grey-light">NO COMMENTS YET.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="px-3 py-2 space-y-1" data-testid="thread-comment">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 font-mono text-xs uppercase text-accent truncate">
                  {c.authorName ?? 'UNKNOWN'} <span className="text-grey-light">· {timeOf(c.createdAt)}</span>
                </div>
                {c.canDelete && (
                  <button
                    type="button"
                    aria-label="DELETE COMMENT"
                    onClick={() => remove(c.id)}
                    className="font-mono text-xs uppercase text-grey-light hover:text-danger flex-shrink-0"
                  >
                    ✕
                  </button>
                )}
              </div>
              <p className="font-sans text-sm text-white whitespace-pre-wrap break-words">{c.body}</p>
              {c.imageUrls.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {c.imageUrls.map((u) => {
                    const src = thumbUrl(u, 320) ?? u
                    return (
                      <a key={u} href={u} target="_blank" rel="noreferrer" className="block border border-grey-mid">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="THREAD PHOTO" className="h-20 w-20 object-cover" />
                      </a>
                    )
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {!closed && canAdd && (
        <div className="p-3 space-y-2 border-t border-grey-mid">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="ADD A COMMENT…"
            className="w-full bg-black border border-grey-mid text-white font-sans text-sm px-2 py-1.5 outline-none focus:border-white resize-none placeholder:text-grey-light"
          />
          <MultiImagePicker
            value={images}
            onChange={setImages}
            endpoint={uploadEndpoint}
            label="PHOTOS (OPTIONAL)"
          />
          {error && <p className="font-mono text-xs text-danger">{error}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={saving || !body.trim()}
            className="font-mono text-xs uppercase font-bold tracking-wider px-3 py-1.5 bg-white text-black border border-white hover:opacity-90 disabled:opacity-40"
          >
            {saving ? 'POSTING_' : 'POST COMMENT'}
          </button>
        </div>
      )}

      {closed && error && <p className="px-3 py-2 font-mono text-xs text-danger">{error}</p>}
    </div>
  )
}
