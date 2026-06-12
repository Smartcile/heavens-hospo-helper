'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'

interface Task {
  id: string
  title: string
  description: string | null
  venueId: string
  departmentId: string | null
  completionType: string
  scheduleType: string
  scheduleDays: number[]
  customCron: string | null
  isActive: boolean
  sortOrder: number
  department: { id: string; name: string; colour: string | null } | null
}

interface Venue { id: string; name: string }
interface Department { id: string; name: string; venueId: string; colour: string | null }

interface FormState {
  title: string
  description: string
  venueId: string
  departmentId: string
  completionType: string
  scheduleType: string
  scheduleDays: number[]
  customCron: string
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  venueId: '',
  departmentId: '',
  completionType: 'TICK',
  scheduleType: 'DAILY',
  scheduleDays: [],
  customCron: '',
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
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterVenue, setFilterVenue] = useState(role === 'MANAGER' ? sessionVenueId : '')
  const [filterDept, setFilterDept] = useState('')

  async function load() {
    const params = new URLSearchParams()
    if (filterVenue) params.set('venueId', filterVenue)
    if (filterDept) params.set('departmentId', filterDept)

    const [tR, vR, dR] = await Promise.all([
      fetch(`/api/admin/tasks?${params}`),
      fetch('/api/admin/venues'),
      fetch('/api/admin/departments'),
    ])
    const [tasksData, venueData, deptData] = await Promise.all([tR.json(), vR.json(), dR.json()])
    setTasks(tasksData)
    setVenues(venueData)
    setDepartments(deptData)
    setLoading(false)
  }

  useEffect(() => { load() }, [filterVenue, filterDept])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, venueId: role === 'MANAGER' ? sessionVenueId : '' })
    setError('')
    setModalOpen(true)
  }

  function openEdit(t: Task) {
    setEditing(t)
    setForm({
      title: t.title,
      description: t.description ?? '',
      venueId: t.venueId,
      departmentId: t.departmentId ?? '',
      completionType: t.completionType,
      scheduleType: t.scheduleType,
      scheduleDays: t.scheduleDays,
      customCron: t.customCron ?? '',
    })
    setError('')
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.title.trim() || !form.venueId) {
      setError('TITLE AND VENUE ARE REQUIRED')
      return
    }
    if (form.scheduleType === 'WEEKLY' && form.scheduleDays.length === 0) {
      setError('SELECT AT LEAST ONE DAY FOR WEEKLY SCHEDULE')
      return
    }
    if (form.scheduleType === 'CUSTOM' && !form.customCron.trim()) {
      setError('CRON EXPRESSION IS REQUIRED FOR CUSTOM SCHEDULE')
      return
    }

    setSaving(true)
    setError('')

    const url = editing ? `/api/admin/tasks/${editing.id}` : '/api/admin/tasks'
    const method = editing ? 'PUT' : 'POST'

    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        departmentId: form.departmentId || null,
        customCron: form.scheduleType === 'CUSTOM' ? form.customCron : null,
        scheduleDays: form.scheduleType === 'DAILY' ? [] : form.scheduleDays,
      }),
    })

    if (!r.ok) {
      const data = await r.json()
      setError(data.error ?? 'SAVE FAILED')
      setSaving(false)
      return
    }

    setSaving(false)
    setModalOpen(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('SOFT-DELETE THIS TASK?')) return
    await fetch(`/api/admin/tasks/${id}`, { method: 'DELETE' })
    load()
  }

  async function toggleActive(t: Task) {
    await fetch(`/api/admin/tasks/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !t.isActive }),
    })
    load()
  }

  function toggleDay(day: number) {
    const days = form.scheduleDays.includes(day)
      ? form.scheduleDays.filter((d) => d !== day)
      : [...form.scheduleDays, day].sort()
    setForm({ ...form, scheduleDays: days })
  }

  const venueOptions = venues.map((v) => ({ value: v.id, label: v.name }))
  const filterDeptOptions = [
    { value: '', label: 'ALL DEPARTMENTS' },
    ...departments
      .filter((d) => !filterVenue || d.venueId === filterVenue)
      .map((d) => ({ value: d.id, label: d.name })),
  ]
  const formDeptOptions = [
    { value: '', label: 'NO DEPARTMENT' },
    ...departments
      .filter((d) => d.venueId === form.venueId)
      .map((d) => ({ value: d.id, label: d.name })),
  ]

  // Group tasks by department
  const grouped = tasks.reduce<Record<string, { dept: Task['department']; tasks: Task[] }>>(
    (acc, t) => {
      const key = t.departmentId ?? 'none'
      if (!acc[key]) acc[key] = { dept: t.department, tasks: [] }
      acc[key].tasks.push(t)
      return acc
    },
    {}
  )

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest">TASKS</h1>
        <Button onClick={openCreate} size="sm">+ NEW TASK</Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        {role === 'ADMIN' && (
          <div className="w-48">
            <Select
              value={filterVenue}
              onChange={(e) => { setFilterVenue(e.target.value); setFilterDept('') }}
              options={[{ value: '', label: 'ALL VENUES' }, ...venueOptions]}
            />
          </div>
        )}
        <div className="w-52">
          <Select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            options={filterDeptOptions}
          />
        </div>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([key, group]) => (
            <div key={key}>
              <div className="flex items-center gap-2 mb-2">
                {group.dept?.colour && (
                  <div className="w-2 h-2" style={{ backgroundColor: group.dept.colour }} />
                )}
                <h2 className="font-mono text-xs uppercase tracking-widest text-grey-light">
                  {group.dept?.name ?? 'NO DEPARTMENT'}
                </h2>
              </div>
              <div className="space-y-1">
                {group.tasks.map((t) => (
                  <div key={t.id} className="bg-grey-dark border border-grey-mid px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-1.5 h-1.5 flex-shrink-0 ${t.isActive ? 'bg-success' : 'bg-grey-mid'}`} />
                      <div className="min-w-0">
                        <span className="font-mono text-sm font-semibold uppercase text-white">{t.title}</span>
                        {t.description && (
                          <p className="font-mono text-xs text-grey-light truncate">{t.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <Badge>{t.scheduleType}</Badge>
                      <Badge>{t.completionType.replace('_', ' + ')}</Badge>
                      <button onClick={() => toggleActive(t)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">
                        {t.isActive ? 'OFF' : 'ON'}
                      </button>
                      <button onClick={() => openEdit(t)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">
                        EDIT
                      </button>
                      <button onClick={() => handleDelete(t.id)} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">
                        DEL
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {tasks.length === 0 && (
            <p className="font-mono text-xs text-grey-light">NO TASKS FOUND.</p>
          )}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'EDIT TASK' : 'NEW TASK'} size="lg">
        <div className="space-y-4">
          <Input
            label="Task Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="WIPE DOWN ALL BAR SURFACES"
          />
          <Textarea
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Additional instructions for this task..."
          />
          <div className="grid grid-cols-2 gap-3">
            {(role === 'ADMIN' || !editing) && (
              <Select
                label="Venue"
                value={form.venueId}
                onChange={(e) => setForm({ ...form, venueId: e.target.value, departmentId: '' })}
                options={venueOptions}
                placeholder="SELECT VENUE"
              />
            )}
            <Select
              label="Department"
              value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
              options={formDeptOptions}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Completion Type"
              value={form.completionType}
              onChange={(e) => setForm({ ...form, completionType: e.target.value })}
              options={COMPLETION_OPTIONS}
            />
            <Select
              label="Schedule"
              value={form.scheduleType}
              onChange={(e) => setForm({ ...form, scheduleType: e.target.value, scheduleDays: [] })}
              options={SCHEDULE_OPTIONS}
            />
          </div>

          {form.scheduleType === 'WEEKLY' && (
            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Active Days</label>
              <div className="flex gap-1">
                {DAYS.map((day, i) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`font-mono text-xs px-2 py-1.5 border transition-colors ${
                      form.scheduleDays.includes(i)
                        ? 'bg-white text-black border-white'
                        : 'bg-transparent text-grey-light border-grey-mid hover:border-white hover:text-white'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}

          {form.scheduleType === 'CUSTOM' && (
            <div className="space-y-1">
              <Input
                label="Cron Expression"
                value={form.customCron}
                onChange={(e) => setForm({ ...form, customCron: e.target.value })}
                placeholder="0 8 * * 1-5"
                className="font-mono"
              />
              <p className="font-mono text-xs text-grey-light">
                FORMAT: MIN HOUR DOM MON DOW — e.g. 0 8 * * 1-5 (weekdays at 8am)
              </p>
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
