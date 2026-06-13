'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
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
  ackCount: number
  applicableCount: number
  createdAt: string
}
interface Venue { id: string; name: string }
interface Department { id: string; name: string; venueId: string }
interface AckRow { id: string; name: string; acked: boolean; ackedAt: string | null }

const PRIORITY_OPTIONS = [
  { value: 'INFO', label: 'INFO' },
  { value: 'IMPORTANT', label: 'IMPORTANT' },
  { value: 'URGENT', label: 'URGENT' },
]

const EMPTY = { title: '', body: '', priority: 'INFO', departmentId: '', pinned: false, requiresAck: false }

export function NoticesClient({ role, sessionVenueId }: { role: string; sessionVenueId: string }) {
  const [notices, setNotices] = useState<Notice[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Notice | null>(null)
  const [form, setForm] = useState({ ...EMPTY, venueId: role === 'MANAGER' ? sessionVenueId : '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [acksFor, setAcksFor] = useState<Notice | null>(null)
  const [ackRows, setAckRows] = useState<AckRow[]>([])

  async function load() {
    const [nR, vR, dR] = await Promise.all([
      fetch('/api/admin/notices'),
      fetch('/api/admin/venues'),
      fetch('/api/admin/departments'),
    ])
    const [nData, vData, dData] = await Promise.all([nR.json(), vR.json(), dR.json()])
    setNotices(nData)
    setVenues(vData)
    setDepartments(dData)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY, venueId: role === 'MANAGER' ? sessionVenueId : '' })
    setError(''); setOpen(true)
  }
  function openEdit(n: Notice) {
    setEditing(n)
    setForm({ title: n.title, body: n.body, priority: n.priority, departmentId: n.departmentId ?? '', pinned: n.pinned, requiresAck: n.requiresAck, venueId: n.venueId })
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
      body: JSON.stringify({ ...form, departmentId: form.departmentId || null }),
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
  const deptOptions = [
    { value: '', label: 'WHOLE VENUE' },
    ...departments.filter((d) => d.venueId === form.venueId).map((d) => ({ value: d.id, label: d.name })),
  ]

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
                    <Badge>{n.departmentName ?? 'WHOLE VENUE'}</Badge>
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
              <Select label="Venue" value={form.venueId} onChange={(e) => setForm({ ...form, venueId: e.target.value, departmentId: '' })} options={[{ value: '', label: 'SELECT VENUE' }, ...venueOptions]} />
            )}
            <Select label="Target" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} options={deptOptions} />
            <Select label="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} options={PRIORITY_OPTIONS} />
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
