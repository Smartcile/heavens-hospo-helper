'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { DateNav } from '@/components/admin/DateNav'
import { getActiveVenueId } from '@/lib/active-venue'
import { keyOfDay, shiftDay, type DateRange } from '@/lib/date-nav'

interface ClockRow {
  id: string
  staffId: string
  clockIn: string
  clockOut: string | null
  isActive: boolean
  geoValid: boolean
  note: string | null
  breaksMinutes: number
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
  rejectedReason: string | null
  source: string
  staff: {
    firstName: string
    lastName: string
    hourlyRate: number | null
    department: { name: string } | null
    positions: { position: { name: string; colour: string | null } }[]
  }
}

interface EditRow {
  id: string
  field: string
  oldValue: string | null
  newValue: string | null
  editedAt: string
  timeClock: { clockIn: string; staff: { firstName: string; lastName: string } }
}

interface StaffLite { id: string; firstName: string; lastName: string; hourlyRate: number | null }
interface Venue { id: string; name: string }

const STATUS_COLOUR: Record<string, string> = {
  APPROVED: 'bg-success/15 text-success border-success',
  PENDING: 'bg-warning/10 text-warning border-warning',
  REJECTED: 'bg-danger/10 text-danger border-danger',
}

const FIELD_LABELS: Record<string, string> = {
  clockIn: 'WHEN IN',
  clockOut: 'WHEN OUT',
  breaksMinutes: 'BREAKS',
  note: 'NOTE',
}

export function ClocksClient({ role, sessionVenueId, defaultVenueId }: { role: string; sessionVenueId: string; defaultVenueId?: string }) {
  const router = useRouter()
  const [sessions, setSessions] = useState<ClockRow[]>([])
  const [staff, setStaff] = useState<StaffLite[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [venueId, setVenueId] = useState(() => getActiveVenueId(role, sessionVenueId, defaultVenueId))
  const [date, setDate] = useState(keyOfDay(new Date()))
  const [showDeleted, setShowDeleted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Create / edit
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<ClockRow | null>(null)
  const [form, setForm] = useState({ staffId: '', clockIn: '', clockOut: '', note: '', breaks: '0' })
  const [saving, setSaving] = useState(false)

  // View edits modal
  const [showEdits, setShowEdits] = useState(false)
  const [edits, setEdits] = useState<EditRow[]>([])
  const [editsLoading, setEditsLoading] = useState(false)

  async function loadMeta() {
    const [vR, sR] = await Promise.all([fetch('/api/admin/venues'), fetch('/api/admin/staff')])
    const [vData, sData] = await Promise.all([vR.json(), sR.json()])
    setVenues(vData)
    setStaff(sData)
  }

  const load = useCallback(async () => {
    if (!venueId) { setLoading(false); return }
    setLoading(true); setError('')
    const params = new URLSearchParams({ venueId, from: date, to: date, limit: '2000' })
    if (showDeleted) params.set('deleted', '1')
    const r = await fetch(`/api/admin/timeclock?${params}`)
    const data = await r.json()
    if (!r.ok) { setError(data.error ?? 'LOAD FAILED'); setLoading(false); return }
    setSessions(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [venueId, date, showDeleted])

  useEffect(() => { loadMeta() }, [])
  useEffect(() => { if (venueId) load() }, [venueId, load])

  function roleOf(s: ClockRow): string {
    return s.staff.positions[0]?.position.name ?? s.staff.department?.name ?? '—'
  }

  function fmtTime(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function fmtDuration(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = Math.round(minutes % 60)
    if (h > 0) return `${h}H ${m}M`
    return `${m}M`
  }

  function workedMinutes(s: ClockRow): number {
    if (!s.clockOut) return 0
    const total = (new Date(s.clockOut).getTime() - new Date(s.clockIn).getTime()) / 60000
    return Math.round(Math.max(0, total - (s.breaksMinutes ?? 0)))
  }

  function money(n: number | null): string {
    if (n == null) return '—'
    return `$${n.toFixed(2)}`
  }

  function openCreate() {
    setEditing(null)
    setForm({ staffId: '', clockIn: '', clockOut: '', note: '', breaks: '0' })
    setShowCreate(true)
    setError('')
  }

  function openEdit(s: ClockRow) {
    setEditing(s)
    setForm({
      staffId: s.staffId,
      clockIn: new Date(s.clockIn).toISOString().slice(0, 16),
      clockOut: s.clockOut ? new Date(s.clockOut).toISOString().slice(0, 16) : '',
      note: s.note ?? '',
      breaks: String(s.breaksMinutes ?? 0),
    })
    setShowCreate(false)
    setError('')
  }

  async function handleSave() {
    if (!form.staffId || !form.clockIn) { setError('STAFF AND CLOCK-IN ARE REQUIRED'); return }
    setSaving(true); setError('')
    const url = editing ? `/api/admin/timeclock/${editing.id}` : '/api/admin/timeclock'
    const method = editing ? 'PUT' : 'POST'
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(editing ? {} : { staffId: form.staffId }),
        clockIn: new Date(form.clockIn).toISOString(),
        clockOut: form.clockOut ? new Date(form.clockOut).toISOString() : null,
        note: form.note || null,
        breaksMinutes: Number(form.breaks) || 0,
      }),
    })
    setSaving(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'SAVE FAILED'); return }
    setEditing(null)
    setShowCreate(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('DELETE THIS CLOCK ENTRY?')) return
    const r = await fetch(`/api/admin/timeclock/${id}`, { method: 'DELETE' })
    if (r.ok) load()
  }

  async function handleApproval(s: ClockRow, status: 'APPROVED' | 'REJECTED') {
    const reason = status === 'REJECTED' ? prompt('REASON FOR REJECTION (OPTIONAL):') : null
    if (status === 'REJECTED' && reason === null) return // cancelled prompt
    const r = await fetch(`/api/admin/timeclock/${s.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reason }),
    })
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'FAILED'); return }
    load()
  }

  async function openViewEdits() {
    setShowEdits(true)
    setEditsLoading(true)
    setError('')
    const params = new URLSearchParams({ venueId, from: date, to: date, limit: '500' })
    const r = await fetch(`/api/admin/timeclock/edits?${params}`)
    const data = await r.json()
    setEditsLoading(false)
    if (!r.ok) { setError(data.error ?? 'LOAD FAILED'); return }
    setEdits(Array.isArray(data) ? data : [])
  }

  function onDateChange(next: string, _range: DateRange) {
    setDate(next)
  }

  const totalRows = sessions.length
  const totalWorkedMinutes = sessions.reduce((s, x) => s + workedMinutes(x), 0)

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest">STAFF CLOCKS</h1>
        <div className="text-right">
          <DateNav date={date} onChange={onDateChange} />
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3 justify-end">
        <label className="flex items-center gap-2 font-mono text-xs uppercase text-grey-light cursor-pointer">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} className="accent-white" />
          SHOW DELETED CLOCKS
        </label>
        {role === 'ADMIN' && (
          <div className="w-40">
            <Select label="Venue" value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              options={[{ value: '', label: 'SELECT' }, ...venues.map(v => ({ value: v.id, label: v.name }))]} />
          </div>
        )}
        <Button size="sm" variant="ghost" onClick={openViewEdits}>VIEW EDITS</Button>
        <Button size="sm" onClick={openCreate}>+ ADD CLOCK</Button>
      </div>

      {error && <p className="font-mono text-xs text-danger">{error}</p>}

      {/* Data table */}
      <div className="border border-grey-mid bg-grey-dark overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-grey-mid">
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-grey-light">TEAM MEMBER</th>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-grey-light">ROLE</th>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-grey-light">WHEN IN</th>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-grey-light">WHEN OUT</th>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-grey-light">BREAKS</th>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-grey-light">TIME WORKED</th>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-grey-light">RATE</th>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-grey-light">STATUS</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-grey-mid">
            {!loading && sessions.map((s) => (
              <tr key={s.id} className="hover:bg-black/20">
                <td className="px-3 py-2">
                  <div className="font-mono text-xs text-white">{s.staff.firstName} {s.staff.lastName}</div>
                  {s.note && <div className="font-mono text-[10px] text-grey-light">[{s.note}]</div>}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-grey-light">{roleOf(s)}</td>
                <td className="px-3 py-2 font-mono text-xs text-grey-light">{fmtTime(s.clockIn)}</td>
                <td className="px-3 py-2 font-mono text-xs text-grey-light">
                  {s.clockOut ? fmtTime(s.clockOut) : <span className="text-warning">ACTIVE</span>}
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => openEdit(s)} className="font-mono text-xs text-accent hover:text-white underline decoration-dotted underline-offset-2">
                    {fmtDuration(s.breaksMinutes ?? 0)}
                  </button>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-white">{s.clockOut ? fmtDuration(workedMinutes(s)) : '—'}</td>
                <td className="px-3 py-2">
                  <button onClick={() => openEdit(s)} className="font-mono text-xs text-accent hover:text-white underline decoration-dotted underline-offset-2">
                    {money(s.staff.hourlyRate)}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider border ${STATUS_COLOUR[s.approvalStatus] ?? STATUS_COLOUR.PENDING}`}>
                    {s.approvalStatus}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    {s.approvalStatus === 'PENDING' && !s.isActive && (
                      <>
                        <button onClick={() => handleApproval(s, 'APPROVED')}
                          className="font-mono text-[10px] uppercase text-success hover:text-white border border-success/40 px-2 py-1 hover:bg-success hover:text-black transition-colors">
                          APPROVE
                        </button>
                        <button onClick={() => handleApproval(s, 'REJECTED')}
                          className="font-mono text-[10px] uppercase text-danger hover:text-white border border-danger/40 px-2 py-1 hover:bg-danger hover:text-black transition-colors">
                          REJECT
                        </button>
                      </>
                    )}
                    {s.rejectedReason && (
                      <span className="font-mono text-[10px] text-danger" title={s.rejectedReason}>REASON</span>
                    )}
                    <button onClick={() => openEdit(s)} title="EDIT"
                      className="font-mono text-[10px] uppercase text-grey-light hover:text-white border border-grey-mid px-2 py-1 transition-colors">
                      EDIT
                    </button>
                    <button onClick={() => handleDelete(s.id)} title="DELETE"
                      className="font-mono text-[10px] uppercase text-grey-light hover:text-danger transition-colors px-1">
                      DEL
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? (
          <div className="p-4 font-mono text-xs text-grey-light loading-cursor">LOADING</div>
        ) : sessions.length === 0 ? (
          <div className="p-4 font-mono text-xs text-grey-light">NO CLOCKS FOR THIS DATE.</div>
        ) : null}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()}
          className="font-mono text-xs uppercase tracking-wider text-accent border border-grey-mid px-3 py-1.5 hover:border-white transition-colors">
          ← BACK
        </button>
        <div className="font-mono text-xs text-grey-light uppercase">
          TOTAL ROWS: {totalRows} · {fmtDuration(totalWorkedMinutes)} WORKED
        </div>
      </div>

      {/* Add / edit modal */}
      {(showCreate || editing) && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => { setShowCreate(false); setEditing(null) }}>
          <div className="bg-grey-dark border border-grey-mid p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-mono text-xs uppercase tracking-widest text-white">{editing ? 'EDIT CLOCK' : 'ADD CLOCK'}</h2>
            {!editing && (
              <Select label="Staff"
                value={form.staffId}
                onChange={(e) => setForm({ ...form, staffId: e.target.value })}
                options={[{ value: '', label: 'SELECT STAFF' }, ...staff.map(s => ({ value: s.id, label: `${s.firstName} ${s.lastName}` }))]} />
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input label="Clock In" type="datetime-local" value={form.clockIn} onChange={(e) => setForm({ ...form, clockIn: e.target.value })} />
              <Input label="Clock Out (optional)" type="datetime-local" value={form.clockOut} onChange={(e) => setForm({ ...form, clockOut: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Breaks (minutes)" type="number" min="0" value={form.breaks} onChange={(e) => setForm({ ...form, breaks: e.target.value })} />
              <div className="flex items-end pb-1">
                <p className="font-mono text-[10px] text-grey-light">RATE: {money(staff.find(s => s.id === form.staffId)?.hourlyRate ?? null)}</p>
              </div>
            </div>
            <Input label="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. LATE START" />
            {error && <p className="font-mono text-xs text-danger">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={handleSave} loading={saving}>SAVE</Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setEditing(null) }}>CANCEL</Button>
            </div>
          </div>
        </div>
      )}

      {/* View edits modal */}
      {showEdits && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowEdits(false)}>
          <div className="bg-grey-dark border border-grey-mid p-5 w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-mono text-xs uppercase tracking-widest text-white mb-3">CLOCK EDITS — {date}</h2>
            <div className="flex-1 overflow-y-auto space-y-2">
              {editsLoading ? (
                <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
              ) : edits.length === 0 ? (
                <p className="font-mono text-xs text-grey-light">NO EDITS ON THIS DATE.</p>
              ) : edits.map((e) => (
                <div key={e.id} className="border border-grey-mid p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-white">
                      {e.timeClock.staff.firstName} {e.timeClock.staff.lastName}
                    </span>
                    <span className="font-mono text-[10px] text-grey-light">
                      {new Date(e.editedAt).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  <div className="font-mono text-[10px] text-grey-light mt-1">
                    {FIELD_LABELS[e.field] ?? e.field}: {e.oldValue || '—'} → {e.newValue || '—'}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-3">
              <Button size="sm" variant="ghost" onClick={() => setShowEdits(false)}>CLOSE</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
