'use client'

import { useEffect, useState, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'

interface Step {
  title: string
  content: string
  imageUrl: string | null
  videoUrl: string
  linkedTaskId: string
}

interface TrainingModule {
  id: string
  title: string
  description: string | null
  category: string | null
  departmentId: string | null
  linkedTaskId: string | null
  requiresSignOff: boolean
  isOnboarding: boolean
  onboardingOrder: number
  isActive: boolean
  steps: {
    id: string
    title: string | null
    content: string
    imageUrl: string | null
    videoUrl: string | null
    linkedTaskId: string | null
  }[]
  department: { id: string; name: string } | null
  linkedTask: { id: string; title: string } | null
  _count: { completions: number }
}

interface Department { id: string; name: string; venueId: string }
interface TaskLite { id: string; title: string; venueId: string }

function emptyStep(): Step {
  return { title: '', content: '', imageUrl: null, videoUrl: '', linkedTaskId: '' }
}

export function TrainingClient({ role, sessionVenueId }: { role: string; sessionVenueId: string }) {
  const [modules, setModules] = useState<TrainingModule[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [tasks, setTasks] = useState<TaskLite[]>([])
  const [loading, setLoading] = useState(true)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<TrainingModule | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [linkedTaskId, setLinkedTaskId] = useState('')
  const [requiresSignOff, setRequiresSignOff] = useState(false)
  const [isOnboarding, setIsOnboarding] = useState(false)
  const [steps, setSteps] = useState<Step[]>([emptyStep()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null)
  const fileRefs = useRef<(HTMLInputElement | null)[]>([])

  async function load() {
    const [mR, dR, tR] = await Promise.all([
      fetch('/api/admin/training'),
      fetch('/api/admin/departments'),
      fetch('/api/admin/tasks'),
    ])
    const [mData, dData, tData] = await Promise.all([mR.json(), dR.json(), tR.json()])
    setModules(mData)
    setDepartments(dData)
    setTasks(tData)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setTitle(''); setDescription(''); setCategory('')
    setDepartmentId(''); setLinkedTaskId('')
    setRequiresSignOff(false); setIsOnboarding(false)
    setSteps([emptyStep()])
    setError(''); setOpen(true)
  }

  function openEdit(m: TrainingModule) {
    setEditing(m)
    setTitle(m.title); setDescription(m.description ?? ''); setCategory(m.category ?? '')
    setDepartmentId(m.departmentId ?? ''); setLinkedTaskId(m.linkedTaskId ?? '')
    setRequiresSignOff(m.requiresSignOff); setIsOnboarding(m.isOnboarding)
    setSteps(
      m.steps.length
        ? m.steps.map((s) => ({
            title: s.title ?? '',
            content: s.content,
            imageUrl: s.imageUrl,
            videoUrl: s.videoUrl ?? '',
            linkedTaskId: s.linkedTaskId ?? '',
          }))
        : [emptyStep()]
    )
    setError(''); setOpen(true)
  }

  function updateStep(i: number, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  async function uploadImage(i: number, file: File) {
    setUploadingIndex(i)
    const form = new FormData()
    form.append('file', file)
    const r = await fetch('/api/admin/upload', { method: 'POST', body: form })
    setUploadingIndex(null)
    if (r.ok) {
      const data = await r.json()
      updateStep(i, { imageUrl: data.url })
    } else {
      setError('IMAGE UPLOAD FAILED')
    }
  }

  async function handleSave() {
    const cleanSteps = steps.filter((s) => s.content.trim())
    if (!title.trim()) { setError('TITLE IS REQUIRED'); return }
    if (cleanSteps.length === 0) { setError('ADD AT LEAST ONE STEP'); return }

    setSaving(true); setError('')
    const payload = {
      title, description, category,
      departmentId: departmentId || null,
      linkedTaskId: linkedTaskId || null,
      requiresSignOff, isOnboarding,
      steps: cleanSteps.map((s) => ({
        title: s.title || null,
        content: s.content,
        imageUrl: s.imageUrl,
        videoUrl: s.videoUrl || null,
        linkedTaskId: s.linkedTaskId || null,
      })),
    }
    const url = editing ? `/api/admin/training/${editing.id}` : '/api/admin/training'
    const method = editing ? 'PUT' : 'POST'
    const r = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'SAVE FAILED'); return }
    setOpen(false); load()
  }

  async function handleDelete(m: TrainingModule) {
    if (!confirm(`DELETE TRAINING "${m.title}"?`)) return
    await fetch(`/api/admin/training/${m.id}`, { method: 'DELETE' })
    load()
  }

  const deptOptions = [
    { value: '', label: 'ALL STAFF (NOT DEPT-SPECIFIC)' },
    ...departments.map((d) => ({ value: d.id, label: d.name })),
  ]
  const taskOptions = [
    { value: '', label: 'NOT LINKED TO A TASK' },
    ...tasks.map((t) => ({ value: t.id, label: t.title })),
  ]

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest">TRAINING</h1>
          <p className="font-mono text-xs text-grey-light mt-1 uppercase">
            GUIDES + ONBOARDING. ASSIGN AND SIGN OFF PER PERSON FROM THE STAFF PAGE.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>+ NEW MODULE</Button>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : modules.length === 0 ? (
        <p className="font-mono text-xs text-grey-light">NO TRAINING MODULES YET.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {modules.map((m) => (
            <div key={m.id} className="bg-grey-dark border border-grey-mid p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono font-semibold text-sm uppercase text-white">{m.title}</span>
                {!m.isActive && <Badge variant="danger">OFF</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {m.isOnboarding && <Badge variant="warning">ONBOARDING</Badge>}
                {m.department && <Badge>{m.department.name}</Badge>}
                {m.category && <Badge>{m.category}</Badge>}
                <Badge variant={m.requiresSignOff ? 'warning' : 'success'}>
                  {m.requiresSignOff ? 'SIGN-OFF' : 'SELF'}
                </Badge>
              </div>
              {m.description && <p className="font-sans text-xs text-grey-light">{m.description}</p>}
              <div className="font-mono text-xs text-grey-light">
                {m.steps.length} STEP{m.steps.length !== 1 ? 'S' : ''} · {m._count.completions} COMPLETED
                {m.linkedTask && <> · LINKED: {m.linkedTask.title}</>}
              </div>
              <div className="flex gap-3 pt-1 border-t border-grey-mid mt-1">
                <button onClick={() => openEdit(m)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">EDIT</button>
                <button onClick={() => handleDelete(m)} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">DELETE</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? 'EDIT MODULE' : 'NEW MODULE'} size="lg">
        <div className="space-y-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="HOW TO CLEAN THE COFFEE MACHINE" />
          <Textarea label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="BAR" />
            <Select label="Auto-assign to department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} options={deptOptions} />
          </div>
          <Select label="Link to a task (optional)" value={linkedTaskId} onChange={(e) => setLinkedTaskId(e.target.value)} options={taskOptions} />

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

          {error && <p className="font-mono text-xs text-danger">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} loading={saving}>SAVE MODULE</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>CANCEL</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
