'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { groupWorkerNotices } from '@/lib/notice-groups'
import { StaffEventNoticeCard, type StaffEventNoticeData } from '@/components/worker/StaffEventNoticeCard'

interface Notice {
  id: string
  title: string
  body: string
  priority: string
  pinned: boolean
  requiresAck: boolean
  acked: boolean
  createdAt: string
  staffEvent?: StaffEventNoticeData
}

export function WorkerNoticesClient() {
  const router = useRouter()
  const [items, setItems] = useState<Notice[]>([])
  const [firstName, setFirstName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function load() {
    const r = await fetch('/api/worker/notices')
    if (r.status === 401) { router.push('/w/login'); return }
    const data = await r.json()
    setItems(data.items ?? [])
    setFirstName(data.firstName ?? '')
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function ack(id: string) {
    setBusy(id)
    await fetch(`/api/worker/notices/${id}/ack`, { method: 'POST' })
    await load()
    setBusy(null)
  }

  async function respond(id: string, response: 'ACCEPTED' | 'DECLINED' | 'MAYBE', reason?: string) {
    setBusy(id)
    setError('')
    const r = await fetch(`/api/worker/staff-events/${id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response, reason }),
    })
    if (r.status === 401) { router.push('/w/login'); return }
    if (!r.ok) {
      const data = await r.json().catch(() => ({}))
      setError(data.error ?? 'COULD NOT SAVE YOUR RESPONSE')
    }
    await load()
    setBusy(null)
  }

  if (loading) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p></div>
  }

  const { pinned, unread, acknowledged } = groupWorkerNotices(items)

  const card = (n: Notice) => {
    if (n.staffEvent) {
      return (
        <StaffEventNoticeCard
          key={n.id}
          event={n.staffEvent}
          busy={busy === n.staffEvent.id}
          onRespond={respond}
        />
      )
    }
    const bar = n.priority === 'URGENT' ? 'status-bar-danger' : n.priority === 'IMPORTANT' ? 'status-bar-warning' : ''
    return (
      <div key={n.id} className={`bg-grey-dark border border-grey-mid p-4 ${bar}`}>
        <div className="flex items-center gap-2 flex-wrap">
          {n.pinned && <span className="font-mono text-xs text-accent">📌</span>}
          <span className="font-mono text-sm font-semibold uppercase text-white">{n.title}</span>
          {n.priority !== 'INFO' && (
            <span className={`font-mono text-xs uppercase ${n.priority === 'URGENT' ? 'text-danger' : 'text-warning'}`}>{n.priority}</span>
          )}
        </div>
        <p className="font-sans text-sm text-grey-light mt-1 whitespace-pre-wrap">{n.body}</p>
        {n.requiresAck && (
          n.acked ? (
            <div className="mt-2 font-mono text-xs text-success uppercase">✓ ACKNOWLEDGED</div>
          ) : (
            <button
              onClick={() => ack(n.id)}
              disabled={busy === n.id}
              className="mt-3 w-full h-11 bg-white text-black font-mono font-bold text-xs uppercase tracking-widest hover:bg-accent transition-colors disabled:opacity-40"
            >
              {busy === n.id ? 'SAVING_' : 'GOT IT'}
            </button>
          )
        )}
      </div>
    )
  }

  const sectionHead = (label: string) => (
    <div className="pt-2 font-mono text-xs uppercase tracking-widest text-grey-light">{label}</div>
  )

  return (
    <div className="min-h-screen bg-black">
      <div className="px-4 pt-6 pb-4 border-b border-grey-mid flex items-start justify-between">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">NOTICES</h1>
      </div>

      <div className="px-4 py-4 space-y-2">
        {error && <p className="font-mono text-xs uppercase text-danger">{error}</p>}
        {items.length === 0 ? (
          <p className="font-mono text-xs text-grey-light">NO NOTICES RIGHT NOW.</p>
        ) : (
          <>
            {pinned.length > 0 && (
              <>
                {sectionHead('PINNED')}
                {pinned.map(card)}
              </>
            )}
            {unread.map(card)}
            {acknowledged.length > 0 && (
              <>
                {sectionHead('READ / ACKNOWLEDGED')}
                {acknowledged.map(card)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
