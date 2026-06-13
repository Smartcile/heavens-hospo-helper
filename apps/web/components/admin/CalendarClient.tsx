'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'

interface ShiftItem { id: string; staffId: string; staffName: string; departmentName: string | null; startTime: string; endTime: string }
interface TimeOffItem { id: string; staffId: string; staffName: string; status: string }
interface DayData { shifts: ShiftItem[]; timeOff: TimeOffItem[]; dutiesRequired: boolean }
interface Pending { id: string; staffName: string; startDate: string; endDate: string; reason: string | null }

interface Venue { id: string; name: string }
interface StaffLite { id: string; firstName: string; lastName: string; venueId: string }

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
  const [loading, setLoading] = useState(true)

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
    setLoading(false)
  }

  async function loadMeta() {
    const [vR, sR] = await Promise.all([fetch('/api/admin/venues'), fetch('/api/admin/staff')])
    const [vData, sData] = await Promise.all([vR.json(), sR.json()])
    setVenues(vData)
    setStaff(sData)
  }

  useEffect(() => { loadMeta() }, [])
  useEffect(() => { load() }, [year, month, venueId])

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
      </div>

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
                      <span className="font-mono text-xs text-white">{s.staffName} · {s.startTime}–{s.endTime}{s.departmentName ? ` · ${s.departmentName}` : ''}</span>
                      <button onClick={() => deleteShift(s.id)} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">DEL</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

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
