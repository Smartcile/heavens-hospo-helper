'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Notice {
  id: string
  title: string
  body: string
  priority: string
  pinned: boolean
  requiresAck: boolean
  acked: boolean
  createdAt: string
}

export function WorkerNoticesClient() {
  const router = useRouter()
  const [items, setItems] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    const r = await fetch('/api/worker/notices')
    if (r.status === 401) { router.push('/w/login'); return }
    const data = await r.json()
    setItems(data.items ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function ack(id: string) {
    setBusy(id)
    await fetch(`/api/worker/notices/${id}/ack`, { method: 'POST' })
    await load()
    setBusy(null)
  }

  if (loading) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p></div>
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="px-4 pt-6 pb-4 border-b border-grey-mid flex items-start justify-between">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">NOTICES</h1>
        <button onClick={() => router.push('/w/tasks')} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors mt-1">TASKS →</button>
      </div>

      <div className="px-4 py-4 space-y-2">
        {items.length === 0 ? (
          <p className="font-mono text-xs text-grey-light">NO NOTICES RIGHT NOW.</p>
        ) : (
          items.map((n) => {
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
          })
        )}
      </div>
    </div>
  )
}
