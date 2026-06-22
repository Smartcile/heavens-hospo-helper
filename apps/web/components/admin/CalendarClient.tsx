'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { formatBreaks } from '@/lib/breaks'

interface ShiftItem { id: string; staffId: string; staffName: string; departmentName: string | null; startTime: string; endTime: string }
interface TimeOffItem { id: string; staffId: string; staffName: string; status: string }
interface EventItem { id: string; title: string; time: string | null; allDay: boolean; location: string | null; source: string; floorPlanSlug?: string | null; floorPlanName?: string | null }

interface FloorPlanLite { slug: string; name: string }
interface DayData { shifts: ShiftItem[]; timeOff: TimeOffItem[]; events: EventItem[]; dutiesRequired: boolean }
interface Pending { id: string; staffName: string; startDate: string; endDate: string; reason: string | null }

interface Venue {
  id: string
  name: string
  loadedRosterUrl?: string | null
  googleCalendarUrl?: string | null
  icalFeedUrl?: string | null
  externalRefreshMinutes?: number
}
interface StaffLite { id: string; firstName: string; lastName: string; venueId: string }
type CalView = 'planner' | 'loaded' | 'events'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function keyOf(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function CalendarClient({ role, sessionVenueId }: { role: string; sessionVenueId: string }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-12
  const [venueId, setVenueId] = useState(role === 'MANAGER' ? sessionVenueId : '')
  const [days, setDays] = useState<Record<string, DayData>>({})
  const [pending, setPending] = useState<Pending[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [staff, setStaff] = useState<StaffLite[]>([])
  const [floorPlans, setFloorPlans] = useState<FloorPlanLite[]>([])
  const [loading, setLoading] = useState(true)

  const [view, setView] = useState<CalView>('planner')
  const [refreshTick, setRefreshTick] = useState(0)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  // Day modal
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [newStaffId, setNewStaffId] = useState('')
  const [newStart, setNewStart] = useState('09:00')
  const [newEnd, setNewEnd] = useState('17:00')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ year: String(year), month: String(month) })
    if (venueId) params.set('venueId', venueId)
    const r = await fetch(`/api/admin/calendar?${params}`)
    const data = await r.json()
    setDays(data.days ?? {})
    setPending(data.pending ?? [])
    setLastSyncedAt(data.lastSyncedAt ?? null)
    setLoading(false)
  }

  // Pull external feeds (Google / iCal) into the planner, then reload the grid.
  async function syncNow(silent = false) {
    if (!silent) setSyncing(true)
    try {
      await fetch('/api/admin/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(venueId ? { venueId } : {}),
      })
    } finally {
      if (!silent) setSyncing(false)
      load()
    }
  }

  async function loadMeta() {
    const [vR, sR, fR] = await Promise.all([
      fetch('/api/admin/venues'),
      fetch('/api/admin/staff'),
      venueId ? fetch(`/api/admin/floorplan?venueId=${venueId}`) : Promise.resolve(null),
    ])
    const [vData, sData] = await Promise.all([vR.json(), sR.json()])
    setVenues(vData)
    setStaff(sData)
    if (fR) {
      const fpData = await fR.json()
      setFloorPlans(fpData.map((fp: any) => ({ slug: fp.slug, name: fp.name })))
    }
  }

  async function linkEventToPlan(eventId: string, slug: string, name: string) {
    await fetch(`/api/admin/calendar/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ floorPlanSlug: slug || null, floorPlanName: name || null }),
    })
    load()
  }

  useEffect(() => { loadMeta() }, [venueId])
  useEffect(() => { load() }, [year, month, venueId])

  // Auto-refresh the embedded views at the venue's chosen interval.
  useEffect(() => {
    if (view === 'planner') return
    const v = venues.find((x) => x.id === venueId) ?? (venues.length === 1 ? venues[0] : undefined)
    const mins = v?.externalRefreshMinutes ?? 0
    if (!mins) return
    const t = setInterval(() => setRefreshTick((n) => n + 1), mins * 60 * 1000)
    return () => clearInterval(t)
  }, [view, venueId, venues])

  // On the planner: import external feeds on open / venue change, then re-sync
  // on the venue's chosen interval so changed events stay current.
  useEffect(() => {
    if (view !== 'planner' || venues.length === 0) return
    syncNow(true)
    const v = venues.find((x) => x.id === venueId) ?? (venues.length === 1 ? venues[0] : undefined)
    const mins = v?.externalRefreshMinutes ?? 0
    if (!mins) return
    const t = setInterval(() => syncNow(true), mins * 60 * 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, venueId, venues, year, month])

  function prevMonth() {
    if (month === 1) { setYear(year - 1); setMonth(12) } else setMonth(month - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear(year + 1); setMonth(1) } else setMonth(month + 1)
  }

  async function reviewRequest(id: string, status: 'APPROVED' | 'DECLINED') {
    await fetch(`/api/admin/timeoff/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    load()
  }

  async function addShift() {
    if (!openDay || !newStaffId) { setError('PICK A STAFF MEMBER'); return }
    setBusy(true); setError('')
    const r = await fetch('/api/admin/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: newStaffId, date: openDay, startTime: newStart, endTime: newEnd }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'FAILED'); return }
    setNewStaffId('')
    load()
  }

  async function deleteShift(id: string) {
    await fetch(`/api/admin/shifts/${id}`, { method: 'DELETE' })
    load()
  }

  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDow = new Date(year, month - 1, 1).getDay()
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const venueOptions = [{ value: '', label: 'ALL VENUES' }, ...venues.map((v) => ({ value: v.id, label: v.name }))]
  const staffOptions = staff
    .filter((s) => !venueId || s.venueId === venueId)
    .map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` }))
  const openDayData = openDay ? days[openDay] : null

  // Venue whose external embeds we show (manager's own, or the admin's selection).
  const embedVenue = venues.find((v) => v.id === (venueId || (role === 'MANAGER' ? venueId : ''))) ?? (venues.length === 1 ? venues[0] : undefined)
  const refreshMins = embedVenue?.externalRefreshMinutes ?? 0
  const embedUrl = view === 'loaded' ? embedVenue?.loadedRosterUrl : view === 'events' ? embedVenue?.googleCalendarUrl : null

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest">CALENDAR</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {role === 'ADMIN' && (
            <div className="w-44">
              <Select value={venueId} onChange={(e) => setVenueId(e.target.value)} options={venueOptions} />
            </div>
          )}
          <button onClick={prevMonth} className="font-mono text-xs uppercase border border-grey-mid px-3 py-2 text-white hover:border-white transition-colors">← PREV</button>
          <span className="font-mono text-sm uppercase text-white w-28 text-center">{MONTHS[month - 1]} {year}</span>
          <button onClick={nextMonth} className="font-mono text-xs uppercase border border-grey-mid px-3 py-2 text-white hover:border-white transition-colors">NEXT →</button>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex gap-2 flex-wrap">
        {([['planner', 'PLANNER'], ['loaded', 'LOADED ROSTER'], ['events', 'EVENTS']] as [CalView, string][]).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`font-mono text-xs uppercase px-3 py-2 border transition-colors ${view === v ? 'bg-white text-black border-white' : 'border-grey-mid text-grey-light hover:border-white hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {view !== 'planner' ? (
        <div className="space-y-2">
          {!embedVenue ? (
            <p className="font-mono text-xs text-grey-light">SELECT A VENUE TO VIEW ITS EXTERNAL {view === 'loaded' ? 'ROSTER' : 'CALENDAR'}.</p>
          ) : !embedUrl ? (
            <p className="font-mono text-xs text-grey-light">
              NO {view === 'loaded' ? 'LOADED ROSTER' : 'GOOGLE CALENDAR'} LINK SET — ADD ONE IN SETTINGS → INTEGRATIONS.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-mono text-xs text-grey-light uppercase">
                  LIVE FROM {view === 'loaded' ? 'LOADED' : 'GOOGLE CALENDAR'}{refreshMins ? ` · AUTO-REFRESH ${refreshMins}MIN` : ''}
                </span>
                <div className="flex gap-3">
                  <button onClick={() => setRefreshTick((n) => n + 1)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">REFRESH</button>
                  <a href={embedUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">OPEN ↗</a>
                </div>
              </div>
              <iframe key={`${view}-${refreshTick}`} src={embedUrl} className="w-full h-[75vh] border border-grey-mid bg-white" />
              <p className="font-mono text-xs text-grey-light">IF THIS PANEL IS BLANK, THE SOURCE MAY BLOCK EMBEDDING — USE OPEN ↗ INSTEAD.</p>
            </>
          )}
        </div>
      ) : (
      <>
      {/* Import status + manual sync */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="font-mono text-xs text-grey-light uppercase">
          {lastSyncedAt ? `IMPORTED EVENTS LAST SYNCED ${new Date(lastSyncedAt).toLocaleString('en-NZ')}` : 'IMPORTED EVENTS — NOT YET SYNCED'}
        </span>
        <button
          onClick={() => syncNow(false)}
          disabled={syncing}
          className="font-mono text-xs uppercase border border-grey-mid px-3 py-1.5 text-white hover:border-white transition-colors disabled:opacity-40"
        >
          {syncing ? 'SYNCING_' : 'SYNC NOW'}
        </button>
      </div>

      {/* Pending approvals */}
      {pending.length > 0 && (
        <div className="bg-grey-dark border border-grey-mid">
          <div className="p-3 border-b border-grey-mid font-mono text-xs uppercase tracking-wider text-warning">
            PENDING TIME-OFF REQUESTS ({pending.length})
          </div>
          <div className="divide-y divide-grey-mid">
            {pending.map((p) => (
              <div key={p.id} className="p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="font-mono text-xs text-white">
                  {p.staffName} · {new Date(p.startDate).toLocaleDateString('en-NZ')} – {new Date(p.endDate).toLocaleDateString('en-NZ')}
                  {p.reason && <span className="text-grey-light"> · {p.reason}</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => reviewRequest(p.id, 'APPROVED')} className="font-mono text-xs uppercase text-success hover:opacity-80 transition-opacity">APPROVE</button>
                  <button onClick={() => reviewRequest(p.id, 'DECLINED')} className="font-mono text-xs uppercase text-danger hover:opacity-80 transition-opacity">DECLINE</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <div className="border border-grey-mid">
          <div className="grid grid-cols-7">
            {DOW.map((d) => (
              <div key={d} className="p-2 border-b border-grey-mid font-mono text-xs uppercase text-grey-light text-center">{d}</div>
            ))}
            {cells.map((day, i) => {
              if (day === null) return <div key={i} className="min-h-24 border-b border-r border-grey-mid bg-black/20" />
              const k = keyOf(year, month, day)
              const data = days[k]
              return (
                <button
                  key={i}
                  onClick={() => { setOpenDay(k); setError(''); setNewStaffId('') }}
                  className="min-h-24 border-b border-r border-grey-mid p-1.5 text-left align-top hover:bg-grey-dark transition-colors flex flex-col gap-0.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-white">{day}</span>
                    {data?.dutiesRequired && <span className="w-1.5 h-1.5 bg-accent" title="Duties due" />}
                  </div>
                  {data?.shifts.slice(0, 3).map((s) => (
                    <div key={s.id} className="font-mono text-[10px] text-success truncate leading-tight">
                      {s.startTime} {s.staffName.split(' ')[0]}
                    </div>
                  ))}
                  {data && data.shifts.length > 3 && (
                    <div className="font-mono text-[10px] text-grey-light">+{data.shifts.length - 3}</div>
                  )}
                  {data?.timeOff.map((t) => (
                    <div key={t.id} className={`font-mono text-[10px] truncate leading-tight ${t.status === 'APPROVED' ? 'text-danger' : 'text-warning'}`}>
                      OFF {t.staffName.split(' ')[0]}{t.status === 'PENDING' ? '?' : ''}
                    </div>
                  ))}
                  {data?.events.slice(0, 2).map((ev) => (
                    <div key={ev.id} className="font-mono text-[10px] text-accent truncate leading-tight">
                      ◆ {ev.time ? `${ev.time} ` : ''}{ev.title}
                    </div>
                  ))}
                  {data && data.events.length > 2 && (
                    <div className="font-mono text-[10px] text-accent">+{data.events.length - 2} EVENT{data.events.length - 2 > 1 ? 'S' : ''}</div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 font-mono text-xs text-grey-light">
        <span><span className="text-success">▮</span> SHIFT</span>
        <span><span className="text-danger">▮</span> OFF (APPROVED)</span>
        <span><span className="text-warning">▮</span> OFF (PENDING)</span>
        <span><span className="text-accent">▮</span> DUTIES DUE</span>
        <span><span className="text-accent">◆</span> IMPORTED EVENT</span>
      </div>
      </>
      )}

      {/* Day modal */}
      <Modal isOpen={!!openDay} onClose={() => setOpenDay(null)} title={openDay ? new Date(openDay).toLocaleDateString('en-NZ', { weekday: 'long', day: '2-digit', month: 'long' }) : ''} size="md">
        {openDay && (
          <div className="space-y-4">
            <div>
              <div className="font-mono text-xs uppercase tracking-wider text-grey-light mb-2">SHIFTS</div>
              {!openDayData || openDayData.shifts.length === 0 ? (
                <p className="font-mono text-xs text-grey-light">NO SHIFTS.</p>
              ) : (
                <div className="space-y-1">
                  {openDayData.shifts.map((s) => (
                    <div key={s.id} className="flex items-center justify-between border border-grey-mid p-2">
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-white">{s.staffName} · {s.startTime}–{s.endTime}{s.departmentName ? ` · ${s.departmentName}` : ''}</div>
                        <div className="font-mono text-xs text-grey-light">BREAKS: {formatBreaks(s.startTime, s.endTime)}</div>
                      </div>
                      <button onClick={() => deleteShift(s.id)} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">DEL</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {openDayData && openDayData.events.length > 0 && (
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-grey-light mb-2">EVENTS</div>
                <div className="space-y-1">
                  {openDayData.events.map((ev) => (
                    <div key={ev.id} className="border border-grey-mid p-2 space-y-1">
                      <div className="font-mono text-xs text-accent">◆ {ev.allDay ? 'ALL DAY' : ev.time} · {ev.title}</div>
                      {ev.location && <div className="font-mono text-xs text-grey-light">{ev.location}</div>}
                      <div className="font-mono text-[10px] uppercase text-grey-light">{ev.source === 'GOOGLE' ? 'GOOGLE CALENDAR' : 'ICAL FEED'}</div>
                      <div className="flex items-center gap-2">
                        <select value={ev.floorPlanSlug ?? ''}
                          onChange={(e) => {
                            const fp = floorPlans.find((f) => f.slug === e.target.value)
                            linkEventToPlan(ev.id, e.target.value, fp?.name ?? '')
                          }}
                          className="bg-grey-dark border border-grey-mid text-white font-mono text-[10px] p-1 flex-1">
                          <option value="">NO FLOOR PLAN</option>
                          {floorPlans.map((fp) => (
                            <option key={fp.slug} value={fp.slug}>{fp.name}</option>
                          ))}
                        </select>
                        {ev.floorPlanSlug && <span className="font-mono text-[10px] text-success uppercase">LINKED</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {openDayData && openDayData.timeOff.length > 0 && (
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-grey-light mb-2">TIME OFF</div>
                <div className="space-y-1">
                  {openDayData.timeOff.map((t) => (
                    <div key={t.id} className="font-mono text-xs">
                      <span className="text-white">{t.staffName}</span>{' '}
                      <Badge variant={t.status === 'APPROVED' ? 'danger' : 'warning'}>{t.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-grey-mid pt-3 space-y-2">
              <div className="font-mono text-xs uppercase tracking-wider text-grey-light">ADD SHIFT</div>
              <Select value={newStaffId} onChange={(e) => setNewStaffId(e.target.value)} options={[{ value: '', label: 'SELECT STAFF' }, ...staffOptions]} />
              <div className="grid grid-cols-2 gap-2">
                <Input label="Start" type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
                <Input label="End" type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
              </div>
              {error && <p className="font-mono text-xs text-danger">{error}</p>}
              <Button size="sm" onClick={addShift} loading={busy} disabled={!newStaffId}>ADD SHIFT</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
