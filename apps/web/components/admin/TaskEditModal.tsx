'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Combobox } from '@/components/ui/Combobox'
import { MONTHLY_OPTIONS } from '@/lib/scheduling'

interface Venue { id: string; name: string }
interface Department { id: string; name: string; venueId: string }
interface Section { id: string; name: string; departmentId: string; venueId: string }
interface GuideLite { id: string; title: string; venueId: string; isTracked: boolean; description: string | null }

interface TaskData {
  id: string; title: string; description: string | null; venueId: string
  departmentId: string | null; sectionId: string | null
  completionType: string; scheduleType: string; scheduleDays: number[]
  customCron: string | null; intervalMonths: number; monthlyOption: string | null; monthlyDay: number | null
  requiredTraining: { moduleId: string }[]
  taskGuides?: { guideId: string; isRequiredForCompetency: boolean }[]
}

const COMPLETION_OPTIONS = [
  { value: 'TICK', label: 'TICK (CHECK OFF)' },
  { value: 'TICK_NOTE', label: 'TICK + NOTE' },
  { value: 'TICK_PHOTO', label: 'TICK + PHOTO' },
]
const SCHEDULE_OPTIONS = [
  { value: 'DAILY', label: 'DAILY' },
  { value: 'WEEKLY', label: 'WEEKLY (SELECT DAYS)' },
  { value: 'MONTHLY', label: 'MONTHLY' },
  { value: 'CUSTOM', label: 'CUSTOM (CRON)' },
]
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

export function TaskEditModal({ taskId, role, onClose, onSaved }: { taskId: string; role: string; onClose: () => void; onSaved: () => void }) {
  const [task, setTask] = useState<TaskData | null>(null)
  const [competencyGuideIds, setCompetencyGuideIds] = useState<string[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [guides, setGuides] = useState<GuideLite[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [requireRetrain, setRequireRetrain] = useState(false)
  const [changeSummary, setChangeSummary] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      fetch(`/api/admin/tasks/${taskId}`).then((r) => r.json()),
      fetch('/api/admin/venues').then((r) => r.json()),
      fetch('/api/admin/departments').then((r) => r.json()),
      fetch('/api/admin/sections').then((r) => r.json()),
      fetch('/api/admin/guides').then((r) => r.json()),
    ]).then(([t, v, d, s, m]) => {
      if (!active) return
      setTask(t)
      // Read competency from TaskGuide (new) or fall back to old requiredTraining
      const guideIds = (t.taskGuides ?? []).filter((g: { isRequiredForCompetency: boolean }) => g.isRequiredForCompetency).map((g: { guideId: string }) => g.guideId)
      setCompetencyGuideIds(guideIds.length > 0 ? guideIds : (t.requiredTraining ?? []).map((r: { moduleId: string }) => r.moduleId))
      setVenues(Array.isArray(v) ? v : [])
      setDepartments(Array.isArray(d) ? d : [])
      setSections(Array.isArray(s) ? s : [])
      setGuides(Array.isArray(m) ? m : [])
      setLoading(false)
    })
    return () => { active = false }
  }, [taskId])

  function patch(p: Partial<TaskData>) {
    setTask((prev) => (prev ? { ...prev, ...p } : prev))
  }
  function toggleDay(day: number) {
    if (!task) return
    const days = task.scheduleDays.includes(day) ? task.scheduleDays.filter((d) => d !== day) : [...task.scheduleDays, day].sort()
    patch({ scheduleDays: days })
  }

  async function handleSave() {
    if (!task) return
    if (!task.title.trim() || !task.venueId) { setError('TITLE AND VENUE ARE REQUIRED'); return }
    if (task.scheduleType === 'WEEKLY' && task.scheduleDays.length === 0) { setError('SELECT AT LEAST ONE DAY'); return }
    if (task.scheduleType === 'CUSTOM' && !(task.customCron ?? '').trim()) { setError('CRON EXPRESSION IS REQUIRED'); return }
    setSaving(true); setError('')
    const r = await fetch(`/api/admin/tasks/${task.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: task.title, description: task.description,
        departmentId: task.departmentId || null, sectionId: task.sectionId || null,
        completionType: task.completionType, scheduleType: task.scheduleType,
        scheduleDays: task.scheduleType === 'DAILY' ? [] : task.scheduleDays,
        customCron: task.scheduleType === 'CUSTOM' ? task.customCron : null,
        intervalMonths: task.intervalMonths, monthlyOption: task.monthlyOption, monthlyDay: task.monthlyDay,
        requiredTrainingIds: [],
        competencyGuideIds,
        requireRetrain, changeSummary,
      }),
    })
    setSaving(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'SAVE FAILED'); return }
    onSaved()
  }

  const venueOptions = venues.map((v) => ({ value: v.id, label: v.name }))
  const deptOptions = task
    ? [{ value: '', label: 'NO DEPARTMENT' }, ...departments.filter((d) => d.venueId === task.venueId).map((d) => ({ value: d.id, label: d.name }))]
    : []
  const sectionOptions = task
    ? [{ value: '', label: 'NO SECTION' }, ...sections.filter((s) => s.departmentId === task.departmentId).map((s) => ({ value: s.id, label: s.name }))]
    : []
  const guideOptions = task ? guides.filter((g) => g.venueId === task.venueId) : []

  return (
    <Modal isOpen onClose={onClose} title="EDIT TASK" size="lg">
      {loading || !task ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <div className="space-y-4">
          <Input label="Task Title" value={task.title} onChange={(e) => patch({ title: e.target.value })} placeholder="WIPE DOWN ALL BAR SURFACES" />
          <Textarea label="Description (optional)" value={task.description ?? ''} onChange={(e) => patch({ description: e.target.value })} placeholder="Additional instructions..." />
          <div className="grid grid-cols-2 gap-3">
            {role === 'ADMIN' && (
              <Select label="Venue" value={task.venueId} onChange={(e) => patch({ venueId: e.target.value, departmentId: '', sectionId: '' })} options={venueOptions} placeholder="SELECT VENUE" />
            )}
            <Select label="Department" value={task.departmentId ?? ''} onChange={(e) => patch({ departmentId: e.target.value, sectionId: '' })} options={deptOptions} />
          </div>
          <Select label="Section (optional)" value={task.sectionId ?? ''} onChange={(e) => patch({ sectionId: e.target.value })} options={sectionOptions} />

          {guideOptions.length > 0 && (
            <Combobox
              label="Required training (competency)"
              options={guideOptions.map((g) => ({ value: g.id, label: g.title, description: g.description ?? undefined }))}
              selected={competencyGuideIds}
              onChange={setCompetencyGuideIds}
              onPreview={(id) => window.open(`/admin/guides?guide=${id}`, '_blank')}
              placeholder="Search guides..."
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Select label="Completion Type" value={task.completionType} onChange={(e) => patch({ completionType: e.target.value })} options={COMPLETION_OPTIONS} />
            <Select label="Schedule" value={task.scheduleType} onChange={(e) => patch({ scheduleType: e.target.value, scheduleDays: [] })} options={SCHEDULE_OPTIONS} />
          </div>

          {task.scheduleType === 'MONTHLY' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Select label="When in the month" value={task.monthlyOption ?? 'FIRST_DAY'} onChange={(e) => patch({ monthlyOption: e.target.value })} options={MONTHLY_OPTIONS} />
                <Input label="Every (months)" type="number" min={1} value={String(task.intervalMonths ?? 1)} onChange={(e) => patch({ intervalMonths: Math.max(1, Number(e.target.value) || 1) })} />
              </div>
              {task.monthlyOption === 'SPECIFIC_DAY' && (
                <Input label="Day of month (1–31)" type="number" min={1} max={31} value={String(task.monthlyDay ?? 1)} onChange={(e) => patch({ monthlyDay: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} />
              )}
              <p className="font-mono text-xs text-grey-light">E.G. END OF MONTH, EVERY 3 MONTHS. &ldquo;EVERY&rdquo; COUNTS FROM WHEN THE TASK WAS CREATED.</p>
            </div>
          )}

          {task.scheduleType === 'WEEKLY' && (
            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Active Days</label>
              <div className="flex gap-1">
                {DAYS.map((day, i) => (
                  <button key={day} type="button" onClick={() => toggleDay(i)} className={`font-mono text-xs px-2 py-1.5 border transition-colors ${task.scheduleDays.includes(i) ? 'bg-white text-black border-white' : 'bg-transparent text-grey-light border-grey-mid hover:border-white hover:text-white'}`}>{day}</button>
                ))}
              </div>
            </div>
          )}

          {task.scheduleType === 'CUSTOM' && (
            <div className="space-y-1">
              <Input label="Cron Expression" value={task.customCron ?? ''} onChange={(e) => patch({ customCron: e.target.value })} placeholder="0 8 * * 1-5" className="font-mono" />
              <p className="font-mono text-xs text-grey-light">FORMAT: MIN HOUR DOM MON DOW — e.g. 0 8 * * 1-5 (weekdays at 8am)</p>
            </div>
          )}

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

          {error && <p className="font-mono text-xs text-danger">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} loading={saving}>SAVE</Button>
            <Button variant="ghost" onClick={onClose}>CANCEL</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
