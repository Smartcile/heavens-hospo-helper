'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Combobox } from '@/components/ui/Combobox'
import { OutcomeOptions } from '@/components/ui/OutcomeOptions'
import { moveItem } from '@/lib/array'
import { describeSchedule, MONTHLY_OPTIONS } from '@/lib/scheduling'
import { TASK_OUTCOMES, type TaskOutcome } from '@/lib/task-outcomes'
import { availableParentTasks, orderTasksWithChildren } from '@/lib/task-subtasks'
import { getActiveVenueId } from '@/lib/active-venue'
import {
  isActivatedOn,
  isChecklistHidden,
  describeNextOpen,
  type CalendarEventSummary,
} from '@/lib/checklist-activation'
import { useGuidePopup } from '@/components/GuidePopup'

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
  intervalMonths: number
  monthlyOption: string | null
  monthlyDay: number | null
  isActive: boolean
  sortOrder: number
  parentTaskId?: string | null
  parentTitle?: string | null
  subtaskOrder?: number
  subtasks?: { id: string; title: string; isActive: boolean; subtaskOrder: number }[]
  allowedOutcomes?: string[]
  overrideOutcomes?: boolean
  requireOutcomeReason?: boolean
  department: { id: string; name: string; colour: string | null } | null
  section: { id: string; name: string } | null
  requiredTraining: { moduleId: string; module?: { kind: string } }[]
  taskGuides?: { guideId: string; isRequiredForCompetency: boolean; guide?: { id: string; title: string } | null }[]
  trainingModules?: { kind: string }[]
  progress?: {
    note: string | null
    outcome: string
    updatedAt: string
    staff: { firstName: string; lastName: string }
  } | null
  _count?: { checklistLinks: number }
}

interface Venue { id: string; name: string }
interface Department { id: string; name: string; venueId: string; colour: string | null }
interface Section { id: string; name: string; departmentId: string; venueId: string }
interface GuideLite { id: string; title: string; venueId: string; isTracked: boolean; description: string | null }

interface ChecklistCardTask { id: string; title: string; isActive: boolean; version: number }
interface ChecklistScheduleRow { dayOfWeek: number; fromTime: string; toTime: string | null }
interface Checklist {
  id: string
  name: string
  description: string | null
  venueId: string
  departmentId: string | null
  sectionId: string | null
  appearFromTime: string | null
  activatedOn: string | null
  schedules?: ChecklistScheduleRow[]
  events?: CalendarEventSummary[]
  allowedOutcomes?: string[]
  requireOutcomeReason?: boolean
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
  intervalMonths: number
  monthlyOption: string
  monthlyDay: number
  requiredTrainingIds: string[]
  competencyGuideIds: string[]
  allowedOutcomes: TaskOutcome[]
  overrideOutcomes: boolean
  requireOutcomeReason: boolean
  parentTaskId: string
}

const EMPTY_FORM: FormState = {
  title: '', description: '', venueId: '', departmentId: '', sectionId: '',
  completionType: 'TICK', scheduleType: 'DAILY', scheduleDays: [], customCron: '',
  intervalMonths: 1, monthlyOption: 'FIRST_DAY', monthlyDay: 1, requiredTrainingIds: [], competencyGuideIds: [],
  allowedOutcomes: [...TASK_OUTCOMES], overrideOutcomes: false, requireOutcomeReason: false,
  parentTaskId: '',
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
const TASKS_SCROLL_KEY = 'hospo-tasks-scroll'

// #16: keep the window and the sticky checklist panel where they were when the
// page is re-entered. A scoped fix — no SPA rewrite, no polling.
function useTasksScrollRestoration(panelRef: RefObject<HTMLDivElement>, ready: boolean) {
  useEffect(() => {
    // Restoring while the lists are still empty (and the panel is not mounted)
    // scrolls the window only, then the loaded content reflows and loses it.
    if (!ready) return
    const winKey = `${TASKS_SCROLL_KEY}:window`
    const panelKey = `${TASKS_SCROLL_KEY}:panel`
    const savedWindow = sessionStorage.getItem(winKey)
    if (savedWindow) window.scrollTo(0, Number(savedWindow))
    const panel = panelRef.current
    const savedPanel = sessionStorage.getItem(panelKey)
    if (panel && savedPanel) panel.scrollTop = Number(savedPanel)

    const save = () => {
      sessionStorage.setItem(winKey, String(window.scrollY))
      if (panel) sessionStorage.setItem(panelKey, String(panel.scrollTop))
    }
    window.addEventListener('scroll', save, { passive: true })
    panel?.addEventListener('scroll', save, { passive: true })
    return () => {
      save()
      window.removeEventListener('scroll', save)
      panel?.removeEventListener('scroll', save)
    }
  }, [panelRef, ready])
}

export function TasksClient({ role, sessionVenueId, defaultVenueId }: { role: string; sessionVenueId: string; defaultVenueId?: string }) {
  const { requestGuide, nodes: guidePopupNodes } = useGuidePopup('admin')
  const checklistPanelRef = useRef<HTMLDivElement>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [guides, setGuides] = useState<GuideLite[]>([])
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventSummary[]>([])
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [loading, setLoading] = useState(true)
  useTasksScrollRestoration(checklistPanelRef, !loading)

  // Task create/edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterVenue, setFilterVenue] = useState(getActiveVenueId(role, sessionVenueId, defaultVenueId))
  const [filterDept, setFilterDept] = useState('')
  const [filterSection, setFilterSection] = useState('')
  const [search, setSearch] = useState('')
  const [filterUsage, setFilterUsage] = useState('nolist')
  const [requireRetrain, setRequireRetrain] = useState(false)
  const [changeSummary, setChangeSummary] = useState('')

  // Inline checklist editor (right panel)
  const [clEditing, setClEditing] = useState<Checklist | 'new' | null>(null)
  const [clName, setClName] = useState('')
  const [clDesc, setClDesc] = useState('')
  const [clVenueId, setClVenueId] = useState(getActiveVenueId(role, sessionVenueId, defaultVenueId))
  const [clDeptId, setClDeptId] = useState('')
  const [clSectionId, setClSectionId] = useState('')
  const [clSelected, setClSelected] = useState<string[]>([])
  const [clAppearFrom, setClAppearFrom] = useState('')
  // Editable schedule rows; `toTime: ''` means "open to end of day".
  const [clSchedules, setClSchedules] = useState<{ dayOfWeek: number; fromTime: string; toTime: string }[]>([])
  const [clEventIds, setClEventIds] = useState<string[]>([])
  const [clAllowedOutcomes, setClAllowedOutcomes] = useState<TaskOutcome[]>([...TASK_OUTCOMES])
  const [clRequireReason, setClRequireReason] = useState(false)
  const [clSaving, setClSaving] = useState(false)
  const [clError, setClError] = useState('')
  const [activateError, setActivateError] = useState('')
  const [dropActive, setDropActive] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set())

  // PDF export popup
  const [pdfOpen, setPdfOpen] = useState(false)

  async function load() {
    const params = new URLSearchParams()
    if (filterVenue) params.set('venueId', filterVenue)
    if (filterDept) params.set('departmentId', filterDept)
    const qs = params.toString() ? `?${params}` : ''
    const venueParam = filterVenue ? `?venueId=${encodeURIComponent(filterVenue)}` : ''
    const [tR, vR, dR, sR, mR, cR, eR] = await Promise.all([
      fetch(`/api/admin/tasks${qs}`),
      fetch('/api/admin/venues'),
      fetch('/api/admin/departments'),
      fetch('/api/admin/sections'),
      fetch(`/api/admin/guides${venueParam}`),
      fetch(`/api/admin/checklists${venueParam}`),
      fetch(`/api/admin/calendar-events${venueParam}`),
    ])
    const [tData, vData, dData, sData, mData, cData, eData] = await Promise.all([tR.json(), vR.json(), dR.json(), sR.json(), mR.json(), cR.json(), eR.json()])
    setTasks(tData)
    setVenues(vData)
    setDepartments(dData)
    setSections(sData)
    setGuides(mData)
    setChecklists(cData)
    setCalendarEvents(Array.isArray(eData) ? eData : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [filterVenue, filterDept])

  // --- Task modal ---
  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, venueId: getActiveVenueId(role, sessionVenueId, defaultVenueId) })
    setRequireRetrain(false); setChangeSummary('')
    setError(''); setModalOpen(true)
  }
  function openEdit(t: Task) {
    setEditing(t)
    setForm({
      title: t.title, description: t.description ?? '', venueId: t.venueId,
      departmentId: t.departmentId ?? '', sectionId: t.sectionId ?? '',
      completionType: t.completionType, scheduleType: t.scheduleType, scheduleDays: t.scheduleDays,
      customCron: t.customCron ?? '',
      intervalMonths: t.intervalMonths ?? 1, monthlyOption: t.monthlyOption ?? 'FIRST_DAY', monthlyDay: t.monthlyDay ?? 1,
      requiredTrainingIds: (t.requiredTraining ?? []).map((r) => r.moduleId),
      competencyGuideIds: (t.taskGuides ?? []).filter((g) => g.isRequiredForCompetency).map((g) => g.guideId),
      allowedOutcomes: (t.allowedOutcomes?.length ? t.allowedOutcomes : TASK_OUTCOMES) as TaskOutcome[],
      overrideOutcomes: !!t.overrideOutcomes,
      requireOutcomeReason: !!t.requireOutcomeReason,
      parentTaskId: t.parentTaskId ?? '',
    })
    setRequireRetrain(false); setChangeSummary('')
    setError(''); setModalOpen(true)
  }
  // Open the edit modal for a subtask that may be outside the current filters.
  async function openEditById(id: string) {
    const local = tasks.find((t) => t.id === id)
    if (local) { openEdit(local); return }
    const r = await fetch(`/api/admin/tasks/${id}`)
    if (!r.ok) return
    openEdit((await r.json()) as Task)
  }
  function openSubtaskCreate(parent: Task) {
    setEditing(null)
    setForm({
      ...EMPTY_FORM,
      title: '',
      venueId: parent.venueId,
      departmentId: parent.departmentId ?? '',
      sectionId: parent.sectionId ?? '',
      completionType: parent.completionType,
      scheduleType: parent.scheduleType,
      scheduleDays: parent.scheduleDays ?? [],
      customCron: parent.customCron ?? '',
      intervalMonths: parent.intervalMonths ?? 1,
      monthlyOption: parent.monthlyOption ?? 'FIRST_DAY',
      monthlyDay: parent.monthlyDay ?? 1,
      parentTaskId: parent.id,
    })
    setRequireRetrain(false); setChangeSummary('')
    setError(''); setModalOpen(true)
  }
  function toggleParentCollapse(id: string) {
    setCollapsedParents((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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
        parentTaskId: form.parentTaskId || null,
        requiredTrainingIds: form.requiredTrainingIds,
        competencyGuideIds: form.competencyGuideIds,
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
    setForm((f) => ({ ...f, competencyGuideIds: f.competencyGuideIds.includes(id) ? f.competencyGuideIds.filter((x) => x !== id) : [...f.competencyGuideIds, id] }))
  }

  // --- Checklist editor ---
  function openChecklistCreate() {
    setClEditing('new')
    setClName(''); setClDesc('')
    setClVenueId(role === 'MANAGER' ? sessionVenueId : (filterVenue || venues[0]?.id || ''))
    setClDeptId(''); setClSectionId(''); setClSelected([]); setClAppearFrom(''); setClError('')
    setClSchedules([]); setClEventIds([])
    setClAllowedOutcomes([...TASK_OUTCOMES]); setClRequireReason(false)
    setFilterUsage('notinthis')
  }
  function openChecklistEdit(c: Checklist) {
    setClEditing(c)
    setClName(c.name); setClDesc(c.description ?? '')
    setClVenueId(c.venueId); setClDeptId(c.departmentId ?? ''); setClSectionId(c.sectionId ?? '')
    setClSelected(c.tasks.map((t) => t.id)); setClAppearFrom(c.appearFromTime ?? ''); setClError('')
    setClSchedules((c.schedules ?? []).map((s) => ({ dayOfWeek: s.dayOfWeek, fromTime: s.fromTime, toTime: s.toTime ?? '' })))
    setClEventIds((c.events ?? []).filter((e) => !e.deletedAt).map((e) => e.id))
    setClAllowedOutcomes((c.allowedOutcomes?.length ? c.allowedOutcomes : TASK_OUTCOMES) as TaskOutcome[])
    setClRequireReason(!!c.requireOutcomeReason)
    // Auto-scope left panel filters to match this checklist
    if (c.venueId) setFilterVenue(c.venueId)
    if (c.departmentId) setFilterDept(c.departmentId)
    if (c.sectionId) setFilterSection(c.sectionId)
    setFilterUsage('notinthis')
  }
  function addToChecklist(id: string) {
    setClSelected((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }
  function toggleScheduleDay(dayOfWeek: number) {
    setClSchedules((prev) => {
      const existing = prev.some((s) => s.dayOfWeek === dayOfWeek)
      if (existing) return prev.filter((s) => s.dayOfWeek !== dayOfWeek)
      return [...prev, { dayOfWeek, fromTime: '08:00', toTime: '' }]
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.fromTime.localeCompare(b.fromTime))
    })
  }
  function addScheduleWindow(dayOfWeek: number) {
    setClSchedules((prev) => [...prev, { dayOfWeek, fromTime: '08:00', toTime: '' }]
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.fromTime.localeCompare(b.fromTime)))
  }
  function updateScheduleWindow(index: number, patch: { fromTime?: string; toTime?: string }) {
    setClSchedules((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }
  function removeScheduleWindow(index: number) {
    setClSchedules((prev) => prev.filter((_, i) => i !== index))
  }
  function closeChecklist() {
    setClEditing(null)
    // Reset to a value that always exists in USAGE_OPTIONS, otherwise the
    // Select keeps rendering a phantom "NOT IN THIS LIST".
    setFilterUsage('nolist')
  }
  async function saveChecklist() {
    if (!clName.trim() || !clVenueId) { setClError('NAME AND VENUE ARE REQUIRED'); return }
    if (clSelected.length === 0) { setClError('ADD AT LEAST ONE TASK'); return }
    setClSaving(true); setClError('')
    const payload = { name: clName, description: clDesc, venueId: clVenueId, departmentId: clDeptId || null, sectionId: clSectionId || null, appearFromTime: clAppearFrom || null, schedules: clSchedules.map((s) => ({ dayOfWeek: s.dayOfWeek, fromTime: s.fromTime, toTime: s.toTime || null })), eventIds: clEventIds, taskIds: clSelected, allowedOutcomes: clAllowedOutcomes, requireOutcomeReason: clRequireReason }
    const url = clEditing && clEditing !== 'new' ? `/api/admin/checklists/${clEditing.id}` : '/api/admin/checklists'
    const method = clEditing && clEditing !== 'new' ? 'PUT' : 'POST'
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setClSaving(false)
    if (!r.ok) { const d = await r.json(); setClError(d.error ?? 'SAVE FAILED'); return }
    closeChecklist(); load()
  }
  async function deleteChecklist() {
    if (!clEditing || clEditing === 'new') return
    if (!confirm(`DELETE CHECKLIST "${clEditing.name}"? (the tasks themselves are kept)`)) return
    await fetch(`/api/admin/checklists/${clEditing.id}`, { method: 'DELETE' })
    closeChecklist(); load()
  }
  async function clearProgress(id: string) {
    if (!confirm('CLEAR THE STALE IN-PROGRESS (PARTIAL) STATE FOR THIS TASK?')) return
    await fetch(`/api/admin/tasks/${id}/progress`, { method: 'DELETE' })
    load()
  }
  async function toggleChecklistActivation(c: Checklist, active: boolean) {
    setActivateError('')
    const r = await fetch(`/api/admin/checklists/${c.id}/activate`, { method: active ? 'POST' : 'DELETE' })
    if (!r.ok) { const d = await r.json().catch(() => ({})); setActivateError(d.error ?? 'FAILED'); return }
    load()
  }

  // --- Derived ---
  const venueOptions = venues.map((v) => ({ value: v.id, label: v.name }))
  const selClass = (v: string) => v ? 'border-info' : ''
  const filterDeptOptions = [{ value: '', label: 'ALL DEPARTMENTS' }, ...departments.filter((d) => !filterVenue || d.venueId === filterVenue).map((d) => ({ value: d.id, label: d.name }))]
  const formDeptOptions = [{ value: '', label: 'NO DEPARTMENT' }, ...departments.filter((d) => d.venueId === form.venueId).map((d) => ({ value: d.id, label: d.name }))]
  const formSectionOptions = [{ value: '', label: 'NO SECTION' }, ...sections.filter((s) => s.departmentId === form.departmentId).map((s) => ({ value: s.id, label: s.name }))]
  const guideOptions = guides.filter((g) => g.venueId === form.venueId)

  const taskById = new Map(tasks.map((t) => [t.id, t]))
  const editingLive = editing ? taskById.get(editing.id) ?? editing : null
  const parentSelectOptions = [
    { value: '', label: 'NONE (TOP-LEVEL TASK)' },
    ...availableParentTasks(tasks, { venueId: form.venueId, taskId: editing?.id }).map((t) => ({ value: t.id, label: t.title })),
  ]
  const clDeptOptions = [{ value: '', label: 'WHOLE VENUE' }, ...departments.filter((d) => d.venueId === clVenueId).map((d) => ({ value: d.id, label: d.name }))]
  const clSectionOptions = [{ value: '', label: 'NO SECTION' }, ...sections.filter((s) => s.departmentId === clDeptId).map((s) => ({ value: s.id, label: s.name }))]
  const clEventOptions = calendarEvents
    .filter((e) => e.venueId === clVenueId)
    .map((e) => ({
      value: e.id,
      label: `${e.title} · ${e.date}${e.allDay ? ' ALL DAY' : ` ${e.startTime}`}`,
      description: e.endTime ? `ENDS ${e.endTime}` : null,
    }))
  // Add-a-task dropdown is scoped to the checklist's department/section (drag in
  // from the left to add anything else).
  const clAddOptions = [
    { value: '', label: '+ ADD A TASK…' },
    ...tasks
      .filter((t) => t.venueId === clVenueId && !clSelected.includes(t.id) && (clSectionId ? t.sectionId === clSectionId : clDeptId ? t.departmentId === clDeptId : true))
      .map((t) => ({ value: t.id, label: t.title })),
  ]

  const filterSectionOptions = [
    { value: '', label: 'ALL SECTIONS' },
    ...sections
      .filter((s) => (filterDept ? s.departmentId === filterDept : !filterVenue || s.venueId === filterVenue))
      .map((s) => ({ value: s.id, label: s.name })),
  ]
  const USAGE_OPTIONS = [
    { value: '', label: 'ANY USAGE' },
    { value: 'list', label: 'IN A CHECKLIST' },
    { value: 'nolist', label: 'NOT IN A LIST' },
    { value: 'training', label: 'HAS TRAINING/SOP' },
    ...(clEditing ? [{ value: 'notinthis', label: 'NOT IN THIS LIST' }] : []),
  ]
  const hasTrainingUse = (t: Task) => (t.trainingModules?.length ?? 0) > 0 || (t.requiredTraining?.length ?? 0) > 0 || (t.taskGuides?.length ?? 0) > 0
  const visibleTasks = tasks.filter((t) => {
    if (filterSection && t.sectionId !== filterSection) return false
    if (search.trim() && !t.title.toLowerCase().includes(search.trim().toLowerCase())) return false
    if (filterUsage === 'list' && !(t._count?.checklistLinks)) return false
    if (filterUsage === 'nolist' && (t._count?.checklistLinks ?? 0) > 0) return false
    // #19: filter against the LIVE selection, not the snapshot taken when the
    // editor opened. A task dropped this session must leave the left list too;
    // this also covers a brand-new list (`clEditing === 'new'`).
    if (filterUsage === 'notinthis' && clSelected.includes(t.id)) return false
    if (filterUsage === 'training' && !hasTrainingUse(t)) return false
    return true
  })

  function taskLabels(t: Task): { text: string; cls: string }[] {
    const out: { text: string; cls: string }[] = []
    const n = t._count?.checklistLinks ?? 0
    if (n > 0) out.push({ text: n > 1 ? `${n} LISTS` : 'LIST', cls: 'text-success' })
    const kinds = new Set<string>()
    ;(t.trainingModules ?? []).forEach((m) => kinds.add(m.kind))
    ;(t.requiredTraining ?? []).forEach((r) => { if (r.module) kinds.add(r.module.kind) })
    if ((t.taskGuides ?? []).length > 0) kinds.add('TRAINING')
    if (kinds.has('TRAINING')) out.push({ text: 'TRAINING', cls: 'text-accent' })
    if (kinds.has('SOP')) out.push({ text: 'SOP', cls: 'text-warning' })
    if (kinds.has('HOWTO') || kinds.has('FAQ')) out.push({ text: 'GUIDE', cls: 'text-grey-light' })
    return out
  }

  // Time-gated lists the floor can't see yet — surfaced at the bottom of the
  // checklists panel so an admin can force one open for today.
  const nowHHmm = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`
  const today = new Date()
  const todayDow = today.getDay()
  const gatedLists = checklists.filter((c) => isChecklistHidden(c.appearFromTime, c.activatedOn, today, nowHHmm, c.schedules, todayDow, c.events))

  // Group tasks: Department → Section, with a per-department "general" bucket.
  const deptGroups: { key: string; name: string; colour: string | null; sections: { id: string; name: string; tasks: Task[] }[]; loose: Task[] }[] = []
  const deptIndex = new Map<string, (typeof deptGroups)[number]>()
  for (const t of visibleTasks) {
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

  const taskRow = (t: Task, depth = 0) => {
    const labels = taskLabels(t)
    const subtaskCount = t.subtasks?.length ?? 0
    const collapsed = collapsedParents.has(t.id)
    return (
      <div
        key={t.id}
        data-testid={`available-task-${t.id}`}
        draggable
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'copy' }}
        className={`bg-grey-dark border border-grey-mid px-3 py-2.5 flex items-center gap-2 cursor-grab active:cursor-grabbing ${depth > 0 ? 'ml-4 border-l-2 border-l-info' : ''}`}
      >
        <div className={`w-1.5 h-1.5 flex-shrink-0 ${t.isActive ? 'bg-success' : 'bg-grey-mid'}`} />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm font-semibold uppercase text-white truncate">
            {depth > 0 ? '↳ ' : ''}{t.title}
          </div>
          {t.description && <p className="font-mono text-xs text-grey-light truncate">{t.description}</p>}
          <div className="flex flex-wrap gap-1.5 mt-0.5 items-center">
            <span className="font-mono text-xs uppercase text-grey-light border border-grey-mid px-1 py-0.5">{describeSchedule(t)}</span>
            {labels.map((l) => <span key={l.text} className={`font-mono text-xs uppercase ${l.cls}`}>{l.text}</span>)}
            {subtaskCount > 0 && (
              <span className="font-mono text-xs uppercase text-info">{subtaskCount} SUBTASK{subtaskCount !== 1 ? 'S' : ''}</span>
            )}
            {depth === 0 && t.parentTaskId && (
              <span className="font-mono text-xs uppercase text-grey-light">SUBTASK OF {t.parentTitle ?? 'PARENT'}</span>
            )}
            {(t.taskGuides ?? []).filter((g) => g.guide).map((g) => (
              <button
                key={g.guideId}
                type="button"
                onClick={() => requestGuide(g.guide!.id, g.guide!.title)}
                className="font-mono text-xs uppercase text-info hover:text-white transition-colors max-w-[12rem] truncate"
              >
                📖 {g.guide!.title}
              </button>
            ))}
            {t.progress && (
              <span className="font-mono text-xs uppercase text-warning">
                IN PROGRESS · {t.progress.staff.firstName} {t.progress.staff.lastName}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {subtaskCount > 0 && (
            <button onClick={() => toggleParentCollapse(t.id)} className="font-mono text-xs uppercase text-info hover:text-white transition-colors">
              {collapsed ? '▸ SHOW' : '▾ HIDE'}
            </button>
          )}
          {t.progress && (
            <button onClick={() => clearProgress(t.id)} className="font-mono text-xs uppercase text-warning hover:text-white transition-colors">CLEAR</button>
          )}
          <button onClick={() => toggleActive(t)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">{t.isActive ? 'OFF' : 'ON'}</button>
          <button onClick={() => openEdit(t)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">EDIT</button>
          <button onClick={() => handleDelete(t.id)} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">DEL</button>
        </div>
      </div>
    )
  }

  const renderTaskRows = (list: Task[]) =>
    orderTasksWithChildren(list).map(({ task, depth }) => {
      if (depth > 0 && task.parentTaskId && collapsedParents.has(task.parentTaskId)) return null
      return taskRow(task, depth)
    })

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest">TASKS &amp; CHECKLISTS</h1>
        <Button variant="ghost" size="sm" onClick={() => setPdfOpen(true)}>⬇ PDF</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* LEFT — tasks grouped by department → section */}
        <div className="space-y-4 pr-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-mono text-sm uppercase tracking-widest text-grey-light">TASKS</h2>
            <Button onClick={openCreate} size="sm">+ NEW TASK</Button>
          </div>

          <div className="space-y-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="SEARCH TASKS…" />
            <div className="flex gap-2 flex-wrap">
              {role === 'ADMIN' && (
                <div className="w-36">
                  <Select value={filterVenue} onChange={(e) => { setFilterVenue(e.target.value); setFilterDept(''); setFilterSection('') }} options={[{ value: '', label: 'ALL VENUES' }, ...venueOptions]} className={selClass(filterVenue)} />
                </div>
              )}
              <div className="w-36">
                <Select value={filterDept} onChange={(e) => { setFilterDept(e.target.value); setFilterSection('') }} options={filterDeptOptions} className={selClass(filterDept)} />
              </div>
              <div className="w-36">
                <Select value={filterSection} onChange={(e) => setFilterSection(e.target.value)} options={filterSectionOptions} className={selClass(filterSection)} />
              </div>
              <div className="w-40">
                <Select data-testid="usage-filter" value={filterUsage} onChange={(e) => setFilterUsage(e.target.value)} options={USAGE_OPTIONS} className={selClass(filterUsage)} />
              </div>
            </div>
          </div>

          {clEditing && <p className="font-mono text-xs uppercase text-accent">DRAG A TASK INTO THE CHECKLIST ON THE RIGHT →</p>}

          {loading ? (
            <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
          ) : visibleTasks.length === 0 ? (
            <p className="font-mono text-xs text-grey-light">{tasks.length === 0 ? 'NO TASKS FOUND.' : 'NO TASKS MATCH THESE FILTERS.'}</p>
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
                      <div className="font-mono text-xs uppercase tracking-wider text-accent">{sg.name}</div>
                      {renderTaskRows(sg.tasks)}
                    </div>
                  ))}
                  {dg.loose.length > 0 && (
                    <div className="space-y-1 pl-3 border-l border-grey-mid">
                      {dg.sections.length > 0 && <div className="font-mono text-xs uppercase tracking-wider text-grey-light">GENERAL (NO SECTION)</div>}
                      {renderTaskRows(dg.loose)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT — checklists list OR inline editor (sticky so it follows long task lists) */}
        <div className="lg:border-l lg:border-grey-mid lg:pl-6">
          <div ref={checklistPanelRef} className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          {clEditing ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-mono text-sm uppercase tracking-widest text-white">{clEditing === 'new' ? 'NEW CHECKLIST' : 'EDIT CHECKLIST'}</h2>
                <button onClick={closeChecklist} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">CLOSE</button>
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
              <div>
                <Input label="Appears from (time, optional)" type="time" value={clAppearFrom} onChange={(e) => setClAppearFrom(e.target.value)} />
                <p className="font-mono text-xs uppercase text-grey-light mt-1">
                  {clSchedules.length > 0
                    ? 'IGNORED WHILE A CUSTOM SCHEDULE IS SET — REMOVE ALL DAYS TO USE THIS EVERY DAY.'
                    : 'SHOWS ON THE FLOOR FROM THIS TIME EVERY DAY & STAYS UNTIL EVERY TASK IS SETTLED.'}
                </p>
              </div>

              <div className="border border-grey-mid p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">Schedule (optional)</h3>
                  <span className="font-mono text-xs uppercase text-grey-light">
                    {clSchedules.length > 0 ? `${clSchedules.length} WINDOW${clSchedules.length !== 1 ? 'S' : ''}` : 'EVERY DAY'}
                  </span>
                </div>
                {DAYS.map((day, dow) => {
                  const rows = clSchedules.map((s, i) => ({ s, i })).filter(({ s }) => s.dayOfWeek === dow)
                  return (
                    <div key={day} className="space-y-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          aria-label={`SCHEDULE DAY ${day}`}
                          checked={rows.length > 0}
                          onChange={() => toggleScheduleDay(dow)}
                          className="w-4 h-4 accent-white"
                        />
                        <span className="font-mono text-xs uppercase text-white w-9">{day}</span>
                        {rows.length === 0 && <span className="font-mono text-xs uppercase text-grey-light">CLOSED</span>}
                      </label>
                      {rows.map(({ s, i }) => (
                        <div key={i} className="flex items-center gap-2 pl-6">
                          <input
                            type="time"
                            aria-label={`SCHEDULE FROM ${day} ${i}`}
                            value={s.fromTime}
                            onChange={(e) => updateScheduleWindow(i, { fromTime: e.target.value })}
                            className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white"
                          />
                          <span className="font-mono text-xs uppercase text-grey-light">TO</span>
                          <input
                            type="time"
                            aria-label={`SCHEDULE TO ${day} ${i}`}
                            value={s.toTime}
                            onChange={(e) => updateScheduleWindow(i, { toTime: e.target.value })}
                            className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white"
                          />
                          <button
                            type="button"
                            aria-label={`REMOVE WINDOW ${day} ${i}`}
                            onClick={() => removeScheduleWindow(i)}
                            className="font-mono text-xs text-grey-light hover:text-danger"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      {rows.length > 0 && (
                        <button
                          type="button"
                          aria-label={`ADD WINDOW ${day}`}
                          onClick={() => addScheduleWindow(dow)}
                          className="ml-6 font-mono text-xs uppercase text-grey-light hover:text-white"
                        >
                          + ADD WINDOW
                        </button>
                      )}
                    </div>
                  )
                })}
                <p className="font-mono text-xs uppercase text-grey-light">
                  LEAVE EVERY DAY UNCHECKED TO USE THE APPEARS FROM TIME EVERY DAY. CLEAR A &ldquo;TO&rdquo; TIME TO STAY OPEN TO END OF DAY.
                </p>
              </div>

              <div className="border border-grey-mid p-3 space-y-2">
                <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">Calendar events (optional)</h3>
                <Combobox
                  options={clEventOptions}
                  selected={clEventIds}
                  onChange={setClEventIds}
                  placeholder="+ LINK AN EVENT..."
                />
                <p className="font-mono text-xs uppercase text-grey-light">
                  THE LIST OPENS ACROSS EACH LINKED EVENT&apos;S DATE/TIME AND CLOSES AFTER IT. A LINKED LIST IS CLOSED OUTSIDE ITS EVENTS UNLESS A SCHEDULE OR APPEARS-FROM TIME ALSO OPENS IT.
                </p>
              </div>

              <OutcomeOptions
                allowed={clAllowedOutcomes}
                requireReason={clRequireReason}
                onChange={(allowedOutcomes, requireOutcomeReason) => { setClAllowedOutcomes(allowedOutcomes); setClRequireReason(requireOutcomeReason) }}
                inheritedLabel="APPLIES TO EVERY TASK IN THIS LIST UNLESS THE TASK OVERRIDES IT"
              />

              <div className="space-y-1">
                <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Tasks in this checklist (drag in from the left)</label>
                <div
                  data-testid="cl-dropzone"
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
                            {t && <button type="button" onClick={() => openEdit(t)} className="font-mono text-xs uppercase text-grey-light hover:text-white">EDIT</button>}
                            <button type="button" disabled={i === 0} onClick={() => setClSelected((p) => moveItem(p, i, i - 1))} className="font-mono text-xs text-grey-light hover:text-white disabled:opacity-30">↑</button>
                            <button type="button" disabled={i === clSelected.length - 1} onClick={() => setClSelected((p) => moveItem(p, i, i + 1))} className="font-mono text-xs text-grey-light hover:text-white disabled:opacity-30">↓</button>
                            <button type="button" onClick={() => setClSelected((p) => p.filter((x) => x !== id))} className="font-mono text-xs text-grey-light hover:text-danger">✕</button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
                <Combobox
                  options={tasks
                    .filter((t) => t.venueId === clVenueId && (clSectionId ? t.sectionId === clSectionId : clDeptId ? t.departmentId === clDeptId : true))
                    .map((t) => ({ value: t.id, label: t.title, description: t.description }))}
                  selected={clSelected}
                  onChange={(ids) => setClSelected(ids)}
                  placeholder="+ ADD A TASK..."
                  hideTags
                />
              </div>

              {clError && <p className="font-mono text-xs text-danger">{clError}</p>}
              <div className="flex gap-2 pt-1">
                <Button onClick={saveChecklist} loading={clSaving} size="sm">SAVE CHECKLIST</Button>
                <Button variant="ghost" size="sm" onClick={closeChecklist}>CANCEL</Button>
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
              <p className="font-mono text-xs uppercase text-grey-light">CHECKLISTS REFERENCE LIVE TASKS — EDIT A TASK ONCE AND EVERY LIST UPDATES.</p>
              {checklists.length === 0 ? (
                <p className="font-mono text-xs text-grey-light">NO CHECKLISTS YET — CREATE ONE AND DRAG TASKS IN.</p>
              ) : (
                <div className="space-y-2">
                  {checklists.map((c) => (
                    <div key={c.id} className="bg-grey-dark border border-grey-mid p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-sm uppercase text-white truncate">{c.name}</span>
                        <button aria-label={`EDIT CHECKLIST ${c.name}`} onClick={() => openChecklistEdit(c)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors flex-shrink-0">EDIT</button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {c.section ? <Badge>{c.section.name}</Badge> : c.department ? <Badge>{c.department.name}</Badge> : <Badge>WHOLE VENUE</Badge>}
                        {c.schedules?.length ? <Badge variant="warning">{c.schedules.length} WINDOWS</Badge> : c.appearFromTime && <Badge variant="warning">FROM {c.appearFromTime}</Badge>}
                        {c.events?.filter((e) => !e.deletedAt).map((e) => <Badge key={e.id}>EVENT: {e.title}</Badge>)}
                        {isActivatedOn(c.activatedOn, today) && <Badge variant="success">ACTIVE TODAY</Badge>}
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

              {gatedLists.length > 0 && (
                <div className="pt-2 space-y-2">
                  <div className="font-mono text-xs uppercase tracking-widest text-grey-light">
                    HIDDEN — NOT OPEN YET ({gatedLists.length})
                  </div>
                  <p className="font-mono text-xs uppercase text-grey-light">
                    THESE LISTS HAVE A &ldquo;FROM&rdquo; TIME LATER TODAY. ACTIVATE ONE TO SHOW IT ON THE FLOOR NOW — IT RESETS TOMORROW.
                  </p>
                  {gatedLists.map((c) => {
                    const active = isActivatedOn(c.activatedOn, today)
                    const opensLabel = describeNextOpen({ schedules: c.schedules, appearFromTime: c.appearFromTime, events: c.events, day: today, nowHHmm, dayOfWeek: todayDow })
                    return (
                      <div key={c.id} className="bg-grey-dark border border-grey-mid p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono font-semibold text-sm uppercase text-white truncate">{c.name}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <Badge variant="warning">{opensLabel ?? 'SCHEDULED'}</Badge>
                            {c.section ? <Badge>{c.section.name}</Badge> : c.department ? <Badge>{c.department.name}</Badge> : <Badge>WHOLE VENUE</Badge>}
                            {c.events?.filter((e) => !e.deletedAt).map((e) => <Badge key={e.id}>EVENT: {e.title}</Badge>)}
                            {active && <Badge variant="success">ACTIVE TODAY</Badge>}
                          </div>
                        </div>
                        {active ? (
                          <button onClick={() => toggleChecklistActivation(c, false)} className="font-mono text-xs uppercase border border-grey-mid px-2 py-1 text-grey-light hover:border-white hover:text-white transition-colors flex-shrink-0">DEACTIVATE</button>
                        ) : (
                          <button onClick={() => toggleChecklistActivation(c, true)} className="font-mono text-xs uppercase border border-success/40 px-2 py-1 text-success hover:bg-success hover:text-black transition-colors flex-shrink-0">ACTIVATE NOW</button>
                        )}
                      </div>
                    )
                  })}
                  {activateError && <p className="font-mono text-xs text-danger">{activateError}</p>}
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'EDIT TASK' : form.parentTaskId ? 'NEW SUBTASK' : 'NEW TASK'} size="lg">
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

          <div className="space-y-2">
            <Select
              data-testid="task-parent-select"
              label="Parent task (optional)"
              value={form.parentTaskId}
              onChange={(e) => setForm({ ...form, parentTaskId: e.target.value })}
              options={parentSelectOptions}
              disabled={!!editingLive && (editingLive.subtasks?.length ?? 0) > 0}
            />
            <p className="font-mono text-xs uppercase text-grey-light">
              LINK THIS TASK UNDER A PARENT. SUBTASKS CANNOT HAVE THEIR OWN SUBTASKS.
            </p>
            {editing && (
              <div className="border border-grey-mid p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs uppercase text-grey-light tracking-wider">
                    Subtasks ({editingLive?.subtasks?.length ?? 0})
                  </span>
                  <button
                    type="button"
                    onClick={() => openSubtaskCreate(editingLive ?? editing)}
                    className="font-mono text-xs uppercase text-info hover:text-white transition-colors"
                  >
                    + ADD SUBTASK
                  </button>
                </div>
                {(editingLive?.subtasks?.length ?? 0) === 0 ? (
                  <p className="font-mono text-xs uppercase text-grey-light">NO SUBTASKS YET.</p>
                ) : (
                  <div className="space-y-1">
                    {editingLive!.subtasks!.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-2 border border-grey-mid px-2 py-1.5">
                        <span className="font-mono text-xs uppercase text-white truncate">{s.title}</span>
                        <button
                          type="button"
                          onClick={() => openEditById(s.id)}
                          className="font-mono text-xs uppercase text-grey-light hover:text-white flex-shrink-0"
                        >
                          EDIT
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {guideOptions.length > 0 && (
            <Combobox
              label="Required training (competency)"
              options={guideOptions.map((g) => ({ value: g.id, label: g.title, description: g.description ?? undefined }))}
              selected={form.competencyGuideIds}
              onChange={(ids) => setForm({ ...form, competencyGuideIds: ids })}
              onPreview={(id) => requestGuide(id, guideOptions.find((g) => g.id === id)?.title ?? null)}
              placeholder="Search guides..."
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Select label="Completion Type" value={form.completionType} onChange={(e) => setForm({ ...form, completionType: e.target.value })} options={COMPLETION_OPTIONS} />
            <Select label="Schedule" value={form.scheduleType} onChange={(e) => setForm({ ...form, scheduleType: e.target.value, scheduleDays: [] })} options={SCHEDULE_OPTIONS} />
          </div>

          <OutcomeOptions
            allowed={form.allowedOutcomes}
            requireReason={form.requireOutcomeReason}
            onChange={(allowedOutcomes, requireOutcomeReason) => setForm({ ...form, allowedOutcomes, requireOutcomeReason })}
            canOverride
            override={form.overrideOutcomes}
            onOverrideChange={(overrideOutcomes) => setForm({ ...form, overrideOutcomes })}
          />

          {form.scheduleType === 'MONTHLY' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Select label="When in the month" value={form.monthlyOption} onChange={(e) => setForm({ ...form, monthlyOption: e.target.value })} options={MONTHLY_OPTIONS} />
                <Input label="Every (months)" type="number" min={1} value={String(form.intervalMonths)} onChange={(e) => setForm({ ...form, intervalMonths: Math.max(1, Number(e.target.value) || 1) })} />
              </div>
              {form.monthlyOption === 'SPECIFIC_DAY' && (
                <Input label="Day of month (1–31)" type="number" min={1} max={31} value={String(form.monthlyDay)} onChange={(e) => setForm({ ...form, monthlyDay: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} />
              )}
              <p className="font-mono text-xs text-grey-light">E.G. END OF MONTH, EVERY 3 MONTHS. &ldquo;EVERY&rdquo; COUNTS FROM WHEN THE TASK WAS CREATED.</p>
            </div>
          )}

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

      <Modal isOpen={pdfOpen} onClose={() => setPdfOpen(false)} title="DOWNLOAD CHECKLISTS (PDF)">
        <div className="space-y-3">
          <p className="font-mono text-xs uppercase text-grey-light">PICK A CHECKLIST TO DOWNLOAD AS A PRINTABLE CHECKBOX PDF.</p>
          {checklists.length === 0 ? (
            <p className="font-mono text-xs text-grey-light">NO CHECKLISTS YET.</p>
          ) : (
            <div className="space-y-2">
              {checklists.map((c) => (
                <div key={c.id} className="bg-black border border-grey-mid p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono font-semibold text-sm uppercase text-white truncate">{c.name}</div>
                    <div className="font-mono text-xs text-grey-light mt-0.5">
                      {c.section ? c.section.name : c.department ? c.department.name : 'WHOLE VENUE'} · {c.tasks.length} TASK{c.tasks.length !== 1 ? 'S' : ''}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => window.open(`/api/admin/checklists/${c.id}/pdf`, '_blank')}>DOWNLOAD</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {guidePopupNodes}
    </div>
  )
}
