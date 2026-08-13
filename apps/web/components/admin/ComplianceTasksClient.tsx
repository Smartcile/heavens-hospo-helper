'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getActiveVenueId } from '@/lib/active-venue'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import {
  describeBand,
  GFMP_DEFAULTS,
  gfmpDefaultFor,
} from '@/lib/food-safety'
import { describeSchedule } from '@/lib/scheduling'
import { cn } from '@/lib/utils'

interface ComplianceTasksClientProps {
  role: string
  sessionVenueId: string
  defaultVenueId?: string | null
}

interface CatalogItem {
  id: string
  name: string
  storageType: string
  unit: string
}

interface SummaryTask {
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
  isOneOff: boolean
  dueDate: string | null
  status: string
  hsCategory: string | null
  linkedItemId: string | null
  readingUnit: string | null
  readingMin: number | null
  readingMax: number | null
  criticalMin: number | null
  criticalMax: number | null
  createdAt: string
  department: { id: string; name: string; colour: string } | null
  section: { id: string; name: string } | null
  linkedItem: { id: string; name: string; storageType: string } | null
  completions: { id: string; value: number | null; valueStatus: string; completedAt: string }[]
  openAlertCount: number
}

interface SummaryData {
  health: { provedX: number; provedY: number; alertX: number; alertY: number }
  counts: { active: number; draft: number; archived: number }
  tasks: SummaryTask[]
  catalog: CatalogItem[]
  todayKey: string
}

const CATEGORIES = [
  { value: 'FOOD', label: 'FOOD' },
  { value: 'EQUIPMENT', label: 'EQUIPMENT' },
  { value: 'TEAM', label: 'TEAM' },
  { value: 'FACILITY', label: 'FACILITY' },
]

const GFMP_PRESETS = [
  { key: 'FRIDGE', label: 'FRIDGE' },
  { key: 'FREEZER', label: 'FREEZER' },
  { key: 'COOK', label: 'COOK' },
  { key: 'REHEAT', label: 'REHEAT' },
  { key: 'HOT_HOLD', label: 'HOT HOLD' },
  { key: 'COOL', label: 'COOL' },
  { key: 'PROBE_CAL', label: 'PROBE CAL' },
] as const

interface FormState {
  title: string
  description: string
  hsCategory: string
  departmentId: string
  sectionId: string
  completionType: string
  status: string
  scheduleType: string
  scheduleDays: number[]
  monthlyOption: string
  monthlyDay: string
  intervalMonths: number
  isOneOff: boolean
  linkedItemId: string
  readingUnit: string
  readingMin: string
  readingMax: string
  criticalMin: string
  criticalMax: string
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  hsCategory: 'FOOD',
  departmentId: '',
  sectionId: '',
  completionType: 'READING',
  status: 'ACTIVE',
  scheduleType: 'DAILY',
  scheduleDays: [],
  monthlyOption: 'FIRST_DAY',
  monthlyDay: '1',
  intervalMonths: 1,
  isOneOff: false,
  linkedItemId: '',
  readingUnit: '°C',
  readingMin: '',
  readingMax: '',
  criticalMin: '',
  criticalMax: '',
}

function numOrNull(v: string): number | null {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function passBadge(task: SummaryTask): { pass: number; total: number } {
  const cs = task.completions
  return { pass: cs.filter((c) => c.valueStatus === 'PASS').length, total: cs.length }
}

function lastCompleted(task: SummaryTask): string | null {
  const cs = task.completions
  if (cs.length === 0) return null
  const latest = cs.reduce((a, b) => (a.completedAt > b.completedAt ? a : b))
  return new Date(latest.completedAt).toLocaleDateString()
}

export function ComplianceTasksClient({ role, sessionVenueId, defaultVenueId }: ComplianceTasksClientProps) {
  const venueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)
  const [data, setData] = useState<SummaryData | null>(null)
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [sections, setSections] = useState<{ id: string; name: string; departmentId: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [statusTab, setStatusTab] = useState<'ACTIVE' | 'DRAFT' | 'ARCHIVED'>('ACTIVE')
  const [view, setView] = useState<'table' | 'grid'>('table')
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('ALL')
  const [editing, setEditing] = useState<null | 'new' | SummaryTask>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [itemSearch, setItemSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!venueId) return
    setLoading(true)
    const venueParam = `?venueId=${venueId}`
    const [sumRes, deptRes, secRes] = await Promise.all([
      fetch(`/api/admin/compliance/summary${venueParam}`),
      fetch(`/api/admin/departments${venueParam}`),
      fetch(`/api/admin/sections${venueParam}`),
    ])
    if (sumRes.ok) setData(await sumRes.json())
    if (deptRes.ok) setDepartments(await deptRes.json())
    if (secRes.ok) setSections(await secRes.json())
    setLoading(false)
  }, [venueId])

  useEffect(() => { load() }, [load])

  const openCreate = useCallback((category?: string) => {
    setForm({ ...EMPTY_FORM, hsCategory: category ?? 'FOOD' })
    setItemSearch('')
    setEditing('new')
    setError('')
  }, [])

  const openEdit = useCallback((t: SummaryTask) => {
    setForm({
      title: t.title,
      description: t.description ?? '',
      hsCategory: t.hsCategory ?? 'FOOD',
      departmentId: t.departmentId ?? '',
      sectionId: t.sectionId ?? '',
      completionType: t.completionType,
      status: t.status,
      scheduleType: t.isOneOff ? 'ONEOFF' : t.scheduleType,
      scheduleDays: t.scheduleDays ?? [],
      monthlyOption: t.monthlyOption ?? 'FIRST_DAY',
      monthlyDay: String(t.monthlyDay ?? 1),
      intervalMonths: t.intervalMonths ?? 1,
      isOneOff: t.isOneOff,
      linkedItemId: t.linkedItemId ?? '',
      readingUnit: t.readingUnit ?? '°C',
      readingMin: t.readingMin != null ? String(t.readingMin) : '',
      readingMax: t.readingMax != null ? String(t.readingMax) : '',
      criticalMin: t.criticalMin != null ? String(t.criticalMin) : '',
      criticalMax: t.criticalMax != null ? String(t.criticalMax) : '',
    })
    setItemSearch('')
    setEditing(t)
    setError('')
  }, [])

  const applyPreset = useCallback((key: string) => {
    const p = GFMP_DEFAULTS[key]
    if (!p) return
    setForm((f) => ({
      ...f,
      readingUnit: p.unit,
      readingMin: p.readingMin != null ? String(p.readingMin) : '',
      readingMax: p.readingMax != null ? String(p.readingMax) : '',
      criticalMin: p.criticalMin != null ? String(p.criticalMin) : '',
      criticalMax: p.criticalMax != null ? String(p.criticalMax) : '',
    }))
  }, [])

  const handleItemLink = useCallback((itemId: string) => {
    const item = data?.catalog.find((c) => c.id === itemId)
    setForm((f) => ({
      ...f,
      linkedItemId: itemId,
      readingUnit: f.readingUnit || '°C',
      ...(item && f.readingMin === '' && f.readingMax === ''
        ? (() => { const g = gfmpDefaultFor(item.storageType); return {
            readingUnit: g.unit,
            readingMin: g.readingMin != null ? String(g.readingMin) : '',
            readingMax: g.readingMax != null ? String(g.readingMax) : '',
            criticalMin: g.criticalMin != null ? String(g.criticalMin) : '',
            criticalMax: g.criticalMax != null ? String(g.criticalMax) : '',
          } })()
        : {}),
    }))
    setItemSearch('')
  }, [data])

  const handleSave = async () => {
    if (!venueId || !form.title.trim() || !editing) return
    setSaving(true)
    setError('')
    const isReading = form.completionType === 'READING'
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      venueId,
      departmentId: form.departmentId || null,
      sectionId: form.sectionId || null,
      hsCategory: form.hsCategory || null,
      completionType: form.completionType,
      status: form.status,
      isOneOff: form.scheduleType === 'ONEOFF',
      scheduleType: form.scheduleType === 'ONEOFF' ? 'DAILY' : form.scheduleType,
      scheduleDays: form.scheduleType === 'WEEKLY' ? form.scheduleDays : [],
      monthlyOption: form.scheduleType === 'MONTHLY' ? form.monthlyOption : null,
      monthlyDay: form.scheduleType === 'MONTHLY' && form.monthlyOption === 'SPECIFIC_DAY' ? Number(form.monthlyDay) || 1 : null,
      intervalMonths: form.scheduleType === 'MONTHLY' ? form.intervalMonths : 1,
      linkedItemId: form.linkedItemId || null,
      ...(isReading ? {
        readingUnit: form.readingUnit || '°C',
        readingMin: numOrNull(form.readingMin),
        readingMax: numOrNull(form.readingMax),
        criticalMin: numOrNull(form.criticalMin),
        criticalMax: numOrNull(form.criticalMax),
      } : {}),
    }
    try {
      const url = editing === 'new' ? '/api/admin/tasks' : `/api/admin/tasks/${editing.id}`
      const r = await fetch(url, {
        method: editing === 'new' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => null)
        setError(j?.error ?? 'SAVE FAILED')
        return
      }
      setEditing(null)
      load()
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (t: SummaryTask, status: string) => {
    await fetch(`/api/admin/tasks/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    load()
  }

  const removeTask = async (t: SummaryTask) => {
    if (!window.confirm(`DELETE ${t.title}?`)) return
    await fetch(`/api/admin/tasks/${t.id}`, { method: 'DELETE' })
    load()
  }

  const duplicate = async (t: SummaryTask) => {
    const payload = {
      title: `${t.title} (COPY)`,
      description: t.description ?? null,
      venueId: t.venueId,
      departmentId: t.departmentId,
      sectionId: t.sectionId,
      hsCategory: t.hsCategory,
      completionType: t.completionType,
      status: 'DRAFT',
      scheduleType: t.scheduleType,
      scheduleDays: t.scheduleDays,
      customCron: t.customCron,
      intervalMonths: t.intervalMonths,
      monthlyOption: t.monthlyOption,
      monthlyDay: t.monthlyDay,
      isOneOff: t.isOneOff,
      linkedItemId: t.linkedItemId,
      readingUnit: t.readingUnit,
      readingMin: t.readingMin,
      readingMax: t.readingMax,
      criticalMin: t.criticalMin,
      criticalMax: t.criticalMax,
    }
    const r = await fetch('/api/admin/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (r.ok) {
      const created = await r.json()
      openEdit({ ...created, completions: [], openAlertCount: 0, department: null, section: null, linkedItem: null, venueId })
    }
  }

  const toggleDay = (d: number) => {
    setForm((f) => ({
      ...f,
      scheduleDays: f.scheduleDays.includes(d) ? f.scheduleDays.filter((x) => x !== d) : [...f.scheduleDays, d],
    }))
  }

  const filtered = useMemo(() => {
    if (!data) return []
    let list = data.tasks
    if (statusTab === 'ACTIVE') list = list.filter((t) => t.status === 'ACTIVE' || t.status == null)
    else list = list.filter((t) => t.status === statusTab)
    if (catFilter !== 'ALL') list = list.filter((t) => (t.hsCategory ?? '') === catFilter)
    if (search.trim()) {
      const q = search.trim().toUpperCase()
      list = list.filter(
        (t) =>
          t.title.includes(q) ||
          (t.linkedItem?.name ?? '').toUpperCase().includes(q) ||
          (t.department?.name ?? '').includes(q),
      )
    }
    return list
  }, [data, statusTab, catFilter, search])

  const grouped = useMemo(() => {
    const groups = new Map<string, SummaryTask[]>()
    for (const t of filtered) {
      const key = t.hsCategory ?? 'GENERAL'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(t)
    }
    return [...groups.entries()]
  }, [filtered])

  const linkedName = (id: string) => data?.catalog.find((c) => c.id === id)?.name ?? ''

  const sectionOptions = form.departmentId
    ? sections.filter((s) => s.departmentId === form.departmentId)
    : sections

  const itemMatches = itemSearch.trim()
    ? (data?.catalog ?? []).filter((c) => c.name.toUpperCase().includes(itemSearch.trim().toUpperCase())).slice(0, 8)
    : []

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest">TASK MANAGER</h1>
          <p className="font-mono text-xs text-grey-light mt-0.5">FOOD HEALTH &amp; SAFETY — NZ GFMP</p>
        </div>
        <Button size="sm" onClick={() => openCreate()}>+ ADD TASK</Button>
      </div>

      {/* Health widget */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="border border-grey-mid p-3 space-y-2">
          <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">TASKS PROVED</h3>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl text-white">{data?.health.provedX ?? '–'}</span>
            <span className="font-mono text-sm text-grey-light">/ {data?.health.provedY ?? '–'}</span>
            <span className="font-mono text-[10px] uppercase text-grey-light ml-auto">PASS IN LAST 7 DAYS</span>
          </div>
        </div>
        <div className="border border-grey-mid p-3 space-y-2">
          <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">TASKS WITH ALERTS</h3>
          <div className="flex items-baseline gap-2">
            <span className={cn('font-mono text-2xl', (data?.health.alertX ?? 0) > 0 ? 'text-danger' : 'text-white')}>
              {data?.health.alertX ?? '–'}
            </span>
            <span className="font-mono text-sm text-grey-light">/ {data?.health.alertY ?? '–'}</span>
            <span className="font-mono text-[10px] uppercase text-grey-light ml-auto">OPEN ALERTS</span>
          </div>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 border-b border-grey-mid">
        {(['ACTIVE', 'DRAFT', 'ARCHIVED'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusTab(s)}
            className={cn(
              'px-4 py-2 font-mono text-xs uppercase tracking-wider border-b-2 transition-colors',
              statusTab === s ? 'text-white border-b-white' : 'text-grey-light border-b-transparent hover:text-white',
            )}
          >
            {s} TASKS <span className="text-grey-light">({data?.counts[s.toLowerCase() as 'active' | 'draft' | 'archived'] ?? 0})</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase text-grey-light">VIEW</span>
          <button
            onClick={() => setView('table')}
            className={cn('px-2 py-1 font-mono text-xs border', view === 'table' ? 'bg-white text-black border-white' : 'text-grey-light border-grey-mid')}
          >
            TABLE
          </button>
          <button
            onClick={() => setView('grid')}
            className={cn('px-2 py-1 font-mono text-xs border', view === 'grid' ? 'bg-white text-black border-white' : 'text-grey-light border-grey-mid')}
          >
            GRID
          </button>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-40">
          <Input placeholder="SEARCH TASKS / ITEMS / DEPARTMENTS…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-44">
          <Select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            options={[
              { value: 'ALL', label: 'ALL CATEGORIES' },
              ...CATEGORIES,
            ]}
          />
        </div>
      </div>

      {/* Category-grouped list */}
      {loading && <p className="font-mono text-xs text-grey-light py-8 text-center">LOADING…</p>}
      {!loading && !data && <p className="font-mono text-xs text-danger py-8 text-center">SELECT A VENUE IN THE SIDEBAR</p>}

      {view === 'table' && data && (
        <div className="space-y-6">
          {grouped.map(([cat, tasks]) => (
            <div key={cat} className="border border-grey-mid">
              <div className="flex items-center justify-between px-3 py-2 bg-grey-dark/30 border-b border-grey-mid">
                <h3 className="font-mono text-xs uppercase tracking-wider text-grey-light">
                  {cat} <span className="text-white">({tasks.length})</span>
                </h3>
                <Button size="sm" variant="ghost" onClick={() => openCreate(cat)}>+ ADD</Button>
              </div>
              <table className="w-full table-fixed">
                <thead>
                  <tr className="border-b border-grey-mid font-mono text-[10px] uppercase text-grey-light tracking-wider">
                    <th className="text-left px-3 py-2 w-[30%]">NAME</th>
                    <th className="text-left px-3 py-2 w-[14%]">SCHEDULE</th>
                    <th className="text-left px-3 py-2 w-[12%]">STATUS</th>
                    <th className="text-left px-3 py-2 w-[12%]">RECENT ALERTS</th>
                    <th className="text-left px-3 py-2 w-[14%]">LAST COMPLETED</th>
                    <th className="text-left px-3 py-2 w-[18%]">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-grey-mid">
                  {tasks.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-4 font-mono text-xs text-grey-light">NO TASKS — + ADD</td></tr>
                  )}
                  {tasks.map((t) => {
                    const badge = passBadge(t)
                    return (
                      <tr key={t.id} className={cn('hover:bg-grey-dark/30', t.status === 'ARCHIVED' && 'opacity-50')}>
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs text-white truncate">
                            {t.title}
                            {t.completionType === 'READING' && (
                              <span className="ml-2 text-[10px] text-grey-light">{describeBand(t, t.readingUnit)}</span>
                            )}
                          </div>
                          <div className="font-mono text-[10px] text-grey-light truncate">
                            {t.linkedItem ? `LINKED: ${t.linkedItem.name}` : t.department?.name ?? 'NO DEPARTMENT'}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px] text-grey-light">
                          {describeSchedule(t)}
                        </td>
                        <td className="px-3 py-2">
                          {t.completionType === 'READING' && badge.total > 0 ? (
                            <span className={cn('font-mono text-[10px] border px-1.5 py-0.5', badge.pass === badge.total ? 'text-success border-success/50' : 'text-danger border-danger/50')}>
                              PASS: {badge.pass}/{badge.total}
                            </span>
                          ) : (
                            <span className="font-mono text-[10px] text-grey-light">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {t.openAlertCount > 0 ? (
                            <a
                              href="/admin/compliance?tab=alerts"
                              className="font-mono text-[10px] text-danger border border-danger/50 px-1.5 py-0.5"
                            >
                              {t.openAlertCount} ALERT{t.openAlertCount > 1 ? 'S' : ''}
                            </a>
                          ) : (
                            <span className="font-mono text-[10px] text-grey-light">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px] text-grey-light">
                          {lastCompleted(t) ?? 'NEVER'}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>EDIT</Button>
                            <Button size="sm" variant="ghost" onClick={() => duplicate(t)}>DUPE</Button>
                            {t.status === 'ACTIVE' && (
                              <Button size="sm" variant="ghost" onClick={() => setStatus(t, 'ARCHIVED')}>ARCHIVE</Button>
                            )}
                            {t.status !== 'ACTIVE' && (
                              <Button size="sm" variant="ghost" onClick={() => setStatus(t, 'ACTIVE')}>
                                {t.status === 'DRAFT' ? 'PUBLISH' : 'RESTORE'}
                              </Button>
                            )}
                            <Button size="sm" variant="danger" onClick={() => removeTask(t)}>DEL</Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
          {grouped.length === 0 && (
            <div className="border border-grey-mid p-8 text-center font-mono text-xs text-grey-light">
              NO {statusTab} TASKS MATCH
            </div>
          )}
        </div>
      )}

      {view === 'grid' && data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((t) => {
            const badge = passBadge(t)
            return (
              <div key={t.id} className={cn('border border-grey-mid p-3 space-y-2', t.status === 'ARCHIVED' && 'opacity-50')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-mono text-xs text-white leading-snug">
                    {t.title}
                    {t.completionType === 'READING' && (
                      <div className="text-[10px] text-grey-light">{describeBand(t, t.readingUnit)}</div>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-grey-light shrink-0">{t.hsCategory ?? 'GENERAL'}</span>
                </div>
                <div className="font-mono text-[10px] text-grey-light">
                  {t.linkedItem ? `LINKED: ${t.linkedItem.name}` : t.department?.name ?? 'NO DEPARTMENT'} · {describeSchedule(t)}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {t.completionType === 'READING' && badge.total > 0 ? (
                    <span className={cn('font-mono text-[10px] border px-1.5 py-0.5', badge.pass === badge.total ? 'text-success border-success/50' : 'text-danger border-danger/50')}>
                      PASS: {badge.pass}/{badge.total}
                    </span>
                  ) : null}
                  {t.openAlertCount > 0 && (
                    <a href="/admin/compliance?tab=alerts" className="font-mono text-[10px] text-danger border border-danger/50 px-1.5 py-0.5">
                      {t.openAlertCount} ALERT{t.openAlertCount > 1 ? 'S' : ''}
                    </a>
                  )}
                  <span className="font-mono text-[10px] text-grey-light ml-auto">{lastCompleted(t) ?? 'NEVER COMPLETED'}</span>
                </div>
                <div className="flex items-center gap-1 pt-1 border-t border-grey-mid">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>EDIT</Button>
                  <Button size="sm" variant="ghost" onClick={() => duplicate(t)}>DUPE</Button>
                  {t.status === 'ACTIVE' ? (
                    <Button size="sm" variant="ghost" onClick={() => setStatus(t, 'ARCHIVED')}>ARCHIVE</Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setStatus(t, 'ACTIVE')}>
                      {t.status === 'DRAFT' ? 'PUBLISH' : 'RESTORE'}
                    </Button>
                  )}
                  <Button size="sm" variant="danger" className="ml-auto" onClick={() => removeTask(t)}>DEL</Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Editor modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="border border-grey-mid bg-grey-dark w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-mono text-lg font-bold uppercase tracking-widest">
              {editing === 'new' ? 'ADD TASK' : `EDIT — ${editing.title}`}
            </h2>

            <Input label="TITLE" placeholder="TASK TITLE" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input label="DESCRIPTION" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="CATEGORY"
                value={form.hsCategory}
                onChange={(e) => setForm({ ...form, hsCategory: e.target.value })}
                options={CATEGORIES}
              />
              <Select
                label="COMPLETION TYPE"
                value={form.completionType}
                onChange={(e) => setForm({ ...form, completionType: e.target.value })}
                options={[
                  { value: 'TICK', label: 'TICK' },
                  { value: 'TICK_NOTE', label: 'TICK + NOTE' },
                  { value: 'TICK_PHOTO', label: 'TICK + PHOTO' },
                  { value: 'READING', label: 'READING (NUMBER)' },
                ]}
              />
            </div>

            {form.completionType === 'READING' && (
              <div className="border border-grey-mid p-3 space-y-3">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="font-mono text-[10px] uppercase text-grey-light mr-1">GFMP PRESET:</span>
                  {GFMP_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => applyPreset(p.key)}
                      className="px-2 py-1 font-mono text-[10px] uppercase border border-grey-mid text-grey-light hover:text-white hover:border-white"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <Input label="UNIT" aria-label="UNIT" value={form.readingUnit} onChange={(e) => setForm({ ...form, readingUnit: e.target.value })} />
                  <Input label="MIN (PASS)" aria-label="MIN (PASS)" type="number" value={form.readingMin} onChange={(e) => setForm({ ...form, readingMin: e.target.value })} />
                  <Input label="MAX (PASS)" aria-label="MAX (PASS)" type="number" value={form.readingMax} onChange={(e) => setForm({ ...form, readingMax: e.target.value })} />
                  <Input label="CRITICAL MIN" aria-label="CRITICAL MIN" type="number" value={form.criticalMin} onChange={(e) => setForm({ ...form, criticalMin: e.target.value })} />
                  <Input label="CRITICAL MAX" aria-label="CRITICAL MAX" type="number" value={form.criticalMax} onChange={(e) => setForm({ ...form, criticalMax: e.target.value })} />
                </div>
                <p className="font-mono text-[10px] text-grey-light">
                  PASS = INSIDE MIN–MAX · OUTSIDE CRITICAL BAND = CRITICAL ALERT + URGENT NOTICE TO THE FLOOR
                </p>
              </div>
            )}

            <div>
              <label className="font-mono text-xs uppercase text-grey-light tracking-wider">LINKED PRODUCT / EQUIPMENT</label>
              <div className="relative mt-1">
                <Input
                  placeholder="SEARCH INVENTORY…"
                  value={itemSearch || (form.linkedItemId ? linkedName(form.linkedItemId) : '')}
                  onChange={(e) => setItemSearch(e.target.value)}
                />
                {itemSearch.trim() !== '' && (
                  <div className="absolute top-full left-0 right-0 z-10 bg-grey-dark border border-grey-mid max-h-48 overflow-y-auto">
                    {itemMatches.length === 0 && <div className="px-3 py-2 font-mono text-[10px] text-grey-light">NO MATCHES</div>}
                    {itemMatches.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => handleItemLink(c.id)}
                        className="w-full text-left px-3 py-2 font-mono text-[10px] text-white hover:bg-grey-mid flex items-center gap-2"
                      >
                        {c.name}
                        <span className="text-grey-light ml-auto">{c.storageType} · {c.unit}</span>
                      </button>
                    ))}
                  </div>
                )}
                {form.linkedItemId && (
                  <button
                    onClick={() => { setForm({ ...form, linkedItemId: '' }); setItemSearch('') }}
                    className="mt-1 font-mono text-[10px] uppercase text-danger"
                  >
                    ✕ REMOVE LINK
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="DEPARTMENT"
                value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value, sectionId: '' })}
                options={[{ value: '', label: 'NO DEPARTMENT' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
              />
              <Select
                label="SECTION"
                value={form.sectionId}
                onChange={(e) => setForm({ ...form, sectionId: e.target.value })}
                options={[{ value: '', label: 'NO SECTION' }, ...sectionOptions.map((s) => ({ value: s.id, label: s.name }))]}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="SCHEDULE"
                value={form.scheduleType}
                onChange={(e) => setForm({ ...form, scheduleType: e.target.value })}
                options={[
                  { value: 'DAILY', label: 'DAILY' },
                  { value: 'WEEKLY', label: 'WEEKLY' },
                  { value: 'MONTHLY', label: 'MONTHLY' },
                  { value: 'CUSTOM', label: 'CUSTOM (CRON)' },
                  { value: 'ONEOFF', label: 'WHEN NEEDED (ONE-OFF)' },
                ]}
              />
              <Select
                label="STATUS"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                options={[
                  { value: 'ACTIVE', label: 'ACTIVE' },
                  { value: 'DRAFT', label: 'DRAFT' },
                ]}
              />
            </div>

            {form.scheduleType === 'WEEKLY' && (
              <div className="flex items-center gap-1 flex-wrap">
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <button
                    key={d}
                    onClick={() => toggleDay(d)}
                    className={cn(
                      'w-8 h-8 font-mono text-[10px] border',
                      form.scheduleDays.includes(d) ? 'bg-white text-black border-white' : 'text-grey-light border-grey-mid',
                    )}
                  >
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'][d]}
                  </button>
                ))}
              </div>
            )}

            {form.scheduleType === 'MONTHLY' && (
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="WHEN IN MONTH"
                  value={form.monthlyOption}
                  onChange={(e) => setForm({ ...form, monthlyOption: e.target.value })}
                  options={[
                    { value: 'FIRST_DAY', label: 'FIRST DAY' },
                    { value: 'LAST_DAY', label: 'LAST DAY' },
                    { value: 'FIFTEENTH', label: '15TH' },
                    { value: 'FIRST_WEEKDAY', label: 'FIRST WEEKDAY' },
                    { value: 'LAST_WEEKDAY', label: 'LAST WEEKDAY' },
                    { value: 'FIRST_MONDAY', label: 'FIRST MONDAY' },
                    { value: 'LAST_FRIDAY', label: 'LAST FRIDAY' },
                    { value: 'SPECIFIC_DAY', label: 'SPECIFIC DAY' },
                  ]}
                />
                {form.monthlyOption === 'SPECIFIC_DAY' && (
                  <Input label="DAY OF MONTH" type="number" value={form.monthlyDay} onChange={(e) => setForm({ ...form, monthlyDay: e.target.value })} />
                )}
                {form.monthlyOption === 'SPECIFIC_DAY' ? null : (
                  <Input label="EVERY N MONTHS" type="number" value={form.intervalMonths} onChange={(e) => setForm({ ...form, intervalMonths: Number(e.target.value) || 1 })} />
                )}
              </div>
            )}

            {form.scheduleType === 'CUSTOM' && (
              <Input label="CRON (e.g. 0 9 * * MON)" placeholder="0 9 * * MON" />
            )}

            {error && <p className="font-mono text-xs text-danger">{error}</p>}

            <div className="border-t border-grey-mid pt-3 flex items-center gap-2 justify-end">
              <Button variant="ghost" onClick={() => setEditing(null)}>CANCEL</Button>
              <Button onClick={handleSave} loading={saving}>
                {editing === 'new' ? 'CREATE TASK' : 'SAVE CHANGES'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
