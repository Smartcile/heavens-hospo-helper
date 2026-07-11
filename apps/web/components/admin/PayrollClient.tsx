'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { getActiveVenueId } from '@/lib/active-venue'

interface TimeClockFull {
  id: string
  staffId: string
  venueId: string
  clockIn: string
  clockOut: string | null
  isActive: boolean
  geoValid: boolean
  note: string | null
  staff: { firstName: string; lastName: string; department: { name: string } | null }
}

interface StaffLite { id: string; firstName: string; lastName: string }
interface Venue { id: string; name: string }

export function PayrollClient({ role, sessionVenueId, defaultVenueId }: { role: string; sessionVenueId: string; defaultVenueId?: string }) {
  const [sessions, setSessions] = useState<TimeClockFull[]>([])
  const [staff, setStaff] = useState<StaffLite[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [venueId, setVenueId] = useState(() => getActiveVenueId(role, sessionVenueId, defaultVenueId))
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  })
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [viewMode, setViewMode] = useState<'day' | 'person'>('person')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Inline editing
  const [editingEntry, setEditingEntry] = useState<TimeClockFull | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [entryStaffId, setEntryStaffId] = useState('')
  const [entryClockIn, setEntryClockIn] = useState('')
  const [entryClockOut, setEntryClockOut] = useState('')
  const [entryNote, setEntryNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function loadMeta() {
    const [vR, sR] = await Promise.all([
      fetch('/api/admin/venues'),
      fetch('/api/admin/staff'),
    ])
    const [vData, sData] = await Promise.all([vR.json(), sR.json()])
    setVenues(vData)
    setStaff(sData)
  }

  async function load() {
    if (!venueId) { setLoading(false); return }
    setLoading(true); setError('')

    const params = new URLSearchParams({ venueId })
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    params.set('limit', '2000')

    const r = await fetch(`/api/admin/timeclock?${params}`)
    const data = await r.json()

    if (!r.ok) { setError(data.error ?? 'LOAD FAILED'); setLoading(false); return }

    setSessions(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { loadMeta() }, [])
  useEffect(() => { if (venueId) load() }, [venueId, fromDate, toDate])

  function openCreate() {
    setEditingEntry(null)
    setShowCreate(true)
    setEntryStaffId('')
    setEntryClockIn('')
    setEntryClockOut('')
    setEntryNote('')
    setError('')
  }

  function openEdit(s: TimeClockFull) {
    setEditingEntry(s)
    setShowCreate(false)
    setEntryStaffId(s.staffId)
    setEntryClockIn(new Date(s.clockIn).toISOString().slice(0, 16))
    setEntryClockOut(s.clockOut ? new Date(s.clockOut).toISOString().slice(0, 16) : '')
    setEntryNote(s.note ?? '')
    setError('')
  }

  function cancelEdit() {
    setEditingEntry(null)
    setShowCreate(false)
    setError('')
  }

  async function handleSave() {
    if (!entryStaffId || !entryClockIn) { setError('STAFF AND CLOCK-IN ARE REQUIRED'); return }
    setSaving(true); setError('')

    const url = editingEntry
      ? `/api/admin/timeclock/${editingEntry.id}`
      : '/api/admin/timeclock'
    const method = editingEntry ? 'PUT' : 'POST'

    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(editingEntry ? {} : { staffId: entryStaffId }),
        clockIn: new Date(entryClockIn).toISOString(),
        clockOut: entryClockOut ? new Date(entryClockOut).toISOString() : null,
        note: entryNote || null,
      }),
    })

    setSaving(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'SAVE FAILED'); return }
    setEditingEntry(null)
    setShowCreate(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('DELETE THIS CLOCK ENTRY?')) return
    await fetch(`/api/admin/timeclock/${id}`, { method: 'DELETE' })
    load()
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  }

  function calcHours(clockIn: string, clockOut: string | null) {
    if (!clockOut) return null
    return Math.round(((new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3600000) * 100) / 100
  }

  function formatHours(h: number | null) {
    if (h === null) return 'ACTIVE'
    const hrs = Math.floor(h)
    const mins = Math.round((h - hrs) * 60)
    if (mins > 0) return `${hrs}H ${mins}M`
    return `${hrs}H`
  }

  function groupByDay(): Map<string, TimeClockFull[]> {
    const map = new Map<string, TimeClockFull[]>()
    for (const s of sessions) {
      const key = s.clockIn.slice(0, 10)
      const arr = map.get(key) ?? []
      arr.push(s)
      map.set(key, arr)
    }
    return map
  }

  function groupByPerson(): Map<string, { name: string; sessions: TimeClockFull[] }> {
    const map = new Map<string, { name: string; sessions: TimeClockFull[] }>()
    for (const s of sessions) {
      const key = s.staffId
      const entry = map.get(key)
      if (entry) {
        entry.sessions.push(s)
      } else {
        map.set(key, { name: `${s.staff.firstName} ${s.staff.lastName}`, sessions: [s] })
      }
    }
    return map
  }

  const dayGroups = groupByDay()
  const personGroups = groupByPerson()
  const totalHours = sessions.reduce((s, t) => s + (calcHours(t.clockIn, t.clockOut) ?? 0), 0)

  function renderEntryRow(s: TimeClockFull) {
    const hrs = calcHours(s.clockIn, s.clockOut)
    const isEditing = editingEntry?.id === s.id

    return (
      <div key={s.id}>
        <div className="p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            {viewMode === 'person' ? (
              <>
                <div className="font-mono text-xs text-white">{formatDate(s.clockIn)}</div>
                <div className="font-mono text-xs text-grey-light mt-0.5">
                  {formatTime(s.clockIn)} — {s.clockOut ? formatTime(s.clockOut) : 'ACTIVE'}
                  {s.note && <span className="ml-2 text-grey-light">[{s.note}]</span>}
                  {!s.geoValid && <span className="ml-2 text-danger">OFFSITE</span>}
                </div>
              </>
            ) : (
              <>
                <div className="font-mono text-xs text-white">{s.staff.firstName} {s.staff.lastName}</div>
                <div className="font-mono text-xs text-grey-light mt-0.5">
                  {formatTime(s.clockIn)} — {s.clockOut ? formatTime(s.clockOut) : 'ACTIVE'}
                  {s.staff.department && <span className="ml-2">[{s.staff.department.name}]</span>}
                  {!s.geoValid && <span className="ml-2 text-danger">OFFSITE</span>}
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="font-mono text-xs text-white">{formatHours(hrs)}</span>
            <button onClick={() => openEdit(s)}
              className="font-mono text-xs uppercase text-grey-light hover:text-warning transition-colors px-1 py-0.5">EDIT</button>
            <button onClick={() => handleDelete(s.id)}
              className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors px-1 py-0.5">DEL</button>
          </div>
        </div>

        {/* Inline edit form */}
        {isEditing && (
          <div className="px-3 pb-3 border-t border-grey-mid bg-black/30">
            <div className="grid grid-cols-2 gap-2 mt-3">
              <Input label="Clock In" type="datetime-local"
                value={entryClockIn}
                onChange={(e) => setEntryClockIn(e.target.value)} />
              <Input label="Clock Out (optional)" type="datetime-local"
                value={entryClockOut}
                onChange={(e) => setEntryClockOut(e.target.value)} />
            </div>
            <div className="mt-2">
              <Input label="Note (optional)"
                value={entryNote}
                onChange={(e) => setEntryNote(e.target.value)}
                placeholder="e.g. LATE START" />
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleSave} loading={saving}>SAVE</Button>
              <Button size="sm" variant="ghost" onClick={cancelEdit}>CANCEL</Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="font-mono text-xl font-bold uppercase tracking-widest">TIME CLOCK</h1>

      {/* Filters row */}
      <div className="flex flex-wrap items-end gap-2">
        {role === 'ADMIN' && (
          <div className="w-36">
            <Select label="Venue" value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              options={[{ value: '', label: 'SELECT' }, ...venues.map(v => ({ value: v.id, label: v.name }))]} />
          </div>
        )}
        <Input label="From" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input label="To" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <div className="flex gap-1">
          <button onClick={() => setViewMode('day')}
            className={`font-mono text-xs uppercase px-3 py-2 border transition-colors ${viewMode === 'day' ? 'bg-white text-black border-white' : 'text-grey-light border-grey-mid hover:border-white hover:text-white'}`}>
            BY DAY
          </button>
          <button onClick={() => setViewMode('person')}
            className={`font-mono text-xs uppercase px-3 py-2 border transition-colors ${viewMode === 'person' ? 'bg-white text-black border-white' : 'text-grey-light border-grey-mid hover:border-white hover:text-white'}`}>
            BY PERSON
          </button>
        </div>
        <Button size="sm" onClick={openCreate}>+ MANUAL ENTRY</Button>
      </div>

      {/* New entry inline form */}
      {showCreate && (
        <div className="border border-grey-mid bg-grey-dark p-4 space-y-3">
          <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">MANUAL ENTRY</h2>
          <Select label="Staff"
            value={entryStaffId}
            onChange={(e) => setEntryStaffId(e.target.value)}
            options={[{ value: '', label: 'SELECT STAFF' }, ...staff.filter(s => !venueId || s.id).map(s => ({ value: s.id, label: `${s.firstName} ${s.lastName}` }))]} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Clock In" type="datetime-local"
              value={entryClockIn}
              onChange={(e) => setEntryClockIn(e.target.value)} />
            <Input label="Clock Out (optional)" type="datetime-local"
              value={entryClockOut}
              onChange={(e) => setEntryClockOut(e.target.value)} />
          </div>
          <Input label="Note (optional)"
            value={entryNote}
            onChange={(e) => setEntryNote(e.target.value)}
            placeholder="e.g. LATE START" />
          {error && <p className="font-mono text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} loading={saving}>SAVE</Button>
            <Button size="sm" variant="ghost" onClick={cancelEdit}>CANCEL</Button>
          </div>
        </div>
      )}

      {/* Summary */}
      {!loading && sessions.length > 0 && (
        <div className="border border-grey-mid p-3 flex flex-wrap gap-6 bg-grey-dark">
          <div>
            <div className="font-mono text-xs uppercase text-grey-light tracking-wider">Sessions</div>
            <div className="font-mono text-sm text-white">{sessions.length}</div>
          </div>
          <div>
            <div className="font-mono text-xs uppercase text-grey-light tracking-wider">Total Hours</div>
            <div className="font-mono text-sm text-white">{formatHours(totalHours)}</div>
          </div>
          <div>
            <div className="font-mono text-xs uppercase text-grey-light tracking-wider">Staff</div>
            <div className="font-mono text-sm text-white">{personGroups.size}</div>
          </div>
        </div>
      )}

      {error && <p className="font-mono text-xs text-danger">{error}</p>}

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : sessions.length === 0 ? (
        <p className="font-mono text-xs text-grey-light">NO CLOCK DATA FOR THIS RANGE.</p>
      ) : viewMode === 'person' ? (
        /* BY PERSON */
        <div className="space-y-3">
          {[...personGroups.entries()].map(([staffId, group]) => {
            const personHours = group.sessions.reduce((s, t) => s + (calcHours(t.clockIn, t.clockOut) ?? 0), 0)
            return (
              <div key={staffId} className="border border-grey-mid bg-grey-dark">
                <div className="p-3 border-b border-grey-mid flex items-center justify-between">
                  <div>
                    <span className="font-mono text-sm font-bold uppercase text-white">{group.name}</span>
                    <div className="flex gap-3 mt-0.5">
                      <span className="font-mono text-xs text-grey-light">{group.sessions.length} SHIFT{group.sessions.length !== 1 ? 'S' : ''}</span>
                      <span className="font-mono text-xs text-white">{formatHours(personHours)}</span>
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-grey-mid">
                  {group.sessions.map((s) => renderEntryRow(s))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* BY DAY */
        <div className="space-y-3">
          {[...dayGroups.entries()]
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([dateKey, daySessions]) => {
              const dayHours = daySessions.reduce((s, t) => s + (calcHours(t.clockIn, t.clockOut) ?? 0), 0)
              return (
                <div key={dateKey} className="border border-grey-mid bg-grey-dark">
                  <div className="p-3 border-b border-grey-mid flex items-center justify-between">
                    <span className="font-mono text-xs uppercase tracking-widest text-white">
                      {new Date(dateKey + 'T00:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    <span className="font-mono text-xs text-white">
                      {daySessions.length} SHIFT{daySessions.length !== 1 ? 'S' : ''} · {formatHours(dayHours)}
                    </span>
                  </div>
                  <div className="divide-y divide-grey-mid">
                    {daySessions.map((s) => renderEntryRow(s))}
                  </div>
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}
