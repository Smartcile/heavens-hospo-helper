'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'

interface TemplateItem {
  id?: string
  title: string
  description: string | null
  completionType: string
  scheduleType: string
  scheduleDays: number[]
}

interface Template {
  id: string
  name: string
  description: string | null
  category: string | null
  isBuiltIn: boolean
  venueId: string | null
  items: TemplateItem[]
  venue: { id: string; name: string } | null
}

interface Department {
  id: string
  name: string
  venueId: string
}

const COMPLETION_OPTIONS = [
  { value: 'TICK', label: 'TICK' },
  { value: 'TICK_NOTE', label: 'TICK + NOTE' },
  { value: 'TICK_PHOTO', label: 'TICK + PHOTO' },
]

const SCHEDULE_OPTIONS = [
  { value: 'DAILY', label: 'DAILY' },
  { value: 'WEEKLY', label: 'WEEKLY' },
]

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function emptyItem(): TemplateItem {
  return { title: '', description: null, completionType: 'TICK', scheduleType: 'DAILY', scheduleDays: [] }
}

export function TemplatesClient({ role, sessionVenueId }: { role: string; sessionVenueId: string }) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)

  // Editor modal
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [items, setItems] = useState<TemplateItem[]>([emptyItem()])
  const [saving, setSaving] = useState(false)
  const [editorError, setEditorError] = useState('')

  // Apply modal
  const [applyTemplate, setApplyTemplate] = useState<Template | null>(null)
  const [applyDept, setApplyDept] = useState('')
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<string>('')
  const [applyError, setApplyError] = useState('')

  // Snapshot modal
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const [snapDept, setSnapDept] = useState('')
  const [snapName, setSnapName] = useState('')
  const [snapSaving, setSnapSaving] = useState(false)
  const [snapError, setSnapError] = useState('')

  async function load() {
    const [tR, dR] = await Promise.all([
      fetch('/api/admin/templates'),
      fetch('/api/admin/departments'),
    ])
    const [tData, dData] = await Promise.all([tR.json(), dR.json()])
    setTemplates(tData)
    setDepartments(dData)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const deptOptions = departments.map((d) => ({ value: d.id, label: d.name }))

  // ---- Editor ----
  function openCreate() {
    setEditing(null)
    setName('')
    setDescription('')
    setCategory('')
    setItems([emptyItem()])
    setEditorError('')
    setEditorOpen(true)
  }

  function openEdit(t: Template) {
    setEditing(t)
    setName(t.name)
    setDescription(t.description ?? '')
    setCategory(t.category ?? '')
    setItems(t.items.length ? t.items.map((i) => ({ ...i })) : [emptyItem()])
    setEditorError('')
    setEditorOpen(true)
  }

  function updateItem(index: number, patch: Partial<TemplateItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }

  function toggleItemDay(index: number, day: number) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it
        const days = it.scheduleDays.includes(day)
          ? it.scheduleDays.filter((d) => d !== day)
          : [...it.scheduleDays, day].sort()
        return { ...it, scheduleDays: days }
      })
    )
  }

  async function handleSave() {
    const cleanItems = items.filter((it) => it.title.trim())
    if (!name.trim()) { setEditorError('NAME IS REQUIRED'); return }
    if (cleanItems.length === 0) { setEditorError('ADD AT LEAST ONE TASK'); return }

    setSaving(true)
    setEditorError('')

    const payload = { name, description, category, items: cleanItems }
    const url = editing ? `/api/admin/templates/${editing.id}` : '/api/admin/templates'
    const method = editing ? 'PUT' : 'POST'

    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    setSaving(false)
    if (!r.ok) {
      const data = await r.json()
      setEditorError(data.error ?? 'SAVE FAILED')
      return
    }
    setEditorOpen(false)
    load()
  }

  async function handleDelete(t: Template) {
    if (!confirm(`DELETE TEMPLATE "${t.name}"?`)) return
    await fetch(`/api/admin/templates/${t.id}`, { method: 'DELETE' })
    load()
  }

  // ---- Apply ----
  function openApply(t: Template) {
    setApplyTemplate(t)
    setApplyDept('')
    setApplyResult('')
    setApplyError('')
  }

  async function handleApply() {
    if (!applyTemplate || !applyDept) { setApplyError('SELECT A DEPARTMENT'); return }
    setApplying(true)
    setApplyError('')

    const r = await fetch(`/api/admin/templates/${applyTemplate.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ departmentId: applyDept }),
    })

    setApplying(false)
    if (!r.ok) {
      const data = await r.json()
      setApplyError(data.error ?? 'APPLY FAILED')
      return
    }
    const data = await r.json()
    setApplyResult(`CREATED ${data.created} TASK${data.created !== 1 ? 'S' : ''}` + (data.skipped ? ` — SKIPPED ${data.skipped} DUPLICATE${data.skipped !== 1 ? 'S' : ''}` : ''))
  }

  // ---- Snapshot ----
  function openSnapshot() {
    setSnapDept('')
    setSnapName('')
    setSnapError('')
    setSnapshotOpen(true)
  }

  async function handleSnapshot() {
    if (!snapDept || !snapName.trim()) { setSnapError('DEPARTMENT AND NAME REQUIRED'); return }
    setSnapSaving(true)
    setSnapError('')

    const r = await fetch('/api/admin/templates/from-department', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ departmentId: snapDept, name: snapName }),
    })

    setSnapSaving(false)
    if (!r.ok) {
      const data = await r.json()
      setSnapError(data.error ?? 'SNAPSHOT FAILED')
      return
    }
    setSnapshotOpen(false)
    load()
  }

  const builtIn = templates.filter((t) => t.isBuiltIn)
  const custom = templates.filter((t) => !t.isBuiltIn)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest">TEMPLATES</h1>
          <p className="font-mono text-xs text-grey-light mt-1 uppercase">
            APPLY A TASK SET TO A DEPARTMENT IN ONE CLICK
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={openSnapshot}>SAVE DEPT AS TEMPLATE</Button>
          <Button size="sm" onClick={openCreate}>+ NEW TEMPLATE</Button>
        </div>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <>
          <TemplateGroup
            title="BUILT-IN"
            templates={builtIn}
            onApply={openApply}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
          <TemplateGroup
            title="YOUR TEMPLATES"
            templates={custom}
            onApply={openApply}
            onEdit={openEdit}
            onDelete={handleDelete}
            emptyText="NO CUSTOM TEMPLATES YET — CREATE ONE OR SAVE A DEPARTMENT."
          />
        </>
      )}

      {/* Apply modal */}
      <Modal isOpen={!!applyTemplate} onClose={() => setApplyTemplate(null)} title={`APPLY: ${applyTemplate?.name ?? ''}`}>
        <div className="space-y-4">
          <p className="font-mono text-xs text-grey-light">
            CREATES {applyTemplate?.items.length} TASK{applyTemplate?.items.length !== 1 ? 'S' : ''} IN THE CHOSEN DEPARTMENT. EXISTING TASKS WITH THE SAME TITLE ARE SKIPPED.
          </p>
          <Select
            label="Target Department"
            value={applyDept}
            onChange={(e) => setApplyDept(e.target.value)}
            options={deptOptions}
            placeholder="SELECT DEPARTMENT"
          />
          {applyError && <p className="font-mono text-xs text-danger">{applyError}</p>}
          {applyResult && (
            <div className="border-l-4 border-l-success pl-3 py-1">
              <p className="font-mono text-xs text-success">{applyResult}</p>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            {applyResult ? (
              <Button onClick={() => setApplyTemplate(null)}>DONE</Button>
            ) : (
              <>
                <Button onClick={handleApply} loading={applying}>APPLY</Button>
                <Button variant="ghost" onClick={() => setApplyTemplate(null)}>CANCEL</Button>
              </>
            )}
          </div>
        </div>
      </Modal>

      {/* Snapshot modal */}
      <Modal isOpen={snapshotOpen} onClose={() => setSnapshotOpen(false)} title="SAVE DEPARTMENT AS TEMPLATE">
        <div className="space-y-4">
          <p className="font-mono text-xs text-grey-light">
            SNAPSHOTS ALL ACTIVE TASKS IN A DEPARTMENT INTO A REUSABLE TEMPLATE.
          </p>
          <Select
            label="Department"
            value={snapDept}
            onChange={(e) => setSnapDept(e.target.value)}
            options={deptOptions}
            placeholder="SELECT DEPARTMENT"
          />
          <Input label="Template Name" value={snapName} onChange={(e) => setSnapName(e.target.value)} placeholder="e.g. BAR STANDARD DAILY" />
          {snapError && <p className="font-mono text-xs text-danger">{snapError}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSnapshot} loading={snapSaving}>SAVE TEMPLATE</Button>
            <Button variant="ghost" onClick={() => setSnapshotOpen(false)}>CANCEL</Button>
          </div>
        </div>
      </Modal>

      {/* Editor modal */}
      <Modal isOpen={editorOpen} onClose={() => setEditorOpen(false)} title={editing ? 'EDIT TEMPLATE' : 'NEW TEMPLATE'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="BAR OPEN" />
            <Input label="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="BAR" />
          </div>
          <Textarea label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Tasks</label>
              <button
                type="button"
                onClick={() => setItems((prev) => [...prev, emptyItem()])}
                className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors"
              >
                + ADD TASK
              </button>
            </div>

            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="border border-grey-mid p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-xs text-grey-light pt-2 w-5">{i + 1}.</span>
                    <div className="flex-1 space-y-2">
                      <Input
                        value={item.title}
                        onChange={(e) => updateItem(i, { title: e.target.value })}
                        placeholder="TASK TITLE"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Select
                          value={item.completionType}
                          onChange={(e) => updateItem(i, { completionType: e.target.value })}
                          options={COMPLETION_OPTIONS}
                        />
                        <Select
                          value={item.scheduleType}
                          onChange={(e) => updateItem(i, { scheduleType: e.target.value, scheduleDays: [] })}
                          options={SCHEDULE_OPTIONS}
                        />
                      </div>
                      {item.scheduleType === 'WEEKLY' && (
                        <div className="flex gap-1 flex-wrap">
                          {DAYS.map((day, d) => (
                            <button
                              key={day}
                              type="button"
                              onClick={() => toggleItemDay(i, d)}
                              className={`font-mono text-xs px-2 py-1 border transition-colors ${
                                item.scheduleDays.includes(d)
                                  ? 'bg-white text-black border-white'
                                  : 'bg-transparent text-grey-light border-grey-mid hover:border-white'
                              }`}
                            >
                              {day}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                        className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors pt-2"
                      >
                        DEL
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {editorError && <p className="font-mono text-xs text-danger">{editorError}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} loading={saving}>SAVE TEMPLATE</Button>
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>CANCEL</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function TemplateGroup({
  title,
  templates,
  onApply,
  onEdit,
  onDelete,
  emptyText,
}: {
  title: string
  templates: Template[]
  onApply: (t: Template) => void
  onEdit: (t: Template) => void
  onDelete: (t: Template) => void
  emptyText?: string
}) {
  return (
    <div className="space-y-2">
      <h2 className="font-mono text-sm uppercase tracking-widest text-grey-light">{title}</h2>
      {templates.length === 0 ? (
        <p className="font-mono text-xs text-grey-light">{emptyText ?? 'NONE.'}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((t) => (
            <div key={t.id} className="bg-grey-dark border border-grey-mid p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono font-semibold text-sm uppercase text-white">{t.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    {t.category && <Badge>{t.category}</Badge>}
                    <span className="font-mono text-xs text-grey-light">{t.items.length} TASK{t.items.length !== 1 ? 'S' : ''}</span>
                  </div>
                </div>
                {t.isBuiltIn && <Badge variant="warning">BUILT-IN</Badge>}
              </div>

              {t.description && (
                <p className="font-sans text-xs text-grey-light">{t.description}</p>
              )}

              <ul className="font-mono text-xs text-grey-light space-y-0.5 flex-1">
                {t.items.slice(0, 4).map((item, i) => (
                  <li key={i} className="truncate">• {item.title}</li>
                ))}
                {t.items.length > 4 && <li className="text-grey-light">+ {t.items.length - 4} MORE</li>}
              </ul>

              <div className="flex flex-wrap gap-3 pt-1 border-t border-grey-mid mt-1">
                <button onClick={() => onApply(t)} className="font-mono text-xs uppercase text-white hover:text-success transition-colors">
                  APPLY
                </button>
                {!t.isBuiltIn ? (
                  <>
                    <button onClick={() => onEdit(t)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">
                      EDIT
                    </button>
                    <button onClick={() => onDelete(t)} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">
                      DELETE
                    </button>
                  </>
                ) : (
                  <button onClick={() => onEdit(t)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">
                    VIEW
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
