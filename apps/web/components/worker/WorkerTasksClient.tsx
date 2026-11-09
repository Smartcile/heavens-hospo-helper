'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { WorkerTaskView } from '@hospo-ops/types'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { DateInput } from '@/components/ui/DateInput'
import { Combobox } from '@/components/ui/Combobox'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import { RichTextContent } from '@/components/ui/RichTextContent'
import { describeSchedule, MONTHLY_OPTIONS } from '@/lib/scheduling'
import { richTextToPlainText } from '@/lib/rich-text'
import { describeLinkedItem, type LinkedItemView } from '@/lib/item-location'
import { readingVerdict, criticalVerdict, describeBand } from '@/lib/food-safety'
import { OUTCOME_LABELS, OUTCOME_DESCRIPTIONS, TASK_OUTCOMES, type TaskOutcome } from '@/lib/task-outcomes'
import { moveItem } from '@/lib/array'
import { availableParentTasks, orderTasksWithChildren, subtasksOutsideList } from '@/lib/task-subtasks'
import { groupChecklistTasks, normaliseGroupLabel } from '@/lib/task-groups'
import { resolveWorkerTaskAccess, type WorkerTaskAccess } from '@/lib/worker-task-access'
import { Panel } from '@/components/ui/Panel'
import { OutcomeOptions } from '@/components/ui/OutcomeOptions'
import { useGuidePopup } from '@/components/GuidePopup'
import { useWorkerImmersive } from '@/components/worker/useWorkerImmersive'
import { useLiveRefresh } from '@/lib/use-live-refresh'
import type { CalendarEventSummary } from '@/lib/checklist-activation'

type TaskState = WorkerTaskView
type ModalTask = TaskState | null

interface TaskForm {
  title: string; description: string; departmentId: string; sectionId: string
  completionType: string; scheduleType: string
  scheduleDays: number[]; customCron: string
  intervalMonths: number; monthlyOption: string; monthlyDay: number
  competencyGuideIds: string[]
  allowedOutcomes: TaskOutcome[]
  overrideOutcomes: boolean
  requireOutcomeReason: boolean
  parentTaskId: string
  checklistIds: string[]
  assignedToStaffId: string
  linkedItemId: string
}

interface TaskFull {
  id: string; title: string; description: string | null; venueId: string
  departmentId: string | null; sectionId: string | null
  completionType: string; scheduleType: string; scheduleDays: number[]
  customCron: string | null; intervalMonths: number
  monthlyOption: string | null; monthlyDay: number | null; isActive: boolean
  allowedOutcomes?: string[]; overrideOutcomes?: boolean; requireOutcomeReason?: boolean
  parentTaskId?: string | null; parentTitle?: string | null; subtaskOrder?: number
  linkedItemId?: string | null; linkedItem?: LinkedItemView | null
  checklistIds?: string[]; assignedToStaffId?: string | null; assigneeName?: string | null
  subtasks?: { id: string; title: string; isActive: boolean; subtaskOrder: number }[]
  department: { id: string; name: string } | null
  section: { id: string; name: string } | null
  requiredTraining: { moduleId: string; module?: { kind: string } }[]
  taskGuides?: { guideId: string; isRequiredForCompetency: boolean; guide?: { id: string; title: string } | null }[]
}

interface ChecklistScheduleRow { dayOfWeek: number; fromTime: string; toTime: string | null }

interface ChecklistFull {
  id: string; name: string; description: string | null; venueId: string
  departmentId: string | null; sectionId: string | null; appearFromTime: string | null
  activatedOn?: string | null
  activatedToday?: boolean
  schedules?: ChecklistScheduleRow[]
  events?: CalendarEventSummary[]
  openNow?: boolean
  opensNext?: string | null
  allowedOutcomes?: string[]
  requireOutcomeReason?: boolean
  multiDay?: boolean
  audiences?: { kind: string; targetId: string }[]
  tasks: { id: string; title: string; isActive: boolean; version: number; groupLabel?: string | null }[]
}

interface ChecklistSummary {
  id: string
  name: string
  appearFromTime: string | null
  activatedToday: boolean
  schedules?: ChecklistScheduleRow[]
  events?: CalendarEventSummary[]
  openNow?: boolean
  opensNext?: string | null
  taskIds: string[]
  /** Checklist-scoped group label per task id (null/absent = ungrouped). */
  taskGroups?: Record<string, string | null>
}

interface Department { id: string; name: string; venueId: string; colour: string | null }
interface Section { id: string; name: string; departmentId: string; venueId: string }
interface TrainingLite { id: string; title: string; venueId: string; kind: string; description: string | null }
interface GuideLite { id: string; title: string; venueId: string; isTracked: boolean; description: string | null }

const EMPTY_TASK_FORM: TaskForm = {
  title: '', description: '', departmentId: '', sectionId: '',
  completionType: 'TICK', scheduleType: 'DAILY', scheduleDays: [], customCron: '',
  intervalMonths: 1, monthlyOption: 'FIRST_DAY', monthlyDay: 1, competencyGuideIds: [],
  allowedOutcomes: [...TASK_OUTCOMES], overrideOutcomes: false, requireOutcomeReason: false,
  parentTaskId: '', checklistIds: [], assignedToStaffId: '', linkedItemId: '',
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
// Display order Mon–Sun; the values remain Date#getDay() (0 = Sunday).
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

export function WorkerTasksClient({
  role,
  sessionVenueId,
  access: accessProp,
}: {
  role: string | null
  sessionVenueId: string | null
  access?: WorkerTaskAccess | null
}) {
  const router = useRouter()
  const { requestGuide, nodes: guidePopupNodes } = useGuidePopup('worker')
  // Server-computed flags, with a role fallback so an older page (or a test)
  // still behaves exactly as before.
  const [access, setAccess] = useState<WorkerTaskAccess>(
    accessProp ?? resolveWorkerTaskAccess(role, []),
  )
  const canAuthor = access.canAuthor

  const [tasks, setTasks] = useState<TaskState[]>([])
  const [checklists, setChecklists] = useState<ChecklistSummary[]>([])
  const [firstName, setFirstName] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTask, setActiveTask] = useState<ModalTask>(null)
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [readingValue, setReadingValue] = useState('')
  const [outcome, setOutcome] = useState<TaskOutcome>('DONE')
  const [completing, setCompleting] = useState(false)
  const [completionError, setCompletionError] = useState('')
  const [undoingId, setUndoingId] = useState<string | null>(null)
  const [undoError, setUndoError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Edit mode
  const [isEditMode, setIsEditMode] = useState(false)
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set())
  // Finished (settled) tasks are hidden by default, per list / other-section key.
  const [showFinished, setShowFinished] = useState<Set<string>>(new Set())
  const [editDepts, setEditDepts] = useState<Department[]>([])
  const [editSections, setEditSections] = useState<Section[]>([])
  const [editGuides, setEditGuides] = useState<GuideLite[]>([])
  const [editCalendarEvents, setEditCalendarEvents] = useState<CalendarEventSummary[]>([])
  const [editTasks, setEditTasks] = useState<TaskFull[]>([])
  const [editChecklists, setEditChecklists] = useState<ChecklistFull[]>([])
  const [editAssignees, setEditAssignees] = useState<{ id: string; name: string }[]>([])

  // Task edit modal
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [taskEditing, setTaskEditing] = useState<TaskFull | null>(null)
  // True when the task modal was opened from the checklist editor: on save the
  // new task is appended to the open list and the list modal stays up.
  const [taskForList, setTaskForList] = useState(false)
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
  // Global TO used by "apply to checked days"; `''` means open to end of day.
  const [clGlobalTo, setClGlobalTo] = useState('')
  // Editable schedule rows; `toTime: ''` means "open to end of day".
  const [clSchedules, setClSchedules] = useState<{ dayOfWeek: number; fromTime: string; toTime: string }[]>([])
  const [clEventIds, setClEventIds] = useState<string[]>([])
  const [clAudiences, setClAudiences] = useState<{ kind: string; targetId: string }[]>([])
  const [editAudienceOptions, setEditAudienceOptions] = useState<{
    departments: { id: string; name: string }[]
    sections: { id: string; name: string; departmentId: string }[]
    positions: { id: string; name: string }[]
  }>({ departments: [], sections: [], positions: [] })
  const [clAllowedOutcomes, setClAllowedOutcomes] = useState<TaskOutcome[]>([...TASK_OUTCOMES])
  const [clRequireReason, setClRequireReason] = useState(false)
  const [clMultiDay, setClMultiDay] = useState(false)
  const [clSelected, setClSelected] = useState<string[]>([])
  const [clGroups, setClGroups] = useState<Record<string, string>>({})
  const [clSaving, setClSaving] = useState(false)
  const [clError, setClError] = useState('')
  // Bulk "mark group not required" confirmation.
  const [bulkGroup, setBulkGroup] = useState<{
    listId: string; listName: string; label: string; taskIds: string[]; requiresNote: boolean
  } | null>(null)
  const [bulkNote, setBulkNote] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkError, setBulkError] = useState('')
  const [bulkMessage, setBulkMessage] = useState('')
  // Action errors for the list-management strip / hidden-list cards, which are
  // rendered outside the checklist editor (so they can't reuse clError).
  const [listActionError, setListActionError] = useState('')

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

  useWorkerImmersive(!!activeTask || taskModalOpen || clModalOpen || !!bulkGroup)

  async function load() {
    const r = await fetch('/api/worker/tasks')
    if (r.status === 401) { router.push('/w/login'); return }
    const data = await r.json()
    setTasks(data.tasks)
    setChecklists(data.checklists ?? [])
    setFirstName(data.firstName)
    if (data.access) setAccess(data.access as WorkerTaskAccess)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Live-refresh the shared floor list so another person's tick appears within
  // ~30 s (and immediately on focus/visibility). Paused while any editor or
  // in-flight form is open so a poll can never clobber a save.
  const editorOpen = !!activeTask || taskModalOpen || clModalOpen || isEditMode || quickOpen
  useLiveRefresh(load, { enabled: !editorOpen })

  async function loadEditData() {
    if (!canAuthor) return null
    const [dR, sR, tR, taskR, clR, evR, asR, audR] = await Promise.all([
      fetch('/api/worker/departments'),
      fetch('/api/worker/sections'),
      fetch('/api/worker/guides?edit=1'),
      fetch('/api/worker/tasks?edit=1'),
      fetch('/api/worker/checklists'),
      fetch('/api/worker/calendar-events'),
      fetch('/api/worker/tasks/assignees'),
      fetch('/api/worker/tasks/audiences'),
    ])
    if (dR.status === 401) { router.push('/w/login'); return null }
    const [depts, sections, guides, editTasksData, checklistsData, eventsData, assigneesData, audiencesData] =
      await Promise.all([dR.json(), sR.json(), tR.json(), taskR.json(), clR.json(), evR.json(), asR.json(), audR.json()])
    // The list endpoint is authoring-gated and should always return an array,
    // but a failed/odd response must not crash the management strip.
    const checklists = Array.isArray(checklistsData) ? (checklistsData as ChecklistFull[]) : []
    setEditDepts(depts as Department[])
    setEditSections(sections as Section[])
    setEditGuides(guides as GuideLite[])
    setEditTasks(Array.isArray(editTasksData) ? (editTasksData as TaskFull[]) : [])
    setEditChecklists(checklists)
    setEditCalendarEvents(Array.isArray(eventsData) ? (eventsData as CalendarEventSummary[]) : [])
    setEditAssignees(Array.isArray(assigneesData) ? assigneesData : [])
    setEditAudienceOptions({
      departments: Array.isArray(audiencesData?.departments) ? audiencesData.departments : [],
      sections: Array.isArray(audiencesData?.sections) ? audiencesData.sections : [],
      positions: Array.isArray(audiencesData?.positions) ? audiencesData.positions : [],
    })
    return { checklists }
  }

  function toggleExpandList(listId: string) {
    setExpandedLists((prev) => {
      const next = new Set(prev)
      if (next.has(listId)) next.delete(listId)
      else next.add(listId)
      return next
    })
  }

  function toggleShowFinished(key: string) {
    setShowFinished((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function openTask(t: TaskState) {
    if (isEditMode) return
    if (t.isSettled) return
    setBulkMessage('')
    setActiveTask(t)
    setNote('')
    setPhoto(null)
    setReadingValue('')
    setOutcome('DONE')
    setCompletionError('')
  }

  async function undoTask(id: string) {
    setUndoingId(id)
    setUndoError('')
    try {
      const r = await fetch(`/api/worker/tasks/${id}/complete`, { method: 'DELETE' })
      if (r.status === 401) { router.push('/w/login'); return }
      if (!r.ok) {
        const data = await r.json().catch(() => ({}))
        setUndoError(data.error ?? 'COULD NOT UNDO THIS TASK')
        return
      }
      await load()
    } catch {
      setUndoError('COULD NOT CONNECT — TRY AGAIN')
    } finally {
      setUndoingId(null)
    }
  }

  function openBulkNotRequired(opts: {
    listId: string; listName: string; label: string; taskIds: string[]; requiresNote: boolean
  }) {
    setBulkGroup(opts)
    setBulkNote('')
    setBulkError('')
    setBulkMessage('')
  }

  async function submitBulkNotRequired() {
    if (!bulkGroup) return
    if (bulkGroup.requiresNote && !bulkNote.trim()) {
      setBulkError('A REASON IS REQUIRED')
      return
    }
    setBulkSaving(true)
    setBulkError('')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)
    try {
      const r = await fetch(`/api/worker/checklists/${bulkGroup.listId}/not-required`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupLabel: bulkGroup.label, taskIds: bulkGroup.taskIds, note: bulkNote || null }),
        signal: controller.signal,
      })
      if (r.status === 401) { router.push('/w/login'); return }
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        setBulkError(data.error ?? 'COULD NOT UPDATE THIS GROUP')
        return
      }
      const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0
      const completed = Array.isArray(data.completed) ? data.completed.length : 0
      setBulkMessage(
        skipped > 0
          ? `${completed} MARKED NOT REQUIRED - ${skipped} SKIPPED`
          : `${completed} TASK${completed === 1 ? '' : 'S'} MARKED NOT REQUIRED`,
      )
      setBulkGroup(null)
      setBulkNote('')
      await load()
    } catch (err) {
      setBulkError((err as Error)?.name === 'AbortError' ? 'REQUEST TIMED OUT - TRY AGAIN' : 'COULD NOT CONNECT - TRY AGAIN')
    } finally {
      clearTimeout(timeout)
      setBulkSaving(false)
    }
  }

  const activeAllowedOutcomes: TaskOutcome[] = (activeTask?.allowedOutcomes?.length
    ? activeTask.allowedOutcomes
    : TASK_OUTCOMES) as TaskOutcome[]

  async function handleComplete() {
    if (!activeTask) return
    if (outcome !== 'DONE' && activeTask.requireOutcomeReason && !note.trim()) {
      setCompletionError('A REASON IS REQUIRED')
      return
    }
    setCompleting(true)
    setCompletionError('')

    const readingValueForSubmit = outcome === 'DONE' ? readingValue : ''
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)

    try {
      let r: Response

      if (activeTask.completionType === 'TICK_PHOTO' && photo && outcome === 'DONE') {
        const form = new FormData()
        form.append('note', note)
        form.append('outcome', outcome)
        form.append('photo', photo)
        if (readingValueForSubmit !== '') form.append('value', readingValueForSubmit)
        r = await fetch(`/api/worker/tasks/${activeTask.id}/complete`, {
          method: 'POST',
          body: form,
          signal: controller.signal,
        })
      } else {
        r = await fetch(`/api/worker/tasks/${activeTask.id}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            note: note || null,
            outcome,
            value: readingValueForSubmit !== '' ? Number(readingValueForSubmit) : null,
          }),
          signal: controller.signal,
        })
      }

      if (r.status === 401) {
        router.push('/w/login')
        return
      }

      if (!r.ok) {
        const data = await r.json().catch(() => ({}))
        setCompletionError(data.error ?? 'FAILED TO COMPLETE TASK')
        return
      }

      setActiveTask(null)
      await load()
    } catch (err) {
      const aborted = (err as Error)?.name === 'AbortError'
      setCompletionError(aborted ? 'REQUEST TIMED OUT — TRY AGAIN' : 'COULD NOT CONNECT — TRY AGAIN')
    } finally {
      clearTimeout(timeout)
      setCompleting(false)
    }
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
      competencyGuideIds: f.competencyGuideIds.includes(id)
        ? f.competencyGuideIds.filter(x => x !== id)
        : [...f.competencyGuideIds, id],
    }))
  }

  function openTaskCreate(opts?: { fromList?: boolean }) {
    setTaskEditing(null)
    setTaskForList(!!opts?.fromList)
    setTaskForm({
      ...EMPTY_TASK_FORM,
      // Pre-scope a task created from a list to that list's department/section.
      departmentId: opts?.fromList ? clDeptId : '',
      sectionId: opts?.fromList ? clSectionId : '',
      // Creating from a list preselects that list; the author can add more.
      checklistIds: opts?.fromList && clEditing && clEditing !== 'new' ? [clEditing.id] : [],
      assignedToStaffId: '',
    })
    setRequireRetrain(false); setChangeSummary('')
    setTaskError(''); setTaskModalOpen(true)
  }

  function openTaskEdit(t: TaskFull) {
    setTaskEditing(t)
    setTaskForList(false)
    setTaskForm({
      title: t.title, description: t.description ?? '',
      departmentId: t.departmentId ?? '', sectionId: t.sectionId ?? '',
      linkedItemId: t.linkedItemId ?? '',
      completionType: t.completionType, scheduleType: t.scheduleType,
      scheduleDays: t.scheduleDays, customCron: t.customCron ?? '',
      intervalMonths: t.intervalMonths ?? 1,
      monthlyOption: t.monthlyOption ?? 'FIRST_DAY',
      monthlyDay: t.monthlyDay ?? 1,
      // Same competency junction the admin form edits. Legacy
      // TaskRequiredTraining rows are left untouched (not edited or deleted).
      competencyGuideIds: (t.taskGuides ?? [])
        .filter(g => g.isRequiredForCompetency)
        .map(g => g.guideId),
      allowedOutcomes: (t.allowedOutcomes?.length ? t.allowedOutcomes : TASK_OUTCOMES) as TaskOutcome[],
      overrideOutcomes: !!t.overrideOutcomes,
      requireOutcomeReason: !!t.requireOutcomeReason,
      parentTaskId: t.parentTaskId ?? '',
      checklistIds: t.checklistIds ?? editChecklists.filter(c => c.tasks.some(ct => ct.id === t.id)).map(c => c.id),
      assignedToStaffId: t.assignedToStaffId ?? '',
    })
    setRequireRetrain(false); setChangeSummary('')
    setTaskError(''); setTaskModalOpen(true)
  }

  // Pre-fill a child from its parent (department/section/schedule/completion),
  // then let the author edit it before saving.
  function openSubtaskCreate(parent: TaskFull) {
    setTaskEditing(null)
    setTaskForList(false)
    setTaskForm({
      ...EMPTY_TASK_FORM,
      title: '',
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
      checklistIds: [],
      assignedToStaffId: '',
    })
    setRequireRetrain(false); setChangeSummary('')
    setTaskError(''); setTaskModalOpen(true)
  }

  async function handleTaskSave() {
    if (taskEditing ? !access.canEditTask : !access.canCreateTask) {
      setTaskError('NOT ALLOWED')
      return
    }
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
        linkedItemId: taskForm.linkedItemId || null,
        parentTaskId: taskForm.parentTaskId || null,
        // Legacy `requiredTrainingIds` is deliberately not sent: the worker UI
        // edits TaskGuide now, and omitting it leaves old links untouched.
        competencyGuideIds: taskForm.competencyGuideIds,
        customCron: taskForm.scheduleType === 'CUSTOM' ? taskForm.customCron : null,
        scheduleDays: taskForm.scheduleType === 'DAILY' ? [] : taskForm.scheduleDays,
        ...(taskEditing ? { requireRetrain, changeSummary } : {}),
      }),
    })
    if (!r.ok) { const d = await r.json(); setTaskError(d.error ?? 'SAVE FAILED'); setTaskSaving(false); return }
    const saved = await r.json().catch(() => null)
    setTaskSaving(false); setTaskModalOpen(false)
    const addToList = taskForList && !taskEditing && saved?.id
    setTaskForList(false)
    if (addToList) {
      setClSelected(prev => (prev.includes(saved.id) ? prev : [...prev, saved.id]))
    }
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
    setClDeptId(''); setClSectionId(''); setClSelected([]); setClGroups({})
    setClAppearFrom(''); setClGlobalTo(''); setClError(''); setClModalOpen(true)
    setClSchedules([]); setClEventIds([]); setClAudiences([])
    setClAllowedOutcomes([...TASK_OUTCOMES]); setClRequireReason(false); setClMultiDay(false)
  }

  function openChecklistEdit(c: ChecklistFull) {
    setClEditing(c)
    setClName(c.name); setClDesc(c.description ?? '')
    setClDeptId(c.departmentId ?? ''); setClSectionId(c.sectionId ?? '')
    setClSelected(c.tasks.map(t => t.id))
    setClGroups(Object.fromEntries(c.tasks.map(t => [t.id, t.groupLabel ?? ''])))
    setClAppearFrom(c.appearFromTime ?? c.schedules?.[0]?.fromTime ?? '')
    setClGlobalTo(c.schedules?.[0]?.toTime ?? '')
    setClSchedules((c.schedules ?? []).map(s => ({ dayOfWeek: s.dayOfWeek, fromTime: s.fromTime, toTime: s.toTime ?? '' })))
    setClEventIds((c.events ?? []).filter((e) => !e.deletedAt).map((e) => e.id))
    setClAudiences(c.audiences ?? [])
    setClAllowedOutcomes((c.allowedOutcomes?.length ? c.allowedOutcomes : TASK_OUTCOMES) as TaskOutcome[])
    setClRequireReason(!!c.requireOutcomeReason)
    setClMultiDay(!!c.multiDay)
    setClError(''); setClModalOpen(true)
  }

  function toggleScheduleDay(dayOfWeek: number) {
    setClSchedules((prev) => {
      if (prev.some((s) => s.dayOfWeek === dayOfWeek)) {
        return prev.filter((s) => s.dayOfWeek !== dayOfWeek)
      }
      return [...prev, { dayOfWeek, fromTime: '08:00', toTime: '' }]
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.fromTime.localeCompare(b.fromTime))
    })
  }
  // Copy the global from/to onto every checked day (one window per day).
  function applyGlobalSchedule() {
    if (clSchedules.length === 0) return
    const days = [...new Set(clSchedules.map(s => s.dayOfWeek))]
    setClSchedules(
      days
        .map(dayOfWeek => ({ dayOfWeek, fromTime: clAppearFrom || '08:00', toTime: clGlobalTo }))
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.fromTime.localeCompare(b.fromTime)),
    )
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

  async function saveChecklist() {
    if (clEditing && clEditing !== 'new' ? !access.canEditList : !access.canCreateList) {
      setClError('NOT ALLOWED')
      return
    }
    if (!clName.trim()) { setClError('NAME IS REQUIRED'); return }
    if (clSelected.length === 0) { setClError('ADD AT LEAST ONE TASK'); return }
    setClSaving(true); setClError('')
    const payload = {
      name: clName, description: clDesc,
      departmentId: clDeptId || null, sectionId: clSectionId || null,
      appearFromTime: clSchedules.length ? null : (clAppearFrom || null), taskIds: clSelected,
      taskGroups: Object.fromEntries(clSelected.map((id) => [id, normaliseGroupLabel(clGroups[id])])),
      schedules: clSchedules.map(s => ({ dayOfWeek: s.dayOfWeek, fromTime: s.fromTime, toTime: s.toTime || null })),
      eventIds: clEventIds,
      audiences: clAudiences,
      allowedOutcomes: clAllowedOutcomes, requireOutcomeReason: clRequireReason,
      multiDay: clMultiDay,
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

  // Force-open / close a list for the venue-local day. Shared by the checklist
  // editor, the MANAGE LISTS strip and the hidden-list cards.
  async function activateChecklist(id: string, active: boolean) {
    if (!access.canEditList) return
    setListActionError('')
    setClError('')
    const r = await fetch(`/api/worker/checklists/${id}/activate`, {
      method: active ? 'POST' : 'DELETE',
    })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      const message = d.error ?? 'FAILED'
      setListActionError(message)
      setClError(message)
      return
    }
    const updated = await r.json().catch(() => null)
    const activatedOn = updated?.activatedOn ?? null
    // The server owns the venue-local "today" verdict; we just toggled it.
    const activatedToday = updated?.activatedToday ?? active
    setEditChecklists((prev) =>
      prev.map((c) => (c.id === id ? { ...c, activatedOn, activatedToday } : c)),
    )
    setClEditing((prev) =>
      prev && prev !== 'new' && prev.id === id ? { ...prev, activatedOn, activatedToday } : prev,
    )
    await load()
  }

  async function toggleChecklistActivation(active: boolean) {
    if (!clEditing || clEditing === 'new') return
    await activateChecklist(clEditing.id, active)
  }

  // Open the checklist editor for a list the manager can only see on a hidden
  // card (edit data may not be loaded yet outside EDIT MODE).
  async function openChecklistEditById(id: string) {
    if (!access.canEditList) return
    let full = editChecklists.find((c) => c.id === id)
    if (!full) {
      const data = await loadEditData()
      full = data?.checklists.find((c) => c.id === id)
    }
    if (full) openChecklistEdit(full)
  }

  const audienceOptionList = [
    ...editAudienceOptions.departments.map((d) => ({ value: `DEPARTMENT:${d.id}`, label: `DEPARTMENT: ${d.name}` })),
    ...editAudienceOptions.sections.map((s) => ({ value: `SECTION:${s.id}`, label: `SECTION: ${s.name}` })),
    ...editAudienceOptions.positions.map((p) => ({ value: `POSITION:${p.id}`, label: `POSITION: ${p.name}` })),
  ]
  const clGroupOptions = [...new Set(
    editChecklists
      .flatMap((c) => c.tasks.map((t) => normaliseGroupLabel(t.groupLabel)))
      .filter((label): label is string => !!label),
  )].sort()
  const pending = tasks.filter((t) => !t.isSettled)
  const done = tasks.filter((t) => t.isDone)
  const handled = tasks.filter((t) => t.isSettled && !t.isDone)
  const allDone = tasks.length > 0 && pending.length === 0
  const allActuallyDone = allDone && handled.length === 0

  // Time-gate the lists. The server returns `openNow` computed in the venue
  // timezone, so a custom schedule is never decided by the phone's clock. The
  // legacy calculation remains only as a fallback for older payloads.
  const now = new Date()
  const nowHHmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const isOpen = (cl: { appearFromTime: string | null; activatedToday?: boolean; openNow?: boolean }) =>
    cl.openNow !== undefined
      ? cl.openNow
      : cl.activatedToday || !cl.appearFromTime || nowHHmm >= cl.appearFromTime

  const listsByTask = new Map<string, ChecklistSummary[]>()
  for (const cl of checklists) {
    for (const tid of cl.taskIds) {
      const arr = listsByTask.get(tid) ?? []
      arr.push(cl)
      listsByTask.set(tid, arr)
    }
  }

  const listGroupMap = new Map<string, { id: string; name: string; time: string | null; tasks: TaskState[] }>()
  const otherTasks: TaskState[] = []
  const upcomingMap = new Map<string, { id: string; name: string; label: string | null }>()
  for (const t of tasks) {
    const lists = listsByTask.get(t.id) ?? []
    if (lists.length === 0) { otherTasks.push(t); continue }
    // Settled work stays inside its list, even if the list is time-closed.
    if (t.isSettled) {
      const first = lists.slice().sort((a, b) => (a.appearFromTime ?? '').localeCompare(b.appearFromTime ?? '') || a.name.localeCompare(b.name))[0]
      let grp = listGroupMap.get(first.id)
      if (!grp) { grp = { id: first.id, name: first.name, time: first.appearFromTime, tasks: [] }; listGroupMap.set(first.id, grp) }
      grp.tasks.push(t)
      continue
    }
    const open = lists
      .filter((l) => isOpen(l))
      .sort((a, b) => (a.appearFromTime ?? '').localeCompare(b.appearFromTime ?? '') || a.name.localeCompare(b.name))
    if (open.length === 0) {
      const next = lists.slice().sort((a, b) =>
        (a.opensNext ?? a.appearFromTime ?? '').localeCompare(b.opensNext ?? b.appearFromTime ?? '') ||
        a.name.localeCompare(b.name),
      )[0]
      upcomingMap.set(next.id, {
        id: next.id,
        name: next.name,
        label: next.opensNext ?? (next.appearFromTime ? `FROM ${next.appearFromTime}` : null),
      })
      continue
    }
    const g = open[0]
    let grp = listGroupMap.get(g.id)
    if (!grp) { grp = { id: g.id, name: g.name, time: g.appearFromTime, tasks: [] }; listGroupMap.set(g.id, grp) }
    grp.tasks.push(t)
  }
  // Unfinished lists first; a fully-settled list drops to the bottom, still
  // clickable to reveal its finished work.
  const isFullySettled = (g: { tasks: TaskState[] }) => g.tasks.length > 0 && g.tasks.every((t) => t.isSettled)
  const listGroups = [...listGroupMap.values()].sort((a, b) => {
    const sa = isFullySettled(a)
    const sb = isFullySettled(b)
    if (sa !== sb) return sa ? 1 : -1
    return (a.time ?? '').localeCompare(b.time ?? '') || a.name.localeCompare(b.name)
  })
  for (const g of listGroups) g.tasks.sort((a, b) => Number(a.isSettled) - Number(b.isSettled))
  const upcoming = [...upcomingMap.values()].sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''))

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
  for (const dg of otherGroups) {
    for (const sg of dg.sections) sg.tasks.sort((a, b) => Number(a.isSettled) - Number(b.isSettled))
  }

  // Settled tasks are hidden unless the list/section is toggled (or in edit
  // mode). Ordering is done first, then filtered, so parent/child order holds.
  function visibleOrdered(list: TaskState[], showAll: boolean) {
    const ordered = orderTasksWithChildren(list).filter(({ task }) => showAll || !task.isSettled)
    const ids = new Set(ordered.map((o) => o.task.id))
    // A settled parent that is hidden must not leave its visible child indented.
    return ordered.map(({ task, depth }) => ({
      task,
      depth: task.parentTaskId && !ids.has(task.parentTaskId) ? 0 : depth,
    }))
  }

  // The coloured status box. DONE = green tick, NOT_REQUIRED = dark box + dash,
  // DID_NOT_COMPLETE = red cross, in progress = warning border, pending = grey.
  function taskStatusBox(t: TaskState) {
    if (t.isDone) {
      return <div role="img" aria-label="DONE STATUS" className="w-5 h-5 border-2 border-success bg-success text-black flex items-center justify-center flex-shrink-0 mt-0.5 font-mono text-xs leading-none">✓</div>
    }
    if (t.outcome === 'NOT_REQUIRED') {
      return <div role="img" aria-label="NOT REQUIRED STATUS" className="w-5 h-5 border-2 border-grey-light bg-black text-grey-light flex items-center justify-center flex-shrink-0 mt-0.5 font-mono text-xs leading-none">—</div>
    }
    if (t.outcome === 'DID_NOT_COMPLETE') {
      return <div role="img" aria-label="DID NOT COMPLETE STATUS" className="w-5 h-5 border-2 border-danger bg-danger text-black flex items-center justify-center flex-shrink-0 mt-0.5 font-mono text-xs leading-none">✕</div>
    }
    if (t.inProgress) {
      return <div role="img" aria-label="IN PROGRESS STATUS" className="w-5 h-5 border-2 border-warning flex-shrink-0 mt-0.5" />
    }
    return <div role="img" aria-label="PENDING STATUS" className="w-5 h-5 border-2 border-grey-mid flex-shrink-0 mt-0.5" />
  }

  const renderTask = (t: TaskState, opts?: { depth?: number; sameListIds?: Set<string> }) => {
    const depth = opts?.depth ?? 0
    const parentInSameList = t.parentTaskId ? !!opts?.sameListIds?.has(t.parentTaskId) : true
    const showPartOf = !!t.parentTaskId && !parentInSameList
    const showSubtasksElsewhere = !!opts?.sameListIds && !!t.subtasks?.length &&
      subtasksOutsideList(t.subtasks.map((s) => s.id), [...opts.sameListIds]).length > 0
    const indentClass = depth > 0 ? 'ml-4 border-l-2 border-l-info pl-3' : ''
    const subtaskLabels = (
      <>
        {showPartOf && (
          <span className="font-mono text-xs uppercase text-grey-light">PART OF {t.parentTitle ?? 'PARENT'}</span>
        )}
        {showSubtasksElsewhere && (
          <span className="font-mono text-xs uppercase text-info">SUBTASKS IN OTHER LISTS</span>
        )}
      </>
    )
    if (isEditMode) {
      const full = editTasks.find(et => et.id === t.id)
      const guideTitles = (full?.taskGuides ?? [])
        .filter(g => g.isRequiredForCompetency && g.guide)
        .map(g => g.guide!.title)
      return (
        <Panel
          key={t.id}
          padding="md"
          className={`w-full text-left flex items-center gap-3 ${indentClass}`}
        >
          <div className={`w-2 h-2 flex-shrink-0 ${t.isCompleted ? 'bg-success' : 'bg-grey-mid'}`} />
          <div className="min-w-0 flex-1">
            <div className="font-mono font-semibold text-sm uppercase text-white truncate">{depth > 0 ? '↳ ' : ''}{t.title}</div>
            {t.description && <p className="font-sans text-xs text-grey-light mt-0.5">{richTextToPlainText(t.description)}</p>}
            {t.linkedItem && <p className="font-mono text-xs uppercase text-grey-light mt-0.5">LINKED: {describeLinkedItem(t.linkedItem)}</p>}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <CompletionTypeIcon type={t.completionType} />
              {t.assigneeName && <span className="font-mono text-xs text-accent">FOR {t.assigneeName}</span>}
              {guideTitles.map((title) => (
                <span key={title} className="font-mono text-xs uppercase text-info truncate max-w-[10rem]">
                  📖 {title}
                </span>
              ))}
              {(t.rolledOverFrom || (t.isOneOff && t.dueDate && !t.isCompleted)) && (
                <span className="font-mono text-xs text-warning uppercase">⚠ ROLLED OVER</span>
              )}
              {subtaskLabels}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {full && access.canEditTask && (
              <button
                onClick={() => toggleTaskActive(full)}
                className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors px-2 py-1"
              >
                {full.isActive ? 'OFF' : 'ON'}
              </button>
            )}
            {access.canEditTask && (
              <button
                onClick={() => { if (full) openTaskEdit(full) }}
                className="font-mono text-xs uppercase text-warning hover:text-white transition-colors px-2 py-1"
              >
                EDIT
              </button>
            )}
            {access.canDeleteTask && (
              <button
                onClick={() => handleTaskDelete(t.id)}
                className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors px-2 py-1"
              >
                DEL
              </button>
            )}
          </div>
        </Panel>
      )
    }
    const settled = t.isSettled
    const titleClass = t.isDone
      ? 'text-success line-through'
      : t.outcome === 'NOT_REQUIRED'
        ? 'text-grey-light line-through decoration-black decoration-2'
        : settled
          ? 'text-grey-light line-through'
          : 'text-white'
    return (
      <div
        key={t.id}
        role="button"
        tabIndex={0}
        aria-disabled={settled}
        onClick={() => openTask(t)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTask(t) } }}
        className={`w-full text-left bg-grey-dark border border-grey-mid p-4 transition-colors ${settled ? 'opacity-60 cursor-default' : 'hover:border-white active:bg-black cursor-pointer'} ${indentClass}`}
      >
        <div className="flex items-start gap-3">
          {taskStatusBox(t)}
          <div className="min-w-0">
            <div className={`font-mono font-semibold text-sm uppercase ${titleClass}`}>{depth > 0 ? '↳ ' : ''}{t.title}</div>
            {t.description && <p className="font-sans text-xs text-grey-light mt-0.5">{richTextToPlainText(t.description)}</p>}
            {t.linkedItem && <p className="font-mono text-xs uppercase text-grey-light mt-0.5">LINKED: {describeLinkedItem(t.linkedItem)}</p>}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <CompletionTypeIcon type={t.completionType} />
              {t.assigneeName && <span className="font-mono text-xs text-accent">FOR {t.assigneeName}</span>}
              {t.guide && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); requestGuide(t.guide!.id, t.guide!.title) }}
                  className="font-mono text-xs text-info hover:text-white transition-colors"
                >
                  📖 GUIDE
                </button>
              )}
              {(t.rolledOverFrom || (t.isOneOff && t.dueDate && !t.isCompleted)) && (
                <span className="font-mono text-xs text-warning uppercase">⚠ ROLLED OVER</span>
              )}
              {t.inProgress && (
                <span className="font-mono text-xs text-warning uppercase">
                  IN PROGRESS{t.inProgress.byName ? ` · ${t.inProgress.byName}` : ''}
                </span>
              )}
              {subtaskLabels}
            </div>
            {t.inProgress?.note && (
              <p className="font-sans text-xs text-warning/80 mt-1 truncate">{t.inProgress.note}</p>
            )}
            {t.isSettled && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className={`font-mono text-xs uppercase border px-1.5 py-0.5 ${t.isDone ? 'text-success border-success/50' : t.outcome === 'NOT_REQUIRED' ? 'text-grey-light border-grey-mid' : 'text-danger border-danger/50'}`}>
                  {t.isDone ? 'DONE' : t.outcome === 'NOT_REQUIRED' ? 'NOT REQUIRED' : 'DID NOT COMPLETE'}
                </span>
                {t.completedByName && (
                  <span className="font-mono text-xs uppercase text-grey-light">BY {t.completedByName}</span>
                )}
                {t.canUndo && (
                  <button
                    type="button"
                    disabled={undoingId === t.id}
                    onClick={(e) => { e.stopPropagation(); void undoTask(t.id) }}
                    className="ml-auto font-mono text-xs uppercase border border-warning/60 text-warning px-2 py-1 hover:bg-warning hover:text-black transition-colors disabled:opacity-40"
                  >
                    {undoingId === t.id ? 'UNDOING...' : t.isDone ? 'UNTICK' : 'REOPEN'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
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

  const parentTaskOptions = availableParentTasks(editTasks, {
    venueId: taskEditing?.venueId ?? sessionVenueId ?? editTasks[0]?.venueId ?? '',
    taskId: taskEditing?.id,
  })

  const clEventOptions = editCalendarEvents.map((e) => ({
    value: e.id,
    label: `${e.title} · ${e.date}${e.allDay ? ' ALL DAY' : ` ${e.startTime}`}`,
    description: e.endTime ? `ENDS ${e.endTime}` : null,
  }))

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
              {done.length} OF {tasks.length} TASKS DONE{handled.length > 0 ? ` · ${handled.length} HANDLED` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setQuickOpen(!quickOpen); setQuickTitle(''); setQuickDesc(''); setQuickDue(''); setQuickRollover(false) }}
              className="font-mono text-xs uppercase font-bold tracking-wider px-3 py-2 border border-success text-success hover:bg-success hover:text-black transition-colors"
            >
              + QUICK TASK
            </button>
            {canAuthor && (
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
          <Panel padding="md" className="mt-3 border border-success/30 space-y-2">
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
                <DateInput value={quickDue} onChange={(e) => setQuickDue(e.target.value)} className="w-40" />
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
          </Panel>
        )}

        {isEditMode && canAuthor && (
          <Panel padding="none" className="mt-3 py-2 px-3 border border-warning text-warning font-mono text-xs uppercase tracking-widest flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-warning animate-pulse" />
            EDIT MODE ACTIVE // ARMED
          </Panel>
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

      {isEditMode && canAuthor && (
        <div className="px-4 pt-3 flex gap-2">
          {access.canCreateTask && (
            <button onClick={() => openTaskCreate()}
              className="font-mono text-xs uppercase font-bold tracking-wider px-4 py-2 border border-warning text-warning hover:bg-warning hover:text-black transition-colors">
              + NEW TASK
            </button>
          )}
          {access.canCreateList && (
            <button onClick={openChecklistCreate}
              className="font-mono text-xs uppercase font-bold tracking-wider px-4 py-2 border border-warning text-warning hover:bg-warning hover:text-black transition-colors">
              + NEW CHECKLIST
            </button>
          )}
        </div>
      )}

      {/* Manager list management — every venue list, including the ones hidden
          from the floor today, so a manager can force-open or edit them. Only
          authoring users reach this (edit data is authoring-gated). */}
      {isEditMode && canAuthor && access.canEditList && !clModalOpen && (
        <div className="px-4 pt-3">
          <Panel padding="none" className="border border-grey-mid">
            <div className="px-3 py-2 border-b border-grey-mid space-y-0.5">
              <div className="font-mono text-xs uppercase tracking-widest text-warning">MANAGE LISTS</div>
              <div className="font-mono text-xs uppercase text-grey-light tracking-wider">
                ALL LISTS · {editChecklists.length}
              </div>
            </div>
            <div className="divide-y divide-grey-mid">
              {editChecklists.length === 0 ? (
                <div className="p-3 font-mono text-xs uppercase text-grey-light">NO LISTS YET</div>
              ) : (
                editChecklists.map((c) => {
                  const open = isOpen(c)
                  return (
                    <div key={c.id} className="px-3 py-2 flex items-center gap-2 flex-wrap">
                      <span className={`font-mono text-xs uppercase border px-1.5 py-0.5 flex-shrink-0 ${
                        open ? 'text-success border-success/50' : 'text-warning border-warning/50'
                      }`}>
                        {open ? 'OPEN' : 'HIDDEN'}
                      </span>
                      <span className="font-mono text-xs uppercase text-white min-w-0 truncate flex-1">
                        {c.name}
                      </span>
                      {c.schedules?.length ? (
                        <span className="font-mono text-xs uppercase text-grey-light flex-shrink-0">
                          {c.schedules.length} WINDOWS
                        </span>
                      ) : c.appearFromTime && (
                        <span className="font-mono text-xs uppercase text-grey-light flex-shrink-0">
                          FROM {c.appearFromTime}
                        </span>
                      )}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {c.activatedToday ? (
                          <button
                            aria-label={`MANAGE DEACTIVATE CHECKLIST ${c.name}`}
                            onClick={() => activateChecklist(c.id, false)}
                            className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors px-1 py-0.5"
                          >
                            DEACTIVATE
                          </button>
                        ) : !open ? (
                          <button
                            aria-label={`MANAGE UNLOCK CHECKLIST ${c.name}`}
                            onClick={() => activateChecklist(c.id, true)}
                            className="font-mono text-xs uppercase text-success hover:text-white transition-colors px-1 py-0.5"
                          >
                            UNLOCK
                          </button>
                        ) : null}
                        <button
                          aria-label={`MANAGE CHECKLIST ${c.name}`}
                          onClick={() => openChecklistEdit(c)}
                          className="font-mono text-xs uppercase text-warning hover:text-white transition-colors px-1 py-0.5"
                        >
                          EDIT
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            {listActionError && (
              <p className="px-3 py-2 font-mono text-xs text-danger border-t border-grey-mid">{listActionError}</p>
            )}
          </Panel>
        </div>
      )}

      {/* Pending — time-gated lists as boxes, then any other tasks by dept → section */}
      <div className="px-4 py-4 space-y-4">
        {allDone && !isEditMode && (
          <Panel padding="md" className={allActuallyDone ? 'border-success/50' : 'border-warning/50'}>
            <div className="flex items-center gap-3">
              <span className={`w-8 h-8 border-2 flex items-center justify-center font-mono text-sm ${allActuallyDone ? 'border-success text-success' : 'border-warning text-warning'}`}>
                {allActuallyDone ? '✓' : '!'}
              </span>
              <div className="min-w-0">
                <div className={`font-mono text-sm font-bold uppercase tracking-wider ${allActuallyDone ? 'text-success' : 'text-warning'}`}>
                  {allActuallyDone ? 'ALL DONE' : 'ALL TASKS HANDLED'}
                </div>
                <div className="font-mono text-xs uppercase text-grey-light">
                  {allActuallyDone ? `NICE WORK, ${firstName}` : `NOT EVERYTHING WAS DONE, ${firstName}`} · {done.length} DONE
                </div>
              </div>
            </div>
          </Panel>
        )}
        {bulkMessage && (
          <p className="font-mono text-xs uppercase text-success">{bulkMessage}</p>
        )}
        {listGroups.map((lg) => {
          const summary = checklists.find((cl) => cl.id === lg.id)
          const allTaskIds = summary?.taskIds ?? []
          const listEvents = (summary?.events ?? []).filter((e) => !e.deletedAt)
          const allInList = tasks.filter((t) => allTaskIds.includes(t.id))
          // The progress bar counts DONE only; other settlements are handled, not done.
          const doneCount = allInList.filter((t) => t.isDone).length
          const totalCount = allInList.length
          const donePct = totalCount > 0 ? (doneCount / totalCount) * 100 : 0
          const sameListIds = new Set(lg.tasks.map((t) => t.id))
          const settledCount = lg.tasks.filter((t) => t.isSettled).length
          const show = isEditMode || showFinished.has(lg.id)
          const ordered = visibleOrdered(lg.tasks, show)
          const maxVisible = (isEditMode || expandedLists.has(lg.id)) ? 999 : 5
          const isExpanded = expandedLists.has(lg.id)
          const extra = ordered.length - maxVisible
          const taskGroupMap = summary?.taskGroups ?? {}
          // Checklist-scoped groups. Ungrouped tasks keep today's flat layout.
          const taskBuckets = groupChecklistTasks(
            ordered.slice(0, maxVisible).map(({ task, depth }) => ({
              id: task.id,
              task,
              depth,
              groupLabel: taskGroupMap[task.id] ?? null,
            })),
          )
          const allFinished = lg.tasks.length > 0 && settledCount === lg.tasks.length
          const canToggleFinished = settledCount > 0 && !isEditMode
          // Only an entirely-finished list is toggled by tapping its header;
          // a partly-finished list uses the SHOW FINISHED button below.
          const headerToggleable = allFinished && !isEditMode
          return (
            <Panel key={lg.id} padding="none">
              <div className="h-1.5 bg-grey-mid">
                <div className="h-full bg-success transition-all duration-500" style={{ width: `${donePct}%` }} />
              </div>
              <div
                className={`p-3 border-b border-grey-mid flex items-center justify-between gap-2 ${headerToggleable ? 'cursor-pointer hover:bg-grey-dark/40' : ''}`}
                onClick={headerToggleable ? () => toggleShowFinished(lg.id) : undefined}
                role={headerToggleable ? 'button' : undefined}
                tabIndex={headerToggleable ? 0 : undefined}
                aria-label={headerToggleable ? `${showFinished.has(lg.id) ? 'HIDE' : 'SHOW'} FINISHED TASKS IN ${lg.name}` : undefined}
                onKeyDown={headerToggleable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleShowFinished(lg.id) } } : undefined}
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs uppercase tracking-widest text-white truncate">{lg.name}</div>
                  {allFinished && !showFinished.has(lg.id) && (
                    <div className="font-mono text-xs uppercase text-success mt-0.5">ALL FINISHED · TAP TO VIEW</div>
                  )}
                  {listEvents.map((e) => (
                    <span key={e.id} className="inline-block mt-1 mr-1 font-mono text-xs uppercase text-warning border border-warning/40 px-1.5 py-0.5">
                      EVENT: {e.title}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isEditMode && access.canEditList && (
                    <button
                      aria-label={`EDIT CHECKLIST ${lg.name}`}
                      onClick={(e) => { e.stopPropagation(); const full = editChecklists.find(c => c.id === lg.id); if (full) openChecklistEdit(full) }}
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
                {taskBuckets.map((bucket) => {
                  if (bucket.label === null) {
                    return bucket.tasks.map(({ task, depth }) =>
                      renderTask(task, { depth, sameListIds }),
                    )
                  }
                  const label = bucket.label
                  const groupTasks = lg.tasks.filter(
                    (t) => normaliseGroupLabel(taskGroupMap[t.id]) === label,
                  )
                  const unsettled = groupTasks.filter((t) => !t.isSettled)
                  const eligible = unsettled.filter((t) =>
                    (t.allowedOutcomes?.length ? t.allowedOutcomes : TASK_OUTCOMES).includes('NOT_REQUIRED'),
                  )
                  const requiresNote = eligible.some((t) => t.requireOutcomeReason)
                  return (
                    <div key={`group:${label}`}>
                      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-grey-mid/20 border-b border-grey-mid">
                        <div className="min-w-0">
                          <span className="font-mono text-xs font-bold uppercase tracking-wider text-accent">
                            {label}
                          </span>
                          <span className="ml-2 font-mono text-xs uppercase text-grey-light">
                            {unsettled.length} LEFT
                          </span>
                        </div>
                        {!isEditMode && eligible.length > 0 && (
                          <button
                            type="button"
                            aria-label={`MARK GROUP ${label} NOT REQUIRED`}
                            onClick={() => openBulkNotRequired({
                              listId: lg.id,
                              listName: lg.name,
                              label,
                              taskIds: eligible.map((t) => t.id),
                              requiresNote,
                            })}
                            className="font-mono text-xs uppercase border border-grey-mid px-2 py-1 text-grey-light hover:border-white hover:text-white transition-colors flex-shrink-0"
                          >
                            MARK NOT REQUIRED
                          </button>
                        )}
                      </div>
                      {bucket.tasks.map(({ task, depth }) => renderTask(task, { depth, sameListIds }))}
                    </div>
                  )
                })}
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
                {canToggleFinished && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleShowFinished(lg.id) }}
                    className="w-full p-2 text-center hover:bg-grey-dark/50 transition-colors"
                  >
                    <span className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">
                      {showFinished.has(lg.id) ? 'HIDE FINISHED' : `SHOW FINISHED (${settledCount})`}
                    </span>
                  </button>
                )}
              </div>
            </Panel>
          )
        })}

        {otherGroups.map((dg) => (
          <div key={dg.dept} className="space-y-2">
            <div className="font-mono text-xs uppercase tracking-widest text-white border-b border-grey-mid pb-1">{dg.dept}</div>
            {dg.sections.map((sg) => {
              const key = `other:${dg.dept}:${sg.key}`
              const show = isEditMode || showFinished.has(key)
              const ordered = visibleOrdered(sg.tasks, show)
              const settledCount = sg.tasks.filter((t) => t.isSettled).length
              return (
                <div key={sg.key} className="space-y-2">
                  {sg.name && <div className="font-mono text-xs uppercase tracking-wider text-accent pt-1">{sg.name}</div>}
                  {ordered.map(({ task, depth }) => renderTask(task, { depth }))}
                  {settledCount > 0 && !isEditMode && (
                    <button
                      onClick={() => toggleShowFinished(key)}
                      className="w-full p-2 text-center hover:bg-grey-dark/50 transition-colors border border-grey-mid"
                    >
                      <span className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">
                        {showFinished.has(key) ? 'HIDE FINISHED' : `SHOW FINISHED (${settledCount})`}
                      </span>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ))}

        {undoError && (
          <p className="font-mono text-xs text-danger">{undoError}</p>
        )}

        {upcoming.length > 0 && (
          <Panel variant="outline" padding="md">
            <div className="font-mono text-xs uppercase tracking-wider text-grey-light mb-1">OPENS LATER</div>
            <div className="space-y-1">
              {upcoming.map((u) => (
                <div key={u.id} className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-grey-light min-w-0 truncate">
                    {u.name}{u.label ? ` · ${u.label}` : ''}
                  </span>
                  {access.canEditList && (
                    <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                      <button
                        aria-label={`UNLOCK CHECKLIST ${u.name}`}
                        onClick={() => activateChecklist(u.id, true)}
                        className="font-mono text-xs uppercase text-success hover:text-white transition-colors px-1 py-0.5"
                      >
                        UNLOCK
                      </button>
                      <button
                        aria-label={`EDIT CHECKLIST ${u.name}`}
                        onClick={() => openChecklistEditById(u.id)}
                        className="font-mono text-xs uppercase text-warning hover:text-white transition-colors px-1 py-0.5"
                      >
                        EDIT
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {listActionError && (
              <p className="mt-2 font-mono text-xs text-danger">{listActionError}</p>
            )}
          </Panel>
        )}
      </div>

      {/* Completion modal (only when not in edit mode) */}
      {!isEditMode && activeTask && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-4 border-b border-grey-mid">
            <button
              onClick={() => setActiveTask(null)}
              className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors border border-grey-mid px-3 py-2 hover:border-white"
            >
              ← BACK
            </button>
            <span className="font-mono text-xs text-grey-light">{activeTask.completionType.replace('_', ' + ')}</span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-6">
            <div>
              <h2 className="font-mono text-xl font-bold uppercase text-white">{activeTask.title}</h2>
              <RichTextContent html={activeTask.description} className="mt-2" />
              {activeTask.linkedItem && (
                <p className="font-mono text-xs text-grey-light mt-2 uppercase">
                  LINKED: {describeLinkedItem(activeTask.linkedItem)}
                </p>
              )}
              {activeTask.departmentName && (
                <p className="font-mono text-xs text-grey-light mt-1 uppercase">[{activeTask.departmentName}]</p>
              )}
              {activeTask.guide && (
                <button
                  onClick={() => requestGuide(activeTask.guide!.id, activeTask.guide!.title)}
                  className="mt-3 inline-block font-mono text-xs uppercase border border-grey-mid px-3 py-2 text-white hover:border-white transition-colors"
                >
                  VIEW GUIDE: {activeTask.guide.title}
                </button>
              )}
            </div>

            {activeTask.inProgress && outcome === 'DONE' && (
              <div className="border-l-4 border-l-warning pl-3 py-1">
                <p className="font-mono text-xs text-warning uppercase">
                  IN PROGRESS SINCE {new Date(activeTask.inProgress.since).toLocaleDateString()}
                  {activeTask.inProgress.byName ? ` · ${activeTask.inProgress.byName}` : ''}
                </p>
                {activeTask.inProgress.note && (
                  <p className="font-sans text-xs text-grey-light mt-1">{activeTask.inProgress.note}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="font-mono text-xs uppercase text-grey-light tracking-wider">
                WHAT HAPPENED?
              </label>
              <div className="grid grid-cols-1 gap-2">
                {activeAllowedOutcomes.map((o) => {
                  const selected = outcome === o
                  const tone =
                    o === 'DONE'
                      ? 'border-success text-success'
                      : o === 'PARTIAL'
                        ? 'border-warning text-warning'
                        : o === 'DID_NOT_COMPLETE'
                          ? 'border-danger text-danger'
                          : 'border-grey-mid text-white'
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setOutcome(o)}
                      className={`text-left border px-3 py-3 transition-colors ${selected ? 'bg-white text-black border-white' : `bg-transparent ${tone} hover:border-white hover:text-white`}`}
                    >
                      <div className="font-mono text-xs font-bold uppercase tracking-wider">{OUTCOME_LABELS[o]}</div>
                      <div className={`font-mono text-xs uppercase mt-0.5 ${selected ? 'text-grey-dark' : 'text-grey-light'}`}>
                        {OUTCOME_DESCRIPTIONS[o]}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {activeTask.completionType === 'READING' && outcome === 'DONE' && (
              <div className="space-y-2">
                <label className="font-mono text-xs uppercase text-grey-light tracking-wider">
                  READING — {describeBand(activeTask, activeTask.readingUnit)}
                </label>
                {(activeTask.linkedItem || activeTask.linkedItemName) && (
                  <p className="font-mono text-xs text-grey-light uppercase">
                    {activeTask.linkedItem ? describeLinkedItem(activeTask.linkedItem) : activeTask.linkedItemName}
                  </p>
                )}
                <div className="flex items-stretch gap-2">
                  <input
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    value={readingValue}
                    onChange={(e) => setReadingValue(e.target.value)}
                    placeholder={`TEMPERATURE ${activeTask.readingUnit ?? '°C'}`}
                    className="flex-1 bg-grey-dark border border-grey-mid text-white font-mono text-2xl px-3 py-3 outline-none focus:border-white placeholder:text-grey-light"
                  />
                  <div
                    className={`flex flex-col justify-center items-center px-4 border ${
                      readingValue === ''
                        ? 'border-grey-mid'
                        : readingVerdict(Number(readingValue), activeTask) === 'PASS'
                          ? 'border-success text-success'
                          : 'border-danger text-danger'
                    }`}
                  >
                    <span className="font-mono text-xs uppercase tracking-wider">
                      {readingValue === ''
                        ? '—'
                        : readingVerdict(Number(readingValue), activeTask) === 'PASS'
                          ? 'PASS'
                          : 'FAIL'}
                    </span>
                  </div>
                </div>
                {readingValue !== '' && criticalVerdict(Number(readingValue), activeTask) && (
                  <p className="font-mono text-xs text-danger uppercase">
                    ⚠ CRITICAL — OUTSIDE THE DANGER BAND. AN URGENT NOTICE GOES TO THE FLOOR.
                  </p>
                )}
                <p className="font-mono text-xs text-grey-light">
                  PASS = {describeBand(activeTask, activeTask.readingUnit)} · THE READING IS SHARED BY THE WHOLE FLOOR
                </p>
              </div>
            )}

            {(activeTask.completionType === 'TICK_NOTE' || activeTask.completionType === 'TICK_PHOTO' || outcome !== 'DONE') && (
              <div className="space-y-2">
                <label className="font-mono text-xs uppercase text-grey-light tracking-wider">
                  {outcome !== 'DONE'
                    ? `REASON${activeTask.requireOutcomeReason ? ' (REQUIRED)' : ' (OPTIONAL)'}`
                    : activeTask.completionType === 'TICK_PHOTO' ? 'NOTE (OPTIONAL)' : 'NOTE'}
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={outcome !== 'DONE' ? 'WHY? (HELPS THE FOLLOW-UP REVIEW)...' : 'ADD YOUR NOTES HERE...'}
                  className="w-full bg-grey-dark border border-grey-mid text-white font-sans text-sm px-3 py-3 outline-none focus:border-white min-h-[120px] resize-none placeholder:text-grey-light"
                />
              </div>
            )}

            {activeTask.completionType === 'TICK_PHOTO' && outcome === 'DONE' && (
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
              className={`w-full h-14 font-mono font-bold text-sm uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed ${
                outcome === 'DONE'
                  ? 'bg-success text-black'
                  : outcome === 'PARTIAL'
                    ? 'bg-warning text-black'
                    : outcome === 'DID_NOT_COMPLETE'
                      ? 'bg-danger text-black'
                      : 'bg-white text-black'
              }`}
            >
              {completing
                ? 'SAVING_'
                : outcome === 'DONE'
                  ? 'MARK DONE'
                  : outcome === 'PARTIAL'
                    ? 'SAVE PROGRESS'
                    : `MARK ${OUTCOME_LABELS[outcome]}`}
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
              className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors border border-grey-mid px-3 py-2 hover:border-white"
            >
              ← BACK
            </button>
            <span className="font-mono text-xs font-bold uppercase text-warning tracking-widest">
              {taskEditing ? 'EDIT TASK' : taskForm.parentTaskId ? 'NEW SUBTASK' : 'NEW TASK'}
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

            <div className="space-y-1">
              <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Description (optional)</label>
              <RichTextEditor
                value={taskForm.description}
                onChange={(html) => setTaskForm({ ...taskForm, description: html })}
                placeholder="Additional instructions for this task..."
              />
            </div>

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

            <Select
              data-testid="task-parent-select"
              label="Parent task (optional)"
              value={taskForm.parentTaskId}
              onChange={(e) => setTaskForm({ ...taskForm, parentTaskId: e.target.value })}
              options={[
                { value: '', label: 'NONE (TOP-LEVEL TASK)' },
                ...parentTaskOptions.map(t => ({ value: t.id, label: t.title })),
              ]}
              disabled={(taskEditing?.subtasks?.length ?? 0) > 0}
            />
            <p className="font-mono text-xs uppercase text-grey-light">
              LINK THIS TASK UNDER A PARENT. SUBTASKS CANNOT HAVE THEIR OWN SUBTASKS.
            </p>

            {taskEditing && !taskEditing.parentTaskId && (
              <div className="border border-grey-mid p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs uppercase text-grey-light tracking-wider">
                    Subtasks ({taskEditing.subtasks?.length ?? 0})
                  </span>
                  <button
                    type="button"
                    onClick={() => openSubtaskCreate(taskEditing)}
                    className="font-mono text-xs uppercase text-info hover:text-white transition-colors"
                  >
                    + ADD SUBTASK
                  </button>
                </div>
                {(taskEditing.subtasks?.length ?? 0) === 0 ? (
                  <p className="font-mono text-xs uppercase text-grey-light">NO SUBTASKS YET.</p>
                ) : (
                  <div className="space-y-1">
                    {taskEditing.subtasks!.map((s) => {
                      const full = editTasks.find(et => et.id === s.id)
                      return (
                        <div key={s.id} className="flex items-center justify-between gap-2 border border-grey-mid px-2 py-1.5">
                          <span className="font-mono text-xs uppercase text-white truncate">{s.title}</span>
                          {full && (
                            <button
                              type="button"
                              onClick={() => openTaskEdit(full)}
                              className="font-mono text-xs uppercase text-grey-light hover:text-white flex-shrink-0"
                            >
                              EDIT
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Select label="Completion Type" value={taskForm.completionType}
                onChange={(e) => setTaskForm({ ...taskForm, completionType: e.target.value })}
                options={COMPLETION_OPTIONS} />
              <Select label="Schedule" value={taskForm.scheduleType}
                onChange={(e) => setTaskForm({ ...taskForm, scheduleType: e.target.value, scheduleDays: [] })}
                options={SCHEDULE_OPTIONS} />
            </div>

            <OutcomeOptions
              allowed={taskForm.allowedOutcomes}
              requireReason={taskForm.requireOutcomeReason}
              onChange={(allowedOutcomes, requireOutcomeReason) => setTaskForm({ ...taskForm, allowedOutcomes, requireOutcomeReason })}
              canOverride
              override={taskForm.overrideOutcomes}
              onOverrideChange={(overrideOutcomes) => setTaskForm({ ...taskForm, overrideOutcomes })}
            />

            {taskForm.scheduleType === 'WEEKLY' && (
              <div className="flex flex-col gap-1">
                <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Active Days</label>
                <div className="flex gap-1">
                  {WEEK_ORDER.map((dow) => (
                    <button key={DAYS[dow]} type="button" onClick={() => toggleDay(dow)}
                      className={`font-mono text-xs px-2 py-1.5 border transition-colors ${
                        taskForm.scheduleDays.includes(dow)
                          ? 'bg-warning text-black border-warning'
                          : 'bg-transparent text-grey-light border-grey-mid hover:border-white hover:text-white'
                      }`}
                    >
                      {DAYS[dow]}
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

            <div className="border border-grey-mid p-3 space-y-3">
              <span className="font-mono text-xs uppercase text-grey-light tracking-wider">Links</span>
              {editGuides.length > 0 && (
                <Combobox
                  label="Required training (competency)"
                  options={editGuides.map(m => ({ value: m.id, label: m.title, description: m.description ?? undefined }))}
                  selected={taskForm.competencyGuideIds}
                  onChange={(ids) => setTaskForm({ ...taskForm, competencyGuideIds: ids })}
                  placeholder="Search guides..."
                />
              )}

              <Combobox
                label="Lists (which checklists this task appears in)"
                options={editChecklists.map(c => ({ value: c.id, label: c.name }))}
                selected={taskForm.checklistIds}
                onChange={(ids) => setTaskForm({ ...taskForm, checklistIds: ids })}
                placeholder="Search lists..."
              />

              <Combobox
                label="Assigned to (optional)"
                multiple={false}
                options={editAssignees.map(a => ({ value: a.id, label: a.name }))}
                selected={taskForm.assignedToStaffId ? [taskForm.assignedToStaffId] : []}
                onChange={(ids) => setTaskForm({ ...taskForm, assignedToStaffId: ids[0] ?? '' })}
                placeholder="Search people..."
              />
              <p className="font-mono text-xs uppercase text-grey-light">
                DEPARTMENT/SECTION SCOPE THE TASK. LISTS DECIDE WHICH CHECKLISTS SHOW IT.
              </p>
            </div>

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
            <button data-testid="worker-task-save" onClick={handleTaskSave} disabled={taskSaving}
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
              className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors border border-grey-mid px-3 py-2 hover:border-white">
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

            <div className="border border-grey-mid p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs uppercase text-grey-light tracking-wider">Schedule (optional)</span>
                <span className="font-mono text-xs uppercase text-grey-light">
                  {clSchedules.length > 0 ? `${clSchedules.length} WINDOW${clSchedules.length !== 1 ? 'S' : ''}` : 'EVERY DAY'}
                </span>
              </div>
              <div className="flex flex-wrap items-end gap-2 border-b border-grey-mid pb-2">
                <div className="space-y-1">
                  <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Appears from (global)</label>
                  <input
                    type="time"
                    value={clAppearFrom}
                    onChange={(e) => setClAppearFrom(e.target.value)}
                    className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-xs uppercase text-grey-light tracking-wider">To (optional)</label>
                  <input
                    type="time"
                    value={clGlobalTo}
                    onChange={(e) => setClGlobalTo(e.target.value)}
                    className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={applyGlobalSchedule}
                  disabled={clSchedules.length === 0}
                  className="h-9 px-3 border border-grey-mid text-grey-light font-mono text-xs uppercase hover:border-white hover:text-white disabled:opacity-40"
                >
                  APPLY TO CHECKED DAYS
                </button>
              </div>
              {WEEK_ORDER.map((dow) => {
                const dayName = DAYS[dow]
                const rows = clSchedules.map((s, i) => ({ s, i })).filter(({ s }) => s.dayOfWeek === dow)
                return (
                  <div key={dayName} className="space-y-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        aria-label={`SCHEDULE DAY ${dayName}`}
                        checked={rows.length > 0}
                        onChange={() => toggleScheduleDay(dow)}
                        className="w-4 h-4 accent-warning"
                      />
                      <span className="font-mono text-xs uppercase text-white w-9">{dayName}</span>
                      {rows.length === 0 && <span className="font-mono text-xs uppercase text-grey-light">CLOSED</span>}
                    </label>
                    {rows.map(({ s, i }) => (
                      <div key={i} className="flex items-center gap-2 pl-6">
                        <input
                          type="time"
                          aria-label={`SCHEDULE FROM ${dayName} ${i}`}
                          value={s.fromTime}
                          onChange={(e) => updateScheduleWindow(i, { fromTime: e.target.value })}
                          className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white"
                        />
                        <span className="font-mono text-xs uppercase text-grey-light">TO</span>
                        <input
                          type="time"
                          aria-label={`SCHEDULE TO ${dayName} ${i}`}
                          value={s.toTime}
                          onChange={(e) => updateScheduleWindow(i, { toTime: e.target.value })}
                          className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white"
                        />
                        <button
                          type="button"
                          aria-label={`REMOVE WINDOW ${dayName} ${i}`}
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
                        aria-label={`ADD WINDOW ${dayName}`}
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
                LEAVE EVERY DAY UNCHECKED TO USE THE GLOBAL APPEARS FROM TIME EVERY DAY. APPLY COPIES THE GLOBAL TIME TO CHECKED DAYS. CLEAR A &ldquo;TO&rdquo; TIME TO STAY OPEN TO END OF DAY.
              </p>
            </div>

            <div className="border border-grey-mid p-3 space-y-3">
              <span className="font-mono text-xs uppercase text-grey-light tracking-wider">Links</span>
              <Combobox
                label="People / audience (who sees this list)"
                options={audienceOptionList}
                selected={clAudiences.map((a) => `${a.kind}:${a.targetId}`)}
                onChange={(keys) => setClAudiences(keys.map((key) => {
                  const i = key.indexOf(':')
                  return { kind: key.slice(0, i), targetId: key.slice(i + 1) }
                }))}
                placeholder="Search departments, sections, positions..."
              />
              <Combobox
                options={clEventOptions}
                selected={clEventIds}
                onChange={setClEventIds}
                placeholder="+ LINK AN EVENT..."
              />
              <p className="font-mono text-xs uppercase text-grey-light">
                THE LIST OPENS ACROSS EACH LINKED EVENT&apos;S DATE/TIME AND CLOSES AFTER IT.
              </p>
              <p className="font-mono text-xs uppercase text-grey-light">
                A LIST WITH NO AUDIENCE KEEPS THE LEGACY DEPARTMENT/SECTION SCOPING.
              </p>
            </div>

            {clEditing !== 'new' && (clEditing?.appearFromTime || clEditing?.schedules?.length) && access.canEditList && (
              <div className="flex items-center justify-between gap-2 border border-grey-mid p-2">
                <span className="font-mono text-xs uppercase text-grey-light">
                  {clEditing.activatedToday
                    ? 'FORCED OPEN FOR TODAY'
                    : 'NOT OPEN YET TODAY'}
                </span>
                {clEditing.activatedToday ? (
                  <button onClick={() => toggleChecklistActivation(false)}
                    className="font-mono text-xs uppercase border border-grey-mid px-2 py-1 text-grey-light hover:border-white hover:text-white transition-colors">
                    DEACTIVATE
                  </button>
                ) : (
                  <button onClick={() => toggleChecklistActivation(true)}
                    className="font-mono text-xs uppercase border border-success/40 px-2 py-1 text-success hover:bg-success hover:text-black transition-colors">
                    ACTIVATE NOW
                  </button>
                )}
              </div>
            )}

            <OutcomeOptions
              allowed={clAllowedOutcomes}
              requireReason={clRequireReason}
              onChange={(allowedOutcomes, requireOutcomeReason) => { setClAllowedOutcomes(allowedOutcomes); setClRequireReason(requireOutcomeReason) }}
              inheritedLabel="APPLIES TO EVERY TASK IN THIS LIST UNLESS THE TASK OVERRIDES IT"
            />

            <div className="border border-grey-mid p-3 space-y-1">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clMultiDay}
                  onChange={(e) => setClMultiDay(e.target.checked)}
                  className="mt-0.5 accent-white"
                />
                <span className="font-mono text-xs uppercase text-white">SIDE WORK / MULTI-DAY — KEEP IN PROGRESS UNTIL DONE</span>
              </label>
              <p className="font-mono text-xs uppercase text-grey-light pl-6">
                A PARTIAL ON THIS LIST STAYS ON THE FLOOR ACROSS DAYS. WITHOUT THIS, A PARTIAL RESETS AT THE NEXT VENUE DAY.
              </p>
            </div>

            <div className="space-y-1">
              <label className="font-mono text-xs uppercase text-grey-light tracking-wider">
                Tasks ({clSelected.length})
              </label>
              <datalist id="worker-checklist-groups">
                {clGroupOptions.map((label) => <option key={label} value={label} />)}
              </datalist>
              <Panel variant="outline" padding="none" className="divide-y divide-grey-mid">
                {clSelected.length === 0 ? (
                  <div className="p-4 text-center font-mono text-xs text-grey-light">
                    NO TASKS SELECTED
                  </div>
                ) : (
                  clSelected.map((id, i) => {
                    const found = editTasks.find(et => et.id === id)
                    return (
                      <div key={id} className="px-3 py-2 bg-grey-dark space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-white truncate">
                          {i + 1}. {found?.title ?? '(task removed)'}
                        </span>
                        <div className="flex gap-2 flex-shrink-0">
                          {found && access.canEditTask && (
                            <button onClick={() => openTaskEdit(found)}
                              className="font-mono text-xs uppercase text-grey-light hover:text-white px-1 py-0.5">
                              EDIT
                            </button>
                          )}
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
                        <div className="flex items-center gap-2">
                          <label className="font-mono text-xs uppercase text-grey-light flex-shrink-0">GROUP</label>
                          <input
                            list="worker-checklist-groups"
                            aria-label={`GROUP FOR ${found?.title ?? id}`}
                            value={clGroups[id] ?? ''}
                            onChange={(e) => setClGroups((prev) => ({ ...prev, [id]: e.target.value }))}
                            placeholder="OPTIONAL (E.G. OUTSIDE)"
                            className="flex-1 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white placeholder:text-grey-light"
                          />
                        </div>
                      </div>
                      )
                    })
                  )}
              </Panel>
                <Combobox
                options={editTasks.filter(et => !clSelected.includes(et.id)).map(et => ({ value: et.id, label: et.title, description: richTextToPlainText(et.description) }))}
                selected={clSelected}
                onChange={(ids) => setClSelected(ids)}
                placeholder="+ ADD A TASK..."
              />
              {access.canCreateTask && (
                <div className="pt-1">
                  <button data-testid="checklist-create-task" onClick={() => openTaskCreate({ fromList: true })}
                    className="w-full border border-dashed border-grey-mid py-2 font-mono text-xs uppercase text-warning hover:border-warning transition-colors">
                    + CREATE NEW TASK
                  </button>
                  <p className="font-mono text-xs uppercase text-grey-light mt-1">
                    A NEW TASK SAVES IMMEDIATELY — CANCELLING THIS LIST WON&apos;T DELETE IT.
                  </p>
                </div>
              )}
            </div>

            {clError && <p className="font-mono text-xs text-danger">{clError}</p>}
          </div>

          <div className="px-4 pb-8 pt-4 border-t border-grey-mid flex gap-2">
            <button data-testid="worker-checklist-save" onClick={saveChecklist} disabled={clSaving}
              className="flex-1 h-14 bg-warning text-black font-mono font-bold text-sm uppercase tracking-widest hover:opacity-90 disabled:opacity-40">
              {clSaving ? 'SAVING_' : 'SAVE'}
            </button>
            <button onClick={() => setClModalOpen(false)}
              className="flex-1 h-14 border border-grey-mid text-white font-mono font-bold text-sm uppercase tracking-widest hover:border-white transition-colors">
              CANCEL
            </button>
            {clEditing !== 'new' && access.canDeleteList && (
              <button onClick={deleteChecklist}
                className="h-14 px-4 border border-danger text-danger font-mono font-bold text-xs uppercase tracking-widest hover:bg-danger hover:text-black transition-colors">
                DEL
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bulk "mark group not required" confirmation */}
      {bulkGroup && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-grey-dark border border-warning/60 p-4 space-y-3">
            <div className="font-mono text-xs font-bold uppercase tracking-widest text-warning">
              MARK GROUP NOT REQUIRED?
            </div>
            <p className="font-mono text-xs uppercase text-white">
              {bulkGroup.listName} - GROUP {bulkGroup.label}
            </p>
            <p className="font-sans text-xs text-grey-light">
              This will mark <strong className="text-white">{bulkGroup.taskIds.length} task{bulkGroup.taskIds.length === 1 ? '' : 's'}</strong> as
              NOT REQUIRED for today. It is not the same as DONE: the tasks stay on the record, do not count
              towards completion and can be reopened one at a time with REOPEN.
            </p>
            <p className="font-mono text-xs uppercase text-warning">
              ONLY DO THIS IF THE GROUP REALLY IS NOT NEEDED TODAY.
            </p>
            <div className="space-y-1">
              <label className="font-mono text-xs uppercase text-grey-light">
                REASON {bulkGroup.requiresNote ? '(REQUIRED)' : '(OPTIONAL)'}
              </label>
              <textarea
                value={bulkNote}
                onChange={(e) => setBulkNote(e.target.value)}
                rows={2}
                placeholder="WHY IS THIS GROUP NOT NEEDED?"
                className="w-full bg-black border border-grey-mid text-white font-sans text-xs px-2 py-1.5 outline-none focus:border-white placeholder:text-grey-light"
              />
            </div>
            {bulkError && <p className="font-mono text-xs text-danger">{bulkError}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setBulkGroup(null); setBulkError('') }}
                disabled={bulkSaving}
                className="flex-1 h-11 border border-grey-mid text-white font-mono text-xs uppercase tracking-wider hover:border-white disabled:opacity-40"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={submitBulkNotRequired}
                disabled={bulkSaving}
                className="flex-1 h-11 bg-warning text-black font-mono font-bold text-xs uppercase tracking-wider hover:opacity-90 disabled:opacity-40"
              >
                {bulkSaving ? 'SAVING_' : 'MARK NOT REQUIRED'}
              </button>
            </div>
          </div>
        </div>
      )}

      {guidePopupNodes}
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
