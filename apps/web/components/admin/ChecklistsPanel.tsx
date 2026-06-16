'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { moveItem } from '@/lib/array'

interface ChecklistTask {
  id: string
  title: string
  completionType: string
  scheduleType: string
  isActive: boolean
  version: number
  departmentName: string | null
  sectionName: string | null
}
interface Checklist {
  id: string
  name: string
  description: string | null
  venueId: string
  departmentId: string | null
  sectionId: string | null
  department: { id: string; name: string } | null
  section: { id: string; name: string } | null
  tasks: ChecklistTask[]
}
interface Venue { id: string; name: string }
interface Department { id: string; name: string; venueId: string }
interface Section { id: string; name: string; venueId: string; departmentId: string }
interface TaskLite { id: string; title: string; venueId: string }

export function ChecklistsPanel({ role, sessionVenueId }: { role: string; sessionVenueId: string }) {
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [tasks, setTasks] = useState<TaskLite[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(true)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Checklist | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [venueId, setVenueId] = useState(role === 'MANAGER' ? sessionVenueId : '')
  const [departmentId, setDepartmentId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [addPick, setAddPick] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const [cR, tR, vR, dR, sR] = await Promise.all([
      fetch('/api/admin/checklists'),
      fetch('/api/admin/tasks'),
      fetch('/api/admin/venues'),
      fetch('/api/admin/departments'),
      fetch('/api/admin/sections'),
    ])
    const [cData, tData, vData, dData, sData] = await Promise.all([cR.json(), tR.json(), vR.json(), dR.json(), sR.json()])
    setChecklists(cData)
    setTasks(tData)
    setVenues(vData)
    setDepartments(dData)
    setSections(sData)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setName(''); setDescription('')
    setVenueId(role === 'MANAGER' ? sessionVenueId : (venues[0]?.id ?? ''))
    setDepartmentId(''); setSectionId(''); setSelected([]); setAddPick('')
    setError(''); setOpen(true)
  }
  function openEdit(c: Checklist) {
    setEditing(c)
    setName(c.name); setDescription(c.description ?? '')
    setVenueId(c.venueId); setDepartmentId(c.departmentId ?? ''); setSectionId(c.sectionId ?? '')
    setSelected(c.tasks.map((t) => t.id)); setAddPick('')
    setError(''); setOpen(true)
  }

  async function handleSave() {
    if (!name.trim() || !venueId) { setError('NAME AND VENUE ARE REQUIRED'); return }
    if (selected.length === 0) { setError('ADD AT LEAST ONE TASK'); return }
    setSaving(true); setError('')
    const payload = { name, description, venueId, departmentId: departmentId || null, sectionId: sectionId || null, taskIds: selected }
    const url = editing ? `/api/admin/checklists/${editing.id}` : '/api/admin/checklists'
    const method = editing ? 'PUT' : 'POST'
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSaving(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'SAVE FAILED'); return }
    setOpen(false); load()
  }

  async function handleDelete(c: Checklist) {
    if (!confirm(`DELETE CHECKLIST "${c.name}"? (the tasks themselves are kept)`)) return
    await fetch(`/api/admin/checklists/${c.id}`, { method: 'DELETE' })
    load()
  }

  const taskById = new Map(tasks.map((t) => [t.id, t]))
  const venueOptions = venues.map((v) => ({ value: v.id, label: v.name }))
  const deptOptions = [{ value: '', label: 'WHOLE VENUE' }, ...departments.filter((d) => d.venueId === venueId).map((d) => ({ value: d.id, label: d.name }))]
  const sectionOptions = [{ value: '', label: 'NO SECTION' }, ...sections.filter((s) => s.departmentId === departmentId).map((s) => ({ value: s.id, label: s.name }))]
  const addOptions = [
    { value: '', label: '+ ADD A TASK…' },
    ...tasks.filter((t) => t.venueId === venueId && !selected.includes(t.id)).map((t) => ({ value: t.id, label: t.title })),
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="font-mono text-xs text-grey-light">
          A CHECKLIST IS AN ORDERED SET OF <span className="text-white">LIVE TASKS</span> — EDIT A TASK ONCE AND EVERY CHECKLIST UPDATES. NO COPIES.
        </p>
        <Button size="sm" onClick={openCreate}>+ NEW CHECKLIST</Button>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : checklists.length === 0 ? (
        <p className="font-mono text-xs text-grey-light">NO CHECKLISTS YET — BUILD ONE FROM YOUR EXISTING TASKS.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {checklists.map((c) => (
            <div key={c.id} className="bg-grey-dark border border-grey-mid p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono font-semibold text-sm uppercase text-white">{c.name}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {c.section ? <Badge>{c.section.name}</Badge> : c.department ? <Badge>{c.department.name}</Badge> : <Badge>WHOLE VENUE</Badge>}
                <span className="font-mono text-xs text-grey-light">{c.tasks.length} TASK{c.tasks.length !== 1 ? 'S' : ''}</span>
              </div>
              {c.description && <p className="font-sans text-xs text-grey-light">{c.description}</p>}
              <ol className="font-mono text-xs text-grey-light space-y-0.5 flex-1 list-decimal list-inside">
                {c.tasks.slice(0, 6).map((t) => (
                  <li key={t.id} className="truncate">
                    <span className={t.isActive ? 'text-white' : 'text-grey-light line-through'}>{t.title}</span>
                    {t.version > 1 && <span className="text-accent"> v{t.version}</span>}
                  </li>
                ))}
                {c.tasks.length > 6 && <li className="list-none text-grey-light">+ {c.tasks.length - 6} more</li>}
              </ol>
              <div className="flex gap-3 pt-1 border-t border-grey-mid mt-1">
                <button onClick={() => openEdit(c)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">EDIT</button>
                <button onClick={() => handleDelete(c)} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">DELETE</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? 'EDIT CHECKLIST' : 'NEW CHECKLIST'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="BAR OPEN" />
            {role === 'ADMIN' && (
              <Select label="Venue" value={venueId} onChange={(e) => { setVenueId(e.target.value); setDepartmentId(''); setSectionId(''); setSelected([]) }} options={venueOptions} placeholder="SELECT VENUE" />
            )}
          </div>
          <Textarea label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Department (optional)" value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setSectionId('') }} options={deptOptions} />
            <Select label="Section (optional)" value={sectionId} onChange={(e) => setSectionId(e.target.value)} options={sectionOptions} />
          </div>

          <div className="space-y-2">
            <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Tasks in this checklist (in order)</label>
            {selected.length === 0 ? (
              <p className="font-mono text-xs text-grey-light">NONE YET — ADD TASKS BELOW.</p>
            ) : (
              <div className="space-y-1">
                {selected.map((id, i) => {
                  const t = taskById.get(id)
                  return (
                    <div key={id} className="flex items-center justify-between gap-2 border border-grey-mid px-2 py-1.5">
                      <span className="font-mono text-xs text-white truncate">{i + 1}. {t?.title ?? '(task removed)'}</span>
                      <div className="flex gap-2 flex-shrink-0">
                        <button type="button" disabled={i === 0} onClick={() => setSelected((p) => moveItem(p, i, i - 1))} className="font-mono text-xs text-grey-light hover:text-white disabled:opacity-30">↑</button>
                        <button type="button" disabled={i === selected.length - 1} onClick={() => setSelected((p) => moveItem(p, i, i + 1))} className="font-mono text-xs text-grey-light hover:text-white disabled:opacity-30">↓</button>
                        <button type="button" onClick={() => setSelected((p) => p.filter((x) => x !== id))} className="font-mono text-xs text-grey-light hover:text-danger">✕</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <Select
              value={addPick}
              onChange={(e) => { if (e.target.value) { setSelected((p) => [...p, e.target.value]); setAddPick('') } }}
              options={addOptions}
            />
          </div>

          {error && <p className="font-mono text-xs text-danger">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} loading={saving}>SAVE CHECKLIST</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>CANCEL</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
