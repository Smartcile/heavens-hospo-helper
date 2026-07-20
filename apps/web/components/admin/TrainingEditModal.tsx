'use client'

import { useEffect, useState, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Combobox, ComboboxHandle } from '@/components/ui/Combobox'

interface Step {
  title: string
  content: string
  imageUrl: string | null
  videoUrl: string
  linkedTaskId: string
  linkedChecklistId: string
  taskIds: string[]
  linkedModuleIds: string[]
  inventoryItemIds: { itemId: string; quantity: number }[]
}

interface Department { id: string; name: string; venueId: string }
interface TaskLite { id: string; title: string; venueId: string }
interface Section { id: string; name: string; venueId: string }
interface ChecklistLite { id: string; name: string; departmentId: string | null }
interface ModuleLite { id: string; title: string; kind: string; category: string | null }
interface InventoryLite { id: string; name: string; unit: string; category: { id: string; name: string } | null; totalQty: number }

interface TrainingData {
  id: string; title: string; description: string | null; category: string | null; kind: string
  departmentId: string | null; linkedTaskId: string | null
  requiresSignOff: boolean; isOnboarding: boolean; venueId: string
  steps: {
    title: string | null; content: string; imageUrl: string | null; videoUrl: string | null
    linkedTaskId: string | null; linkedChecklistId: string | null
    stepTasks?: { taskId: string }[]; stepModules?: { moduleId: string }[]
    inventoryItems?: { id: string; itemId: string; quantity: number }[]
  }[]
  resourceSections: { sectionId: string }[]
  moduleDepartments?: { departmentId: string }[]
  moduleTasks?: { taskId: string }[]
}

const KIND_OPTIONS = [
  { value: 'TRAINING', label: 'TRAINING (SIGN-OFF-ABLE)' },
  { value: 'SOP', label: 'SOP' },
  { value: 'FAQ', label: 'FAQ' },
  { value: 'HOWTO', label: 'HOW-TO' },
]

function emptyStep(): Step {
  return { title: '', content: '', imageUrl: null, videoUrl: '', linkedTaskId: '', linkedChecklistId: '', taskIds: [], linkedModuleIds: [], inventoryItemIds: [] }
}

export function TrainingEditModal({ moduleId, onClose, onSaved }: { moduleId: string; onClose: () => void; onSaved: () => void }) {
  const [venueId, setVenueId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [kind, setKind] = useState('TRAINING')
  const [departmentId, setDepartmentId] = useState('')
  const [departmentIds, setDepartmentIds] = useState<string[]>([])
  const [taskIds, setTaskIds] = useState<string[]>([])
  const [sectionIds, setSectionIds] = useState<string[]>([])
  const [requiresSignOff, setRequiresSignOff] = useState(false)
  const [isOnboarding, setIsOnboarding] = useState(false)
  const [steps, setSteps] = useState<Step[]>([emptyStep()])
  const [reqRetrain, setReqRetrain] = useState(false)
  const [changeSummary, setChangeSummary] = useState('')

  const [departments, setDepartments] = useState<Department[]>([])
  const [tasks, setTasks] = useState<TaskLite[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [checklists, setChecklists] = useState<ChecklistLite[]>([])
  const [modules, setModules] = useState<ModuleLite[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryLite[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null)
  const fileRefs = useRef<(HTMLInputElement | null)[]>([])
  const deptRef = useRef<ComboboxHandle>(null)
  const taskRef = useRef<ComboboxHandle>(null)
  const sectionRef = useRef<ComboboxHandle>(null)

  useEffect(() => {
    let active = true
    Promise.all([
      fetch(`/api/admin/training/${moduleId}`).then((r) => r.json()),
      fetch('/api/admin/departments').then((r) => r.json()),
      fetch('/api/admin/tasks').then((r) => r.json()),
      fetch('/api/admin/sections').then((r) => r.json()),
      fetch('/api/admin/checklists').then((r) => r.json()),
      fetch('/api/admin/training').then((r) => r.json()),
      fetch('/api/admin/inventory').then((r) => r.json()),
    ]).then(([m, d, t, s, c, mods, inv]: [TrainingData, Department[], TaskLite[], Section[], ChecklistLite[], ModuleLite[], InventoryLite[]]) => {
      if (!active) return
      setVenueId(m.venueId)
      setTitle(m.title); setDescription(m.description ?? ''); setCategory(m.category ?? '')
      setKind(m.kind ?? 'TRAINING'); setDepartmentId(m.departmentId ?? ''); setLinkedTaskIdState(m.linkedTaskId ?? '')
      setDepartmentIds((m.moduleDepartments ?? []).map((md) => md.departmentId))
      setTaskIds((m.moduleTasks ?? []).map((mt) => mt.taskId))
      setSectionIds((m.resourceSections ?? []).map((r) => r.sectionId))
      setRequiresSignOff(m.requiresSignOff); setIsOnboarding(m.isOnboarding)
      setSteps(
        m.steps.length
          ? m.steps.map((s) => ({
              title: s.title ?? '', content: s.content, imageUrl: s.imageUrl,
              videoUrl: s.videoUrl ?? '', linkedTaskId: s.linkedTaskId ?? '', linkedChecklistId: s.linkedChecklistId ?? '',
              taskIds: (s.stepTasks ?? []).map((st) => st.taskId),
              linkedModuleIds: (s.stepModules ?? []).map((sm) => sm.moduleId),
              inventoryItemIds: (s.inventoryItems ?? []).map((inv) => ({ itemId: inv.itemId, quantity: inv.quantity })),
            }))
          : [emptyStep()]
      )
      setDepartments(Array.isArray(d) ? d : [])
      setTasks(Array.isArray(t) ? t : [])
      setSections(Array.isArray(s) ? s : [])
      setChecklists(Array.isArray(c) ? c : [])
      setModules(Array.isArray(mods) ? mods : [])
      setInventoryItems(Array.isArray(inv) ? inv : [])
      setLoading(false)
    })
    return () => { active = false }
  }, [moduleId])

  // linkedTaskId kept for payload parity (single "how-to for" task) though the UI
  // uses the multi-task combobox; retained via state setter.
  const [linkedTaskId, setLinkedTaskIdState] = useState('')

  function updateStep(i: number, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  async function uploadImage(i: number, file: File) {
    setUploadingIndex(i)
    const form = new FormData()
    form.append('file', file)
    const r = await fetch('/api/admin/upload', { method: 'POST', body: form })
    setUploadingIndex(null)
    if (r.ok) { const data = await r.json(); updateStep(i, { imageUrl: data.url }) }
    else setError('IMAGE UPLOAD FAILED')
  }

  async function handleSave() {
    const cleanSteps = steps.filter((s) => s.content.trim() || s.linkedChecklistId || s.linkedTaskId)
    if (!title.trim()) { setError('TITLE IS REQUIRED'); return }
    if (cleanSteps.length === 0) { setError('ADD AT LEAST ONE STEP'); return }
    setSaving(true); setError('')
    const payload = {
      title, description, category, kind,
      sectionIds: sectionRef.current?.getFinalSelection() ?? sectionIds,
      departmentIds: deptRef.current?.getFinalSelection() ?? departmentIds,
      taskIds: taskRef.current?.getFinalSelection() ?? taskIds,
      departmentId: departmentId || null,
      linkedTaskId: linkedTaskId || null,
      requiresSignOff, isOnboarding,
      requireRetrain: reqRetrain, changeSummary,
      steps: cleanSteps.map((s) => ({
        title: s.title || null, content: s.content, imageUrl: s.imageUrl,
        videoUrl: s.videoUrl || null, linkedTaskId: s.linkedTaskId || null, linkedChecklistId: s.linkedChecklistId || null,
        taskIds: s.taskIds.length ? s.taskIds : undefined,
        linkedModuleIds: s.linkedModuleIds.length ? s.linkedModuleIds : undefined,
        inventoryItemIds: s.inventoryItemIds.length ? s.inventoryItemIds : undefined,
      })),
    }
    const r = await fetch(`/api/admin/training/${moduleId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSaving(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'SAVE FAILED'); return }
    onSaved()
  }

  const formDepartments = departments.filter((d) => d.venueId === venueId)
  const formTasks = tasks.filter((t) => t.venueId === venueId)
  const formSections = sections.filter((s) => s.venueId === venueId)
  const deptOptions = [{ value: '', label: 'ALL STAFF (NOT DEPT-SPECIFIC)' }, ...formDepartments.map((d) => ({ value: d.id, label: d.name }))]
  const stepChecklistOptions = [
    { value: '', label: '+ EMBED A CHECKLIST (OPTIONAL)' },
    ...checklists.filter((c) => !departmentId || c.departmentId === departmentId || c.departmentId === null).map((c) => ({ value: c.id, label: c.name })),
  ]

  return (
    <Modal isOpen onClose={onClose} title="EDIT MODULE" size="lg">
      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <div className="space-y-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="HOW TO CLEAN THE COFFEE MACHINE" />
          <Textarea label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Type" value={kind} onChange={(e) => setKind(e.target.value)} options={KIND_OPTIONS} />
            <Input label="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="BAR" />
          </div>
          <Select label="Auto-assign to department (single)" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} options={deptOptions} />
          <div className="grid grid-cols-2 gap-3">
            <Combobox
              ref={deptRef}
              label="Auto-assign to departments"
              options={formDepartments.map((d) => ({ value: d.id, label: d.name }))}
              selected={departmentIds}
              onChange={setDepartmentIds}
              placeholder="Search departments..."
            />
            <Combobox
              ref={taskRef}
              label="Link to tasks (optional)"
              options={formTasks.map((t) => ({ value: t.id, label: t.title }))}
              selected={taskIds}
              onChange={setTaskIds}
              onPreview={(id) => window.open(`/admin/tasks?task=${id}`, '_blank')}
              placeholder="Search tasks..."
            />
          </div>

          {formSections.length > 0 && (
            <Combobox
              ref={sectionRef}
              label="Show in sections (optional)"
              options={formSections.map((s) => ({ value: s.id, label: s.name }))}
              selected={sectionIds}
              onChange={setSectionIds}
              placeholder="Search sections..."
            />
          )}

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={requiresSignOff} onChange={(e) => setRequiresSignOff(e.target.checked)} className="w-4 h-4 accent-white" />
              <span className="font-mono text-xs uppercase text-white">REQUIRES MANAGER SIGN-OFF</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isOnboarding} onChange={(e) => setIsOnboarding(e.target.checked)} className="w-4 h-4 accent-white" />
              <span className="font-mono text-xs uppercase text-white">PART OF ONBOARDING</span>
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Steps</label>
              <button type="button" onClick={() => setSteps((p) => [...p, emptyStep()])} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">+ ADD STEP</button>
            </div>
            {steps.map((s, i) => (
              <div key={i} className="border border-grey-mid p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-grey-light">STEP {i + 1}</span>
                  {steps.length > 1 && (
                    <button type="button" onClick={() => setSteps((p) => p.filter((_, idx) => idx !== i))} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">DEL</button>
                  )}
                </div>
                <Input value={s.title} onChange={(e) => updateStep(i, { title: e.target.value })} placeholder="STEP HEADING (OPTIONAL)" />
                <Textarea value={s.content} onChange={(e) => updateStep(i, { content: e.target.value })} placeholder="What to do in this step..." />
                <Input value={s.videoUrl} onChange={(e) => updateStep(i, { videoUrl: e.target.value })} placeholder="VIDEO LINK (YOUTUBE/VIMEO, OPTIONAL)" />
                <Select value={s.linkedChecklistId} onChange={(e) => updateStep(i, { linkedChecklistId: e.target.value })} options={stepChecklistOptions} />
                {s.linkedChecklistId && (
                  <p className="font-mono text-xs uppercase text-grey-light">THIS LIST APPEARS IN THE TRAINING TO TICK OFF IN PERSON.</p>
                )}
                <Combobox
                  label="Linked tasks"
                  options={formTasks.map((t) => ({ value: t.id, label: t.title }))}
                  selected={s.taskIds}
                  onChange={(ids) => updateStep(i, { taskIds: ids })}
                  onPreview={(id) => window.open(`/admin/tasks?task=${id}`, '_blank')}
                  placeholder="Search tasks..."
                />
                <Combobox
                  label="Linked training / SOPs"
                  options={modules.filter((m) => m.id !== moduleId).map((m) => ({ value: m.id, label: m.title, description: `${m.kind} · ${m.category ?? ''}` }))}
                  selected={s.linkedModuleIds}
                  onChange={(ids) => updateStep(i, { linkedModuleIds: ids })}
                  onPreview={(id) => window.open(`/admin/training?module=${id}`, '_blank')}
                  placeholder="Search modules..."
                />
                <Combobox
                  label="Tools / equipment needed"
                  options={inventoryItems.map((inv) => ({ value: inv.id, label: inv.name, description: `${inv.unit} · ${inv.category?.name ?? ''}${inv.totalQty > 0 ? ` · QTY ${inv.totalQty}` : ''}` }))}
                  selected={(s.inventoryItemIds ?? []).map((si) => si.itemId)}
                  onChange={(ids) => updateStep(i, { inventoryItemIds: ids.map((itemId) => ({ itemId, quantity: 1 })) })}
                  onPreview={(id) => window.open(`/admin/inventory?item=${id}`, '_blank')}
                  placeholder="Search inventory..."
                />
                <div className="flex items-center gap-2">
                  <input
                    ref={(el) => { fileRefs.current[i] = el }}
                    type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(i, f) }}
                  />
                  <button type="button" onClick={() => fileRefs.current[i]?.click()} className="font-mono text-xs uppercase border border-grey-mid px-3 py-1.5 text-grey-light hover:border-white hover:text-white transition-colors">
                    {uploadingIndex === i ? 'UPLOADING_' : s.imageUrl ? 'REPLACE PHOTO' : 'ADD PHOTO'}
                  </button>
                  {s.imageUrl && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.imageUrl} alt="step" className="h-10 w-10 object-cover border border-grey-mid" />
                      <button type="button" onClick={() => updateStep(i, { imageUrl: null })} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">REMOVE</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="border-l-4 border-l-warning pl-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={reqRetrain} onChange={(e) => setReqRetrain(e.target.checked)} className="w-4 h-4 accent-white" />
              <span className="font-mono text-xs uppercase text-white">Require re-training (notify staff of this change)</span>
            </label>
            {reqRetrain && (
              <Input label="What changed? (optional)" value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} placeholder="e.g. UPDATED MILK TEMPERATURE" />
            )}
            <p className="font-mono text-xs text-grey-light">POSTS A MUST-ACKNOWLEDGE NOTICE TO THE RELEVANT GROUP; STAFF TAP GOT IT TO CONFIRM.</p>
          </div>

          {error && <p className="font-mono text-xs text-danger">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} loading={saving}>SAVE MODULE</Button>
            <Button variant="ghost" onClick={onClose}>CANCEL</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
