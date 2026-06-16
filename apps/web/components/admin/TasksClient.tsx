'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { moveItem } from '@/lib/array'

interface Task {
  id: string
  title: string
  description: string | null
  venueId: string
  departmentId: string | null
  sectionId: string | null
  completionType: string
  scheduleType: string
  scheduleDays: number[]
  customCron: string | null
  isActive: boolean
  sortOrder: number
  department: { id: string; name: string; colour: string | null } | null
  section: { id: string; name: string } | null
  requiredTraining: { moduleId: string; module?: { kind: string } }[]
  trainingModules?: { kind: string }[]
  _count?: { checklistLinks: number }
}

interface Venue { id: string; name: string }
interface Department { id: string; name: string; venueId: string; colour: string | null }
interface Section { id: string; name: string; departmentId: string; venueId: string }
interface TrainingLite { id: string; title: string; venueId: string; kind: string }

interface ChecklistCardTask { id: string; title: string; isActive: boolean; version: number }
interface Checklist {
  id: string
  name: string
  description: string | null
  venueId: string
  departmentId: string | null
  sectionId: string | null
  department: { id: string; name: string } | null
  section: { id: string; name: string } | null
  tasks: ChecklistCardTask[]
}

interface FormState {
  title: string
  description: string
  venueId: string
  departmentId: string
  sectionId: string
  completionType: string
  scheduleType: string
  scheduleDays: number[]
  customCron: string
  requiredTrainingIds: string[]
}

const EMPTY_FORM: FormState = {
  title: '', description: '', venueId: '', departmentId: '', sectionId: '',
  completionType: 'TICK', scheduleType: 'DAILY', scheduleDays: [], customCron: '', requiredTrainingIds: [],
}

const COMPLETION_OPTIONS = [
  { value: 'TICK', label: 'TICK (CHECK OFF)' },
  { value: 'TICK_NOTE', label: 'TICK + NOTE' },
  { value: 'TICK_PHOTO', label: 'TICK + PHOTO' },
]
const SCHEDULE_OPTIONS = [
  { value: 'DAILY', label: 'DAILY' },
  { value: 'WEEKLY', label: 'WEEKLY (SELECT DAYS)' },
  { value: 'CUSTOM', label: 'CUSTOM (CRON)' },
]
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

export function TasksClient({ role, sessionVenueId }: { role: string; sessionVenueId: string }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [modules, setModules] = useState<TrainingLite[]>([])
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [loading, setLoading] = useState(true)

  // Task create/edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterVenue, setFilterVenue] = useState(role === 'MANAGER' ? sessionVenueId : '')
  const [filterDept, setFilterDept] = useState('')
  const [requireRetrain, setRequireRetrain] = useState(false)
  const [changeSummary, setChangeSummary] = useState('')

  // Inline checklist editor (right panel)
  const [clEditing, setClEditing] = useState<Checklist | 'new' | null>(null)
  const [clName, setClName] = useState('')
  const [clDesc, setClDesc] = useState('')
  const [clVenueId, setClVenueId] = useState(role === 'MANAGER' ? sessionVenueId : '')
  const [clDeptId, setClDeptId] = useState('')
  const [clSectionId, setClSectionId] = useState('')
  const [clSelected, setClSelected] = useState<string[]>([])
  const [clSaving, setClSaving] = useState(false)
  const [clError, setClError] = useState('')
  const [dropActive, setDropActive] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  async function load() {
    const params = new URLSearchParams()
    if (filterVenue) params.set('venueId', filterVenue)
    if (filterDept) params.set('departmentId', filterDept)
    const [tR, vR, dR, sR, mR, cR] = await Promise.all([
      fetch(`/api/admin/tasks?${params}`),
      fetch('/api/admin/venues'),
      fetch('/api/admin/departments'),
      fetch('/api/admin/sections'),
      fetch('/api/admin/training'),
      fetch('/api/admin/checklists'),
    ])
    const [tData, vData, dData, sData, mData, cData] = await Promise.all([tR.json(), vR.json(), dR.json(), sR.json(), mR.json(), cR.json()])
    setTasks(tData)
    setVenues(vData)
    setDepartments(dData)
    setSections(sData)
    setModules(mData)
    setChecklists(cData)
    setLoading(false)
  }

  useEffect(() => { load() }, [filterVenue, filterDept])

  // --- Task modal ---
  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, venueId: role === 'MANAGER' ? sessionVenueId : '' })
    setRequireRetrain(false); setChangeSummary('')
    setError(''); setModalOpen(true)
  }
  function openEdit(t: Task) {
    setEditing(t)
    setForm({
      title: t.title, description: t.description ?? '', venueId: t.venueId,
      departmentId: t.departmentId ?? '', sectionId: t.sectionId ?? '',
      completionType: t.completionType, scheduleType: t.scheduleType, scheduleDays: t.scheduleDays,
      customCron: t.customCron ?? '', requiredTrainingIds: (t.requiredTraining ?? []).map((r) => r.moduleId),
    })
    setRequireRetrain(false); setChangeSummary('')
    setError(''); setModalOpen(true)
  }

  async function handleSave() {
    if (!form.title.trim() || !form.venueId) { setError('TITLE AND VENUE ARE REQUIRED'); return }
    if (form.scheduleType === 'WEEKLY' && form.scheduleDays.length === 0) { setError('SELECT AT LEAST ONE DAY FOR WEEKLY SCHEDULE'); return }
    if (form.scheduleType === 'CUSTOM' && !form.customCron.trim()) { setError('CRON EXPRESSION IS REQUIRED FOR CUSTOM SCHEDULE'); return }
    setSaving(true); setError('')
    const url = editing ? `/api/admin/tasks/${editing.id}` : '/api/admin/tasks'
    const method = editing ? 'PUT' : 'POST'
    const r = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        departmentId: form.departmentId || null,
        sectionId: form.sectionId || null,
        requiredTrainingIds: form.requiredTrainingIds,
        customCron: form.scheduleType === 'CUSTOM' ? form.customCron : null,
        scheduleDays: form.scheduleType === 'DAILY' ? [] : form.scheduleDays,
        ...(editing ? { requireRetrain, changeSummary } : {}),
      }),
    })
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'SAVE FAILED'); setSaving(false); return }
    setSaving(false); setModalOpen(false); load()
  }

  async function handleDelete(id: string) {
    if (!confirm('SOFT-DELETE THIS TASK?')) return
    await fetch(`/api/admin/tasks/${id}`, { method: 'DELETE' })
    load()
  }
  async function toggleActive(t: Task) {
    await fetch(`/api/admin/tasks/${t.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !t.isActive }) })
    load()
  }
  function toggleDay(day: number) {
    const days = form.scheduleDays.includes(day) ? form.scheduleDays.filter((d) => d !== day) : [...form.scheduleDays, day].sort()
    setForm({ ...form, scheduleDays: days })
  }
  function toggleRequired(id: string) {
    setForm((f) => ({ ...f, requiredTrainingIds: f.requiredTrainingIds.includes(id) ? f.requiredTrainingIds.filter((x) => x !== id) : [...f.requiredTrainingIds, id] }))
  }

  // --- Checklist editor ---
  function openChecklistCreate() {
    setClEditing('new')
    setClName(''); setClDesc('')
    setClVenueId(role === 'MANAGER' ? sessionVenueId : (filterVenue || venues[0]?.id || ''))
    setClDeptId(''); setClSectionId(''); setClSelected([]); setClError('')
  }
  function openChecklistEdit(c: Checklist) {
    setClEditing(c)
    setClName(c.name); setClDesc(c.description ?? '')
    setClVenueId(c.venueId); setClDeptId(c.departmentId ?? ''); setClSectionId(c.sectionId ?? '')
    setClSelected(c.tasks.map((t) => t.id)); setClError('')
  }
  function addToChecklist(id: string) {
    setClSelected((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }
  async function saveChecklist() {
    if (!clName.trim() || !clVenueId) { setClError('NAME AND VENUE ARE REQUIRED'); return }
    if (clSelected.length === 0) { setClError('ADD AT LEAST ONE TASK'); return }
    setClSaving(true); setClError('')
    const payload = { name: clName, description: clDesc, venueId: clVenueId, departmentId: clDeptId || null, sectionId: clSectionId || null, taskIds: clSelected }
    const url = clEditing && clEditing !== 'new' ? `/api/admin/checklists/${clEditing.id}` : '/api/admin/checklists'
    const method = clEditing && clEditing !== 'new' ? 'PUT' : 'POST'
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setClSaving(false)
    if (!r.ok) { const d = await r.json(); setClError(d.error ?? 'SAVE FAILED'); return }
    setClEditing(null); load()
  }
  async function deleteChecklist() {
    if (!clEditing || clEditing === 'new') return
    if (!confirm(`DELETE CHECKLIST "${clEditing.name}"? (the tasks themselves are kept)`)) return
    await fetch(`/api/admin/checklists/${clEditing.id}`, { method: 'DELETE' })
    setClEditing(null); load()
  }

  // --- Derived ---
  const venueOptions = venues.map((v) => ({ value: v.id, label: v.name }))
  const filterDeptOptions = [{ value: '', label: 'ALL DEPARTMENTS' }, ...departments.filter((d) => !filterVenue || d.venueId === filterVenue).map((d) => ({ value: d.id, label: d.name }))]
  const formDeptOptions = [{ value: '', label: 'NO DEPARTMENT' }, ...departments.filter((d) => d.venueId === form.venueId).map((d) => ({ value: d.id, label: d.name }))]
  const formSectionOptions = [{ value: '', label: 'NO SECTION' }, ...sections.filter((s) => s.departmentId === form.departmentId).map((s) => ({ value: s.id, label: s.name }))]
  const trainingOptions = modules.filter((m) => m.venueId === form.venueId && m.kind === 'TRAINING')

  const taskById = new Map(tasks.map((t) => [t.id, t]))
  const clDeptOptions = [{ value: '', label: 'WHOLE VENUE' }, ...departments.filter((d) => d.venueId === clVenueId).map((d) => ({ value: d.id, label: d.name }))]
  const clSectionOptions = [{ value: '', label: 'NO SECTION' }, ...sections.filter((s) => s.departmentId === clDeptId).map((s) => ({ value: s.id, label: s.name }))]
  const clAddOptions = [{ value: '', label: '+ ADD A TASK…' }, ...tasks.filter((t) => t.venueId === clVenueId && !clSelected.includes(t.id)).map((t) => ({ value: t.id, label: t.title }))]

  function taskLabels(t: Task): { text: string; cls: string }[] {
    const out: { text: string; cls: string }[] = []
    const n = t._count?.checklistLinks ?? 0
    if (n > 0) out.push({ text: n > 1 ? `${n} LISTS` : 'LIST', cls: 'text-success' })
    const kinds = new Set<string>()
    ;(t.trainingModules ?? []).forEach((m) => kinds.add(m.kind))
    ;(t.requiredTraining ?? []).forEach((r) => { if (r.module) kinds.add(r.module.kind) })
    if (kinds.has('TRAINING')) out.push({ text: 'TRAINING', cls: 'text-accent' })
    if (kinds.has('SOP')) out.push({ text: 'SOP', cls: 'text-warning' })
    if (kinds.has('HOWTO') || kinds.has('FAQ')) out.push({ text: 'GUIDE', cls: 'text-grey-light' })
    return out
  }

  // Group tasks: Department → Section, with a per-department "general" bucket.
  const deptGroups: { key: string; name: string; colour: string | null; sections: { id: string; name: string; tasks: Task[] }[]; loose: Task[] }[] = []
  const deptIndex = new Map<string, (typeof deptGroups)[number]>()
  for (const t of tasks) {
    const dKey = t.departmentId ?? 'none'
    let dg = deptIndex.get(dKey)
    if (!dg) { dg = { key: dKey, name: t.department?.name ?? 'NO DEPARTMENT', colour: t.department?.colour ?? null, sections: [], loose: [] }; deptIndex.set(dKey, dg); deptGroups.push(dg) }
    if (t.sectionId) {
      let sg = dg.sections.find((s) => s.id === t.sectionId)
      if (!sg) { sg = { id: t.sectionId, name: t.section?.name ?? 'SECTION', tasks: [] }; dg.sections.push(sg) }
      sg.tasks.push(t)
    } else dg.loose.push(t)
  }
  for (const dg of deptGroups) dg.sections.sort((a, b) => a.name.localeCompare(b.name))

  const taskRow = (t: Task) => {
    const labels = taskLabels(t)
    return (
      <div
        key={t.id}
        draggable
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'copy' }}
        className="bg-grey-dark border border-grey-mid px-3 py-2.5 flex items-center gap-2 cursor-grab active:cursor-grabbing"
      >
        <div className={`w-1.5 h-1.5 flex-shrink-0 ${t.isActive ? 'bg-success' : 'bg-grey-mid'}`} />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm font-semibold uppercase text-white truncate">{t.title}</div>
          {t.description && <p className="font-mono text-xs text-grey-light truncate">{t.description}</p>}
          {labels.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-0.5">
              {labels.map((l) => <span key={l.text} className={`font-mono text-[10px] uppercase ${l.cls}`}>{l.text}</span>)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge>{t.scheduleType}</Badge>
          <button onClick={() => toggleActive(t)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">{t.isActive ? 'OFF' : 'ON'}</button>
          <button onClick={() => openEdit(t)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">EDIT</button>
          <button onClick={() => handleDelete(t.id)} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">DEL</button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="font-mono text-xl font-bold uppercase tracking-widest">TASKS &amp; CHECKLISTS</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* LEFT — tasks grouped by department → section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-mono text-sm uppercase tracking-widest text-grey-light">TASKS</h2>
            <Button onClick={openCreate} size="sm">+ NEW TASK</Button>
          </div>

          <div className="flex gap-2 flex-wrap">
            {role === 'ADMIN' && (
              <div className="w-40">
                <Select value={filterVenue} onChange={(e) => { setFilterVenue(e.target.value); setFilterDept('') }} options={[{ value: '', label: 'ALL VENUES' }, ...venueOptions]} />
              </div>
            )}
            <div className="w-44">
              <Select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} options={filterDeptOptions} />
            </div>
          </div>

          {clEditing && <p className="font-mono text-[10px] uppercase text-accent">DRAG A TASK INTO THE CHECKLIST ON THE RIGHT →</p>}

          {loading ? (
            <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
          ) : tasks.length === 0 ? (
            <p className="font-mono text-xs text-grey-light">NO TASKS FOUND.</p>
          ) : (
            <div className="space-y-5">
              {deptGroups.map((dg) => (
                <div key={dg.key} className="space-y-2">
                  <div className="flex items-center gap-2">
                    {dg.colour && <div className="w-2 h-2" style={{ backgroundColor: dg.colour }} />}
                    <h3 className="font-mono text-xs uppercase tracking-widest text-white">{dg.name}</h3>
                  </div>
                  {dg.sections.map((sg) => (
                    <div key={sg.id} className="space-y-1 pl-3 border-l border-grey-mid">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-accent">{sg.name}</div>
                      {sg.tasks.map(taskRow)}
                    </div>
                  ))}
                  {dg.loose.length > 0 && (
                    <div className="space-y-1 pl-3 border-l border-grey-mid">
                      {dg.sections.length > 0 && <div className="font-mono text-[10px] uppercase tracking-wider text-grey-light">GENERAL (NO SECTION)</div>}
                      {dg.loose.map(taskRow)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT — checklists list OR inline editor */}
        <div className="lg:border-l lg:border-grey-mid lg:pl-6">
          {clEditing ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-mono text-sm uppercase tracking-widest text-white">{clEditing === 'new' ? 'NEW CHECKLIST' : 'EDIT CHECKLIST'}</h2>
                <button onClick={() => setClEditing(null)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">CLOSE</button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label="Name" value={clName} onChange={(e) => setClName(e.target.value)} placeholder="BAR OPEN" />
                {role === 'ADMIN' && (
                  <Select label="Venue" value={clVenueId} onChange={(e) => { setClVenueId(e.target.value); setClDeptId(''); setClSectionId(''); setClSelected([]) }} options={venueOptions} placeholder="SELECT VENUE" />
                )}
              </div>
              <Textarea label="Description (optional)" value={clDesc} onChange={(e) => setClDesc(e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Department (optional)" value={clDeptId} onChange={(e) => { setClDeptId(e.target.value); setClSectionId('') }} options={clDeptOptions} />
                <Select label="Section (optional)" value={clSectionId} onChange={(e) => setClSectionId(e.target.value)} options={clSectionOptions} />
              </div>

              <div className="space-y-1">
                <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Tasks in this checklist (drag in from the left)</label>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDropActive(true) }}
                  onDragLeave={() => setDropActive(false)}
                  onDrop={(e) => { e.preventDefault(); setDropActive(false); const id = e.dataTransfer.getData('text/plain'); if (id) addToChecklist(id) }}
                  className={`border-2 border-dashed p-2 min-h-[90px] space-y-1 transition-colors ${dropActive ? 'border-white bg-black/30' : 'border-grey-mid'}`}
                >
                  {clSelected.length === 0 ? (
                    <p className="font-mono text-xs text-grey-light text-center py-6">DRAG TASKS HERE FROM THE LEFT</p>
                  ) : (
                    clSelected.map((id, i) => {
                      const t = taskById.get(id)
                      return (
                        <div
                          key={id}
                          draggable
                          onDragStart={(e) => { setDragIdx(i); e.dataTransfer.setData('text/plain', '') }}
                          onDragEnter={() => { if (dragIdx !== null && dragIdx !== i) { setClSelected((p) => moveItem(p, dragIdx, i)); setDragIdx(i) } }}
                          onDragEnd={() => setDragIdx(null)}
                          className="flex items-center justify-between gap-2 border border-grey-mid px-2 py-1.5 bg-grey-dark cursor-grab"
                        >
                          <span className="font-mono text-xs text-white truncate">{i + 1}. {t?.title ?? '(task removed)'}</span>
                          <div className="flex gap-2 flex-shrink-0">
                            <button type="button" disabled={i === 0} onClick={() => setClSelected((p) => moveItem(p, i, i - 1))} className="font-mono text-xs text-grey-light hover:text-white disabled:opacity-30">↑</button>
                            <button type="button" disabled={i === clSelected.length - 1} onClick={() => setClSelected((p) => moveItem(p, i, i + 1))} className="font-mono text-xs text-grey-light hover:text-white disabled:opacity-30">↓</button>
                            <button type="button" onClick={() => setClSelected((p) => p.filter((x) => x !== id))} className="font-mono text-xs text-grey-light hover:text-danger">✕</button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
                <Select value="" onChange={(e) => { if (e.target.value) addToChecklist(e.target.value) }} options={clAddOptions} />
              </div>

              {clError && <p className="font-mono text-xs text-danger">{clError}</p>}
              <div className="flex gap-2 pt-1">
                <Button onClick={saveChecklist} loading={clSaving} size="sm">SAVE CHECKLIST</Button>
                <Button variant="ghost" size="sm" onClick={() => setClEditing(null)}>CANCEL</Button>
                {clEditing !== 'new' && (
                  <button onClick={deleteChecklist} className="ml-auto font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">DELETE</button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-mono text-sm uppercase tracking-widest text-grey-light">CHECKLISTS</h2>
                <Button onClick={openChecklistCreate} size="sm">+ NEW CHECKLIST</Button>
              </div>
              <p className="font-mono text-[10px] uppercase text-grey-light">CHECKLISTS REFERENCE LIVE TASKS — EDIT A TASK ONCE AND EVERY LIST UPDATES.</p>
              {checklists.length === 0 ? (
                <p className="font-mono text-xs text-grey-light">NO CHECKLISTS YET — CREATE ONE AND DRAG TASKS IN.</p>
              ) : (
                <div className="space-y-2">
                  {checklists.map((c) => (
                    <div key={c.id} className="bg-grey-dark border border-grey-mid p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-sm uppercase text-white truncate">{c.name}</span>
                        <button onClick={() => openChecklistEdit(c)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors flex-shrink-0">EDIT</button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {c.section ? <Badge>{c.section.name}</Badge> : c.department ? <Badge>{c.department.name}</Badge> : <Badge>WHOLE VENUE</Badge>}
                        <span className="font-mono text-xs text-grey-light">{c.tasks.length} TASK{c.tasks.length !== 1 ? 'S' : ''}</span>
                      </div>
                      <ol className="font-mono text-xs text-grey-light list-decimal list-inside">
                        {c.tasks.slice(0, 5).map((t) => <li key={t.id} className="truncate">{t.title}</li>)}
                        {c.tasks.length > 5 && <li className="list-none">+ {c.tasks.length - 5} more</li>}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'EDIT TASK' : 'NEW TASK'} size="lg">
        <div className="space-y-4">
          <Input label="Task Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="WIPE DOWN ALL BAR SURFACES" />
          <Textarea label="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Additional instructions for this task..." />
          <div className="grid grid-cols-2 gap-3">
            {(role === 'ADMIN' || !editing) && (
              <Select label="Venue" value={form.venueId} onChange={(e) => setForm({ ...form, venueId: e.target.value, departmentId: '', sectionId: '' })} options={venueOptions} placeholder="SELECT VENUE" />
            )}
            <Select label="Department" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value, sectionId: '' })} options={formDeptOptions} />
          </div>
          <Select label="Section (optional)" value={form.sectionId} onChange={(e) => setForm({ ...form, sectionId: e.target.value })} options={formSectionOptions} />

          {trainingOptions.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Required training (competency)</label>
              <div className="flex flex-wrap gap-1">
                {trainingOptions.map((m) => (
                  <button key={m.id} type="button" onClick={() => toggleRequired(m.id)} className={`font-mono text-xs px-2 py-1.5 border transition-colors ${form.requiredTrainingIds.includes(m.id) ? 'bg-white text-black border-white' : 'bg-transparent text-grey-light border-grey-mid hover:border-white hover:text-white'}`}>{m.title}</button>
                ))}
              </div>
              <p className="font-mono text-xs text-grey-light">IF SOMEONE COMPLETES THIS TASK WITHOUT THE TICKED TRAINING, A FOLLOW-UP IS RAISED FOR A MANAGER.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Select label="Completion Type" value={form.completionType} onChange={(e) => setForm({ ...form, completionType: e.target.value })} options={COMPLETION_OPTIONS} />
            <Select label="Schedule" value={form.scheduleType} onChange={(e) => setForm({ ...form, scheduleType: e.target.value, scheduleDays: [] })} options={SCHEDULE_OPTIONS} />
          </div>

          {form.scheduleType === 'WEEKLY' && (
            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Active Days</label>
              <div className="flex gap-1">
                {DAYS.map((day, i) => (
                  <button key={day} type="button" onClick={() => toggleDay(i)} className={`font-mono text-xs px-2 py-1.5 border transition-colors ${form.scheduleDays.includes(i) ? 'bg-white text-black border-white' : 'bg-transparent text-grey-light border-grey-mid hover:border-white hover:text-white'}`}>{day}</button>
                ))}
              </div>
            </div>
          )}

          {form.scheduleType === 'CUSTOM' && (
            <div className="space-y-1">
              <Input label="Cron Expression" value={form.customCron} onChange={(e) => setForm({ ...form, customCron: e.target.value })} placeholder="0 8 * * 1-5" className="font-mono" />
              <p className="font-mono text-xs text-grey-light">FORMAT: MIN HOUR DOM MON DOW — e.g. 0 8 * * 1-5 (weekdays at 8am)</p>
            </div>
          )}

          {editing && (
            <div className="border-l-4 border-l-warning pl-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={requireRetrain} onChange={(e) => setRequireRetrain(e.target.checked)} className="w-4 h-4 accent-white" />
                <span className="font-mono text-xs uppercase text-white">Require re-training (notify staff of this change)</span>
              </label>
              {requireRetrain && (
                <Input label="What changed? (optional)" value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} placeholder="e.g. NEW GLASS-RINSE STEP ADDED" />
              )}
              <p className="font-mono text-xs text-grey-light">POSTS A MUST-ACKNOWLEDGE NOTICE TO THE RELEVANT GROUP; STAFF TAP GOT IT TO CONFIRM.</p>
            </div>
          )}

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
