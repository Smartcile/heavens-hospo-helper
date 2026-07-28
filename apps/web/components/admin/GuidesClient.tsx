'use client'

import { useEffect, useState, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Combobox, ComboboxHandle } from '@/components/ui/Combobox'
import { getActiveVenueId } from '@/lib/active-venue'

interface Step {
  heading: string
  content: string
  imageUrl: string | null
  videoUrl: string
}

interface TaskGuide {
  id?: string
  taskId: string
  isRequiredForCompetency: boolean
}

interface Guide {
  id: string
  title: string
  description: string | null
  category: string | null
  venueId: string
  departmentId: string | null
  status: 'DRAFT' | 'PUBLISHED'
  isTracked: boolean
  isOnboarding: boolean
  requiresSignOff: boolean
  legacyToolsNote: string | null
  steps: {
    id: string
    heading: string | null
    content: string
    imageUrl: string | null
    videoUrl: string | null
  }[]
  taskGuides?: TaskGuide[]
  department: { id: string; name: string } | null
}

interface Venue { id: string; name: string }
interface Department { id: string; name: string; venueId: string }
interface TaskLite { id: string; title: string; venueId: string }

function emptyStep(): Step {
  return { heading: '', content: '', imageUrl: null, videoUrl: '' }
}

export function GuidesClient({ role, sessionVenueId, defaultVenueId }: { role: string; sessionVenueId: string; defaultVenueId?: string }) {
  const [guides, setGuides] = useState<Guide[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [tasks, setTasks] = useState<TaskLite[]>([])
  const [loading, setLoading] = useState(true)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Guide | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [isTracked, setIsTracked] = useState(true)
  const [isOnboarding, setIsOnboarding] = useState(false)
  const [requiresSignOff, setRequiresSignOff] = useState(false)
  const [venueId, setVenueId] = useState('')
  const [linkedTaskIds, setLinkedTaskIds] = useState<string[]>([])
  const [competencyTaskIds, setCompetencyTaskIds] = useState<string[]>([])
  const [steps, setSteps] = useState<Step[]>([emptyStep()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null)
  const fileRefs = useRef<(HTMLInputElement | null)[]>([])
  const linkedRef = useRef<ComboboxHandle>(null)
  const compRef = useRef<ComboboxHandle>(null)

  async function load() {
    const activeVenueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)
    const venueParam = activeVenueId ? `?venueId=${encodeURIComponent(activeVenueId)}` : ''
    const [gR, dR, tR] = await Promise.all([
      fetch(`/api/admin/guides${venueParam}`),
      fetch('/api/admin/departments'),
      fetch('/api/admin/tasks'),
    ])
    const [gData, dData, tData] = await Promise.all([gR.json(), dR.json(), tR.json()])
    setGuides(gData)
    setDepartments(dData)
    setTasks(tData)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (role === 'ADMIN') {
      fetch('/api/admin/venues')
        .then((r) => r.json())
        .then((v: Venue[]) => {
          setVenues(v)
          if (!venueId && v.length > 0) {
            const active = getActiveVenueId(role, sessionVenueId, defaultVenueId)
            setVenueId(active || v[0].id)
          }
        })
    }
  }, [role])

  function openCreate() {
    setEditing(null)
    setTitle(''); setDescription(''); setCategory('')
    setDepartmentId(''); setIsTracked(true); setIsOnboarding(false); setRequiresSignOff(false)
    setLinkedTaskIds([]); setCompetencyTaskIds([])
    setSteps([emptyStep()])
    setVenueId(getActiveVenueId(role, sessionVenueId, defaultVenueId))
    setError(''); setOpen(true)
  }

  function openEdit(g: Guide) {
    setEditing(g)
    setTitle(g.title); setDescription(g.description ?? ''); setCategory(g.category ?? '')
    setDepartmentId(g.departmentId ?? '')
    setIsTracked(g.isTracked); setIsOnboarding(g.isOnboarding); setRequiresSignOff(g.requiresSignOff)
    setVenueId(g.venueId)

    const tgs = g.taskGuides ?? []
    setLinkedTaskIds(tgs.filter((t) => !t.isRequiredForCompetency).map((t) => t.taskId))
    setCompetencyTaskIds(tgs.filter((t) => t.isRequiredForCompetency).map((t) => t.taskId))

    setSteps(
      g.steps.length
        ? g.steps.map((s) => ({
            heading: s.heading ?? '',
            content: s.content,
            imageUrl: s.imageUrl,
            videoUrl: s.videoUrl ?? '',
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
    if (!title.trim()) { setError('TITLE IS REQUIRED'); return }

    setSaving(true); setError('')
    const cleanSteps = steps.filter((s) => s.content.trim() || s.heading.trim())

    const finalLinked = linkedRef.current?.getFinalSelection() ?? linkedTaskIds
    const finalComp = compRef.current?.getFinalSelection() ?? competencyTaskIds

    const taskGuides: { taskId: string; isRequiredForCompetency: boolean }[] = [
      ...finalLinked.filter((id) => !finalComp.includes(id)).map((taskId) => ({ taskId, isRequiredForCompetency: false })),
      ...finalComp.map((taskId) => ({ taskId, isRequiredForCompetency: true })),
    ]

    const payload = {
      title, description, category,
      venueId: role === 'ADMIN' ? venueId : undefined,
      departmentId: departmentId || null,
      isTracked, isOnboarding, requiresSignOff,
      steps: cleanSteps.map((s) => ({
        heading: s.heading || null,
        content: s.content,
        imageUrl: s.imageUrl,
        videoUrl: s.videoUrl || null,
      })),
      taskGuides,
    }
    const url = editing ? `/api/admin/guides/${editing.id}` : '/api/admin/guides'
    const method = editing ? 'PUT' : 'POST'
    const r = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'SAVE FAILED'); return }
    setOpen(false); load()
  }

  async function handleDelete(g: Guide) {
    if (!confirm(`DELETE GUIDE "${g.title}"?`)) return
    await fetch(`/api/admin/guides/${g.id}`, { method: 'DELETE' })
    load()
  }

  async function handlePublish(g: Guide, newStatus: 'DRAFT' | 'PUBLISHED') {
    await fetch(`/api/admin/guides/${g.id}/publish`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }),
    })
    load()
  }

  const effectiveVenueId = role === 'ADMIN' ? venueId : sessionVenueId
  const filteredDepartments = departments.filter((d) => !effectiveVenueId || d.venueId === effectiveVenueId)
  const filteredTasks = tasks.filter((t) => !effectiveVenueId || t.venueId === effectiveVenueId)
  const filteredGuides = guides.filter((g) => !effectiveVenueId || g.venueId === effectiveVenueId)

  const deptOptions = [
    { value: '', label: 'ALL STAFF (NOT DEPT-SPECIFIC)' },
    ...filteredDepartments.map((d) => ({ value: d.id, label: d.name })),
  ]
  const venueOptions = venues.map((v) => ({ value: v.id, label: v.name }))
  const taskOptions = filteredTasks.map((t) => ({ value: t.id, label: t.title }))

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest">PLAYBOOK GUIDES</h1>
          <p className="font-mono text-xs text-grey-light mt-1 uppercase">
            TRAINING, SOPS, FAQS + HOW-TOS. PUBLISH WHEN READY.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>+ NEW GUIDE</Button>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : filteredGuides.length === 0 ? (
        <p className="font-mono text-xs text-grey-light">NO GUIDES YET.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredGuides.map((g) => (
            <div key={g.id} className={`bg-grey-dark border p-4 flex flex-col gap-2 ${g.status === 'DRAFT' ? 'border-yellow-700' : 'border-grey-mid'}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono font-semibold text-sm uppercase text-white">{g.title}</span>
                <Badge variant={g.status === 'DRAFT' ? 'warning' : 'success'}>{g.status}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {g.isTracked && <Badge variant="default">TRACKED</Badge>}
                {!g.isTracked && <Badge variant="default">REFERENCE</Badge>}
                {g.isOnboarding && <Badge variant="warning">ONBOARDING</Badge>}
                {g.department && <Badge>{g.department.name}</Badge>}
                {g.category && <Badge>{g.category}</Badge>}
                <Badge variant={g.requiresSignOff ? 'warning' : 'success'}>
                  {g.requiresSignOff ? 'SIGN-OFF' : 'SELF'}
                </Badge>
              </div>
              {g.description && <p className="font-sans text-xs text-grey-light line-clamp-2">{g.description}</p>}
              <div className="font-mono text-xs text-grey-light">
                {g.steps.length} STEP{g.steps.length !== 1 ? 'S' : ''}
                {(g.taskGuides?.length ?? 0) > 0 && <> · {g.taskGuides!.length} TASK LINK{g.taskGuides!.length !== 1 ? 'S' : ''}</>}
              </div>
              {g.legacyToolsNote && (
                <p className="font-mono text-[10px] text-grey-light leading-tight">{g.legacyToolsNote}</p>
              )}
              <div className="flex gap-3 pt-1 border-t border-grey-mid mt-1">
                <button onClick={() => openEdit(g)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">EDIT</button>
                <button onClick={() => handleDelete(g)} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">DELETE</button>
                {g.status === 'DRAFT'
                  ? <button onClick={() => handlePublish(g, 'PUBLISHED')} className="font-mono text-xs uppercase text-success hover:text-white transition-colors ml-auto">PUBLISH</button>
                  : <button onClick={() => handlePublish(g, 'DRAFT')} className="font-mono text-xs uppercase text-yellow-500 hover:text-white transition-colors ml-auto">UNPUBLISH</button>
                }
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? 'EDIT GUIDE' : 'NEW GUIDE'} size="lg">
        <div className="space-y-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="HOW TO CLEAN THE COFFEE MACHINE" />
          <Textarea label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          {role === 'ADMIN' && !editing && (
            <Select label="Venue" value={venueId} onChange={(e) => setVenueId(e.target.value)} options={venueOptions} />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Select label="Auto-assign to department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} options={deptOptions} />
            <Input label="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="BAR" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Combobox
              ref={linkedRef}
              label="Linked tasks (how-to guide for)"
              options={taskOptions}
              selected={linkedTaskIds}
              onChange={setLinkedTaskIds}
              onPreview={(id) => window.open(`/admin/tasks?task=${id}`, '_blank')}
              placeholder="Search tasks..."
            />
            <Combobox
              ref={compRef}
              label="Required competency (must complete before task)"
              options={taskOptions}
              selected={competencyTaskIds}
              onChange={setCompetencyTaskIds}
              onPreview={(id) => window.open(`/admin/tasks?task=${id}`, '_blank')}
              placeholder="Search tasks..."
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isTracked} onChange={(e) => setIsTracked(e.target.checked)} className="w-4 h-4 accent-white" />
              <span className="font-mono text-xs uppercase text-white">TRACK COMPLETION</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={requiresSignOff} onChange={(e) => setRequiresSignOff(e.target.checked)} className="w-4 h-4 accent-white" disabled={!isTracked} />
              <span className={`font-mono text-xs uppercase ${!isTracked ? 'text-grey-light' : 'text-white'}`}>REQUIRES MANAGER SIGN-OFF</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isOnboarding} onChange={(e) => setIsOnboarding(e.target.checked)} className="w-4 h-4 accent-white" disabled={!isTracked} />
              <span className={`font-mono text-xs uppercase ${!isTracked ? 'text-grey-light' : 'text-white'}`}>PART OF ONBOARDING</span>
            </label>
          </div>

          {!isTracked && (
            <p className="font-mono text-xs text-grey-light">REFERENCE GUIDES ARE NOT TRACKED. SIGN-OFF AND ONBOARDING DO NOT APPLY.</p>
          )}

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
                <Input value={s.heading} onChange={(e) => updateStep(i, { heading: e.target.value })} placeholder="STEP HEADING (OPTIONAL)" />
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
            <Button onClick={handleSave} loading={saving}>SAVE GUIDE</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>CANCEL</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
