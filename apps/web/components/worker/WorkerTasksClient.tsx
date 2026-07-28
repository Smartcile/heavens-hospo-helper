'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { WorkerTaskView } from '@hospo-ops/types'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Combobox } from '@/components/ui/Combobox'
import { describeSchedule, MONTHLY_OPTIONS } from '@/lib/scheduling'
import { moveItem } from '@/lib/array'

type TaskState = WorkerTaskView
type ModalTask = TaskState | null

interface TaskForm {
  title: string; description: string; departmentId: string; sectionId: string
  completionType: string; scheduleType: string
  scheduleDays: number[]; customCron: string
  intervalMonths: number; monthlyOption: string; monthlyDay: number
  requiredTrainingIds: string[]
}

interface TaskFull {
  id: string; title: string; description: string | null; venueId: string
  departmentId: string | null; sectionId: string | null
  completionType: string; scheduleType: string; scheduleDays: number[]
  customCron: string | null; intervalMonths: number
  monthlyOption: string | null; monthlyDay: number | null; isActive: boolean
  department: { id: string; name: string } | null
  section: { id: string; name: string } | null
  requiredTraining: { moduleId: string; module?: { kind: string } }[]
}

interface ChecklistFull {
  id: string; name: string; description: string | null; venueId: string
  departmentId: string | null; sectionId: string | null; appearFromTime: string | null
  tasks: { id: string; title: string; isActive: boolean; version: number }[]
}

interface Department { id: string; name: string; venueId: string; colour: string | null }
interface Section { id: string; name: string; departmentId: string; venueId: string }
interface TrainingLite { id: string; title: string; venueId: string; kind: string; description: string | null }
interface GuideLite { id: string; title: string; venueId: string; isTracked: boolean; description: string | null }

const EMPTY_TASK_FORM: TaskForm = {
  title: '', description: '', departmentId: '', sectionId: '',
  completionType: 'TICK', scheduleType: 'DAILY', scheduleDays: [], customCron: '',
  intervalMonths: 1, monthlyOption: 'FIRST_DAY', monthlyDay: 1, requiredTrainingIds: [],
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

let inactivityTimer: ReturnType<typeof setTimeout> | null = null

export function WorkerTasksClient({ role, sessionVenueId }: { role: string | null; sessionVenueId: string | null }) {
  const router = useRouter()
  const isAdminOrManager = role === 'ADMIN' || role === 'MANAGER'

  const [tasks, setTasks] = useState<TaskState[]>([])
  const [checklists, setChecklists] = useState<{ id: string; name: string; appearFromTime: string | null; taskIds: string[] }[]>([])
  const [firstName, setFirstName] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTask, setActiveTask] = useState<ModalTask>(null)
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [completing, setCompleting] = useState(false)
  const [completionError, setCompletionError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Edit mode
  const [isEditMode, setIsEditMode] = useState(false)
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set())
  const [editDepts, setEditDepts] = useState<Department[]>([])
  const [editSections, setEditSections] = useState<Section[]>([])
  const [editGuides, setEditGuides] = useState<GuideLite[]>([])
  const [editTasks, setEditTasks] = useState<TaskFull[]>([])
  const [editChecklists, setEditChecklists] = useState<ChecklistFull[]>([])

  // Task edit modal
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [taskEditing, setTaskEditing] = useState<TaskFull | null>(null)
  const [taskForm, setTaskForm] = useState<TaskForm>(EMPTY_TASK_FORM)
  const [taskSaving, setTaskSaving] = useState(false)
  const [taskError, setTaskError] = useState('')
  const [requireRetrain, setRequireRetrain] = useState(false)
  const [changeSummary, setChangeSummary] = useState('')

  // Checklist editor modal
  const [clModalOpen, setClModalOpen] = useState(false)
  const [clEditing, setClEditing] = useState<ChecklistFull | 'new' | null>(null)
  const [clName, setClName] = useState('')
  const [clDesc, setClDesc] = useState('')
  const [clDeptId, setClDeptId] = useState('')
  const [clSectionId, setClSectionId] = useState('')
  const [clAppearFrom, setClAppearFrom] = useState('')
  const [clSelected, setClSelected] = useState<string[]>([])
  const [clSaving, setClSaving] = useState(false)
  const [clError, setClError] = useState('')

  // Quick task form
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickTitle, setQuickTitle] = useState('')
  const [quickDesc, setQuickDesc] = useState('')
  const [quickDue, setQuickDue] = useState('')
  const [quickRollover, setQuickRollover] = useState(false)
  const [quickSaving, setQuickSaving] = useState(false)

  async function handleQuickTask() {
    if (!quickTitle.trim()) return
    setQuickSaving(true)
    const r = await fetch('/api/worker/quick-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: quickTitle,
        description: quickDesc || null,
        dueDate: quickDue || null,
        rolloverEnabled: quickRollover,
      }),
    })
    setQuickSaving(false)
    if (r.ok) {
      setQuickOpen(false)
      setQuickTitle(''); setQuickDesc(''); setQuickDue(''); setQuickRollover(false)
      load()
    }
  }

  const expiryMinutes = Number(process.env.NEXT_PUBLIC_WORKER_SESSION_EXPIRY_MINUTES ?? 15)

  function resetInactivity() {
    if (inactivityTimer) clearTimeout(inactivityTimer)
    inactivityTimer = setTimeout(async () => {
      await fetch('/api/worker/logout', { method: 'POST' })
      router.push('/w/login')
    }, expiryMinutes * 60 * 1000)
  }

  useEffect(() => {
    const events = ['click', 'touchstart', 'keydown']
    events.forEach((e) => document.addEventListener(e, resetInactivity, { passive: true }))
    resetInactivity()
    return () => {
      events.forEach((e) => document.removeEventListener(e, resetInactivity))
      if (inactivityTimer) clearTimeout(inactivityTimer)
    }
  }, [])

  async function load() {
    const r = await fetch('/api/worker/tasks')
    if (r.status === 401) { router.push('/w/login'); return }
    const data = await r.json()
    setTasks(data.tasks)
    setChecklists(data.checklists ?? [])
    setFirstName(data.firstName)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function loadEditData() {
    const [dR, sR, tR, taskR, clR] = await Promise.all([
      fetch('/api/worker/departments'),
      fetch('/api/worker/sections'),
      fetch('/api/worker/guides?edit=1'),
      fetch('/api/worker/tasks?edit=1'),
      fetch('/api/worker/checklists'),
    ])
    if (dR.status === 401) { router.push('/w/login'); return }
    const [depts, sections, guides, editTasksData, checklistsData] =
      await Promise.all([dR.json(), sR.json(), tR.json(), taskR.json(), clR.json()])
    setEditDepts(depts as Department[])
    setEditSections(sections as Section[])
    setEditGuides(guides as GuideLite[])
    setEditTasks(editTasksData as TaskFull[])
    setEditChecklists(checklistsData as ChecklistFull[])
  }

  function toggleExpandList(listId: string) {
    setExpandedLists((prev) => {
      const next = new Set(prev)
      if (next.has(listId)) next.delete(listId)
      else next.add(listId)
      return next
    })
  }

  function openTask(t: TaskState) {
    if (isEditMode) return
    if (t.isCompleted) return
    setActiveTask(t)
    setNote('')
    setPhoto(null)
    setCompletionError('')
  }

  async function handleComplete() {
    if (!activeTask) return
    setCompleting(true)
    setCompletionError('')

    let r: Response

    if (activeTask.completionType === 'TICK_PHOTO' && photo) {
      const form = new FormData()
      form.append('note', note)
      form.append('photo', photo)
      r = await fetch(`/api/worker/tasks/${activeTask.id}/complete`, {
        method: 'POST',
        body: form,
      })
    } else {
      r = await fetch(`/api/worker/tasks/${activeTask.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note || null }),
      })
    }

    if (!r.ok) {
      const data = await r.json()
      setCompletionError(data.error ?? 'FAILED TO COMPLETE TASK')
      setCompleting(false)
      return
    }

    setCompleting(false)
    setActiveTask(null)
    await load()
  }

  // ── Edit mode handlers ──

  function toggleDay(day: number) {
    const days = taskForm.scheduleDays.includes(day)
      ? taskForm.scheduleDays.filter(d => d !== day)
      : [...taskForm.scheduleDays, day].sort()
    setTaskForm({ ...taskForm, scheduleDays: days })
  }

  function toggleRequired(id: string) {
    setTaskForm(f => ({
      ...f,
      requiredTrainingIds: f.requiredTrainingIds.includes(id)
        ? f.requiredTrainingIds.filter(x => x !== id)
        : [...f.requiredTrainingIds, id],
    }))
  }

  function openTaskCreate() {
    setTaskEditing(null)
    setTaskForm({ ...EMPTY_TASK_FORM })
    setRequireRetrain(false); setChangeSummary('')
    setTaskError(''); setTaskModalOpen(true)
  }

  function openTaskEdit(t: TaskFull) {
    setTaskEditing(t)
    setTaskForm({
      title: t.title, description: t.description ?? '',
      departmentId: t.departmentId ?? '', sectionId: t.sectionId ?? '',
      completionType: t.completionType, scheduleType: t.scheduleType,
      scheduleDays: t.scheduleDays, customCron: t.customCron ?? '',
      intervalMonths: t.intervalMonths ?? 1,
      monthlyOption: t.monthlyOption ?? 'FIRST_DAY',
      monthlyDay: t.monthlyDay ?? 1,
      requiredTrainingIds: (t.requiredTraining ?? []).map(r => r.moduleId),
    })
    setRequireRetrain(false); setChangeSummary('')
    setTaskError(''); setTaskModalOpen(true)
  }

  async function handleTaskSave() {
    if (!taskForm.title.trim()) { setTaskError('TITLE IS REQUIRED'); return }
    if (taskForm.scheduleType === 'WEEKLY' && taskForm.scheduleDays.length === 0) {
      setTaskError('SELECT AT LEAST ONE DAY FOR WEEKLY'); return
    }
    if (taskForm.scheduleType === 'CUSTOM' && !taskForm.customCron.trim()) {
      setTaskError('CRON EXPRESSION IS REQUIRED'); return
    }
    setTaskSaving(true); setTaskError('')
    const url = taskEditing ? `/api/worker/tasks/${taskEditing.id}` : '/api/worker/tasks'
    const method = taskEditing ? 'PUT' : 'POST'
    const r = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...taskForm,
        departmentId: taskForm.departmentId || null,
        sectionId: taskForm.sectionId || null,
        requiredTrainingIds: taskForm.requiredTrainingIds,
        customCron: taskForm.scheduleType === 'CUSTOM' ? taskForm.customCron : null,
        scheduleDays: taskForm.scheduleType === 'DAILY' ? [] : taskForm.scheduleDays,
        ...(taskEditing ? { requireRetrain, changeSummary } : {}),
      }),
    })
    if (!r.ok) { const d = await r.json(); setTaskError(d.error ?? 'SAVE FAILED'); setTaskSaving(false); return }
    setTaskSaving(false); setTaskModalOpen(false)
    await load()
    await loadEditData()
  }

  async function handleTaskDelete(id: string) {
    if (!confirm('SOFT-DELETE THIS TASK?')) return
    await fetch(`/api/worker/tasks/${id}`, { method: 'DELETE' })
    await load()
    await loadEditData()
  }

  async function toggleTaskActive(t: TaskFull) {
    await fetch(`/api/worker/tasks/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !t.isActive }),
    })
    await load()
    await loadEditData()
  }

  function openChecklistCreate() {
    setClEditing('new')
    setClName(''); setClDesc('')
    setClDeptId(''); setClSectionId(''); setClSelected([])
    setClAppearFrom(''); setClError(''); setClModalOpen(true)
  }

  function openChecklistEdit(c: ChecklistFull) {
    setClEditing(c)
    setClName(c.name); setClDesc(c.description ?? '')
    setClDeptId(c.departmentId ?? ''); setClSectionId(c.sectionId ?? '')
    setClSelected(c.tasks.map(t => t.id))
    setClAppearFrom(c.appearFromTime ?? '')
    setClError(''); setClModalOpen(true)
  }

  async function saveChecklist() {
    if (!clName.trim()) { setClError('NAME IS REQUIRED'); return }
    if (clSelected.length === 0) { setClError('ADD AT LEAST ONE TASK'); return }
    setClSaving(true); setClError('')
    const payload = {
      name: clName, description: clDesc,
      departmentId: clDeptId || null, sectionId: clSectionId || null,
      appearFromTime: clAppearFrom || null, taskIds: clSelected,
    }
    const url = clEditing && clEditing !== 'new' ? `/api/worker/checklists/${clEditing.id}` : '/api/worker/checklists'
    const method = clEditing && clEditing !== 'new' ? 'PUT' : 'POST'
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setClSaving(false)
    if (!r.ok) { const d = await r.json(); setClError(d.error ?? 'SAVE FAILED'); return }
    setClModalOpen(false)
    await load()
    await loadEditData()
  }

  async function deleteChecklist() {
    if (!clEditing || clEditing === 'new') return
    if (!confirm(`DELETE CHECKLIST "${clEditing.name}"?`)) return
    await fetch(`/api/worker/checklists/${clEditing.id}`, { method: 'DELETE' })
    setClModalOpen(false)
    await load()
    await loadEditData()
  }

  const pending = tasks.filter((t) => !t.isCompleted)
  const done = tasks.filter((t) => t.isCompleted)
  const allDone = tasks.length > 0 && pending.length === 0

  // Time-gate the lists
  const now = new Date()
  const nowHHmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const isOpen = (t: string | null) => !t || nowHHmm >= t

  const listsByTask = new Map<string, { id: string; name: string; appearFromTime: string | null }[]>()
  for (const cl of checklists) {
    for (const tid of cl.taskIds) {
      const arr = listsByTask.get(tid) ?? []
      arr.push(cl)
      listsByTask.set(tid, arr)
    }
  }

  const listGroupMap = new Map<string, { id: string; name: string; time: string | null; tasks: TaskState[] }>()
  const otherTasks: TaskState[] = []
  const upcomingMap = new Map<string, { name: string; time: string | null }>()
  for (const t of pending) {
    const lists = listsByTask.get(t.id) ?? []
    if (lists.length === 0) { otherTasks.push(t); continue }
    const open = lists
      .filter((l) => isOpen(l.appearFromTime))
      .sort((a, b) => (a.appearFromTime ?? '').localeCompare(b.appearFromTime ?? '') || a.name.localeCompare(b.name))
    if (open.length === 0) {
      const next = lists.slice().sort((a, b) => (a.appearFromTime ?? '').localeCompare(b.appearFromTime ?? ''))[0]
      upcomingMap.set(next.id, { name: next.name, time: next.appearFromTime })
      continue
    }
    const g = open[0]
    let grp = listGroupMap.get(g.id)
    if (!grp) { grp = { id: g.id, name: g.name, time: g.appearFromTime, tasks: [] }; listGroupMap.set(g.id, grp) }
    grp.tasks.push(t)
  }
  const listGroups = [...listGroupMap.values()].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || a.name.localeCompare(b.name))
  const upcoming = [...upcomingMap.values()].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))

  // "Other" tasks grouped by department → section
  const otherGroups: { dept: string; sections: { key: string; name: string | null; tasks: TaskState[] }[] }[] = []
  const dIndex = new Map<string, (typeof otherGroups)[number]>()
  for (const t of otherTasks) {
    const dName = t.departmentName ?? 'GENERAL'
    let dg = dIndex.get(dName)
    if (!dg) { dg = { dept: dName, sections: [] }; dIndex.set(dName, dg); otherGroups.push(dg) }
    const sName = t.sectionName ?? null
    const sKey = sName ?? '__none__'
    let sg = dg.sections.find((s) => s.key === sKey)
    if (!sg) { sg = { key: sKey, name: sName, tasks: [] }; dg.sections.push(sg) }
    sg.tasks.push(t)
  }

  const renderTask = (t: TaskState) => {
    if (isEditMode) {
      return (
        <div
          key={t.id}
          className="w-full text-left bg-grey-dark border border-grey-mid p-3 flex items-center gap-3"
        >
          <div className={`w-2 h-2 flex-shrink-0 ${t.isCompleted ? 'bg-success' : 'bg-grey-mid'}`} />
          <div className="min-w-0 flex-1">
            <div className="font-mono font-semibold text-sm uppercase text-white truncate">{t.title}</div>
            {t.description && <p className="font-sans text-xs text-grey-light mt-0.5">{t.description}</p>}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <CompletionTypeIcon type={t.completionType} />
              {t.assigneeName && <span className="font-mono text-xs text-accent">FOR {t.assigneeName}</span>}
              {(t.rolledOverFrom || (t.isOneOff && t.dueDate && !t.isCompleted)) && (
                <span className="font-mono text-xs text-warning uppercase">⚠ ROLLED OVER</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => { const full = editTasks.find(et => et.id === t.id); if (full) openTaskEdit(full) }}
              className="font-mono text-xs uppercase text-warning hover:text-white transition-colors px-2 py-1"
            >
              EDIT
            </button>
            <button
              onClick={() => handleTaskDelete(t.id)}
              className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors px-2 py-1"
            >
              DEL
            </button>
          </div>
        </div>
      )
    }
    return (
      <button
        key={t.id}
        onClick={() => openTask(t)}
        className="w-full text-left bg-grey-dark border border-grey-mid p-4 hover:border-white transition-colors active:bg-black"
      >
        <div className="flex items-start gap-3">
          <div className="w-5 h-5 border-2 border-grey-mid flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="font-mono font-semibold text-sm uppercase text-white">{t.title}</div>
            {t.description && <p className="font-sans text-xs text-grey-light mt-0.5">{t.description}</p>}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <CompletionTypeIcon type={t.completionType} />
              {t.assigneeName && <span className="font-mono text-xs text-accent">FOR {t.assigneeName}</span>}
              {t.guide && <span className="font-mono text-xs text-grey-light">📖 GUIDE</span>}
              {(t.rolledOverFrom || (t.isOneOff && t.dueDate && !t.isCompleted)) && (
                <span className="font-mono text-xs text-warning uppercase">⚠ ROLLED OVER</span>
              )}
            </div>
          </div>
        </div>
      </button>
    )
  }

  const getGreeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'GOOD MORNING'
    if (h < 17) return 'GOOD AFTERNOON'
    return 'GOOD EVENING'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p>
      </div>
    )
  }

  if (allDone && !isEditMode) {
    return (
      <div className="min-h-screen bg-black flex flex-col">
        <div className="px-4 pt-6 pb-4 border-b border-grey-mid">
          <div />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-6">
          <div className="w-16 h-16 border-4 border-success flex items-center justify-center">
            <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h1 className="font-mono text-2xl font-bold uppercase tracking-widest text-success">
              ALL DONE
            </h1>
            <p className="font-mono text-sm text-white mt-1 uppercase">NICE WORK, {firstName}!</p>
          </div>
          <p className="font-mono text-xs text-grey-light uppercase">
            {tasks.length} TASK{tasks.length !== 1 ? 'S' : ''} COMPLETED TODAY
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 border-b border-grey-mid">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">
              {getGreeting()}, {firstName}
            </h1>
            <p className="font-mono text-xs text-grey-light mt-0.5 uppercase">
              {done.length} OF {tasks.length} TASKS COMPLETE
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setQuickOpen(!quickOpen); setQuickTitle(''); setQuickDesc(''); setQuickDue(''); setQuickRollover(false) }}
              className="font-mono text-xs uppercase font-bold tracking-wider px-3 py-2 border border-success text-success hover:bg-success hover:text-black transition-colors"
            >
              + QUICK TASK
            </button>
            {isAdminOrManager && (
              <button
                onClick={() => { const next = !isEditMode; setIsEditMode(next); if (next && editDepts.length === 0) loadEditData() }}
                className={`font-mono text-xs uppercase font-bold tracking-wider px-3 py-2 border transition-colors ${
                  isEditMode ? 'bg-warning text-black border-warning' : 'text-grey-light border-grey-mid hover:border-white hover:text-white'
                }`}
              >
                {isEditMode ? 'EDIT MODE ON' : 'EDIT MODE'}
              </button>
            )}
          </div>
        </div>

        {/* Quick task form */}
        {quickOpen && (
          <div className="mt-3 border border-success/30 bg-grey-dark p-3 space-y-2">
            <h3 className="font-mono text-xs uppercase text-success tracking-wider">QUICK SIDE-WORK TASK</h3>
            <input
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              placeholder="WHAT NEEDS DOING?"
              className="w-full bg-black border border-grey-mid text-white font-mono text-sm px-3 py-2 outline-none focus:border-white placeholder:text-grey-light"
            />
            <textarea
              value={quickDesc}
              onChange={(e) => setQuickDesc(e.target.value)}
              placeholder="EXTRA DETAILS (OPTIONAL)..."
              rows={2}
              className="w-full bg-black border border-grey-mid text-white font-sans text-xs px-3 py-2 outline-none focus:border-white resize-none placeholder:text-grey-light"
            />
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 font-mono text-xs text-grey-light">
                <input type="date" value={quickDue} onChange={(e) => setQuickDue(e.target.value)}
                  className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white" />
                DUE DATE
              </label>
              <label className="flex items-center gap-2 font-mono text-xs text-grey-light cursor-pointer">
                <input type="checkbox" checked={quickRollover} onChange={(e) => setQuickRollover(e.target.checked)}
                  className="accent-success w-4 h-4" />
                ROLL OVER IF NOT DONE
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={handleQuickTask} disabled={quickSaving}
                className="font-mono text-xs uppercase font-bold tracking-wider px-4 py-2 bg-success text-black hover:opacity-90 disabled:opacity-40">
                {quickSaving ? 'SAVING_' : 'CREATE'}
              </button>
              <button onClick={() => setQuickOpen(false)}
                className="font-mono text-xs uppercase px-4 py-2 border border-grey-mid text-grey-light hover:border-white hover:text-white">
                CANCEL
              </button>
            </div>
          </div>
        )}

        {isEditMode && isAdminOrManager && (
          <div className="mt-3 py-2 px-3 border border-warning text-warning font-mono text-xs uppercase tracking-widest flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-warning animate-pulse" />
            MANAGER EDIT MODE ACTIVE // ARMED
          </div>
        )}

        {!isEditMode && (
          <div className="mt-3 bg-grey-mid h-1.5">
            <div
              className="h-full bg-success transition-all duration-500"
              style={{ width: `${tasks.length > 0 ? (done.length / tasks.length) * 100 : 0}%` }}
            />
          </div>
        )}
      </div>

      {isEditMode && isAdminOrManager && (
        <div className="px-4 pt-3 flex gap-2">
          <button onClick={openTaskCreate}
            className="font-mono text-xs uppercase font-bold tracking-wider px-4 py-2 border border-warning text-warning hover:bg-warning hover:text-black transition-colors">
            + NEW TASK
          </button>
          <button onClick={openChecklistCreate}
            className="font-mono text-xs uppercase font-bold tracking-wider px-4 py-2 border border-warning text-warning hover:bg-warning hover:text-black transition-colors">
            + NEW CHECKLIST
          </button>
        </div>
      )}

      {/* Pending — time-gated lists as boxes, then any other tasks by dept → section */}
      <div className="px-4 py-4 space-y-4">
        {listGroups.map((lg) => {
          const allTaskIds = checklists.find((cl) => cl.id === lg.id)?.taskIds ?? []
          const allInList = tasks.filter((t) => allTaskIds.includes(t.id))
          const doneCount = allInList.filter((t) => t.isCompleted).length
          const totalCount = allInList.length
          const donePct = totalCount > 0 ? (doneCount / totalCount) * 100 : 0
          const maxVisible = (isEditMode || expandedLists.has(lg.id)) ? 999 : 5
          const isExpanded = expandedLists.has(lg.id)
          const extra = lg.tasks.length - maxVisible
          return (
            <div key={lg.id} className="border border-grey-mid bg-grey-dark">
              <div className="h-1.5 bg-grey-mid">
                <div className="h-full bg-success transition-all duration-500" style={{ width: `${donePct}%` }} />
              </div>
              <div className="p-3 border-b border-grey-mid flex items-center justify-between gap-2">
                <div className="font-mono text-xs uppercase tracking-widest text-white">{lg.name}</div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isEditMode && isAdminOrManager && (
                    <button
                      onClick={() => { const full = editChecklists.find(c => c.id === lg.id); if (full) openChecklistEdit(full) }}
                      className="font-mono text-xs uppercase text-warning hover:text-white transition-colors px-1 py-0.5"
                    >
                      EDIT
                    </button>
                  )}
                  {lg.time && <span className="font-mono text-xs uppercase text-warning">{lg.time}</span>}
                  <span className="font-mono text-xs text-white">{doneCount}/{totalCount}</span>
                </div>
              </div>
              <div className="divide-y divide-grey-mid">
                {lg.tasks.slice(0, maxVisible).map((t) => (
                  isEditMode ? renderTask(t) : (
                    <button key={t.id} onClick={() => openTask(t)}
                      className="w-full text-left bg-grey-dark p-3 hover:border-white transition-colors active:bg-black flex items-center gap-3 border-0 border-b border-grey-mid last:border-0">
                      <div className="w-5 h-5 border-2 border-grey-mid flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono font-semibold text-sm uppercase text-white">{t.title}</div>
                        {t.description && <p className="font-sans text-xs text-grey-light mt-0.5">{t.description}</p>}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <CompletionTypeIcon type={t.completionType} />
                          {t.assigneeName && <span className="font-mono text-xs text-accent">FOR {t.assigneeName}</span>}
                          {t.guide && <span className="font-mono text-xs text-grey-light">📖 GUIDE</span>}
                          {(t.rolledOverFrom || (t.isOneOff && t.dueDate && !t.isCompleted)) && (
                            <span className="font-mono text-xs text-warning uppercase">⚠ ROLLED OVER</span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                ))}
                {extra > 0 && !isEditMode && (
                  <button onClick={() => toggleExpandList(lg.id)} className="w-full p-3 text-center hover:bg-grey-dark/50 transition-colors">
                    <span className="font-mono text-xs text-grey-light hover:text-white transition-colors">
                      +{extra} MORE TASK{extra > 1 ? 'S' : ''}
                    </span>
                  </button>
                )}
                {isExpanded && !isEditMode && (
                  <button onClick={() => toggleExpandList(lg.id)} className="w-full p-2 text-center hover:bg-grey-dark/50 transition-colors">
                    <span className="font-mono text-xs text-grey-light hover:text-white transition-colors">SHOW LESS</span>
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {otherGroups.map((dg) => (
          <div key={dg.dept} className="space-y-2">
            <div className="font-mono text-xs uppercase tracking-widest text-white border-b border-grey-mid pb-1">{dg.dept}</div>
            {dg.sections.map((sg) => (
              <div key={sg.key} className="space-y-2">
                {sg.name && <div className="font-mono text-xs uppercase tracking-wider text-accent pt-1">{sg.name}</div>}
                {sg.tasks.map(renderTask)}
              </div>
            ))}
          </div>
        ))}

        {upcoming.length > 0 && (
          <div className="border border-grey-mid p-3">
            <div className="font-mono text-xs uppercase tracking-wider text-grey-light mb-1">OPENS LATER</div>
            {upcoming.map((u) => (
              <div key={u.name} className="font-mono text-xs text-grey-light">{u.name}{u.time ? ` · FROM ${u.time}` : ''}</div>
            ))}
          </div>
        )}
      </div>

      {/* Completed tasks */}
      {done.length > 0 && (
        <div className="px-4 pb-6">
          <div className="font-mono text-xs text-grey-light uppercase mb-2 tracking-wider">
            COMPLETED
          </div>
          <div className="space-y-1">
            {done.map((t) => (
              <div key={t.id} className="bg-grey-dark border border-grey-mid p-3 flex items-center gap-3 opacity-60">
                <div className="w-5 h-5 border-2 border-success bg-success flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="font-mono text-xs uppercase text-success line-through min-w-0 truncate">{t.title}</span>
                {t.completedByName && <span className="font-mono text-xs uppercase text-grey-light ml-auto flex-shrink-0">BY {t.completedByName}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completion modal (only when not in edit mode) */}
      {!isEditMode && activeTask && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-4 border-b border-grey-mid">
            <button
              onClick={() => setActiveTask(null)}
              className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors"
            >
              ← BACK
            </button>
            <span className="font-mono text-xs text-grey-light">{activeTask.completionType.replace('_', ' + ')}</span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-6">
            <div>
              <h2 className="font-mono text-xl font-bold uppercase text-white">{activeTask.title}</h2>
              {activeTask.description && (
                <p className="font-sans text-sm text-grey-light mt-2">{activeTask.description}</p>
              )}
              {activeTask.departmentName && (
                <p className="font-mono text-xs text-grey-light mt-1 uppercase">[{activeTask.departmentName}]</p>
              )}
              {activeTask.guide && (
                <button
                  onClick={() => router.push(`/w/guides?guide=${activeTask.guide!.id}`)}
                  className="mt-3 inline-block font-mono text-xs uppercase border border-grey-mid px-3 py-2 text-white hover:border-white transition-colors"
                >
                  VIEW GUIDE: {activeTask.guide.title}
                </button>
              )}
            </div>

            {(activeTask.completionType === 'TICK_NOTE' || activeTask.completionType === 'TICK_PHOTO') && (
              <div className="space-y-2">
                <label className="font-mono text-xs uppercase text-grey-light tracking-wider">
                  {activeTask.completionType === 'TICK_PHOTO' ? 'NOTE (OPTIONAL)' : 'NOTE'}
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="ADD YOUR NOTES HERE..."
                  className="w-full bg-grey-dark border border-grey-mid text-white font-sans text-sm px-3 py-3 outline-none focus:border-white min-h-[120px] resize-none placeholder:text-grey-light"
                />
              </div>
            )}

            {activeTask.completionType === 'TICK_PHOTO' && (
              <div className="space-y-2">
                <label className="font-mono text-xs uppercase text-grey-light tracking-wider">PHOTO</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full h-24 border-2 border-dashed border-grey-mid flex flex-col items-center justify-center gap-1 hover:border-white transition-colors"
                >
                  {photo ? (
                    <div className="text-center">
                      <div className="font-mono text-xs text-success uppercase">PHOTO SELECTED</div>
                      <div className="font-mono text-xs text-grey-light mt-0.5">{photo.name}</div>
                    </div>
                  ) : (
                    <>
                      <svg className="w-6 h-6 text-grey-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="font-mono text-xs uppercase text-grey-light">TAP TO ADD PHOTO</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {completionError && (
              <div className="border-l-4 border-l-danger pl-3 py-1">
                <p className="font-mono text-xs text-danger">{completionError}</p>
              </div>
            )}
          </div>

          <div className="px-4 pb-8 pt-4 border-t border-grey-mid">
            <button
              onClick={handleComplete}
              disabled={completing}
              className="w-full h-14 bg-success text-black font-mono font-bold text-sm uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {completing ? 'SAVING_' : 'MARK DONE'}
            </button>
          </div>
        </div>
      )}

      {/* Task Edit/Create modal */}
      {taskModalOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-4 border-b border-grey-mid">
            <button
              onClick={() => setTaskModalOpen(false)}
              className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors"
            >
              ← BACK
            </button>
            <span className="font-mono text-xs font-bold uppercase text-warning tracking-widest">
              {taskEditing ? 'EDIT TASK' : 'NEW TASK'}
            </span>
            <div className="w-10" />
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
            <Input
              label="Task Title"
              value={taskForm.title}
              onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              placeholder="WIPE DOWN ALL BAR SURFACES"
            />

            <Textarea
              label="Description (optional)"
              value={taskForm.description}
              onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
              placeholder="Additional instructions for this task..."
            />

            <Select
              label="Department"
              value={taskForm.departmentId}
              onChange={(e) => setTaskForm({ ...taskForm, departmentId: e.target.value, sectionId: '' })}
              options={[
                { value: '', label: 'NO DEPARTMENT' },
                ...editDepts.map(d => ({ value: d.id, label: d.name })),
              ]}
            />

            <Select
              label="Section (optional)"
              value={taskForm.sectionId}
              onChange={(e) => setTaskForm({ ...taskForm, sectionId: e.target.value })}
              options={[
                { value: '', label: 'NO SECTION' },
                ...editSections.filter(s => s.departmentId === taskForm.departmentId).map(s => ({ value: s.id, label: s.name })),
              ]}
            />

            <div className="grid grid-cols-2 gap-3">
              <Select label="Completion Type" value={taskForm.completionType}
                onChange={(e) => setTaskForm({ ...taskForm, completionType: e.target.value })}
                options={COMPLETION_OPTIONS} />
              <Select label="Schedule" value={taskForm.scheduleType}
                onChange={(e) => setTaskForm({ ...taskForm, scheduleType: e.target.value, scheduleDays: [] })}
                options={SCHEDULE_OPTIONS} />
            </div>

            {taskForm.scheduleType === 'WEEKLY' && (
              <div className="flex flex-col gap-1">
                <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Active Days</label>
                <div className="flex gap-1">
                  {DAYS.map((day, i) => (
                    <button key={day} type="button" onClick={() => toggleDay(i)}
                      className={`font-mono text-xs px-2 py-1.5 border transition-colors ${
                        taskForm.scheduleDays.includes(i)
                          ? 'bg-warning text-black border-warning'
                          : 'bg-transparent text-grey-light border-grey-mid hover:border-white hover:text-white'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {taskForm.scheduleType === 'MONTHLY' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Select label="When in the month"
                    value={taskForm.monthlyOption}
                    onChange={(e) => setTaskForm({ ...taskForm, monthlyOption: e.target.value })}
                    options={MONTHLY_OPTIONS} />
                  <Input label="Every (months)" type="number" min={1}
                    value={String(taskForm.intervalMonths)}
                    onChange={(e) => setTaskForm({ ...taskForm, intervalMonths: Math.max(1, Number(e.target.value) || 1) })} />
                </div>
                {taskForm.monthlyOption === 'SPECIFIC_DAY' && (
                  <Input label="Day of month (1–31)" type="number" min={1} max={31}
                    value={String(taskForm.monthlyDay)}
                    onChange={(e) => setTaskForm({ ...taskForm, monthlyDay: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} />
                )}
              </div>
            )}

            {taskForm.scheduleType === 'CUSTOM' && (
              <div className="space-y-1">
                <Input label="Cron Expression"
                  value={taskForm.customCron}
                  onChange={(e) => setTaskForm({ ...taskForm, customCron: e.target.value })}
                  placeholder="0 8 * * 1-5"
                  className="font-mono" />
              </div>
            )}

            {editGuides.length > 0 && (
              <Combobox
                label="Required Training"
                options={editGuides.map(m => ({ value: m.id, label: m.title, description: m.description ?? undefined }))}
                selected={taskForm.requiredTrainingIds}
                onChange={(ids) => setTaskForm({ ...taskForm, requiredTrainingIds: ids })}
                placeholder="Search guides..."
              />
            )}

            {taskEditing && (
              <div className="border-l-4 border-l-warning pl-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={requireRetrain}
                    onChange={(e) => setRequireRetrain(e.target.checked)}
                    className="w-4 h-4 accent-warning" />
                  <span className="font-mono text-xs uppercase text-white">Require re-training</span>
                </label>
                {requireRetrain && (
                  <Input label="What changed? (optional)"
                    value={changeSummary}
                    onChange={(e) => setChangeSummary(e.target.value)}
                    placeholder="e.g. NEW STEP ADDED" />
                )}
              </div>
            )}

            {taskError && <p className="font-mono text-xs text-danger">{taskError}</p>}
          </div>

          <div className="px-4 pb-8 pt-4 border-t border-grey-mid flex gap-2">
            <button onClick={handleTaskSave} disabled={taskSaving}
              className="flex-1 h-14 bg-warning text-black font-mono font-bold text-sm uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-40">
              {taskSaving ? 'SAVING_' : 'SAVE'}
            </button>
            <button onClick={() => setTaskModalOpen(false)}
              className="flex-1 h-14 border border-grey-mid text-white font-mono font-bold text-sm uppercase tracking-widest hover:border-white transition-colors">
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* Checklist Editor modal */}
      {clModalOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-4 border-b border-grey-mid">
            <button onClick={() => setClModalOpen(false)}
              className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">
              ← BACK
            </button>
            <span className="font-mono text-xs font-bold uppercase text-warning tracking-widest">
              {clEditing === 'new' ? 'NEW CHECKLIST' : 'EDIT CHECKLIST'}
            </span>
            <div className="w-10" />
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
            <Input label="Name" value={clName} onChange={(e) => setClName(e.target.value)}
              placeholder="BAR OPEN" />

            <Textarea label="Description (optional)" value={clDesc}
              onChange={(e) => setClDesc(e.target.value)} />

            <div className="grid grid-cols-2 gap-3">
              <Select label="Department (optional)" value={clDeptId}
                onChange={(e) => { setClDeptId(e.target.value); setClSectionId('') }}
                options={[
                  { value: '', label: 'WHOLE VENUE' },
                  ...editDepts.map(d => ({ value: d.id, label: d.name })),
                ]} />
              <Select label="Section (optional)" value={clSectionId}
                onChange={(e) => setClSectionId(e.target.value)}
                options={[
                  { value: '', label: 'NO SECTION' },
                  ...editSections.filter(s => s.departmentId === clDeptId).map(s => ({ value: s.id, label: s.name })),
                ]} />
            </div>

            <Input label="Appears from (time, optional)" type="time"
              value={clAppearFrom} onChange={(e) => setClAppearFrom(e.target.value)} />
            <p className="font-mono text-xs uppercase text-grey-light">
              SHOWS ON THE FLOOR FROM THIS TIME &amp; STAYS UNTIL EVERY TASK IS DONE FOR THE DAY.
            </p>

            <div className="space-y-1">
              <label className="font-mono text-xs uppercase text-grey-light tracking-wider">
                Tasks ({clSelected.length})
              </label>
              <div className="border border-grey-mid divide-y divide-grey-mid">
                {clSelected.length === 0 ? (
                  <div className="p-4 text-center font-mono text-xs text-grey-light">
                    NO TASKS SELECTED
                  </div>
                ) : (
                  clSelected.map((id, i) => {
                    const found = editTasks.find(et => et.id === id)
                    return (
                      <div key={id} className="flex items-center justify-between gap-2 px-3 py-2 bg-grey-dark">
                        <span className="font-mono text-xs text-white truncate">
                          {i + 1}. {found?.title ?? '(task removed)'}
                        </span>
                        <div className="flex gap-2 flex-shrink-0">
                          <button disabled={i === 0}
                            onClick={() => setClSelected(moveItem(clSelected, i, i - 1))}
                            className="font-mono text-xs text-grey-light hover:text-white disabled:opacity-30 px-1 py-0.5">
                            ↑
                          </button>
                          <button disabled={i === clSelected.length - 1}
                            onClick={() => setClSelected(moveItem(clSelected, i, i + 1))}
                            className="font-mono text-xs text-grey-light hover:text-white disabled:opacity-30 px-1 py-0.5">
                            ↓
                          </button>
                          <button onClick={() => setClSelected(clSelected.filter(x => x !== id))}
                            className="font-mono text-xs text-grey-light hover:text-danger px-1 py-0.5">
                            ✕
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <Combobox
                options={editTasks.filter(et => !clSelected.includes(et.id)).map(et => ({ value: et.id, label: et.title, description: et.description }))}
                selected={clSelected}
                onChange={(ids) => setClSelected(ids)}
                placeholder="+ ADD A TASK..."
              />
            </div>

            {clError && <p className="font-mono text-xs text-danger">{clError}</p>}
          </div>

          <div className="px-4 pb-8 pt-4 border-t border-grey-mid flex gap-2">
            <button onClick={saveChecklist} disabled={clSaving}
              className="flex-1 h-14 bg-warning text-black font-mono font-bold text-sm uppercase tracking-widest hover:opacity-90 disabled:opacity-40">
              {clSaving ? 'SAVING_' : 'SAVE'}
            </button>
            <button onClick={() => setClModalOpen(false)}
              className="flex-1 h-14 border border-grey-mid text-white font-mono font-bold text-sm uppercase tracking-widest hover:border-white transition-colors">
              CANCEL
            </button>
            {clEditing !== 'new' && (
              <button onClick={deleteChecklist}
                className="h-14 px-4 border border-danger text-danger font-mono font-bold text-xs uppercase tracking-widest hover:bg-danger hover:text-black transition-colors">
                DEL
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CompletionTypeIcon({ type }: { type: string }) {
  if (type === 'TICK_NOTE') {
    return <span className="font-mono text-xs text-grey-light">+ NOTE</span>
  }
  if (type === 'TICK_PHOTO') {
    return <span className="font-mono text-xs text-grey-light">+ PHOTO</span>
  }
  return null
}
