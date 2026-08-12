'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { getActiveVenueId } from '@/lib/active-venue'
import { formatDateLong, keyOfDay, mondayOf, parseDay, shiftDay, weekKeys } from '@/lib/date-nav'
import { colourForShift, rosterWeekSummary, staffWeekTotals, type RosterShift } from '@/lib/roster-math'
import { generateRosterPdf } from '@/lib/roster-pdf'

interface RosterStaff {
  id: string
  firstName: string
  lastName: string
  hourlyRate: number | null
  employmentType: string | null
  departmentName: string | null
  positions: { id: string; name: string; colour: string | null }[]
}

interface RosterData {
  staff: RosterStaff[]
  shifts: RosterShift[]
  blockedDays: Record<string, string[]>
  budgetedSalesByDate: Record<string, number>
  summary: { totalCost: number; budgetedSales: number; staffingRatio: number; totalPaidHours: number }
}

interface Venue { id: string; name: string }

const WEEKDAY = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

export function RosterClient({ role, sessionVenueId, defaultVenueId }: { role: string; sessionVenueId: string; defaultVenueId?: string | null }) {
  const [venueId, setVenueId] = useState(() => getActiveVenueId(role, sessionVenueId, defaultVenueId))
  const [venues, setVenues] = useState<Venue[]>([])
  const [positions, setPositions] = useState<{ id: string; name: string; colour: string | null }[]>([])
  const [weekStart, setWeekStart] = useState(() => mondayOf(keyOfDay(new Date())))
  const [view, setView] = useState<'week' | 'day'>('week')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [data, setData] = useState<RosterData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  // Shift modal
  const [modal, setModal] = useState<null | { shift: RosterShift | null; staffId: string; date: string }>(null)
  const [form, setForm] = useState({ staffId: '', date: '', startTime: '09:00', endTime: '17:00', positionId: '', colour: '', tag: '', breakMinutes: '0', note: '' })

  // Analyze / Visualize modals
  const [showAnalyze, setShowAnalyze] = useState(false)
  const [showVisualize, setShowVisualize] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)

  const weekDays = useMemo(() => (view === 'week' ? weekKeys(weekStart) : [weekStart]), [view, weekStart])
  const todayKey = keyOfDay(new Date())

  async function loadMeta() {
    const [vR, pR] = await Promise.all([fetch('/api/admin/venues'), fetch('/api/admin/positions')])
    const [vData, pData] = await Promise.all([vR.json(), pR.json()])
    setVenues(vData)
    setPositions(pData)
  }

  const load = useCallback(async () => {
    if (!venueId) { setLoading(false); return }
    setLoading(true); setError('')
    const start = weekStart
    const end = shiftDay(weekStart, view === 'week' ? 6 : 0)
    const r = await fetch(`/api/admin/roster?venueId=${venueId}&start=${start}&end=${end}`)
    const d = await r.json()
    if (!r.ok) { setError(d.error ?? 'LOAD FAILED'); setLoading(false); return }
    setData(d)
    setLoading(false)
  }, [venueId, weekStart, view])

  useEffect(() => { loadMeta() }, [])
  useEffect(() => { if (venueId) load() }, [venueId, load])

  useEffect(() => {
    function onFs() { setFullscreen(!!document.fullscreenElement) }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const filteredStaff = useMemo(() => {
    if (!data) return []
    return data.staff.filter((s) => {
      if (search && !`${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase())) return false
      if (roleFilter && !s.positions.some((p) => p.id === roleFilter)) return false
      return true
    })
  }, [data, search, roleFilter])

  const totals = useMemo(() => {
    if (!data) return { byStaff: new Map<string, { hours: number; cost: number; shiftCount: number }>(), summary: { totalCost: 0, budgetedSales: 0, staffingRatio: 0, totalPaidHours: 0 } }
    const byStaff = staffWeekTotals(data.shifts, data.staff.map((s) => ({ staffId: s.id, hourlyRate: s.hourlyRate })))
    const summary = rosterWeekSummary(data.shifts, data.staff.map((s) => ({ staffId: s.id, hourlyRate: s.hourlyRate })), data.budgetedSalesByDate)
    return { byStaff, summary }
  }, [data])

  const publishedStatus = useMemo(() => {
    if (!data || data.shifts.length === 0) return 'DRAFT'
    const allPublished = data.shifts.every((s) => s.status === 'PUBLISHED')
    const anyPublished = data.shifts.some((s) => s.status === 'PUBLISHED')
    return allPublished ? 'PUBLISHED' : anyPublished ? 'MIXED' : 'DRAFT'
  }, [data])

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await rootRef.current?.requestFullscreen()
    }
  }

  async function handlePublish(published: boolean) {
    if (!venueId) return
    setBusy(true); setError('')
    const start = weekStart
    const end = shiftDay(weekStart, view === 'week' ? 6 : 0)
    const r = await fetch('/api/admin/roster/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, start, end, published }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'FAILED'); return }
    load()
  }

  function openModal(staffId: string, date: string, shift: RosterShift | null = null) {
    setModal({ shift, staffId, date })
    setForm(shift ? {
      staffId: shift.staffId,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      positionId: '',
      colour: shift.colour ?? '',
      tag: shift.tag ?? '',
      breakMinutes: String(shift.breakMinutes ?? 0),
      note: '',
    } : { staffId, date, startTime: '09:00', endTime: '17:00', positionId: '', colour: '', tag: '', breakMinutes: '0', note: '' })
    setError('')
  }

  async function saveShift() {
    if (!form.staffId || !form.date || !form.startTime || !form.endTime) { setError('ALL FIELDS EXCEPT TAG/COLOUR ARE REQUIRED'); return }
    setBusy(true); setError('')
    const body = {
      staffId: form.staffId,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      positionId: form.positionId || null,
      colour: form.colour || null,
      tag: form.tag || null,
      breakMinutes: Number(form.breakMinutes) || 0,
      note: form.note || null,
    }
    const r = modal?.shift
      ? await fetch(`/api/admin/shifts/${modal.shift.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/admin/shifts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setBusy(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'SAVE FAILED'); return }
    setModal(null)
    load()
  }

  async function deleteShift(id: string) {
    if (!confirm('DELETE THIS SHIFT?')) return
    await fetch(`/api/admin/shifts/${id}`, { method: 'DELETE' })
    setModal(null)
    load()
  }

  function printRoster() {
    if (!data) return
    const end = shiftDay(weekStart, view === 'week' ? 6 : 0)
    const doc = generateRosterPdf({
      venueName: venues.find((v) => v.id === venueId)?.name ?? 'ROSTER',
      weekLabel: `${formatDateLong(weekStart)} — ${formatDateLong(end)}`,
      weekDates: weekDays,
      staff: filteredStaff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` })),
      shifts: data.shifts,
      rates: data.staff.map((s) => ({ staffId: s.id, hourlyRate: s.hourlyRate })),
    })
    doc.save(`ROSTER-${weekStart}.pdf`)
  }

  const positionTotals = useMemo(() => {
    if (!data) return []
    const map = new Map<string, { name: string; hours: number; cost: number; count: number }>()
    for (const s of data.shifts) {
      const name = s.positionName ?? 'GENERAL'
      const e = map.get(name) ?? { name, hours: 0, cost: 0, count: 0 }
      const [sh, sm] = s.startTime.split(':').map(Number)
      const [eh, em] = s.endTime.split(':').map(Number)
      let mins = eh * 60 + em - (sh * 60 + sm)
      if (mins < 0) mins += 24 * 60
      mins -= Math.min(s.breakMinutes ?? 0, mins)
      e.hours = Math.round((e.hours + mins / 60) * 100) / 100
      const rate = data.staff.find((st) => st.id === s.staffId)?.hourlyRate ?? 0
      e.cost = Math.round((e.cost + (mins / 60) * rate) * 100) / 100
      e.count += 1
      map.set(name, e)
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours)
  }, [data])

  const coverage = useMemo(() => {
    if (!data) return []
    return weekDays.map((day) => {
      const dayShifts = data.shifts.filter((s) => s.date === day)
      const hours = dayShifts.reduce((t, s) => {
        const [sh, sm] = s.startTime.split(':').map(Number)
        const [eh, em] = s.endTime.split(':').map(Number)
        let mins = eh * 60 + em - (sh * 60 + sm)
        if (mins < 0) mins += 24 * 60
        return t + Math.max(0, mins - Math.min(s.breakMinutes ?? 0, mins)) / 60
      }, 0)
      return { day, count: dayShifts.length, hours: Math.round(hours * 100) / 100 }
    })
  }, [data, weekDays])

  return (
    <div ref={rootRef} className="p-4 md:p-6 space-y-4 bg-black">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest">ROSTER EDITOR</h1>
        <div className="flex flex-wrap items-center gap-2">
          {role === 'ADMIN' && (
            <div className="w-36">
              <Select label="Venue" value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
                options={[{ value: '', label: 'SELECT' }, ...venues.map(v => ({ value: v.id, label: v.name }))]} />
            </div>
          )}
          <div className="flex gap-1">
            {(['day', 'week'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`font-mono text-xs uppercase px-3 py-2 border transition-colors ${view === v ? 'bg-white text-black border-white' : 'text-grey-light border-grey-mid hover:border-white hover:text-white'}`}>
                {v === 'day' ? 'DAY' : 'WEEK'}
              </button>
            ))}
          </div>
          <div className="w-40">
            <Select label="Filter Role" value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              options={[{ value: '', label: 'ALL ROLES' }, ...positions.map(p => ({ value: p.id, label: p.name }))]} />
          </div>
          <Input label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="NAME..." className="w-40" />
          <button onClick={() => setWeekStart((w) => shiftDay(w, -7))} className="font-mono text-xs uppercase text-grey-light border border-grey-mid px-2 py-2 hover:border-white">&lt;</button>
          <button onClick={() => setWeekStart(mondayOf(todayKey))} className="font-mono text-xs uppercase text-grey-light border border-grey-mid px-2 py-2 hover:border-white">TODAY</button>
          <button onClick={() => setWeekStart((w) => shiftDay(w, 7))} className="font-mono text-xs uppercase text-grey-light border border-grey-mid px-2 py-2 hover:border-white">&gt;</button>
          <span className="font-mono text-xs uppercase text-white whitespace-nowrap">
            {view === 'week' ? `${formatDateLong(weekStart)} — ${formatDateLong(shiftDay(weekStart, 6))}` : formatDateLong(weekStart)}
          </span>
          <Button size="sm" variant="ghost" onClick={printRoster}>PRINT</Button>
          <Button size="sm" variant="ghost" onClick={toggleFullscreen}>{fullscreen ? 'EXIT FS' : 'FULLSCREEN'}</Button>
          <Button size="sm"
            variant={publishedStatus === 'PUBLISHED' ? 'primary' : 'ghost'}
            onClick={() => handlePublish(publishedStatus !== 'PUBLISHED')}
            loading={busy}>
            {publishedStatus === 'PUBLISHED' ? '✔ PUBLISHED' : publishedStatus === 'MIXED' ? '● MIXED' : 'PUBLISH'}
          </Button>
        </div>
      </div>

      {error && <p className="font-mono text-xs text-danger">{error}</p>}

      {/* Grid */}
      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : data && filteredStaff.length > 0 ? (
        <div className="border border-grey-mid overflow-auto max-h-[70vh]">
          <div className="grid" style={{ gridTemplateColumns: `220px repeat(${weekDays.length}, minmax(140px, 1fr))`, minWidth: 220 + weekDays.length * 140 }}>
            {/* Header row */}
            <div className="sticky top-0 left-0 z-20 bg-grey-dark border-b border-r border-grey-mid px-3 py-2 font-mono text-[10px] uppercase text-grey-light">TEAM</div>
            {weekDays.map((d, di) => (
              <div key={d} className={`sticky top-0 z-10 bg-grey-dark border-b border-grey-mid px-3 py-2 ${d === todayKey ? 'border-l-2 border-l-accent' : ''}`}>
                <div className="font-mono text-[10px] uppercase text-grey-light">{WEEKDAY[di]} {parseDay(d).getUTCDate()}</div>
                {d === todayKey && <div className="font-mono text-[9px] uppercase text-accent">TODAY</div>}
              </div>
            ))}

            {filteredStaff.map((s, idx) => {
              const t = totals.byStaff.get(s.id)
              return (
                <div key={s.id} className="contents">
                  {/* Staff cell — sticky left */}
                  <div className="sticky left-0 z-10 bg-grey-dark border-b border-r border-grey-mid px-3 py-2">
                    <button onClick={() => openModal(s.id, weekDays[0])} className="font-mono text-xs text-accent hover:text-white underline decoration-dotted underline-offset-2">
                      {idx + 1} — {s.firstName} {s.lastName}
                    </button>
                    <div className="font-mono text-[10px] text-grey-light mt-0.5">
                      {t ? `${t.hours.toFixed(2)}HRS / $${t.cost.toFixed(2)}` : '0HRS / $0.00'}
                    </div>
                    {s.positions.length > 0 && (
                      <div className="font-mono text-[9px] text-grey-light mt-0.5 truncate">{s.positions.map((p) => p.name).join(' · ')}</div>
                    )}
                  </div>
                  {weekDays.map((d) => {
                    const dayShifts = data.shifts.filter((sh) => sh.staffId === s.id && sh.date === d)
                    const blocked = (data.blockedDays[s.id] ?? []).includes(d)
                    return (
                      <div key={d} className={`border-b border-grey-mid min-h-[72px] p-1 relative ${blocked ? 'bg-danger/5' : 'hover:bg-black/20'}`} onClick={() => !blocked && openModal(s.id, d)}>
                        {blocked && (
                          <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none">
                            <span className="font-mono text-[9px] uppercase text-danger tracking-widest bg-black/60 px-2 py-0.5">TIME OFF</span>
                          </div>
                        )}
                        <div className="space-y-1 relative z-10">
                          {dayShifts.map((sh) => (
                            <div key={sh.id}
                              onClick={(e) => { e.stopPropagation(); openModal(s.id, d, sh) }}
                              className="px-2 py-1 cursor-pointer hover:opacity-80 transition-opacity"
                              style={{ backgroundColor: colourForShift(sh) }}>
                              <div className="font-mono text-[10px] font-bold text-white leading-tight">{sh.startTime} — {sh.endTime}</div>
                              <div className="font-mono text-[9px] text-white/90 leading-tight truncate">
                                {sh.tag ?? sh.positionName ?? 'SHIFT'}{sh.breakMinutes ? ` · ${sh.breakMinutes}M BRK` : ''}
                              </div>
                              {sh.status === 'DRAFT' && <div className="font-mono text-[8px] uppercase text-black/60 mt-0.5">DRAFT</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="font-mono text-xs text-grey-light">NO STAFF OR SHIFTS FOR THIS RANGE.</p>
      )}

      {/* Analyze / Visualize + summary footer */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowAnalyze(true)}>ANALYZE</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowVisualize(true)}>VISUALIZE</Button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-1 max-w-3xl">
          {[
            { label: 'TOTAL COST', value: `$${totals.summary.totalCost.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}` },
            { label: 'BUDGETED SALES (EXCL GST)', value: `$${totals.summary.budgetedSales.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}` },
            { label: 'STAFFING RATIO', value: `${totals.summary.staffingRatio.toFixed(2)}%` },
            { label: 'TOTAL PAID HOURS', value: totals.summary.totalPaidHours.toFixed(2) },
          ].map((x) => (
            <div key={x.label} className="border border-grey-mid p-3">
              <div className="font-mono text-[10px] uppercase text-grey-light tracking-wider mb-1">{x.label}</div>
              <div className="font-mono text-sm font-bold text-white">{x.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Shift modal */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-grey-dark border border-grey-mid p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-mono text-xs uppercase tracking-widest text-white">{modal.shift ? 'EDIT SHIFT' : 'NEW SHIFT'} — {formatDateLong(modal.date)}</h2>
            <Select label="Staff"
              value={form.staffId}
              onChange={(e) => setForm({ ...form, staffId: e.target.value })}
              options={[{ value: '', label: 'SELECT STAFF' }, ...(data?.staff ?? []).map(s => ({ value: s.id, label: `${s.firstName} ${s.lastName}` }))]} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Start" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              <Input label="End" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Role"
                value={form.positionId}
                onChange={(e) => setForm({ ...form, positionId: e.target.value })}
                options={[{ value: '', label: 'NO ROLE' }, ...positions.map(p => ({ value: p.id, label: p.name }))]} />
              <Input label="Break (minutes)" type="number" min="0" value={form.breakMinutes} onChange={(e) => setForm({ ...form, breakMinutes: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-mono text-xs uppercase text-grey-light block mb-1">Colour</label>
                <input type="color" value={form.colour || '#0E7490'} onChange={(e) => setForm({ ...form, colour: e.target.value })} className="w-full h-9 bg-black border border-grey-mid" />
              </div>
              <Input label="Tag (optional)" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="EVENT / ALT LEAVE" />
            </div>
            <Input label="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="OPTIONAL" />
            {error && <p className="font-mono text-xs text-danger">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={saveShift} loading={busy}>SAVE</Button>
              {modal.shift && <Button size="sm" variant="danger" onClick={() => deleteShift(modal.shift!.id)}>DELETE</Button>}
              <Button size="sm" variant="ghost" onClick={() => setModal(null)}>CANCEL</Button>
            </div>
          </div>
        </div>
      )}

      {/* Analyze modal — per-role totals */}
      {showAnalyze && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowAnalyze(false)}>
          <div className="bg-grey-dark border border-grey-mid p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-mono text-xs uppercase tracking-widest text-white">ROLE ANALYSIS — {view === 'week' ? `${formatDateLong(weekStart)} → ${formatDateLong(shiftDay(weekStart, 6))}` : formatDateLong(weekStart)}</h2>
            <div className="space-y-1 max-h-[50vh] overflow-y-auto">
              {positionTotals.length === 0 && <p className="font-mono text-xs text-grey-light">NO SHIFTS.</p>}
              {positionTotals.map((p) => (
                <div key={p.name} className="flex items-center justify-between border border-grey-mid px-3 py-2">
                  <div>
                    <div className="font-mono text-xs text-white">{p.name}</div>
                    <div className="font-mono text-[10px] text-grey-light">{p.count} SHIFT{p.count !== 1 ? 'S' : ''}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs text-white">{p.hours.toFixed(2)}HRS</div>
                    <div className="font-mono text-[10px] text-grey-light">${p.cost.toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <Button size="sm" variant="ghost" onClick={() => setShowAnalyze(false)}>CLOSE</Button>
            </div>
          </div>
        </div>
      )}

      {/* Visualize modal — per-day coverage */}
      {showVisualize && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowVisualize(false)}>
          <div className="bg-grey-dark border border-grey-mid p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-mono text-xs uppercase tracking-widest text-white">COVERAGE</h2>
            <div className="space-y-1 max-h-[50vh] overflow-y-auto">
              {coverage.map((c) => (
                <div key={c.day} className="flex items-center justify-between border border-grey-mid px-3 py-2">
                  <div className="font-mono text-xs text-white">{formatDateLong(c.day)}</div>
                  <div className="font-mono text-xs text-grey-light">
                    {c.count} ON · {c.hours.toFixed(2)}HRS
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <Button size="sm" variant="ghost" onClick={() => setShowVisualize(false)}>CLOSE</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
