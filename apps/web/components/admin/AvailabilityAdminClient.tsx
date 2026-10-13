'use client'

// Admin availability page (TEAM → AVAILABILITY). Three jobs in one place:
// confirm or decline declared unavailability / time off, resolve workers' edit
// requests, and override any day directly (past, locked and approved included).
//
// The grid follows the shared DateNav range (day / week / month / custom).
// Staff rows can be grouped by Position (drag the group headers to reorder —
// persisted on Position.sortOrder), and clicking a day header pins it so the
// people available that day float to the top of their group until it is
// clicked again.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { DateNav } from '@/components/admin/DateNav'
import { getActiveVenueId } from '@/lib/active-venue'
import { AvailabilityBar } from '@/components/availability/AvailabilityBar'
import { AvailabilityDayEditor, type EditorDraft, type EditorSaveOptions } from '@/components/availability/AvailabilityDayEditor'
import { StaffEditModal } from '@/components/admin/StaffEditModal'
import { moveItem } from '@/lib/array'
import { fillRect, fillTargets, inFillRect } from '@/lib/cell-fill'
import { dateKeysBetween } from '@/lib/calendar'
import { formatDateLong, keyOfDay, mondayOf, parseDay, shiftDay, type DateRange } from '@/lib/date-nav'
import { nearestIndex, type Rect } from '@/lib/reorder'
import { buildStaffGroups, insertSubset, sortByPinnedAvailability } from '@/lib/staff-groups'
import {
  availabilityState,
  describeSeriesEnd,
  describeWindows,
  isFreeAt,
  statusMeta,
  type AvailabilityEntry,
  type AvailabilityPayloadLike,
  type AvailabilityPreset,
  type AvailabilityScope,
  type AvailabilitySeries,
} from '@/lib/availability'

const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const NAME_COL = 200
const MIN_DAY_COL = 96

interface AdminPosition {
  id: string
  name: string
  colour: string | null
  sortOrder: number
}

interface AdminStaff {
  id: string
  firstName: string
  lastName: string
  employmentType: string | null
  positions?: { id: string; name: string; colour: string | null }[]
}

interface AdminEditRequest {
  id: string
  staffId: string
  date: string
  scope: AvailabilityScope
  seriesId: string | null
  action: 'SET' | 'CLEAR'
  payload: { availability?: AvailabilityPayloadLike | null } | null
  reason: string | null
  status: string
  reviewNote: string | null
  createdAt: string
}

interface AdminData {
  venueId: string
  staff: AdminStaff[]
  positions?: AdminPosition[]
  entries: AvailabilityEntry[]
  series: (AvailabilitySeries & { staffId: string })[]
  presets: AvailabilityPreset[]
  queue: {
    pending: AvailabilityEntry[]
    requests: AdminEditRequest[]
  }
}

function payloadSummary(req: AdminEditRequest): string {
  if (req.action === 'CLEAR') return 'CLEAR THIS DAY'
  const av = req.payload?.availability
  if (!av) return '—'
  if (av.isAllDay) return `ALL DAY ${av.type}`
  return describeWindows(av.windows, false, av.type)
}

export function AvailabilityAdminClient({ role, sessionVenueId, defaultVenueId }: {
  role: string
  sessionVenueId: string
  defaultVenueId?: string | null
}) {
  const [venueId] = useState(() => getActiveVenueId(role, sessionVenueId, defaultVenueId))
  const [range, setRange] = useState<DateRange>(() => {
    const monday = mondayOf(keyOfDay(new Date()))
    return { start: monday, end: shiftDay(monday, 6) }
  })
  const [data, setData] = useState<AdminData | null>(null)
  const [positions, setPositions] = useState<AdminPosition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editor, setEditor] = useState<{ staffId: string; date: string } | null>(null)
  const [editStaffId, setEditStaffId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [pinnedDay, setPinnedDay] = useState<string | null>(null)
  const [groupByPosition, setGroupByPosition] = useState(true)
  const [draggingGroup, setDraggingGroup] = useState<string | null>(null)
  const [overGroup, setOverGroup] = useState<string | null>(null)

  const groupHeaderRefs = useRef<Map<string, HTMLElement>>(new Map())
  const groupDragRef = useRef<{ key: string; x: number; y: number; moved: boolean } | null>(null)
  const overGroupRef = useRef<string | null>(null)

  // Drag-fill — copy one day's settings across the row.
  const [fill, setFill] = useState<{ staffId: string; from: number; to: number } | null>(null)
  const fillRef = useRef<{ staffId: string; from: number; to: number; x: number; y: number; moved: boolean } | null>(null)

  const days = useMemo(
    () => dateKeysBetween(new Date(`${range.start}T00:00:00Z`), new Date(`${range.end}T00:00:00Z`)),
    [range],
  )
  const today = keyOfDay(new Date())

  async function load() {
    if (!venueId) { setLoading(false); return }
    setLoading(true); setError('')
    const r = await fetch(`/api/admin/availability?venueId=${venueId}&start=${range.start}&end=${range.end}`)
    const d = await r.json()
    if (!r.ok) { setError((d.error ?? 'LOAD FAILED').toUpperCase()); setLoading(false); return }
    setData(d)
    setPositions(d.positions ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [venueId, range.start, range.end]) // eslint-disable-line react-hooks/exhaustive-deps

  const entryIndex = useMemo(() => {
    const map = new Map<string, AvailabilityEntry>()
    for (const e of data?.entries ?? []) {
      if (e.staffId) map.set(`${e.staffId}:${e.date}`, e)
    }
    return map
  }, [data])

  const entryFor = (staffId: string, date: string) =>
    entryIndex.get(`${staffId}:${date}`) ?? null

  // A pinned day floats people with free time to the top: free all day, free
  // part of the day (SPLIT), or — for today — still free after the current
  // time, so an availability window that has already passed doesn't count.
  const isAvailableOn = (staffId: string, day: string) => {
    const entry = entryIndex.get(`${staffId}:${day}`)
    if (!entry) return false
    const state = availabilityState(entry)
    if (state === 'DEFAULT') return false
    if (day === today) {
      const now = new Date()
      return isFreeAt(entry, now.getHours() * 60 + now.getMinutes())
    }
    return state !== 'UNAVAILABLE'
  }

  const groups = useMemo(() => {
    if (!data) return []
    return buildStaffGroups(data.staff, positions)
  }, [data, positions])

  // A pinned day floats the people available that day to the top of their
  // position group — the grouping itself stays put.
  const displayGroups = useMemo(() => {
    if (!pinnedDay) return groups
    return groups.map((g) => ({
      ...g,
      items: sortByPinnedAvailability(g.items, (s) => isAvailableOn(s.id, pinnedDay)),
    }))
  }, [groups, pinnedDay, entryIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  const ungroupedStaff = useMemo(() => {
    if (!data) return []
    if (!pinnedDay) return data.staff
    return sortByPinnedAvailability(data.staff, (s) => isAvailableOn(s.id, pinnedDay))
  }, [data, pinnedDay, entryIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  const visibleGroupKeys = useMemo(
    () => groups.filter((g) => g.positionId).map((g) => g.key),
    [groups],
  )

  function collectGroupRects(): Rect[] {
    return visibleGroupKeys
      .map((k) => groupHeaderRefs.current.get(k))
      .filter((el): el is HTMLElement => !!el)
      .map((el) => {
        const r = el.getBoundingClientRect()
        return { left: r.left, top: r.top, width: r.width, height: r.height }
      })
  }

  function onGroupPointerDown(e: React.PointerEvent, key: string) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    groupDragRef.current = { key, x: e.clientX, y: e.clientY, moved: false }
    setDraggingGroup(key)
    setError('')
  }

  function onGroupPointerMove(e: React.PointerEvent) {
    const drag = groupDragRef.current
    if (!drag) return
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true
    if (!drag.moved) return
    const idx = nearestIndex(collectGroupRects(), e.clientX, e.clientY)
    const key = idx == null ? null : visibleGroupKeys[idx] ?? null
    overGroupRef.current = key
    setOverGroup(key)
  }

  function onGroupPointerUp() {
    const drag = groupDragRef.current
    groupDragRef.current = null
    setDraggingGroup(null)
    const target = overGroupRef.current
    overGroupRef.current = null
    setOverGroup(null)
    if (!drag || !drag.moved || !target || target === drag.key) return
    applyGroupOrder(drag.key, target)
  }

  function onGroupPointerCancel() {
    groupDragRef.current = null
    overGroupRef.current = null
    setDraggingGroup(null)
    setOverGroup(null)
  }

  // Move one visible group over another and persist the full position order
  // (hidden positions keep their slots — `insertSubset`).
  function applyGroupOrder(fromKey: string, toKey: string) {
    const visibleBefore = positions.filter((p) => visibleGroupKeys.includes(p.id)).map((p) => p.id)
    const fi = visibleBefore.indexOf(fromKey)
    const ti = visibleBefore.indexOf(toKey)
    if (fi < 0 || ti < 0 || fi === ti) return
    const visibleAfter = moveItem(visibleBefore, fi, ti)
    const fullOrder = insertSubset(positions.map((p) => p.id), visibleBefore, visibleAfter)
    const byId = new Map(positions.map((p) => [p.id, p]))
    const next = fullOrder.map((id) => byId.get(id)).filter((p): p is AdminPosition => !!p)
    const prev = positions
    setPositions(next)
    void fetch('/api/admin/positions/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, order: fullOrder }),
    }).then(async (r) => {
      if (r.ok) return
      setPositions(prev)
      const d = await r.json().catch(() => ({}))
      setError((d.error ?? 'COULD NOT REORDER THE GROUPS').toUpperCase())
    })
  }

  function onChangeDate(_next: string, nextRange: DateRange) {
    setRange(nextRange)
    setPinnedDay(null)
  }

  const pendingGroups = useMemo(() => {
    const map = new Map<string, AvailabilityEntry[]>()
    for (const e of data?.queue.pending ?? []) {
      const key = e.seriesId ? `${e.staffId}:${e.seriesId}` : `${e.staffId}:${e.id}`
      map.set(key, [...(map.get(key) ?? []), e])
    }
    return [...map.entries()]
  }, [data])

  const staffName = (id: string) => {
    const s = data?.staff.find((x) => x.id === id)
    return s ? `${s.firstName} ${s.lastName}` : 'STAFF'
  }

  async function review(kind: 'ids' | 'series', ids: string[], staffId: string, seriesId: string | null, action: 'APPROVE' | 'DECLINE' | 'DELETE', noteKey: string) {
    setBusy(true)
    const body: Record<string, unknown> = { venueId, action, reviewNote: notes[noteKey] ?? null }
    if (kind === 'series' && seriesId) { body.seriesId = seriesId; body.staffId = staffId }
    else body.ids = ids
    const r = await fetch('/api/admin/availability/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError((d.error ?? 'REVIEW FAILED').toUpperCase()); return }
    load()
  }

  async function resolveRequest(id: string, action: 'APPLY' | 'DISCARD') {
    setBusy(true)
    const r = await fetch(`/api/admin/availability/requests/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reviewNote: notes[`req:${id}`] ?? null }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError((d.error ?? 'REQUEST FAILED').toUpperCase()); return }
    load()
  }

  function cellColFromPoint(x: number, y: number): number | null {
    const el = typeof document !== 'undefined' ? document.elementFromPoint?.(x, y) ?? null : null
    const cell = (el as HTMLElement | null)?.closest?.('[data-fill-col]') as HTMLElement | null
    if (!cell) return null
    const col = Number(cell.dataset.fillCol)
    return Number.isFinite(col) ? col : null
  }

  function onFillPointerDown(e: React.PointerEvent, staffId: string, from: number) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    fillRef.current = { staffId, from, to: from, x: e.clientX, y: e.clientY, moved: false }
    setFill({ staffId, from, to: from })
  }

  function onFillPointerMove(e: React.PointerEvent) {
    const drag = fillRef.current
    if (!drag) return
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true
    if (!drag.moved) return
    const col = cellColFromPoint(e.clientX, e.clientY)
    if (col == null) return
    drag.to = col
    setFill({ staffId: drag.staffId, from: drag.from, to: col })
  }

  function onFillPointerUp() {
    const drag = fillRef.current
    fillRef.current = null
    setFill(null)
    if (!drag || !drag.moved) return
    const targets = fillTargets({ row: 0, col: drag.from }, fillRect({ row: 0, col: drag.from }, { row: 0, col: drag.to }))
    const sourceDate = days[drag.from]
    const targetDates = targets.map((t) => days[t.col]).filter((d): d is string => !!d)
    if (!sourceDate || targetDates.length === 0) return
    void copyDays(drag.staffId, sourceDate, targetDates)
  }

  function onFillPointerCancel() {
    fillRef.current = null
    setFill(null)
  }

  async function copyDays(staffId: string, sourceDate: string, dates: string[]) {
    const entry = entryFor(staffId, sourceDate)
    if (!entry) return
    const source = {
      isAllDay: entry.isAllDay,
      type: entry.type,
      windows: entry.windows,
      timeOff: entry.timeOff,
      notes: entry.notes,
    }
    setBusy(true); setError('')
    const results = await Promise.all(dates.map((date) =>
      fetch('/api/admin/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId, staffId, date, availability: source, repeat: null, scope: null, seriesId: null }),
      }),
    ))
    setBusy(false)
    const failed = results.filter((r) => !r.ok).length
    if (failed) setError(`${failed} DAY${failed === 1 ? '' : 'S'} FAILED TO COPY`)
    load()
  }

  async function save(staffId: string, date: string, draft: EditorDraft, options: EditorSaveOptions) {
    const entry = entryFor(staffId, date)
    setBusy(true); setError('')
    const r = await fetch('/api/admin/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venueId,
        staffId,
        date,
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
      }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError((d.error ?? 'SAVE FAILED').toUpperCase()); return }
    setEditor(null)
    load()
  }

  async function clear(staffId: string, date: string, options: { scope: AvailabilityScope | null }) {
    const entry = entryFor(staffId, date)
    setBusy(true); setError('')
    const r = await fetch('/api/admin/availability/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, staffId, date, scope: options.scope, seriesId: entry?.seriesId ?? null }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError((d.error ?? 'CLEAR FAILED').toUpperCase()); return }
    setEditor(null)
    load()
  }

  const editorEntry = editor ? entryFor(editor.staffId, editor.date) : null
  const editorSeries = editorEntry?.seriesId
    ? data?.series.find((s) => s.id === editorEntry.seriesId) ?? null
    : null

  function renderStaffRow(s: AdminStaff) {
    return (
      <div key={s.id} className="contents">
        <div className="sticky left-0 z-10 bg-grey-dark border-b border-r border-grey-mid">
          <button
            type="button"
            onClick={() => setEditStaffId(s.id)}
            title="EDIT STAFF"
            className="w-full text-left px-3 py-2 hover:bg-black/30 transition-colors"
          >
            <div className="font-mono text-xs text-white uppercase truncate underline decoration-dotted underline-offset-2">{s.firstName} {s.lastName}</div>
            <div className="font-mono text-2xs text-grey-light uppercase">{s.employmentType ?? ''}</div>
          </button>
        </div>
        {days.map((d, di) => {
          const entry = entryFor(s.id, d)
          const inFill = fill && fill.staffId === s.id
            ? inFillRect({ row: 0, col: di }, fillRect({ row: 0, col: fill.from }, { row: 0, col: fill.to }))
            : false
          return (
            <button
              key={d}
              type="button"
              data-fill-col={di}
              onClick={() => setEditor({ staffId: s.id, date: d })}
              className={`group/day relative border-b border-r border-grey-mid min-h-[64px] p-1.5 text-left hover:bg-black/30 transition-colors flex flex-col ${entry ? '' : 'bg-black/10'} ${inFill ? 'ring-1 ring-inset ring-accent/70 bg-accent/10' : ''}`}
            >
              {entry ? (
                <div className="flex-1 flex flex-col min-h-0 gap-1">
                  <AvailabilityBar
                    windows={entry.windows}
                    isAllDay={entry.isAllDay}
                    type={entry.type}
                    labelled
                    fill
                    series={entry.seriesId ? { endDate: entry.seriesEndDate } : null}
                  />
                  <div className="flex flex-wrap gap-1 items-center">
                    {entry.status !== 'APPROVED' && (
                      <span className={`font-mono text-2xs uppercase border px-1 ${statusMeta(entry.status).badge}`}>{entry.status}</span>
                    )}
                    {entry.timeOff && <span className="font-mono text-2xs uppercase text-warning">TO</span>}
                  </div>
                </div>
              ) : (
                <span className="font-mono text-2xs uppercase text-grey-mid">—</span>
              )}
              {entry && (
                <span
                  title="DRAG TO COPY THIS DAY"
                  onPointerDown={(e) => onFillPointerDown(e, s.id, di)}
                  onPointerMove={onFillPointerMove}
                  onPointerUp={onFillPointerUp}
                  onPointerCancel={onFillPointerCancel}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-0.5 right-0.5 z-20 flex h-3.5 w-3.5 items-center justify-center border border-white/80 bg-black/70 font-mono text-2xs leading-none text-white cursor-copy opacity-0 transition-opacity group-hover/day:opacity-100"
                  style={{ touchAction: 'none' }}
                >
                  ⤡
                </span>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white">AVAILABILITY</h1>
          <p className="font-mono text-xs uppercase text-grey-light mt-1">CONFIRM DECLARATIONS · RESOLVE EDIT REQUESTS · OVERRIDE ANY DAY</p>
        </div>
        <div className="text-right">
          <DateNav
            date={range.start}
            range={range}
            onChange={onChangeDate}
          />
        </div>
      </div>

      {error && <p className="font-mono text-xs text-danger border border-danger/50 bg-danger/10 px-3 py-2">{error}</p>}

      {/* Queue */}
      <div className="border border-grey-mid p-4 space-y-4">
        <h2 className="font-mono text-xs uppercase tracking-wider text-grey-light">WAITING FOR CONFIRMATION</h2>

        {pendingGroups.length === 0 && (data?.queue.requests.length ?? 0) === 0 && (
          <p className="font-mono text-xs uppercase text-grey-light">NOTHING WAITING.</p>
        )}

        {pendingGroups.map(([key, rows]) => {
          const first = rows[0]
          const dates = rows.map((r) => r.date).sort()
          const rangeLabel = dates[0] === dates[dates.length - 1]
            ? dates[0]
            : `${dates[0]} → ${dates[dates.length - 1]}`
          return (
            <div key={key} className="border border-grey-mid p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-sm text-white uppercase">{staffName(first.staffId ?? '')}</span>
                  <span className="font-mono text-xs text-grey-light ml-2">{rangeLabel}{rows.length > 1 ? ` · ${rows.length} DAYS` : ''}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {first.timeOff && <span className="font-mono text-2xs uppercase px-1.5 py-0.5 border border-warning text-warning">TIME OFF — CHECK LEAVE PAY</span>}
                  {first.seriesId && <span className="font-mono text-2xs uppercase px-1.5 py-0.5 border border-accent text-accent">{describeSeriesEnd(first.seriesEndDate)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1"><AvailabilityBar windows={first.windows} isAllDay={first.isAllDay} type={first.type} labelled showType /></div>
                <span className="font-mono text-2xs uppercase text-grey-light">{describeWindows(first.windows, first.isAllDay, first.type)}</span>
              </div>
              {first.notes && <p className="font-mono text-2xs uppercase text-grey-light">NOTE: {first.notes}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={notes[key] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [key]: e.target.value })}
                  placeholder="REVIEW NOTE (OPTIONAL)"
                  className="field flex-1 min-w-[10rem]"
                />
                <button disabled={busy} onClick={() => review(first.seriesId ? 'series' : 'ids', rows.map((r) => r.id!).filter(Boolean), first.staffId ?? '', first.seriesId, 'APPROVE', key)}
                  className="h-9 px-3 bg-success text-black font-mono text-xs uppercase font-bold hover:opacity-80 disabled:opacity-40">CONFIRM</button>
                <button disabled={busy} onClick={() => review(first.seriesId ? 'series' : 'ids', rows.map((r) => r.id!).filter(Boolean), first.staffId ?? '', first.seriesId, 'DECLINE', key)}
                  className="h-9 px-3 border border-danger text-danger font-mono text-xs uppercase hover:bg-danger hover:text-black disabled:opacity-40">DECLINE</button>
                <button disabled={busy} onClick={() => review(first.seriesId ? 'series' : 'ids', rows.map((r) => r.id!).filter(Boolean), first.staffId ?? '', first.seriesId, 'DELETE', key)}
                  title="CANCEL THIS DECLARATION WITHOUT APPROVING OR DECLINING"
                  className="h-9 px-3 border border-grey-mid text-grey-light font-mono text-xs uppercase hover:border-danger hover:text-danger disabled:opacity-40">CANCEL</button>
              </div>
            </div>
          )
        })}

        {data?.queue.requests.map((req) => (
          <div key={req.id} className="border border-accent/50 bg-accent/5 p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-mono text-sm text-white uppercase">{staffName(req.staffId)}</span>
                <span className="font-mono text-xs text-grey-light ml-2">EDIT REQUEST · {req.date} · {req.scope === 'THIS' ? 'JUST THIS DAY' : req.scope === 'FROM' ? 'FROM THIS DAY' : 'ALL IN SERIES'}</span>
              </div>
              <span className="font-mono text-2xs uppercase text-accent">{req.action} · {payloadSummary(req)}</span>
            </div>
            {req.reason && <p className="font-mono text-2xs uppercase text-grey-light">WORKER: {req.reason}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={notes[`req:${req.id}`] ?? ''}
                onChange={(e) => setNotes({ ...notes, [`req:${req.id}`]: e.target.value })}
                placeholder="REVIEW NOTE (OPTIONAL)"
                className="field flex-1 min-w-[10rem]"
              />
              <button disabled={busy} onClick={() => resolveRequest(req.id, 'APPLY')}
                className="h-9 px-3 bg-white text-black font-mono text-xs uppercase font-bold hover:bg-accent disabled:opacity-40">APPLY</button>
              <button disabled={busy} onClick={() => resolveRequest(req.id, 'DISCARD')}
                className="h-9 px-3 border border-grey-mid text-grey-light font-mono text-xs uppercase hover:border-white hover:text-white disabled:opacity-40">DISCARD</button>
            </div>
          </div>
        ))}
      </div>

      {/* Grid controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setGroupByPosition(!groupByPosition)}
          className={`font-mono text-xs uppercase px-3 py-1.5 border transition-colors ${
            groupByPosition ? 'bg-white text-black border-white' : 'text-grey-light border-grey-mid hover:border-white hover:text-white'
          }`}
        >
          GROUP BY POSITION
        </button>
        {pinnedDay && (
          <p className="font-mono text-2xs uppercase text-success">
            ● SHOWING STAFF AVAILABLE ON {formatDateLong(pinnedDay)} FIRST — CLICK THE DAY AGAIN TO CLEAR
          </p>
        )}
      </div>

      {/* Grid */}
      <div className="border border-grey-mid overflow-auto">
        {loading ? (
          <p className="p-4 font-mono text-xs text-grey-light loading-cursor">LOADING</p>
        ) : data && data.staff.length > 0 ? (
          <div
            className="grid"
            style={{
              gridTemplateColumns: `${NAME_COL}px repeat(${days.length}, minmax(${MIN_DAY_COL}px, 1fr))`,
              minWidth: NAME_COL + days.length * MIN_DAY_COL,
            }}
          >
            <div className="sticky top-0 left-0 z-30 bg-black border-b border-r border-grey-mid font-mono text-2xs uppercase text-white px-3 py-2">TEAM</div>
            {days.map((d) => {
              const dobj = parseDay(d)
              const pinned = pinnedDay === d
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPinnedDay(pinned ? null : d)}
                  title={pinned ? 'CLEAR THE AVAILABLE-FIRST PIN' : 'PIN AVAILABLE STAFF FOR THIS DAY'}
                  className={`sticky top-0 z-20 border-b border-r border-grey-mid px-2 py-2 text-left transition-colors ${
                    pinned ? 'bg-success/20' : d === today ? 'bg-black border-t-2 border-t-accent' : 'bg-black hover:bg-grey-dark'
                  }`}
                >
                  <div className={`font-mono text-2xs uppercase ${pinned ? 'text-success font-bold' : 'text-white'}`}>
                    {WEEKDAY[dobj.getUTCDay()]} {dobj.getUTCDate()}
                  </div>
                  {pinned && <div className="font-mono text-2xs uppercase text-success">● AVAILABLE FIRST</div>}
                  {!pinned && d === today && <div className="font-mono text-2xs uppercase text-accent">TODAY</div>}
                </button>
              )
            })}

            {groupByPosition
              ? displayGroups.map((g) => (
                  <div key={g.key} className="contents">
                    <div
                      ref={(el) => {
                        if (el) groupHeaderRefs.current.set(g.key, el)
                        else groupHeaderRefs.current.delete(g.key)
                      }}
                      style={{ gridColumn: '1 / -1' }}
                      className={`border-b border-grey-mid bg-grey-dark ${
                        draggingGroup === g.key ? 'opacity-40' : ''
                      } ${overGroup === g.key && draggingGroup && draggingGroup !== g.key ? 'ring-1 ring-inset ring-white' : ''}`}
                    >
                      <div
                        className={`sticky left-0 inline-flex items-center gap-2 px-3 py-1.5 ${g.positionId ? 'cursor-grab select-none' : ''}`}
                        onPointerDown={(e) => { if (g.positionId) onGroupPointerDown(e, g.key) }}
                        onPointerMove={g.positionId ? onGroupPointerMove : undefined}
                        onPointerUp={g.positionId ? onGroupPointerUp : undefined}
                        onPointerCancel={g.positionId ? onGroupPointerCancel : undefined}
                        style={g.positionId ? { touchAction: 'none' } : undefined}
                      >
                        {g.positionId && <span className="font-mono text-xs text-grey-light">⠿</span>}
                        {g.colour && <span className="w-2 h-2 shrink-0" style={{ backgroundColor: g.colour }} />}
                        <span className="font-mono text-2xs uppercase tracking-wider text-white">{g.label}</span>
                        <span className="font-mono text-2xs uppercase text-grey-light">{g.items.length}</span>
                      </div>
                    </div>
                    {g.items.map((s) => renderStaffRow(s))}
                  </div>
                ))
              : ungroupedStaff.map((s) => renderStaffRow(s))}
          </div>
        ) : (
          <p className="p-4 font-mono text-xs text-grey-light">NO STAFF FOR THIS VENUE.</p>
        )}
      </div>

      {/* Editor */}
      <Modal
        isOpen={!!editor}
        onClose={() => { if (!busy) setEditor(null) }}
        title={editor ? `AVAILABILITY — ${staffName(editor.staffId)}` : 'AVAILABILITY'}
        size="lg"
      >
        {editor && (
          <AvailabilityDayEditor
            key={`${editor.staffId}:${editor.date}`}
            dateKey={editor.date}
            entry={editorEntry}
            series={editorSeries}
            presets={data?.presets ?? []}
            canOverride
            busy={busy}
            error={error || null}
            onSave={(draft, options) => save(editor.staffId, editor.date, draft, options)}
            onClear={(options) => clear(editor.staffId, editor.date, options)}
            onClose={() => { if (!busy) setEditor(null) }}
          />
        )}
      </Modal>

      {/* Staff editor — opened from the name in the grid */}
      {editStaffId && (
        <StaffEditModal
          staffId={editStaffId}
          role={role}
          onClose={() => setEditStaffId(null)}
          onSaved={() => { setEditStaffId(null); load() }}
        />
      )}
    </div>
  )
}
