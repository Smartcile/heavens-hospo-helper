'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { StaffEventNoticeCard, type StaffEventNoticeData } from '@/components/worker/StaffEventNoticeCard'
import { useWorkerImmersive } from '@/components/worker/useWorkerImmersive'

export function WorkerStaffEventClient({ id }: { id: string }) {
  const router = useRouter()
  const [event, setEvent] = useState<StaffEventNoticeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useWorkerImmersive(true)

  async function load() {
    const r = await fetch(`/api/worker/staff-events/${id}`)
    if (r.status === 401) { router.push('/w/login'); return }
    if (!r.ok) { setError('THIS EVENT IS NOT AVAILABLE'); setLoading(false); return }
    setEvent(await r.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function respond(eventId: string, response: 'ACCEPTED' | 'DECLINED' | 'MAYBE', reason?: string) {
    setBusy(true); setError('')
    const r = await fetch(`/api/worker/staff-events/${eventId}/respond`, {
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
    setBusy(false)
  }

  if (loading) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p></div>
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="px-4 pt-6 pb-4 border-b border-grey-mid flex items-center gap-3">
        <Link href="/w/notices" className="font-mono text-xs uppercase border border-grey-mid px-2 py-1.5 text-grey-light hover:border-white hover:text-white transition-colors">← NOTICES</Link>
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">STAFF EVENT</h1>
      </div>
      <div className="px-4 py-4 space-y-3">
        {error && <p className="font-mono text-xs uppercase text-danger">{error}</p>}
        {event ? (
          <StaffEventNoticeCard event={event} busy={busy} onRespond={respond} />
        ) : (
          <p className="font-mono text-xs text-grey-light">THIS EVENT IS NOT AVAILABLE.</p>
        )}
      </div>
    </div>
  )
}
