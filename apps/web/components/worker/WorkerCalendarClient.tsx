'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatBreaks } from '@/lib/breaks'

interface Shift {
  id: string
  date: string
  startTime: string
  endTime: string
  departmentName: string | null
  note: string | null
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString('en-NZ', { weekday: 'short', day: '2-digit', month: 'short' })
}

export function WorkerCalendarClient() {
  const router = useRouter()
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const r = await fetch('/api/worker/calendar')
    if (r.status === 401) { router.push('/w/login'); return }
    const data = await r.json()
    setShifts(data.shifts ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p></div>
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="px-4 pt-6 pb-4 border-b border-grey-mid flex items-start justify-between">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">MY SCHEDULE</h1>
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
                <div className="font-mono text-xs text-grey-light">BREAKS: {formatBreaks(s.startTime, s.endTime)}</div>
              </div>
              <div className="font-mono text-sm text-success">{s.startTime}–{s.endTime}</div>
            </div>
          ))
        )}
      </div>

      <div className="px-4 py-4 border-t border-grey-mid">
        <Link href="/w/availability" className="block bg-grey-dark border border-grey-mid p-3 hover:border-white transition-colors">
          <div className="font-mono text-xs uppercase text-white">TIME OFF</div>
          <div className="font-mono text-2xs uppercase text-grey-light mt-1">
            MARK DAYS UNAVAILABLE AND TICK “TIME OFF REQUEST” ON MY AVAILABILITY →
          </div>
        </Link>
      </div>
    </div>
  )
}
