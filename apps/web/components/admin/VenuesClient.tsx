'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'

const TIMEZONES = [
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland (NZST)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST)' },
  { value: 'Australia/Melbourne', label: 'Australia/Melbourne (AEDT)' },
  { value: 'Australia/Brisbane', label: 'Australia/Brisbane (AEST)' },
  { value: 'Australia/Perth', label: 'Australia/Perth (AWST)' },
  { value: 'UTC', label: 'UTC' },
]

interface Venue {
  id: string
  name: string
  address: string | null
  timezone: string
  isActive: boolean
  departments: { id: string; name: string }[]
}

interface FormState {
  name: string
  address: string
  timezone: string
}

const EMPTY_FORM: FormState = { name: '', address: '', timezone: 'Pacific/Auckland' }

export function VenuesClient({ role }: { role: string }) {
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Venue | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isAdmin = role === 'ADMIN'

  async function load() {
    const r = await fetch('/api/admin/venues')
    const data = await r.json()
    setVenues(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }

  function openEdit(v: Venue) {
    setEditing(v)
    setForm({ name: v.name, address: v.address ?? '', timezone: v.timezone })
    setError('')
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')

    const url = editing ? `/api/admin/venues/${editing.id}` : '/api/admin/venues'
    const method = editing ? 'PUT' : 'POST'

    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
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
    if (!confirm('SOFT-DELETE THIS VENUE?')) return
    await fetch(`/api/admin/venues/${id}`, { method: 'DELETE' })
    load()
  }

  async function toggleActive(v: Venue) {
    await fetch(`/api/admin/venues/${v.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !v.isActive }),
    })
    load()
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest">VENUES</h1>
        {isAdmin && (
          <Button onClick={openCreate} size="sm">+ NEW VENUE</Button>
        )}
      </div>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <div className="space-y-2">
          {venues.length === 0 && (
            <p className="font-mono text-xs text-grey-light">NO VENUES FOUND.</p>
          )}
          {venues.map((v) => (
            <div key={v.id} className="bg-grey-dark border border-grey-mid p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold uppercase text-sm text-white">{v.name}</span>
                  <Badge variant={v.isActive ? 'success' : 'danger'}>
                    {v.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </Badge>
                </div>
                {v.address && (
                  <p className="font-mono text-xs text-grey-light mt-0.5">{v.address}</p>
                )}
                <p className="font-mono text-xs text-grey-light">{v.timezone}</p>
                <p className="font-mono text-xs text-grey-light mt-1">
                  {v.departments.length} DEPT{v.departments.length !== 1 ? 'S' : ''}: {v.departments.map((d) => d.name).join(', ')}
                </p>
              </div>
              {isAdmin && (
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => toggleActive(v)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">
                    {v.isActive ? 'DEACTIVATE' : 'ACTIVATE'}
                  </button>
                  <button onClick={() => openEdit(v)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">
                    EDIT
                  </button>
                  <button onClick={() => handleDelete(v.id)} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">
                    DELETE
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'EDIT VENUE' : 'NEW VENUE'}>
        <div className="space-y-4">
          <Input
            label="Venue Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. THE CROWN HOTEL"
          />
          <Input
            label="Address (optional)"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="123 Main Street, Auckland"
          />
          <Select
            label="Timezone"
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            options={TIMEZONES}
          />
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
