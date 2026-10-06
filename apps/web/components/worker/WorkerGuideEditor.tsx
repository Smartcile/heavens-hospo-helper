'use client'

import { useEffect, useMemo, useState } from 'react'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import { MultiImagePicker } from '@/components/ui/MultiImagePicker'
import { VideoPicker } from '@/components/ui/VideoPicker'
import { mergeStepImages } from '@/lib/guide-media'
import { GUIDE_TYPES, GUIDE_TYPE_LABELS } from '@/lib/guide-types'

interface GuideStep {
  id?: string
  heading: string
  content: string
  imageUrls: string[]
  videoUrl: string | null
  videoPath: string | null
}

interface TaskOption {
  id: string
  title: string
  departmentId: string | null
}

interface TaskLink {
  taskId: string
  isRequiredForCompetency: boolean
}

interface EditorOptions {
  departments: { id: string; name: string }[]
  tasks: TaskOption[]
}

interface FormState {
  title: string
  description: string
  category: string
  guideType: string
  departmentId: string
  isTracked: boolean
  isOnboarding: boolean
  requiresSignOff: boolean
  bodyHtml: string
  steps: GuideStep[]
  taskLinks: TaskLink[]
  status: 'DRAFT' | 'PUBLISHED'
}

function emptyStep(): GuideStep {
  return { heading: '', content: '', imageUrls: [], videoUrl: null, videoPath: null }
}

function blankForm(): FormState {
  return {
    title: '',
    description: '',
    category: '',
    guideType: 'HOW_TO',
    departmentId: '',
    isTracked: true,
    isOnboarding: false,
    requiresSignOff: false,
    bodyHtml: '',
    steps: [emptyStep()],
    taskLinks: [],
    status: 'DRAFT',
  }
}

const FIELD = 'w-full bg-black border border-grey-mid text-white font-mono text-sm px-2 py-2 outline-none focus:border-white'
const LABEL = 'font-mono text-xs uppercase text-grey-light'
const CHECK = 'flex items-center gap-2 font-mono text-xs uppercase text-grey-light'

export function WorkerGuideEditor({
  guideId,
  canPublish,
  onClose,
  onSaved,
}: {
  guideId: string | null
  canPublish: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormState>(blankForm)
  const [options, setOptions] = useState<EditorOptions>({ departments: [], tasks: [] })
  const [taskSearch, setTaskSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [oR, gR] = await Promise.all([
        fetch('/api/worker/guides/options'),
        guideId ? fetch(`/api/worker/guides/${guideId}`) : Promise.resolve(null),
      ])
      if (cancelled) return
      const opts = oR.ok ? await oR.json() : { departments: [], tasks: [] }
      setOptions({ departments: opts.departments ?? [], tasks: opts.tasks ?? [] })

      if (guideId && gR) {
        if (gR.status === 401) { window.location.href = '/w/login'; return }
        if (!gR.ok) { setError('COULD NOT LOAD GUIDE'); setLoading(false); return }
        const g = await gR.json()
        setForm({
          title: g.title ?? '',
          description: g.description ?? '',
          category: g.category ?? '',
          guideType: g.guideType ?? 'HOW_TO',
          departmentId: g.departmentId ?? '',
          isTracked: !!g.isTracked,
          isOnboarding: !!g.isOnboarding,
          requiresSignOff: !!g.requiresSignOff,
          bodyHtml: g.bodyHtml ?? '',
          steps: (g.steps ?? []).length
            ? (g.steps as { id: string; heading: string | null; content: string; imageUrl: string | null; imageUrls?: string[] | null; videoUrl: string | null; videoPath?: string | null }[]).map((s) => ({
                id: s.id,
                heading: s.heading ?? '',
                content: s.content ?? '',
                imageUrls: mergeStepImages(s.imageUrls, s.imageUrl),
                videoUrl: s.videoUrl,
                videoPath: s.videoPath ?? null,
              }))
            : [emptyStep()],
          taskLinks: (g.taskGuides ?? []).map((t: TaskLink) => ({ taskId: t.taskId, isRequiredForCompetency: !!t.isRequiredForCompetency })),
          status: g.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
        })
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [guideId])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function updateStep(i: number, patch: Partial<GuideStep>) {
    setForm((f) => ({ ...f, steps: f.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }))
  }

  function toggleTask(taskId: string) {
    setForm((f) => {
      const existing = f.taskLinks.find((t) => t.taskId === taskId)
      return {
        ...f,
        taskLinks: existing
          ? f.taskLinks.filter((t) => t.taskId !== taskId)
          : [...f.taskLinks, { taskId, isRequiredForCompetency: false }],
      }
    })
  }

  function toggleCompetency(taskId: string) {
    setForm((f) => ({
      ...f,
      taskLinks: f.taskLinks.map((t) => (t.taskId === taskId ? { ...t, isRequiredForCompetency: !t.isRequiredForCompetency } : t)),
    }))
  }

  const filteredTasks = useMemo(() => {
    const q = taskSearch.trim().toLowerCase()
    return options.tasks.filter((t) => !q || t.title.toLowerCase().includes(q))
  }, [options.tasks, taskSearch])

  async function save() {
    if (!form.title.trim()) { setError('TITLE IS REQUIRED'); return }
    setSaving(true); setError('')
    const body = {
      title: form.title,
      description: form.description || null,
      category: form.category || null,
      guideType: form.guideType,
      departmentId: form.departmentId || null,
      isTracked: form.isTracked,
      isOnboarding: form.isOnboarding,
      requiresSignOff: form.requiresSignOff,
      bodyHtml: form.bodyHtml || null,
      steps: form.steps
        .filter((s) => s.content.trim() || s.heading.trim())
        .map((s) => ({ id: s.id, heading: s.heading || null, content: s.content, imageUrls: s.imageUrls, videoUrl: s.videoUrl || null, videoPath: s.videoPath })),
      taskGuides: form.taskLinks,
    }
    const url = guideId ? `/api/worker/guides/${guideId}` : '/api/worker/guides'
    const r = await fetch(url, {
      method: guideId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error ?? 'SAVE FAILED'); return }
    onSaved()
  }

  async function togglePublish() {
    if (!guideId) return
    setSaving(true); setError('')
    const next = form.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED'
    const r = await fetch(`/api/worker/guides/${guideId}/publish`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    setSaving(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error ?? 'PUBLISH FAILED'); return }
    setForm((f) => ({ ...f, status: next }))
  }

  if (loading) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p></div>
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-4 border-b border-grey-mid">
        <button onClick={onClose} className="font-mono text-xs uppercase text-grey-light hover:text-white">← BACK</button>
        <span className="font-mono text-xs text-grey-light">{guideId ? 'EDIT GUIDE' : 'NEW GUIDE'}</span>
        <span className={`font-mono text-xs uppercase ${form.status === 'PUBLISHED' ? 'text-success' : 'text-warning'}`}>{form.status}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div className="space-y-1">
          <label className={LABEL}>Title</label>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="FOOD SAFETY BASICS" className={FIELD} />
        </div>

        <div className="space-y-1">
          <label className={LABEL}>Type</label>
          <select value={form.guideType} onChange={(e) => set('guideType', e.target.value)} className={FIELD}>
            {GUIDE_TYPES.map((t) => <option key={t} value={t}>{GUIDE_TYPE_LABELS[t]}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className={LABEL}>Category (optional)</label>
            <input value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="BAR" className={FIELD} />
          </div>
          <div className="space-y-1">
            <label className={LABEL}>Department</label>
            <select value={form.departmentId} onChange={(e) => set('departmentId', e.target.value)} className={FIELD}>
              <option value="">NONE</option>
              {options.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className={LABEL}>Description (optional)</label>
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} className={`${FIELD} font-sans`} />
        </div>

        <div className="space-y-1">
          <label className={LABEL}>Instructions (rich text)</label>
          <RichTextEditor value={form.bodyHtml} onChange={(html) => set('bodyHtml', html)} placeholder="Write basic instructions here — add steps below if you want a checklist." />
        </div>

        <div className="flex flex-wrap gap-4">
          <label className={CHECK}><input type="checkbox" checked={form.isTracked} onChange={(e) => set('isTracked', e.target.checked)} className="accent-white" /> Track completion</label>
          <label className={CHECK}><input type="checkbox" checked={form.isOnboarding} disabled={!form.isTracked} onChange={(e) => set('isOnboarding', e.target.checked)} className="accent-white disabled:opacity-40" /> Onboarding</label>
          <label className={CHECK}><input type="checkbox" checked={form.requiresSignOff} disabled={!form.isTracked} onChange={(e) => set('requiresSignOff', e.target.checked)} className="accent-white disabled:opacity-40" /> Manager sign-off</label>
        </div>

        {/* Steps */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className={LABEL}>Steps (optional)</label>
            <button type="button" onClick={() => set('steps', [...form.steps, emptyStep()])} className="font-mono text-xs uppercase text-white hover:text-accent">+ ADD STEP</button>
          </div>
          {form.steps.map((s, i) => (
            <div key={i} className="border border-grey-mid p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-grey-light">STEP {i + 1}</span>
                {form.steps.length > 1 && (
                  <button type="button" onClick={() => set('steps', form.steps.filter((_, idx) => idx !== i))} className="font-mono text-xs uppercase text-danger hover:opacity-80">DEL</button>
                )}
              </div>
              <input value={s.heading} onChange={(e) => updateStep(i, { heading: e.target.value })} placeholder="STEP HEADING (OPTIONAL)" className={FIELD} />
              <textarea value={s.content} onChange={(e) => updateStep(i, { content: e.target.value })} rows={3} placeholder="What to do..." className={`${FIELD} font-sans`} />
              <MultiImagePicker value={s.imageUrls} onChange={(urls) => updateStep(i, { imageUrls: urls })} endpoint="/api/worker/upload" />
              <VideoPicker value={s.videoPath} onChange={(url) => updateStep(i, { videoPath: url })} endpoint="/api/worker/upload-video" />
              <input value={s.videoUrl ?? ''} onChange={(e) => updateStep(i, { videoUrl: e.target.value })} placeholder="VIDEO LINK (OPTIONAL)" className={FIELD} />
            </div>
          ))}
        </div>

        {/* Linked tasks */}
        <div className="space-y-2">
          <label className={LABEL}>Link to tasks</label>
          <input value={taskSearch} onChange={(e) => setTaskSearch(e.target.value)} placeholder="SEARCH TASKS..." className={FIELD} />
          <div className="max-h-56 overflow-y-auto border border-grey-mid divide-y divide-grey-mid">
            {filteredTasks.length === 0 && <p className="font-mono text-xs text-grey-light p-3">NO TASKS.</p>}
            {filteredTasks.map((t) => {
              const link = form.taskLinks.find((x) => x.taskId === t.id)
              return (
                <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <button type="button" onClick={() => toggleTask(t.id)} className="flex items-center gap-2 min-w-0 text-left">
                    <span className={`w-4 h-4 border flex-shrink-0 ${link ? 'bg-white border-white' : 'border-grey-mid'}`} />
                    <span className="font-mono text-xs text-white truncate">{t.title}</span>
                  </button>
                  {link && (
                    <button type="button" onClick={() => toggleCompetency(t.id)} className={`font-mono text-xs uppercase border px-1.5 py-0.5 ${link.isRequiredForCompetency ? 'border-warning text-warning' : 'border-grey-mid text-grey-light'}`}>
                      {link.isRequiredForCompetency ? 'REQUIRED' : 'REFERENCE'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {error && <p className="font-mono text-xs text-danger">{error}</p>}
      </div>

      <div className="px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-grey-mid flex gap-2">
        <button onClick={save} disabled={saving} className="flex-1 h-12 bg-white text-black font-mono font-bold text-sm uppercase tracking-widest hover:bg-accent transition-colors disabled:opacity-40">
          {saving ? 'SAVING_' : 'SAVE'}
        </button>
        {guideId && canPublish && (
          <button onClick={togglePublish} disabled={saving} className={`h-12 px-4 border font-mono font-bold text-sm uppercase tracking-widest transition-colors disabled:opacity-40 ${form.status === 'PUBLISHED' ? 'border-warning text-warning' : 'border-success text-success'}`}>
            {form.status === 'PUBLISHED' ? 'UNPUBLISH' : 'PUBLISH'}
          </button>
        )}
      </div>
    </div>
  )
}
