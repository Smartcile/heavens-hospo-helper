'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { ImportModal } from '@/components/import/ImportModal'
import { getActiveVenueId } from '@/lib/active-venue'
import type { AttendanceCounts } from '@/lib/staff-events'
import {
  buildStaffEventImportPrompt,
  matchStaffEventRows,
  parseStaffEventImportAnswer,
  type StaffEventImportValues,
} from '@/lib/import/staff-event'

interface Audience { kind: 'DEPARTMENT' | 'SECTION' | 'POSITION'; targetId: string }
interface StaffEvent {
  id: string
  title: string
  description: string | null
  location: string | null
  startsAt: string
  endsAt: string | null
  allDay: boolean
  attendanceRequired: boolean
  allowMaybe: boolean
  requireDeclineReason: boolean
  responseDeadline: string | null
  notes: string | null
  status: string
  reminderSentAt: string | null
  venueId: string
  venueName: string
  audiences: Audience[]
  attendance: AttendanceCounts
}
interface Venue { id: string; name: string }
interface Department { id: string; name: string; venueId: string }
interface Section { id: string; name: string; venueId: string }
interface Position { id: string; name: string; venueId: string }
interface StaffLite {
  id: string
  firstName: string
  lastName: string
  venueId: string
  departmentId: string | null
  sections: { sectionId: string }[]
  positions: { positionId: string }[]
}
interface InviteRow { id: string; staffId: string; staffName: string; departmentName: string | null; response: string; reason: string | null; respondedAt: string | null }
interface Detail extends StaffEvent { organiserName: string | null; invites: InviteRow[] }

const AUDIENCE_KINDS: { value: Audience['kind']; label: string }[] = [
  { value: 'DEPARTMENT', label: 'DEPARTMENT' },
  { value: 'SECTION', label: 'SECTION' },
  { value: 'POSITION', label: 'ROLE' },
]

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  DRAFT: 'warning',
  PUBLISHED: 'success',
  CANCELLED: 'danger',
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

const EMPTY = {
  title: '',
  description: '',
  location: '',
  date: todayKey(),
  startTime: '18:00',
  endTime: '20:00',
  allDay: false,
  attendanceRequired: true,
  allowMaybe: true,
  requireDeclineReason: false,
  responseDeadlineDate: '',
  responseDeadlineTime: '',
  notes: '',
  audiences: [] as Audience[],
  staffIds: [] as string[],
  publish: true,
}

function dateOf(iso: string): string {
  return iso.slice(0, 10)
}
function timeOf(iso: string | null): string {
  return iso ? iso.slice(11, 16) : ''
}
function whenLabel(e: StaffEvent): string {
  const day = new Date(e.startsAt).toLocaleDateString('en-NZ', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })
  if (e.allDay) return `${day} · ALL DAY`
  return `${day} · ${timeOf(e.startsAt)}–${timeOf(e.endsAt)}`
}

function AddAudience({
  options,
  onAdd,
}: {
  options: Record<Audience['kind'], { value: string; label: string }[]>
  onAdd: (kind: Audience['kind'], targetId: string) => void
}) {
  const [kind, setKind] = useState<Audience['kind']>('DEPARTMENT')
  const [targetId, setTargetId] = useState('')
  const opts = options[kind] ?? []
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={kind}
        onChange={(e) => { setKind(e.target.value as Audience['kind']); setTargetId('') }}
        className="bg-black border border-grey-mid text-white font-mono text-xs uppercase px-2 py-1.5 outline-none focus:border-white"
      >
        {AUDIENCE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
      </select>
      <select
        value={targetId}
        onChange={(e) => setTargetId(e.target.value)}
        className="flex-1 min-w-[10rem] bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white"
      >
        <option value="">{opts.length ? 'SELECT…' : 'NONE AVAILABLE'}</option>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button
        type="button"
        disabled={!targetId}
        onClick={() => { onAdd(kind, targetId); setTargetId('') }}
        className="font-mono text-xs uppercase border border-grey-mid px-3 py-1.5 text-grey-light hover:border-white hover:text-white transition-colors disabled:opacity-40"
      >
        + ADD
      </button>
    </div>
  )
}

export function StaffEventsPanel({ role, sessionVenueId, defaultVenueId }: { role: string; sessionVenueId: string; defaultVenueId?: string }) {
  const [events, setEvents] = useState<StaffEvent[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [staff, setStaff] = useState<StaffLite[]>([])
  const [loading, setLoading] = useState(true)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<StaffEvent | null>(null)
  const [form, setForm] = useState({ ...EMPTY, venueId: getActiveVenueId(role, sessionVenueId, defaultVenueId) })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pickerError, setPickerError] = useState('')

  const [attendanceForEvent, setAttendanceForEvent] = useState<Detail | null>(null)
  const [attendanceLoading, setAttendanceLoading] = useState(false)
  const [reminding, setReminding] = useState<string | null>(null)

  const [importOpen, setImportOpen] = useState(false)
  const [importExisting, setImportExisting] = useState<{ id: string; name: string }[]>([])

  const prompt = useMemo(() => buildStaffEventImportPrompt(), [])

  async function load() {
    const activeVenueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)
    const venueParam = activeVenueId ? `?venueId=${encodeURIComponent(activeVenueId)}` : ''
    const [eR, vR, dR, secR, pR, sR] = await Promise.all([
      fetch(`/api/admin/staff-events${venueParam}`),
      fetch('/api/admin/venues'),
      fetch('/api/admin/departments'),
      fetch('/api/admin/sections'),
      fetch(`/api/admin/positions${venueParam}`),
      fetch(`/api/admin/staff${venueParam}`),
    ])
    const [eData, vData, dData, secData, pData, sData] = await Promise.all([eR.json(), vR.json(), dR.json(), secR.json(), pR.json(), sR.json()])
    const misses: string[] = []
    if (!vR.ok) misses.push('VENUES')
    if (!dR.ok) misses.push('DEPARTMENTS')
    if (!secR.ok) misses.push('SECTIONS')
    if (!pR.ok) misses.push('POSITIONS')
    if (!sR.ok) misses.push('STAFF')
    setPickerError(misses.length ? `SOME PICKERS COULD NOT LOAD (${misses.join(', ')}). YOU MAY NOT HAVE ACCESS TO THEM.` : '')
    setEvents(Array.isArray(eData) ? eData : [])
    setVenues(Array.isArray(vData) ? vData : [])
    setDepartments(Array.isArray(dData) ? dData : [])
    setSections(Array.isArray(secData) ? secData : [])
    setPositions(Array.isArray(pData) ? pData : [])
    setStaff(Array.isArray(sData) ? sData : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY, venueId: getActiveVenueId(role, sessionVenueId, defaultVenueId) })
    setError(''); setOpen(true)
  }

  async function openEdit(e: StaffEvent) {
    setEditing(e); setError('')
    setForm({
      title: e.title,
      description: e.description ?? '',
      location: e.location ?? '',
      date: dateOf(e.startsAt),
      startTime: timeOf(e.startsAt) || '18:00',
      endTime: timeOf(e.endsAt) || '20:00',
      allDay: e.allDay,
      attendanceRequired: e.attendanceRequired,
      allowMaybe: e.allowMaybe,
      requireDeclineReason: e.requireDeclineReason,
      responseDeadlineDate: e.responseDeadline ? dateOf(e.responseDeadline) : '',
      responseDeadlineTime: e.responseDeadline ? timeOf(e.responseDeadline) : '',
      notes: e.notes ?? '',
      audiences: e.audiences ?? [],
      staffIds: [],
      publish: true,
      venueId: e.venueId,
    })
    setOpen(true)
    const r = await fetch(`/api/admin/staff-events/${e.id}`)
    if (r.ok) {
      const detail = await r.json() as Detail
      // Only people NOT already covered by the event's audiences are "specific
      // people"; sending every invite back would freeze removed audiences.
      const byId = new Map(staff.map((s) => [s.id, s]))
      const covered = (s: StaffLite | undefined) => !s || detail.audiences.some((a) =>
        a.kind === 'DEPARTMENT' ? s.departmentId === a.targetId
          : a.kind === 'SECTION' ? s.sections.some((x) => x.sectionId === a.targetId)
            : s.positions.some((x) => x.positionId === a.targetId))
      setForm((f) => ({
        ...f,
        // If the staff list is unavailable, keep every invite rather than
        // silently dropping people on save.
        staffIds: staff.length === 0
          ? detail.invites.map((i) => i.staffId)
          : detail.invites.filter((i) => !covered(byId.get(i.staffId))).map((i) => i.staffId),
      }))
    }
  }

  const audienceOptions: Record<Audience['kind'], { value: string; label: string }[]> = {
    DEPARTMENT: departments.filter((d) => d.venueId === form.venueId).map((d) => ({ value: d.id, label: d.name })),
    SECTION: sections.filter((s) => s.venueId === form.venueId).map((s) => ({ value: s.id, label: s.name })),
    POSITION: positions.filter((p) => p.venueId === form.venueId).map((p) => ({ value: p.id, label: p.name })),
  }
  const audienceLabel = (a: Audience) => audienceOptions[a.kind].find((o) => o.value === a.targetId)?.label ?? 'REMOVED'
  function addAudience(kind: Audience['kind'], targetId: string) {
    if (!targetId) return
    setForm((f) => f.audiences.some((x) => x.kind === kind && x.targetId === targetId) ? f : { ...f, audiences: [...f.audiences, { kind, targetId }] })
  }
  const staffLabel = (id: string) => {
    const p = staff.find((s) => s.id === id)
    return p ? `${p.firstName} ${p.lastName}` : 'STAFF'
  }
  function addStaff(id: string) {
    if (!id) return
    setForm((f) => f.staffIds.includes(id) ? f : { ...f, staffIds: [...f.staffIds, id] })
  }

  async function save() {
    if (!form.title.trim()) { setError('TITLE IS REQUIRED'); return }
    if (!form.venueId) { setError('SELECT A VENUE'); return }
    setSaving(true); setError('')
    const payload = {
      ...form,
      publish: editing ? undefined : form.publish,
      staffIds: form.staffIds,
    }
    const url = editing ? `/api/admin/staff-events/${editing.id}` : '/api/admin/staff-events'
    const r = await fetch(url, {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error ?? 'SAVE FAILED'); return }
    setOpen(false); load()
  }

  async function publish(e: StaffEvent) {
    const r = await fetch(`/api/admin/staff-events/${e.id}/publish`, { method: 'POST' })
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error ?? 'PUBLISH FAILED') }
    load()
  }

  async function remind(e: StaffEvent) {
    setReminding(e.id)
    const r = await fetch(`/api/admin/staff-events/${e.id}/remind`, { method: 'POST' })
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error ?? 'REMIND FAILED') }
    setReminding(null); load()
  }

  async function remove(e: StaffEvent) {
    if (!confirm(`DELETE STAFF EVENT "${e.title}"? THE NOTICE IS REMOVED TOO.`)) return
    const r = await fetch(`/api/admin/staff-events/${e.id}`, { method: 'DELETE' })
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error ?? 'DELETE FAILED') }
    load()
  }

  async function showAttendance(e: StaffEvent) {
    setAttendanceLoading(true); setAttendanceForEvent(null)
    const r = await fetch(`/api/admin/staff-events/${e.id}`)
    if (r.ok) setAttendanceForEvent(await r.json())
    setAttendanceLoading(false)
  }

  async function openImport() {
    const activeVenueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)
    const venueParam = activeVenueId ? `?venueId=${encodeURIComponent(activeVenueId)}` : ''
    const r = await fetch(`/api/admin/import/staff-events${venueParam}`)
    const data = await r.json()
    setImportExisting(Array.isArray(data.events) ? data.events : [])
    setImportOpen(true)
  }

  const venueOptions = venues.map((v) => ({ value: v.id, label: v.name }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-mono text-lg font-bold uppercase tracking-widest">STAFF EVENTS</h2>
          <p className="font-mono text-xs text-grey-light mt-1 uppercase">INVITE STAFF, TRACK ATTENDANCE, SEND REMINDERS</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={openImport}>⬆ IMPORT FROM EMAIL</Button>
          <Button size="sm" onClick={openCreate}>+ NEW STAFF EVENT</Button>
        </div>
      </div>

      {error && <p className="font-mono text-xs uppercase text-danger">{error}</p>}
      {pickerError && <p className="font-mono text-xs uppercase text-warning">{pickerError}</p>}

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : events.length === 0 ? (
        <p className="font-mono text-xs text-grey-light">NO STAFF EVENTS YET.</p>
      ) : (
        <div className="space-y-2">
          {events.map((e) => (
            <div key={e.id} className="bg-grey-dark border border-grey-mid p-3 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold uppercase text-white">{e.title}</span>
                    <Badge variant={STATUS_VARIANT[e.status] ?? 'default'}>{e.status}</Badge>
                    <Badge>{e.attendanceRequired ? 'REQUIRED' : 'OPTIONAL'}</Badge>
                    {e.allowMaybe && <Badge>MAYBE</Badge>}
                    {e.reminderSentAt && <Badge variant="warning">REMINDER SENT</Badge>}
                  </div>
                  <p className="font-mono text-xs uppercase text-grey-light mt-1">{whenLabel(e)} · {e.location?.trim() || 'LOCATION TBC'}</p>
                  <p className="font-mono text-xs text-grey-light mt-0.5">
                    <span className="text-success">{e.attendance.accepted} YES</span> · <span className="text-danger">{e.attendance.declined} NO</span> · <span className="text-warning">{e.attendance.maybe} MAYBE</span> · <span>{e.attendance.pending} NO REPLY</span>
                  </p>
                </div>
                <button onClick={() => showAttendance(e)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">ATTENDANCE</button>
              </div>
              <div className="flex flex-wrap gap-3 pt-2 border-t border-grey-mid">
                {e.status === 'DRAFT' && <button onClick={() => publish(e)} className="font-mono text-xs uppercase text-success hover:text-white transition-colors">PUBLISH</button>}
                {e.status === 'PUBLISHED' && e.attendance.pending > 0 && (
                  <button onClick={() => remind(e)} disabled={reminding === e.id} className="font-mono text-xs uppercase text-warning hover:text-white transition-colors disabled:opacity-40">
                    {reminding === e.id ? 'REMINDING…' : 'REMIND NO-REPLIES'}
                  </button>
                )}
                <button onClick={() => openEdit(e)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">EDIT</button>
                <button onClick={() => remove(e)} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">DELETE</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? 'EDIT STAFF EVENT' : 'NEW STAFF EVENT'} size="md">
        <div className="space-y-4">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="TEAM BRIEFING" />
          <Textarea label="Description / agenda" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What the event is about" />
          <Input label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="FUNCTION ROOM / ONLINE / TBC" />
          <div className="grid grid-cols-2 gap-3">
            {role === 'ADMIN' && (
              <Select label="Venue" value={form.venueId} onChange={(e) => setForm({ ...form, venueId: e.target.value, audiences: [] })} options={[{ value: '', label: 'SELECT VENUE' }, ...venueOptions]} />
            )}
            <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.allDay} onChange={(e) => setForm({ ...form, allDay: e.target.checked })} className="w-4 h-4 accent-white" />
            <span className="font-mono text-xs uppercase text-white">ALL DAY</span>
          </label>
          {!form.allDay && (
            <div className="grid grid-cols-2 gap-3">
              <Input label="Start" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              <Input label="End" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Response deadline date (optional)" type="date" value={form.responseDeadlineDate} onChange={(e) => setForm({ ...form, responseDeadlineDate: e.target.value })} />
            <Input label="Deadline time" type="time" value={form.responseDeadlineTime} onChange={(e) => setForm({ ...form, responseDeadlineTime: e.target.value })} />
          </div>
          <Textarea label="Notes (dress code, what to bring)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.attendanceRequired} onChange={(e) => setForm({ ...form, attendanceRequired: e.target.checked })} className="w-4 h-4 accent-white" />
              <span className="font-mono text-xs uppercase text-white">ATTENDANCE REQUIRED</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.allowMaybe} onChange={(e) => setForm({ ...form, allowMaybe: e.target.checked })} className="w-4 h-4 accent-white" />
              <span className="font-mono text-xs uppercase text-white">ALLOW MAYBE</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.requireDeclineReason} onChange={(e) => setForm({ ...form, requireDeclineReason: e.target.checked })} className="w-4 h-4 accent-white" />
              <span className="font-mono text-xs uppercase text-white">REQUIRE DECLINE REASON</span>
            </label>
            {!editing && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.publish} onChange={(e) => setForm({ ...form, publish: e.target.checked })} className="w-4 h-4 accent-white" />
                <span className="font-mono text-xs uppercase text-white">PUBLISH &amp; NOTIFY NOW</span>
              </label>
            )}
          </div>

          <div className="border border-grey-mid p-3 space-y-2">
            <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Applies to</label>
            {form.audiences.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {form.audiences.map((a) => (
                  <span key={`${a.kind}:${a.targetId}`} className="inline-flex items-center gap-1.5 border border-grey-mid px-2 py-0.5 font-mono text-xs uppercase text-white">
                    <span className="text-grey-light">{a.kind}</span>
                    {audienceLabel(a)}
                    <button type="button" onClick={() => setForm((f) => ({ ...f, audiences: f.audiences.filter((x) => !(x.kind === a.kind && x.targetId === a.targetId)) }))} className="text-grey-light hover:text-danger transition-colors">✕</button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="font-mono text-xs uppercase text-grey-light">WHOLE VENUE — ADD TARGETS OR PICK SPECIFIC PEOPLE.</p>
            )}
            <AddAudience options={audienceOptions} onAdd={addAudience} />
          </div>

          <div className="border border-grey-mid p-3 space-y-2">
            <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Specific people</label>
            {form.staffIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.staffIds.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1.5 border border-grey-mid px-2 py-0.5 font-mono text-xs uppercase text-white">
                    {staffLabel(id)}
                    <button type="button" onClick={() => setForm((f) => ({ ...f, staffIds: f.staffIds.filter((x) => x !== id) }))} className="text-grey-light hover:text-danger transition-colors">✕</button>
                  </span>
                ))}
              </div>
            )}
            <select value="" onChange={(e) => { addStaff(e.target.value); e.currentTarget.value = '' }} className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white">
              <option value="">+ ADD A PERSON</option>
              {staff.filter((s) => s.venueId === form.venueId && !form.staffIds.includes(s.id)).map((s) => (
                <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
              ))}
            </select>
          </div>

          {error && <p className="font-mono text-xs text-danger">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={save} loading={saving}>{editing ? 'SAVE' : form.publish ? 'CREATE & NOTIFY' : 'SAVE DRAFT'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>CANCEL</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!attendanceForEvent || attendanceLoading} onClose={() => { setAttendanceForEvent(null); setAttendanceLoading(false) }} title={`ATTENDANCE — ${attendanceForEvent?.title ?? ''}`} size="md">
        {attendanceLoading || !attendanceForEvent ? (
          <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'YES', value: attendanceForEvent.attendance.accepted, colour: 'text-success' },
                { label: 'NO', value: attendanceForEvent.attendance.declined, colour: 'text-danger' },
                { label: 'MAYBE', value: attendanceForEvent.attendance.maybe, colour: 'text-warning' },
                { label: 'NO REPLY', value: attendanceForEvent.attendance.pending, colour: 'text-white' },
              ].map((s) => (
                <div key={s.label} className="border border-grey-mid p-2">
                  <div className="font-mono text-xs uppercase text-grey-light">{s.label}</div>
                  <div className={`font-mono text-lg ${s.colour}`}>{s.value}</div>
                </div>
              ))}
            </div>
            <div className="border border-grey-mid divide-y divide-grey-mid max-h-[45vh] overflow-y-auto">
              {attendanceForEvent.invites.length === 0 ? (
                <p className="p-2 font-mono text-xs text-grey-light">NOBODY INVITED.</p>
              ) : attendanceForEvent.invites.map((i) => (
                <div key={i.id} className="p-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-white">{i.staffName}</div>
                    {i.departmentName && <div className="font-mono text-2xs uppercase text-grey-light">{i.departmentName}</div>}
                    {i.reason && <div className="font-mono text-2xs text-grey-light mt-0.5">REASON: {i.reason}</div>}
                  </div>
                  <span className={`font-mono text-2xs uppercase border px-1.5 py-0.5 shrink-0 ${
                    i.response === 'ACCEPTED' ? 'text-success border-success/50' : i.response === 'DECLINED' ? 'text-danger border-danger/50' : i.response === 'MAYBE' ? 'text-warning border-warning/50' : 'text-grey-light border-grey-mid'
                  }`}>{i.response}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {importOpen && (
        <ImportModal<StaffEventImportValues>
          title="IMPORT STAFF EVENT FROM AN EMAIL"
          prompt={prompt}
          existing={importExisting}
          endpoint="/api/admin/import/staff-events"
          venueId={getActiveVenueId(role, sessionVenueId, defaultVenueId)}
          parse={(text, existing) => {
            const parsed = parseStaffEventImportAnswer(text)
            if ('error' in parsed) return parsed
            return { ...parsed, rows: matchStaffEventRows(parsed.rows, existing) }
          }}
          renderSummary={(v) => ({
            title: v.title,
            meta: `${v.date}${v.allDay ? ' · ALL DAY' : ` · ${v.startTime}–${v.endTime}`}${v.audienceName ? ` · ${v.audienceName}` : ''}`,
          })}
          fields={[
            { key: 'title', label: 'TITLE' },
            { key: 'date', label: 'DATE (YYYY-MM-DD)' },
            { key: 'startTime', label: 'START (HH:mm)' },
            { key: 'endTime', label: 'END (HH:mm)' },
            { key: 'location', label: 'LOCATION' },
            { key: 'audienceName', label: 'AUDIENCE NAME' },
            { key: 'description', label: 'DESCRIPTION', kind: 'textarea' },
          ]}
          onClose={() => setImportOpen(false)}
          onImported={load}
        />
      )}
    </div>
  )
}
