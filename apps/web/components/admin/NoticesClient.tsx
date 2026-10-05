'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { getActiveVenueId } from '@/lib/active-venue'
import { formatDate } from '@/lib/utils'

interface Notice {
  id: string
  title: string
  body: string
  priority: string
  pinned: boolean
  requiresAck: boolean
  isActive: boolean
  venueId: string
  departmentId: string | null
  departmentName: string | null
  audiences: { kind: string; targetId: string }[]
  ackCount: number
  applicableCount: number
  createdAt: string
}
interface Venue { id: string; name: string }
interface Department { id: string; name: string; venueId: string }
interface Section { id: string; name: string; venueId: string; departmentId: string }
interface Position { id: string; name: string; venueId: string }
interface Audience { kind: 'DEPARTMENT' | 'SECTION' | 'POSITION'; targetId: string }
interface AckRow { id: string; name: string; acked: boolean; ackedAt: string | null }

const AUDIENCE_KINDS: { value: Audience['kind']; label: string }[] = [
  { value: 'DEPARTMENT', label: 'DEPARTMENT' },
  { value: 'SECTION', label: 'SECTION' },
  { value: 'POSITION', label: 'ROLE' },
]

const PRIORITY_OPTIONS = [
  { value: 'INFO', label: 'INFO' },
  { value: 'IMPORTANT', label: 'IMPORTANT' },
  { value: 'URGENT', label: 'URGENT' },
]

const EMPTY = { title: '', body: '', priority: 'INFO', pinned: false, requiresAck: false, audiences: [] as Audience[] }

// Module-level so it isn't remounted on every parent render (keeps focus).
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

export function NoticesClient({ role, sessionVenueId, defaultVenueId }: { role: string; sessionVenueId: string; defaultVenueId?: string }) {
  const [notices, setNotices] = useState<Notice[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Notice | null>(null)
  const [form, setForm] = useState({ ...EMPTY, venueId: getActiveVenueId(role, sessionVenueId, defaultVenueId) })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [acksFor, setAcksFor] = useState<Notice | null>(null)
  const [ackRows, setAckRows] = useState<AckRow[]>([])

  async function load() {
    const activeVenueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)
    const venueParam = activeVenueId ? `?venueId=${encodeURIComponent(activeVenueId)}` : ''
    const [nR, vR, dR, secR, pR] = await Promise.all([
      fetch(`/api/admin/notices${venueParam}`),
      fetch('/api/admin/venues'),
      fetch('/api/admin/departments'),
      fetch('/api/admin/sections'),
      fetch(`/api/admin/positions${venueParam}`),
    ])
    const [nData, vData, dData, secData, pData] = await Promise.all([nR.json(), vR.json(), dR.json(), secR.json(), pR.json()])
    setNotices(Array.isArray(nData) ? nData : [])
    setVenues(vData)
    setDepartments(dData)
    setSections(Array.isArray(secData) ? secData : [])
    setPositions(Array.isArray(pData) ? pData : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY, venueId: getActiveVenueId(role, sessionVenueId, defaultVenueId) })
    setError(''); setOpen(true)
  }
  function openEdit(n: Notice) {
    setEditing(n)
    setForm({
      title: n.title, body: n.body, priority: n.priority, pinned: n.pinned, requiresAck: n.requiresAck, venueId: n.venueId,
      audiences: (n.audiences ?? []).length
        ? n.audiences.map((a) => ({ kind: a.kind as Audience['kind'], targetId: a.targetId }))
        : n.departmentId
          ? [{ kind: 'DEPARTMENT' as const, targetId: n.departmentId }]
          : [],
    })
    setError(''); setOpen(true)
  }

  async function save() {
    if (!form.title.trim() || !form.body.trim()) { setError('TITLE AND BODY ARE REQUIRED'); return }
    if (!form.venueId) { setError('SELECT A VENUE'); return }
    setSaving(true); setError('')
    const url = editing ? `/api/admin/notices/${editing.id}` : '/api/admin/notices'
    const method = editing ? 'PUT' : 'POST'
    const r = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, departmentId: null, audiences: form.audiences }),
    })
    setSaving(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'SAVE FAILED'); return }
    setOpen(false); load()
  }

  async function toggleActive(n: Notice) {
    await fetch(`/api/admin/notices/${n.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !n.isActive }) })
    load()
  }
  async function remove(n: Notice) {
    if (!confirm(`DELETE NOTICE "${n.title}"?`)) return
    await fetch(`/api/admin/notices/${n.id}`, { method: 'DELETE' })
    load()
  }
  async function showAcks(n: Notice) {
    setAcksFor(n)
    const r = await fetch(`/api/admin/notices/${n.id}/acks`)
    const d = await r.json()
    setAckRows(d.staff ?? [])
  }

  const venueOptions = venues.map((v) => ({ value: v.id, label: v.name }))
  const audienceOptions: Record<Audience['kind'], { value: string; label: string }[]> = {
    DEPARTMENT: departments.filter((d) => d.venueId === form.venueId).map((d) => ({ value: d.id, label: d.name })),
    SECTION: sections.filter((s) => s.venueId === form.venueId).map((s) => ({ value: s.id, label: s.name })),
    POSITION: positions.filter((p) => p.venueId === form.venueId).map((p) => ({ value: p.id, label: p.name })),
  }
  const audienceLabel = (a: Audience) =>
    audienceOptions[a.kind].find((o) => o.value === a.targetId)?.label ?? 'REMOVED'
  function addAudience(kind: Audience['kind'], targetId: string) {
    if (!targetId) return
    setForm((f) =>
      f.audiences.some((x) => x.kind === kind && x.targetId === targetId)
        ? f
        : { ...f, audiences: [...f.audiences, { kind, targetId }] },
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest">NOTICES</h1>
          <p className="font-mono text-xs text-grey-light mt-1 uppercase">POST WHAT&apos;S GOING ON — STAFF SEE IT ON THEIR PHONE</p>
        </div>
        <Button size="sm" onClick={openCreate}>+ NEW NOTICE</Button>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : notices.length === 0 ? (
        <p className="font-mono text-xs text-grey-light">NO NOTICES YET.</p>
      ) : (
        <div className="space-y-2">
          {notices.map((n) => (
            <div key={n.id} className={`bg-grey-dark border border-grey-mid p-4 ${!n.isActive ? 'opacity-50' : ''} ${n.priority === 'URGENT' ? 'status-bar-danger' : n.priority === 'IMPORTANT' ? 'status-bar-warning' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {n.pinned && <span className="font-mono text-xs text-accent">📌</span>}
                    <span className="font-mono text-sm font-semibold uppercase text-white">{n.title}</span>
                    <Badge variant={n.priority === 'URGENT' ? 'danger' : n.priority === 'IMPORTANT' ? 'warning' : 'default'}>{n.priority}</Badge>
                    <Badge>
                      {n.audiences.length === 0
                        ? n.departmentName ?? 'WHOLE VENUE'
                        : `${n.audiences.length} TARGET${n.audiences.length === 1 ? '' : 'S'}`}
                    </Badge>
                    {!n.isActive && <Badge variant="danger">INACTIVE</Badge>}
                  </div>
                  <p className="font-sans text-xs text-grey-light mt-1 whitespace-pre-wrap">{n.body}</p>
                  <p className="font-mono text-xs text-grey-light mt-1">{formatDate(n.createdAt)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 pt-2 mt-2 border-t border-grey-mid">
                {n.requiresAck && (
                  <button onClick={() => showAcks(n)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">
                    READ {n.ackCount}/{n.applicableCount}
                  </button>
                )}
                <button onClick={() => toggleActive(n)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">{n.isActive ? 'DEACTIVATE' : 'ACTIVATE'}</button>
                <button onClick={() => openEdit(n)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">EDIT</button>
                <button onClick={() => remove(n)} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">DELETE</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor */}
      <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? 'EDIT NOTICE' : 'NEW NOTICE'} size="md">
        <div className="space-y-4">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="STAFF MEETING FRIDAY 3PM" />
          <Textarea label="Body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Details staff need to know..." />
          <div className="grid grid-cols-2 gap-3">
            {role === 'ADMIN' && (
              <Select label="Venue" value={form.venueId} onChange={(e) => setForm({ ...form, venueId: e.target.value, audiences: [] })} options={[{ value: '', label: 'SELECT VENUE' }, ...venueOptions]} />
            )}
            <Select label="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} options={PRIORITY_OPTIONS} />
          </div>

          <div className="border border-grey-mid p-3 space-y-2">
            <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Applies to</label>
            {form.audiences.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {form.audiences.map((a) => (
                  <span key={`${a.kind}:${a.targetId}`} className="inline-flex items-center gap-1.5 border border-grey-mid px-2 py-0.5 font-mono text-[10px] uppercase text-white">
                    <span className="text-grey-light">{a.kind}</span>
                    {audienceLabel(a)}
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, audiences: f.audiences.filter((x) => !(x.kind === a.kind && x.targetId === a.targetId)) }))}
                      className="text-grey-light hover:text-danger transition-colors"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="font-mono text-[10px] uppercase text-grey-light">WHOLE VENUE — ADD TARGETS TO NARROW IT.</p>
            )}
            <AddAudience options={audienceOptions} onAdd={addAudience} />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} className="w-4 h-4 accent-white" />
              <span className="font-mono text-xs uppercase text-white">PIN TO TOP</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.requiresAck} onChange={(e) => setForm({ ...form, requiresAck: e.target.checked })} className="w-4 h-4 accent-white" />
              <span className="font-mono text-xs uppercase text-white">REQUIRE ACKNOWLEDGEMENT</span>
            </label>
          </div>
          {error && <p className="font-mono text-xs text-danger">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={save} loading={saving}>SAVE</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>CANCEL</Button>
          </div>
        </div>
      </Modal>

      {/* Acks */}
      <Modal isOpen={!!acksFor} onClose={() => setAcksFor(null)} title={`READ BY — ${acksFor?.title ?? ''}`} size="sm">
        <div className="space-y-1">
          {ackRows.length === 0 ? (
            <p className="font-mono text-xs text-grey-light">NO APPLICABLE STAFF.</p>
          ) : (
            ackRows.map((s) => (
              <div key={s.id} className="flex items-center justify-between border border-grey-mid p-2">
                <span className="font-mono text-xs text-white">{s.name}</span>
                {s.acked ? (
                  <span className="font-mono text-xs text-success">✓ {s.ackedAt ? formatDate(s.ackedAt) : ''}</span>
                ) : (
                  <span className="font-mono text-xs text-grey-light">NOT YET</span>
                )}
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  )
}
