'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { AvailabilityBar } from '@/components/availability/AvailabilityBar'
import { useWorkerImmersive } from '@/components/worker/useWorkerImmersive'
import { AvailabilityDayEditor, type EditorDraft, type EditorSaveOptions } from '@/components/availability/AvailabilityDayEditor'
import { dayRange, toggleSelection } from '@/lib/cell-fill'
import {
  availabilityMeta,
  availabilityState,
  canWorkerEditDate,
  describeAvailabilityCutoff,
  describeSeriesEnd,
  describeWindows,
  type AvailabilityEntry,
  type AvailabilityPreset,
  type AvailabilityScope,
  type AvailabilitySeries,
} from '@/lib/availability'
import {
  formatDateLong,
  firstOfMonthKey,
  keyOfDay,
  mondayOf,
  MONTH_ABBR,
  monthGrid,
  parseDay,
  shiftDay,
  shiftMonth,
  weekKeys,
} from '@/lib/date-nav'

const WEEKDAY_HEADS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const WEEKDAY_SHORT = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const VIEW_STORAGE_KEY = 'hospo-worker-availability-view'

/** Weekly is the default; a valid choice from this session is remembered. */
function initialView(): 'month' | 'week' {
  if (typeof window === 'undefined') return 'week'
  try {
    const saved = window.sessionStorage.getItem(VIEW_STORAGE_KEY)
    return saved === 'month' || saved === 'week' ? saved : 'week'
  } catch {
    return 'week'
  }
}

interface WorkerRequest {
  id: string
  date: string
  scope: AvailabilityScope
  action: 'SET' | 'CLEAR'
  seriesId: string | null
  reason?: string | null
  payload?: { availability?: { notes?: string | null } | null } | null
}

interface AvailabilityData {
  employmentType: string | null
  lockDays: number
  cutoff?: { day: number; time: string } | null
  today: string
  presets: AvailabilityPreset[]
  entries: AvailabilityEntry[]
  series: AvailabilitySeries[]
  requests: WorkerRequest[]
}

export function WorkerAvailabilityClient() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [view, setView] = useState<'month' | 'week'>(initialView)
  const [data, setData] = useState<AvailabilityData | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null)
  const [clearSelectionOpen, setClearSelectionOpen] = useState(false)

  useWorkerImmersive(!!selected)

  const [month, setMonth] = useState(() => {
    const d = parseDay(keyOfDay(new Date()))
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
  })
  const [weekStart, setWeekStart] = useState(() => mondayOf(keyOfDay(new Date())))

  const monthKey = `${month.year}-${String(month.month).padStart(2, '0')}`
  const today = data?.today ?? keyOfDay(new Date())

  const range = useMemo(() => {
    if (view === 'week') return { start: weekStart, end: shiftDay(weekStart, 6) }
    const lastDay = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate()
    return {
      start: firstOfMonthKey(`${monthKey}-01`),
      end: `${monthKey}-${String(lastDay).padStart(2, '0')}`,
    }
  }, [view, weekStart, monthKey, month.year, month.month])

  async function load() {
    const r = await fetch(`/api/worker/availability?start=${range.start}&end=${range.end}`)
    if (r.status === 401) { router.push('/w/login'); return }
    const d = await r.json()
    setData(d)
    setLoading(false)
  }

  useEffect(() => { load() }, [range.start, range.end]) // eslint-disable-line react-hooks/exhaustive-deps

  const entryByDate = useMemo(() => {
    const map = new Map<string, AvailabilityEntry>()
    for (const e of data?.entries ?? []) map.set(e.date, e)
    return map
  }, [data])

  const requestDates = useMemo(() => new Set((data?.requests ?? []).map((r) => r.date)), [data])
  const cells = useMemo(() => monthGrid(month.year, month.month), [month])
  const weekDays = useMemo(() => (view === 'week' ? weekKeys(weekStart) : []), [view, weekStart])
  const orderedKeys = useMemo(
    () => (view === 'week'
      ? weekDays
      : cells.filter((c) => c.inMonth && c.key).map((c) => c.key as string)),
    [view, weekDays, cells],
  )

  useEffect(() => {
    if (!selectMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setSelectMode(false)
      setSelection(new Set())
      setSelectionAnchor(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectMode])

  function selectable(dateKey: string): boolean {
    return canWorkerEditDate(dateKey, data?.lockDays ?? 0, today)
  }

  function changeView(next: 'month' | 'week') {
    setView(next)
    clearSelection()
    try { window.sessionStorage.setItem(VIEW_STORAGE_KEY, next) } catch { /* private mode */ }
  }

  function goMonth(next: { year: number; month: number }) {
    setMonth(next)
    clearSelection()
  }

  function goWeek(next: string) {
    setWeekStart(next)
    clearSelection()
  }

  // Range/view changes clear the selected days but keep SELECT MODE active,
  // so a mobile user can move on and pick another range.
  function clearSelection() {
    setSelection(new Set())
    setSelectionAnchor(null)
  }

  function cancelSelection() {
    setSelectMode(false)
    clearSelection()
  }

  function selectDay(dateKey: string, range = false) {
    if (!selectable(dateKey)) return
    setSelection((prev) => {
      if (range && selectionAnchor) {
        const from = orderedKeys.indexOf(selectionAnchor)
        const to = orderedKeys.indexOf(dateKey)
        if (from >= 0 && to >= 0) {
          const next = new Set(prev)
          for (const idx of dayRange(from, to)) {
            const key = orderedKeys[idx]
            if (selectable(key)) next.add(key)
          }
          return next
        }
      }
      return toggleSelection(prev, dateKey)
    })
    setSelectionAnchor(dateKey)
  }

  function onDayClick(e: React.MouseEvent, dateKey: string) {
    if (e.shiftKey) {
      e.preventDefault()
      setSelectMode(true)
      selectDay(dateKey, true)
      return
    }
    if (selectMode) {
      selectDay(dateKey)
      return
    }
    pick(dateKey)
  }

  function pick(dateKey: string) {
    const locked = !canWorkerEditDate(dateKey, data?.lockDays ?? 0, today)
    if (locked) {
      setFlash('THAT DAY IS IN THE PAST OR LOCKED — ASK A MANAGER')
      return
    }
    setSelected(dateKey)
    setError('')
    setFlash('')
  }

  function resultMessage(mode: string, skipped: number, verb: 'SAVE' | 'CLEAR' = 'SAVE') {
    if (mode === 'REQUEST') {
      return verb === 'CLEAR'
        ? 'CANCEL REQUEST SENT — YOUR MANAGER WILL CONFIRM'
        : 'EDIT REQUEST SENT — YOUR MANAGER WILL CONFIRM'
    }
    if (skipped > 0) return `SAVED · ${skipped} PROTECTED DAY${skipped === 1 ? '' : 'S'} LEFT UNCHANGED`
    return 'SAVED'
  }

  async function cancelRequest(id: string) {
    setSaving(true); setError('')
    const r = await fetch(`/api/worker/availability/requests/${id}`, { method: 'DELETE' })
    setSaving(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError((d.error ?? 'COULD NOT CANCEL THE REQUEST').toUpperCase()); return }
    setFlash('REQUEST CANCELLED — YOUR MANAGER NO LONGER SEES IT')
    load()
  }

  async function save(draft: EditorDraft, options: EditorSaveOptions) {
    if (!selected) return
    const entry = entryByDate.get(selected)
    setSaving(true); setError('')
    const r = await fetch('/api/worker/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: selected,
        availability: {
          isAllDay: draft.isAllDay,
          type: draft.type,
          windows: draft.windows,
          timeOff: draft.timeOff,
          notes: draft.notes,
        },
        repeat: options.repeat,
        scope: options.scope,
        seriesId: entry?.seriesId ?? null,
        reason: options.reason,
      }),
    })
    setSaving(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError((d.error ?? 'SAVE FAILED').toUpperCase()); return }
    const out = await r.json()
    setSelected(null)
    setFlash(resultMessage(out.mode, (out.skipped ?? []).length))
    load()
  }

  async function clear(options: { scope: AvailabilityScope | null; reason: string | null }) {
    if (!selected) return
    const entry = entryByDate.get(selected)
    setSaving(true); setError('')
    const r = await fetch('/api/worker/availability/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: selected,
        scope: options.scope,
        seriesId: entry?.seriesId ?? null,
        reason: options.reason,
      }),
    })
    setSaving(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError((d.error ?? 'CLEAR FAILED').toUpperCase()); return }
    const out = await r.json()
    setSelected(null)
    setFlash(resultMessage(out.mode, (out.skipped ?? []).length, 'CLEAR'))
    load()
  }

  // Notes-only PATCH — applies immediately, even on a manager-locked day.
  async function saveNote(dateKey: string, notes: string | null) {
    const entry = entryByDate.get(dateKey)
    if (!entry?.id) { setError('SAVE THE DAY BEFORE ADDING A NOTE'); return }
    setSaving(true); setError('')
    const r = await fetch(`/api/worker/availability/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
    setSaving(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError((d.error ?? 'COULD NOT SAVE THE NOTE').toUpperCase())
      return
    }
    setFlash('NOTE SAVED')
    load()
  }

  // Bulk clear: one THIS-scoped POST per day with availability. Locked/approved
  // days become edit requests server-side; past/system-locked days are blocked.
  async function clearSelected() {
    const dates = [...selection].filter((d) => entryByDate.has(d) && selectable(d))
    setClearSelectionOpen(false)
    cancelSelection()
    if (dates.length === 0) {
      setFlash('NOTHING TO CLEAR IN THE SELECTION')
      return
    }
    setSaving(true); setError('')
    const results = await Promise.all(dates.map((date) => {
      const entry = entryByDate.get(date)
      return fetch('/api/worker/availability/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, scope: 'THIS', seriesId: entry?.seriesId ?? null }),
      })
    }))
    const failed = results.filter((r) => !r.ok).length
    const bodies = await Promise.all(results.filter((r) => r.ok).map((r) => r.json().catch(() => ({}))))
    setSaving(false)
    const requests = bodies.filter((b) => b?.mode === 'REQUEST').length
    const saved = bodies.filter((b) => b?.mode === 'SAVED').length
    load()
    if (failed > 0) {
      setError(`${failed} DAY${failed === 1 ? '' : 'S'} FAILED TO CLEAR — THE OTHERS WERE SAVED`)
    } else if (requests > 0) {
      setFlash(`${requests} CHANGE REQUEST${requests === 1 ? '' : 'S'} SENT · ${saved} CLEARED`)
    } else {
      setFlash(`${saved} DAY${saved === 1 ? '' : 'S'} CLEARED`)
    }
  }

  if (loading || !data) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p></div>
  }

  const selectedEntry = selected ? entryByDate.get(selected) ?? null : null
  const selectedSeries = selectedEntry?.seriesId
    ? data.series.find((s) => s.id === selectedEntry.seriesId) ?? null
    : null
  const casual = (data.employmentType ?? '').toUpperCase() === 'CASUAL'

  return (
    <div className="min-h-screen bg-black pb-10">
      <div className="px-4 pt-6 pb-4 border-b border-grey-mid">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">MY AVAILABILITY</h1>
        <p className="font-mono text-xs text-grey-light mt-1 uppercase">
          {casual ? 'TAP THE DAYS YOU CAN WORK' : 'TAP A DAY TO SET AVAILABLE / UNAVAILABLE TIMES'}
        </p>
        {data.lockDays > 0 && (
          <p className="font-mono text-xs text-warning mt-1 uppercase">
            ▒ DAYS WITHIN {data.lockDays} DAYS CANNOT BE CHANGED
          </p>
        )}
        {data.cutoff && (
          <p className="font-mono text-xs text-warning mt-1 uppercase">
            ▒ AFTER {describeAvailabilityCutoff(data.cutoff)} EACH WEEK, CHANGES FOR THE COMING WEEK NEED MANAGER APPROVAL
          </p>
        )}
      </div>

      {/* View toggle + navigation */}
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-grey-mid">
        <div className="flex border border-grey-mid">
          {(['month', 'week'] as const).map((v) => (
            <button
              key={v}
              onClick={() => changeView(v)}
              className={`h-9 px-3 font-mono text-xs uppercase tracking-wider transition-colors ${
                view === v ? 'bg-white text-black' : 'text-grey-light hover:text-white'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        {!selectMode ? (
          <button
            type="button"
            onClick={() => { setSelectMode(true); setSelection(new Set()); setSelectionAnchor(null) }}
            className="h-9 px-3 border border-grey-mid font-mono text-xs uppercase text-grey-light hover:border-white hover:text-white transition-colors"
          >
            SELECT DAYS
          </button>
        ) : (
          <button
            type="button"
            onClick={cancelSelection}
            className="h-9 px-3 border border-accent font-mono text-xs uppercase text-accent hover:bg-accent hover:text-black transition-colors"
          >
            CANCEL SELECT
          </button>
        )}
        {view === 'month' ? (
          <div className="flex items-center gap-2">
            <button onClick={() => goMonth(shiftMonth(month.year, month.month, -1))} className="font-mono text-xs text-grey-light border border-grey-mid px-3 py-1.5 hover:border-white hover:text-white">&lt;</button>
            <span className="font-mono text-sm text-white tracking-widest uppercase">{MONTH_ABBR[month.month - 1]} {month.year}</span>
            <button onClick={() => goMonth(shiftMonth(month.year, month.month, 1))} className="font-mono text-xs text-grey-light border border-grey-mid px-3 py-1.5 hover:border-white hover:text-white">&gt;</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => goWeek(shiftDay(weekStart, -7))} className="font-mono text-xs text-grey-light border border-grey-mid px-3 py-1.5 hover:border-white hover:text-white">&lt;&lt;</button>
            <button onClick={() => goWeek(mondayOf(today))} className="font-mono text-xs text-grey-light border border-grey-mid px-3 py-1.5 hover:border-white hover:text-white">TODAY</button>
            <button onClick={() => goWeek(shiftDay(weekStart, 7))} className="font-mono text-xs text-grey-light border border-grey-mid px-3 py-1.5 hover:border-white hover:text-white">&gt;&gt;</button>
          </div>
        )}
      </div>

      {flash && (
        <p className="mx-4 mt-3 font-mono text-xs uppercase text-success border border-success/50 bg-success/10 px-3 py-2">{flash}</p>
      )}

      {/* Edit requests still waiting for a manager — cancellable here */}
      {data.requests.length > 0 && (
        <div className="mx-4 mt-3 border border-accent/50 bg-accent/5 p-3 space-y-2">
          <h2 className="font-mono text-xs uppercase tracking-wider text-accent">WAITING FOR A MANAGER</h2>
          {data.requests.map((req) => {
            const requestNote = req.reason?.trim() || req.payload?.availability?.notes?.trim() || null
            return (
              <div key={req.id} className="flex flex-wrap items-center justify-between gap-2 border border-grey-mid bg-black p-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-white uppercase">{formatDateLong(req.date)}</div>
                  <div className="font-mono text-2xs uppercase text-grey-light">
                    {req.action === 'CLEAR' ? 'CANCEL' : 'CHANGE'} · {req.scope === 'THIS' ? 'JUST THIS DAY' : req.scope === 'FROM' ? 'FROM THIS DAY' : 'ALL IN SERIES'}
                  </div>
                  {requestNote && (
                    <div title={requestNote} className="max-w-[16rem] truncate font-mono text-2xs uppercase text-grey-light">
                      NOTE: {requestNote}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => cancelRequest(req.id)}
                  disabled={saving}
                  className="h-9 px-3 border border-danger text-danger font-mono text-xs uppercase hover:bg-danger hover:text-black transition-colors disabled:opacity-40"
                >
                  CANCEL REQUEST
                </button>
              </div>
            )
          })}
          <p className="font-mono text-2xs uppercase text-grey-light">CANCELLING HERE WITHDRAWS THE REQUEST — YOUR APPROVED DAYS STAY AS THEY ARE.</p>
        </div>
      )}

      {/* Month grid */}
      {view === 'month' && (
        <div className="p-4">
          <div className="grid grid-cols-7 gap-px bg-grey-mid border border-grey-mid">
            {WEEKDAY_HEADS.map((w) => (
              <div key={w} className="bg-black py-1.5 text-center font-mono text-2xs uppercase text-grey-light tracking-wider">{w}</div>
            ))}
            {cells.map((c, i) => {
              if (!c.inMonth || !c.key) return <div key={`blank-${i}`} className="bg-black min-h-[64px]" />
              const entry = entryByDate.get(c.key)
              const editable = canWorkerEditDate(c.key, data.lockDays, today)
              const meta = availabilityMeta(availabilityState(entry), data.employmentType)
              const isToday = c.key === today
              const requested = requestDates.has(c.key)
              const selected = selection.has(c.key)
              return (
                <button
                  key={c.key}
                  onClick={(e) => onDayClick(e, c.key!)}
                  disabled={!editable}
                  className={`bg-black min-h-[64px] flex flex-col items-start pt-1.5 px-1 gap-0.5 transition-colors ${meta.tint} ${
                    editable ? 'hover:ring-1 hover:ring-inset hover:ring-white' : 'opacity-40 cursor-not-allowed'
                  } ${selected ? 'ring-2 ring-inset ring-accent bg-accent/20' : ''}`}
                >
                  <span className={`font-mono text-2xs ${isToday ? 'text-accent font-bold' : 'text-white'}`}>{c.day}</span>
                  {entry ? (
                    <>
                      <span className={`w-2 h-2 ${meta.dot}`} />
                      <span className="font-mono text-2xs text-grey-light leading-tight">
                        {describeWindows(entry.windows, entry.isAllDay, entry.type)}
                      </span>
                      {entry.notes && (
                        <span title={entry.notes} className="w-full min-w-0 truncate font-mono text-2xs text-grey-light leading-tight">
                          NOTE: {entry.notes}
                        </span>
                      )}
                      <span className="flex flex-wrap gap-0.5">
                        {entry.status === 'PENDING' && <span className="font-mono text-2xs text-warning leading-none">PENDING</span>}
                        {entry.status === 'DECLINED' && <span className="font-mono text-2xs text-danger leading-none">DECLINED</span>}
                        {entry.timeOff && <span className="font-mono text-2xs text-warning leading-none">TO</span>}
                        {entry.lockedAt && <span title={entry.lockedReason ?? 'LOCKED BY A MANAGER'} className="font-mono text-2xs text-warning leading-none">🔒</span>}
                        {entry.seriesId && <span className="font-mono text-2xs text-accent leading-none">⟳</span>}
                      </span>
                    </>
                  ) : (
                    <span className={`mt-1 w-2 h-2 ${meta.dot}`} />
                  )}
                  {requested && <span className="font-mono text-2xs text-accent leading-none">REQ</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Week view */}
      {view === 'week' && (
        <div className="p-4 space-y-2">
          {weekDays.map((d, di) => {
            const entry = entryByDate.get(d)
            const editable = canWorkerEditDate(d, data.lockDays, today)
            const meta = availabilityMeta(availabilityState(entry), data.employmentType)
            const isToday = d === today
            const requested = requestDates.has(d)
            const dObj = parseDay(d)
            const selected = selection.has(d)
            return (
              <button
                key={d}
                onClick={(e) => onDayClick(e, d)}
                disabled={!editable}
                className={`w-full text-left border border-grey-mid p-3 space-y-2 ${meta.tint} ${
                  editable ? 'hover:border-white' : 'opacity-40 cursor-not-allowed'
                } ${selected ? 'ring-2 ring-inset ring-accent bg-accent/20' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-mono text-xs uppercase ${isToday ? 'text-accent font-bold' : 'text-white'}`}>
                    {WEEKDAY_SHORT[di]} {dObj.getUTCDate()} {MONTH_ABBR[dObj.getUTCMonth()]}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {requested && <span className="font-mono text-2xs uppercase text-accent">REQ</span>}
                    {entry?.timeOff && <span className="font-mono text-2xs uppercase text-warning">TIME OFF</span>}
                    {entry?.status === 'PENDING' && <span className="font-mono text-2xs uppercase text-warning">PENDING</span>}
                    {entry?.status === 'DECLINED' && <span className="font-mono text-2xs uppercase text-danger">DECLINED</span>}
                    {entry?.lockedAt && <span title={entry.lockedReason ?? 'LOCKED BY A MANAGER'} className="font-mono text-2xs uppercase text-warning">🔒 LOCKED</span>}
                    <span className={`font-mono text-2xs uppercase ${meta.dot === 'bg-danger' ? 'text-danger' : meta.dot === 'bg-success' ? 'text-success' : 'text-grey-light'}`}>
                      {meta.label}
                    </span>
                  </span>
                </div>
                {entry && (
                  <AvailabilityBar
                    windows={entry.windows}
                    isAllDay={entry.isAllDay}
                    type={entry.type}
                    labelled
                    showType
                    series={entry.seriesId ? { endDate: entry.seriesEndDate } : null}
                  />
                )}
                <div className="font-mono text-2xs text-grey-light uppercase">
                  {entry ? describeWindows(entry.windows, entry.isAllDay, entry.type) : 'NOT SET'}
                  {entry?.seriesId ? ` · ${entry.seriesEndDate ? describeSeriesEnd(entry.seriesEndDate) : 'WEEKLY · NO END DATE'}` : ''}
                </div>
                {entry?.notes && (
                  <div className="font-mono text-2xs text-grey-light uppercase truncate">NOTE: {entry.notes}</div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Select-mode action bar (mobile friendly) */}
      {selectMode && (
        <div className="sticky bottom-0 z-30 border-t border-accent bg-black px-4 py-3 flex items-center justify-between gap-3">
          <span className="font-mono text-xs uppercase text-accent">{selection.size} SELECTED</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving || selection.size === 0}
              onClick={() => setClearSelectionOpen(true)}
              className="h-10 px-4 border border-danger text-danger font-mono text-xs uppercase hover:bg-danger hover:text-black transition-colors disabled:opacity-40"
            >
              CLEAR
            </button>
            <button
              type="button"
              onClick={cancelSelection}
              className="h-10 px-4 border border-grey-mid text-grey-light font-mono text-xs uppercase hover:border-white hover:text-white transition-colors"
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* Bulk-clear confirmation */}
      <Modal
        isOpen={clearSelectionOpen}
        onClose={() => { if (!saving) setClearSelectionOpen(false) }}
        title="CLEAR SELECTED DAYS"
        size="sm"
      >
        <div className="space-y-4">
          <p className="font-mono text-sm text-white uppercase">
            CLEAR {selection.size} SELECTED DAY{selection.size === 1 ? '' : 'S'}?
          </p>
          <p className="font-mono text-2xs uppercase text-grey-light">
            APPROVED OR LOCKED DAYS ARE SENT TO YOUR MANAGER AS CHANGE REQUESTS. THIS CANNOT BE UNDONE.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving || selection.size === 0}
              onClick={clearSelected}
              className="h-10 px-4 border border-danger text-danger font-mono text-xs uppercase hover:bg-danger hover:text-black transition-colors disabled:opacity-40"
            >
              CLEAR
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setClearSelectionOpen(false)}
              className="h-10 px-4 border border-grey-mid text-grey-light font-mono text-xs uppercase hover:border-white hover:text-white transition-colors disabled:opacity-40"
            >
              CANCEL
            </button>
          </div>
        </div>
      </Modal>

      {/* Legend */}
      <div className="px-4 pb-4 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-success" /><span className="font-mono text-2xs uppercase text-grey-light">Available</span></span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-danger" /><span className="font-mono text-2xs uppercase text-grey-light">Unavailable</span></span>
        <span className="flex items-center gap-1.5"><span className={`w-2 h-2 ${casual ? 'bg-warning' : 'bg-grey-mid'}`} /><span className="font-mono text-2xs uppercase text-grey-light">{casual ? 'Unset' : 'Default'}</span></span>
        <span className="font-mono text-2xs uppercase text-warning">PENDING = WAITING FOR A MANAGER</span>
        <span className="font-mono text-2xs uppercase text-warning">🔒 = LOCKED BY A MANAGER</span>
        <span className="font-mono text-2xs uppercase text-accent">⟳ = WEEKLY SERIES</span>
      </div>

      <p className="px-4 font-mono text-2xs uppercase text-grey-light">
        TIME OFF LIVES HERE: MARK THE DAYS UNAVAILABLE AND TICK “TIME OFF REQUEST”.
      </p>

      {/* Editor */}
      <Modal
        isOpen={!!selected}
        onClose={() => { if (!saving) { setSelected(null); setError('') } }}
        title={selected ? `AVAILABILITY — ${formatDateLong(selected)}` : 'AVAILABILITY'}
        size="lg"
      >
        {selected && (
          <AvailabilityDayEditor
            key={selected}
            dateKey={selected}
            entry={selectedEntry}
            series={selectedSeries}
            presets={data.presets}
            allowSeriesScope={false}
            busy={saving}
            error={error || null}
            onSave={save}
            onClear={clear}
            onSaveNote={(notes) => saveNote(selected, notes)}
            onClose={() => { if (!saving) { setSelected(null); setError('') } }}
          />
        )}
      </Modal>
    </div>
  )
}
