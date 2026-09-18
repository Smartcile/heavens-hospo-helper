'use client'

// Customer-submitted BEO requests: edit requests and approvals. Managers
// accept or decline with a note; an accepted approval marks the event signed.

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'

export function EventRequestsPanel({
  sessionVenueId,
  defaultVenueId,
  onOpenEvent,
}: {
  sessionVenueId: string
  defaultVenueId?: string | null
  onOpenEvent: (eventId: string) => void
}) {
  const venueId = defaultVenueId || sessionVenueId

  const [requests, setRequests] = useState<
    {
      id: string
      kind: string
      status: string
      message: string
      responseNote: string | null
      requestedByName: string | null
      createdAt: string
      event: { id: string; name: string; eventDate: string }
    }[]
  >([])
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const q = new URLSearchParams({ venueId })
    if (statusFilter) q.set('status', statusFilter)
    try {
      const r = await fetch(`/api/admin/event-requests?${q.toString()}`)
      setRequests(r.ok ? await r.json() : [])
    } catch {
      setRequests([])
    }
    setLoading(false)
  }, [venueId, statusFilter])

  useEffect(() => { load() }, [load])

  async function resolve(id: string, status: 'ACCEPTED' | 'DECLINED') {
    setBusy(id)
    setError('')
    const r = await fetch(`/api/admin/event-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, responseNote: notes[id] ?? '' }),
    })
    setBusy(null)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? 'COULD NOT RESOLVE')
      return
    }
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white">REQUESTS</h1>
        <div className="flex-1" />
        <div className="flex gap-1">
          {['PENDING', 'ACCEPTED', 'DECLINED', ''].map((s) => (
            <button
              key={s || 'ALL'}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`font-mono text-[10px] uppercase px-2 py-1 border ${
                statusFilter === s ? 'border-white text-white bg-grey-mid' : 'border-grey-mid text-grey-light hover:border-white'
              }`}
            >
              {s || 'ALL'}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="font-mono text-xs text-danger uppercase">{error}</p>}

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : requests.length === 0 ? (
        <div className="border border-grey-mid p-6 text-center">
          <p className="font-mono text-xs uppercase text-grey-light">NO REQUESTS.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => (
            <div key={req.id} className="border border-grey-mid p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs uppercase text-white">{req.event.name}</span>
                <span className="font-mono text-[9px] uppercase text-accent border border-accent px-1">{req.kind}</span>
                <span className="font-mono text-[9px] uppercase text-grey-light border border-grey-mid px-1">{req.status}</span>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => onOpenEvent(req.event.id)}
                  className="font-mono text-[10px] uppercase text-grey-light hover:text-white"
                >
                  OPEN EVENT
                </button>
              </div>
              <p className="font-mono text-xs text-white whitespace-pre-wrap">{req.message}</p>
              <p className="font-mono text-[10px] uppercase text-grey-light">
                {new Date(req.createdAt).toISOString().slice(0, 16).replace('T', ' ')}
                {req.requestedByName ? ` · ${req.requestedByName}` : ''}
              </p>
              {req.status === 'PENDING' ? (
                <div className="flex items-end gap-2 flex-wrap">
                  <div className="flex-1 min-w-[12rem]">
                    <input
                      value={notes[req.id] ?? ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [req.id]: e.target.value }))}
                      placeholder="RESPONSE NOTE (OPTIONAL)"
                      className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white placeholder:text-grey-light"
                    />
                  </div>
                  <Button size="sm" onClick={() => resolve(req.id, 'ACCEPTED')} loading={busy === req.id}>ACCEPT</Button>
                  <Button size="sm" variant="danger" onClick={() => resolve(req.id, 'DECLINED')} loading={busy === req.id}>DECLINE</Button>
                </div>
              ) : (
                req.responseNote && (
                  <p className="font-mono text-[10px] uppercase text-grey-light">NOTE: {req.responseNote}</p>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
