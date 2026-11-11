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

interface StaffEvent {
  id: string
  title: string
  location: string | null
  startsAt: string
  endsAt: string | null
  allDay: boolean
  attendanceRequired: boolean
  response: string
  canRespond: boolean
  icsUrl: string
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString('en-NZ', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })
}

function eventTime(e: StaffEvent): string {
  if (e.allDay) return 'ALL DAY'
  const start = e.startsAt.slice(11, 16)
  const end = e.endsAt?.slice(11, 16)
  return end ? `${start}–${end}` : start
}

const RESPONSE_LABEL: Record<string, string> = {
  PENDING: 'NO REPLY YET',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  MAYBE: 'MAYBE',
}

export function WorkerCalendarClient() {
  const router = useRouter()
  const [shifts, setShifts] = useState<Shift[]>([])
  const [staffEvents, setStaffEvents] = useState<StaffEvent[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const r = await fetch('/api/worker/calendar')
    if (r.status === 401) { router.push('/w/login'); return }
    const data = await r.json()
    setShifts(data.shifts ?? [])
    setStaffEvents(data.staffEvents ?? [])
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

      <div className="px-4 py-4 border-t border-grey-mid space-y-2">
        <div className="font-mono text-xs uppercase tracking-wider text-grey-light">STAFF EVENTS</div>
        {staffEvents.length === 0 ? (
          <p className="font-mono text-xs text-grey-light">NO STAFF EVENTS COMING UP.</p>
        ) : (
          staffEvents.map((e) => (
            <div key={e.id} className="bg-grey-dark border border-grey-mid p-3 space-y-1 status-bar-warning">
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-sm text-white uppercase">{e.title}</div>
                <span className={`font-mono text-2xs uppercase border px-1.5 py-0.5 ${
                  e.response === 'ACCEPTED' ? 'text-success border-success/50' : e.response === 'DECLINED' ? 'text-danger border-danger/50' : 'text-warning border-warning/50'
                }`}>
                  {RESPONSE_LABEL[e.response] ?? 'NO REPLY YET'}
                </span>
              </div>
              <div className="font-mono text-xs text-grey-light uppercase">{fmt(e.startsAt)} · {eventTime(e)}</div>
              <div className="font-mono text-xs text-grey-light uppercase">{e.location?.trim() || 'LOCATION TO BE CONFIRMED'}</div>
              <div className="font-mono text-2xs uppercase text-grey-light">{e.attendanceRequired ? 'ATTENDANCE REQUIRED' : 'OPTIONAL'}</div>
              <div className="flex items-center gap-3 pt-1">
                <Link href={`/w/staff-events/${e.id}`} className="font-mono text-xs uppercase text-accent hover:text-white transition-colors">DETAILS →</Link>
                {e.response === 'ACCEPTED' && (
                  <a href={e.icsUrl} className="font-mono text-xs uppercase text-success hover:text-white transition-colors">ADD TO CALENDAR</a>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="px-4 py-4 border-t border-grey-mid space-y-2">
        <Link href="/w/availability" className="block bg-grey-dark border border-grey-mid p-3 hover:border-white transition-colors">
          <div className="font-mono text-xs uppercase text-white">TIME OFF</div>
          <div className="font-mono text-2xs uppercase text-grey-light mt-1">
            MARK DAYS UNAVAILABLE AND TICK “TIME OFF REQUEST” ON MY AVAILABILITY →
          </div>
        </Link>
        <Link href="/w/shifts" className="block bg-grey-dark border border-grey-mid p-3 hover:border-white transition-colors">
          <div className="font-mono text-xs uppercase text-white">AVAILABLE SHIFTS</div>
          <div className="font-mono text-2xs uppercase text-grey-light mt-1">
            PICK UP EVENT SHIFTS FOR YOUR ROLES →
          </div>
        </Link>
      </div>
    </div>
  )
}
