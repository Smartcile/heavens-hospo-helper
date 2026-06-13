'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Shift {
  id: string
  date: string
  startTime: string
  endTime: string
  departmentName: string | null
  note: string | null
}

interface TimeOff {
  id: string
  startDate: string
  endDate: string
  reason: string | null
  status: string
  reviewNote: string | null
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString('en-NZ', { weekday: 'short', day: '2-digit', month: 'short' })
}

export function WorkerCalendarClient() {
  const router = useRouter()
  const [shifts, setShifts] = useState<Shift[]>([])
  const [timeOff, setTimeOff] = useState<TimeOff[]>([])
  const [loading, setLoading] = useState(true)

  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  async function load() {
    const r = await fetch('/api/worker/calendar')
    if (r.status === 401) { router.push('/w/login'); return }
    const data = await r.json()
    setShifts(data.shifts ?? [])
    setTimeOff(data.timeOff ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function submitRequest() {
    if (!start || !end) { setError('PICK START AND END DATES'); return }
    setSubmitting(true); setError('')
    const r = await fetch('/api/worker/timeoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: start, endDate: end, reason: reason || null }),
    })
    setSubmitting(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'FAILED'); return }
    setStart(''); setEnd(''); setReason(''); setShowForm(false)
    load()
  }

  async function cancelRequest(id: string) {
    await fetch(`/api/worker/timeoff/${id}`, { method: 'DELETE' })
    load()
  }

  if (loading) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p></div>
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="px-4 pt-6 pb-4 border-b border-grey-mid flex items-start justify-between">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">MY SCHEDULE</h1>
        <button onClick={() => router.push('/w/tasks')} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors mt-1">TASKS →</button>
      </div>

      {/* Upcoming shifts */}
      <div className="px-4 py-4 space-y-2">
        <div className="font-mono text-xs uppercase tracking-wider text-grey-light">UPCOMING SHIFTS</div>
        {shifts.length === 0 ? (
          <p className="font-mono text-xs text-grey-light">NO UPCOMING SHIFTS ROSTERED.</p>
        ) : (
          shifts.map((s) => (
            <div key={s.id} className="bg-grey-dark border border-grey-mid p-3 flex items-center justify-between status-bar-success">
              <div>
                <div className="font-mono text-sm text-white uppercase">{fmt(s.date)}</div>
                {s.departmentName && <div className="font-mono text-xs text-grey-light">{s.departmentName}</div>}
              </div>
              <div className="font-mono text-sm text-success">{s.startTime}–{s.endTime}</div>
            </div>
          ))
        )}
      </div>

      {/* Time off */}
      <div className="px-4 py-4 space-y-2 border-t border-grey-mid">
        <div className="flex items-center justify-between">
          <div className="font-mono text-xs uppercase tracking-wider text-grey-light">TIME OFF</div>
          <button onClick={() => setShowForm((v) => !v)} className="font-mono text-xs uppercase text-white hover:text-accent transition-colors">
            {showForm ? 'CANCEL' : '+ REQUEST'}
          </button>
        </div>

        {showForm && (
          <div className="bg-grey-dark border border-grey-mid p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="font-mono text-xs uppercase text-grey-light">FROM</label>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="bg-black border border-grey-mid text-white font-mono text-sm px-2 py-2 outline-none focus:border-white" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-mono text-xs uppercase text-grey-light">TO</label>
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="bg-black border border-grey-mid text-white font-mono text-sm px-2 py-2 outline-none focus:border-white" />
              </div>
            </div>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="REASON (OPTIONAL)" className="w-full bg-black border border-grey-mid text-white font-sans text-sm px-3 py-2 outline-none focus:border-white placeholder:text-grey-light" />
            {error && <p className="font-mono text-xs text-danger">{error}</p>}
            <button onClick={submitRequest} disabled={submitting} className="w-full h-12 bg-white text-black font-mono font-bold text-sm uppercase tracking-widest hover:bg-accent transition-colors disabled:opacity-40">
              {submitting ? 'SENDING_' : 'SUBMIT REQUEST'}
            </button>
          </div>
        )}

        {timeOff.length === 0 ? (
          <p className="font-mono text-xs text-grey-light">NO TIME-OFF REQUESTS.</p>
        ) : (
          timeOff.map((t) => {
            const color = t.status === 'APPROVED' ? 'text-success' : t.status === 'DECLINED' ? 'text-danger' : 'text-warning'
            return (
              <div key={t.id} className="bg-grey-dark border border-grey-mid p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-white">{fmt(t.startDate)} – {fmt(t.endDate)}</span>
                  <span className={`font-mono text-xs uppercase ${color}`}>{t.status}</span>
                </div>
                {t.reason && <p className="font-sans text-xs text-grey-light mt-1">{t.reason}</p>}
                {t.reviewNote && <p className="font-mono text-xs text-grey-light mt-1">NOTE: {t.reviewNote}</p>}
                {t.status === 'PENDING' && (
                  <button onClick={() => cancelRequest(t.id)} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors mt-2">CANCEL REQUEST</button>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
