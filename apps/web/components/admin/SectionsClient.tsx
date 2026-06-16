'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'

interface Section {
  id: string
  name: string
  colour: string | null
  departmentId: string
  isActive: boolean
  department: { id: string; name: string; colour: string | null }
}
interface Department { id: string; name: string; venueId: string }

interface FormState { name: string; departmentId: string; colour: string }
const EMPTY_FORM: FormState = { name: '', departmentId: '', colour: '#6B6B6B' }

export function SectionsClient({ role, venueId }: { role: string; venueId: string }) {
  const [sections, setSections] = useState<Section[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Section | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const [sR, dR] = await Promise.all([
      fetch('/api/admin/sections'),
      fetch('/api/admin/departments'),
    ])
    const [sData, dData] = await Promise.all([sR.json(), dR.json()])
    setSections(sData)
    setDepartments(dData)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setError('')
    setModalOpen(true)
  }
  function openEdit(s: Section) {
    setEditing(s)
    setForm({ name: s.name, departmentId: s.departmentId, colour: s.colour ?? '#6B6B6B' })
    setError('')
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.departmentId) { setError('Name and department are required'); return }
    setSaving(true); setError('')
    const url = editing ? `/api/admin/sections/${editing.id}` : '/api/admin/sections'
    const method = editing ? 'PUT' : 'POST'
    const body = editing ? { name: form.name, colour: form.colour } : { name: form.name, departmentId: form.departmentId, colour: form.colour }
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'SAVE FAILED'); return }
    setModalOpen(false); load()
  }

  async function handleDelete(id: string) {
    if (!confirm('SOFT-DELETE THIS SECTION? (tasks stay, just unlinked)')) return
    await fetch(`/api/admin/sections/${id}`, { method: 'DELETE' })
    load()
  }

  const deptOptions = departments.map((d) => ({ value: d.id, label: d.name }))

  // Group sections by department for display.
  const grouped = sections.reduce<Record<string, { dept: Section['department']; items: Section[] }>>((acc, s) => {
    const key = s.departmentId
    if (!acc[key]) acc[key] = { dept: s.department, items: [] }
    acc[key].items.push(s)
    return acc
  }, {})

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest">SECTIONS</h1>
          <p className="font-mono text-xs text-grey-light mt-1">STATIONS WITHIN A DEPARTMENT (e.g. BAR · COFFEE · CABINET · FLOOR). TASKS, STAFF AND RESOURCES LINK HERE.</p>
        </div>
        <Button onClick={openCreate} size="sm">+ NEW SECTION</Button>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : sections.length === 0 ? (
        <p className="font-mono text-xs text-grey-light">NO SECTIONS YET. ADD ONE UNDER A DEPARTMENT.</p>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([key, group]) => (
            <div key={key}>
              <div className="flex items-center gap-2 mb-2">
                {group.dept?.colour && <div className="w-2 h-2" style={{ backgroundColor: group.dept.colour }} />}
                <h2 className="font-mono text-xs uppercase tracking-widest text-grey-light">{group.dept?.name}</h2>
              </div>
              <div className="space-y-1">
                {group.items.map((s) => (
                  <div key={s.id} className="bg-grey-dark border border-grey-mid px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {s.colour && <div className="w-3 h-3 flex-shrink-0 border border-grey-mid" style={{ backgroundColor: s.colour }} />}
                      <span className="font-mono text-sm font-semibold uppercase text-white">{s.name}</span>
                      {!s.isActive && <Badge variant="danger">OFF</Badge>}
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => openEdit(s)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">EDIT</button>
                      <button onClick={() => handleDelete(s.id)} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">DELETE</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'EDIT SECTION' : 'NEW SECTION'}>
        <div className="space-y-4">
          {!editing && (
            <Select label="Department" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} options={deptOptions} placeholder="SELECT A DEPARTMENT" />
          )}
          <Input label="Section Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. COFFEE" />
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Colour</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.colour} onChange={(e) => setForm({ ...form, colour: e.target.value })} className="w-10 h-8 bg-grey-dark border border-grey-mid cursor-pointer" />
              <Input value={form.colour} onChange={(e) => setForm({ ...form, colour: e.target.value })} className="font-mono" />
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
