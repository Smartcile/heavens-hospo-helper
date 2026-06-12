'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'

interface Department {
  id: string
  name: string
  venueId: string
  colour: string | null
  isActive: boolean
  venue: { id: string; name: string }
}

interface Venue { id: string; name: string }

interface FormState {
  name: string
  venueId: string
  colour: string
}

const EMPTY_FORM: FormState = { name: '', venueId: '', colour: '#6B6B6B' }

export function DepartmentsClient({ role, venueId }: { role: string; venueId: string }) {
  const [departments, setDepartments] = useState<Department[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Department | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const [dR, vR] = await Promise.all([
      fetch('/api/admin/departments'),
      fetch('/api/admin/venues'),
    ])
    const [depts, vens] = await Promise.all([dR.json(), vR.json()])
    setDepartments(depts)
    setVenues(vens)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, venueId: role === 'MANAGER' ? venueId : '' })
    setError('')
    setModalOpen(true)
  }

  function openEdit(d: Department) {
    setEditing(d)
    setForm({ name: d.name, venueId: d.venueId, colour: d.colour ?? '#6B6B6B' })
    setError('')
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.venueId) { setError('Name and venue are required'); return }
    setSaving(true)
    setError('')

    const url = editing ? `/api/admin/departments/${editing.id}` : '/api/admin/departments'
    const method = editing ? 'PUT' : 'POST'
    const body = editing
      ? { name: form.name, colour: form.colour }
      : { name: form.name, venueId: form.venueId, colour: form.colour }

    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!r.ok) {
      const data = await r.json()
      setError(data.error ?? 'SAVE FAILED')
      setSaving(false)
      return
    }

    setSaving(false)
    setModalOpen(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('SOFT-DELETE THIS DEPARTMENT?')) return
    await fetch(`/api/admin/departments/${id}`, { method: 'DELETE' })
    load()
  }

  const venueOptions = venues.map((v) => ({ value: v.id, label: v.name }))

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest">DEPARTMENTS</h1>
        <Button onClick={openCreate} size="sm">+ NEW DEPARTMENT</Button>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <div className="space-y-2">
          {departments.length === 0 && (
            <p className="font-mono text-xs text-grey-light">NO DEPARTMENTS FOUND.</p>
          )}
          {departments.map((d) => (
            <div key={d.id} className="bg-grey-dark border border-grey-mid p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {d.colour && (
                  <div className="w-3 h-3 flex-shrink-0 border border-grey-mid" style={{ backgroundColor: d.colour }} />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold uppercase text-sm text-white">{d.name}</span>
                    <Badge variant={d.isActive ? 'success' : 'danger'}>
                      {d.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </Badge>
                  </div>
                  <p className="font-mono text-xs text-grey-light">{d.venue.name}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => openEdit(d)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">
                  EDIT
                </button>
                <button onClick={() => handleDelete(d.id)} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">
                  DELETE
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'EDIT DEPARTMENT' : 'NEW DEPARTMENT'}>
        <div className="space-y-4">
          {!editing && (
            <Select
              label="Venue"
              value={form.venueId}
              onChange={(e) => setForm({ ...form, venueId: e.target.value })}
              options={venueOptions}
              placeholder="SELECT A VENUE"
            />
          )}
          <Input
            label="Department Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. BAR"
          />
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Colour</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.colour}
                onChange={(e) => setForm({ ...form, colour: e.target.value })}
                className="w-10 h-8 bg-grey-dark border border-grey-mid cursor-pointer"
              />
              <Input
                value={form.colour}
                onChange={(e) => setForm({ ...form, colour: e.target.value })}
                className="font-mono"
              />
            </div>
          </div>
          {error && <p className="font-mono text-xs text-danger">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} loading={saving}>SAVE</Button>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>CANCEL</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
