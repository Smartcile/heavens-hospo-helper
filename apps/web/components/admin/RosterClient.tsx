'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { DateNav } from '@/components/admin/DateNav'
import { EventStaffingModal, EventClaimsModal } from '@/components/admin/EventStaffingModal'
import { CalendarEventFormModal } from '@/components/admin/CalendarEventFormModal'
import { StaffEditModal } from '@/components/admin/StaffEditModal'
import { getActiveVenueId } from '@/lib/active-venue'
import { moveItem } from '@/lib/array'
import { fillRect, fillTargets, inFillRect, type FillCell } from '@/lib/cell-fill'
import { formatDateLong, keyOfDay, mondayOf, parseDay, shiftDay, weekKeys, type DateRange } from '@/lib/date-nav'
import { eventsByDay, formatEventTime } from '@/lib/event-roster'
import { seatFillStatus } from '@/lib/open-shifts'
import { useEventRoster } from '@/lib/use-event-roster'
import { nearestIndex, type Rect } from '@/lib/reorder'
import { useScrollRestore } from '@/lib/use-scroll-restore'
import { buildStaffGroups, insertSubset, sortByPinnedAvailability, topPositionId } from '@/lib/staff-groups'
import { colourForShift, rateForShift, rosterWeekSummary, staffWeekTotals, type RosterShift, type StaffRate } from '@/lib/roster-math'
import { generateRosterPdf } from '@/lib/roster-pdf'
import {
  availabilityMeta,
  availabilityState,
  conflictsWithShift,
  describeFreeWindows,
  describeWindows,
  freeWindowsFrom,
  isCasual,
} from '@/lib/availability'

interface RosterStaff {
  id: string
  firstName: string
  lastName: string
  hourlyRate: number | null
  employmentType: string | null
  departmentName: string | null
  positions: { id: string; name: string; colour: string | null; rate: number | null }[]
}

/** Roster rates with the per-role rates attached (for labour cost). */
function ratesFor(staff: RosterStaff[]): StaffRate[] {
  return staff.map((s) => ({
    staffId: s.id,
    hourlyRate: s.hourlyRate,
    positions: s.positions
      .filter((p): p is { id: string; name: string; colour: string | null; rate: number } => p.rate != null)
      .map((p) => ({ positionId: p.id, rate: p.rate })),
  }))
}

interface RosterAvailability {
  id: string
  type: 'UNAVAILABLE' | 'PREFERRED' | 'AVAILABLE'
  isAllDay: boolean
  startTime: string | null
  endTime: string | null
  windows: { type: 'AVAILABLE' | 'UNAVAILABLE'; startTime: string; endTime: string }[]
  status: 'PENDING' | 'APPROVED' | 'DECLINED'
  timeOff: boolean
  notes: string | null
}

interface RosterData {
  staff: RosterStaff[]
  shifts: RosterShift[]
  blockedDays: Record<string, string[]>
  availability: Record<string, Record<string, RosterAvailability>>
  budgetedSalesByDate: Record<string, number>
  summary: { totalCost: number; budgetedSales: number; staffingRatio: number; totalPaidHours: number }
}

interface Venue { id: string; name: string }

const WEEKDAY = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

// One border colour for every grid line, so rows/columns read clearly.
const GRID_LINE = 'border-grey-light/50'

function utcDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Minutes since local midnight — "today" availability is judged from now. */
function nowMinutes(): number {
  const n = new Date()
  return n.getHours() * 60 + n.getMinutes()
}

export function RosterClient({ role, sessionVenueId, defaultVenueId }: { role: string; sessionVenueId: string; defaultVenueId?: string | null }) {
  const [venueId, setVenueId] = useState(() => getActiveVenueId(role, sessionVenueId, defaultVenueId))
  const [venues, setVenues] = useState<Venue[]>([])
  const [positions, setPositions] = useState<{ id: string; name: string; colour: string | null }[]>([])
  const [weekStart, setWeekStart] = useState(() => mondayOf(keyOfDay(new Date())))
  const [tab, setTab] = useState<'staff' | 'events'>('staff')
  const [view, setView] = useState<'week' | 'day'>('week')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [data, setData] = useState<RosterData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { capture: captureScroll, restore: restoreScroll } = useScrollRestore()
  const [fullscreen, setFullscreen] = useState(false)
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable')
  const compact = density === 'compact'
  const [groupByPosition, setGroupByPosition] = useState(true)
  const [pinnedDay, setPinnedDay] = useState<string | null>(null)
  const [draggingGroup, setDraggingGroup] = useState<string | null>(null)
  const [overGroup, setOverGroup] = useState<string | null>(null)
  const groupHeaderRefs = useRef<Map<string, HTMLElement>>(new Map())
  const groupDragRef = useRef<{ key: string; x: number; y: number; moved: boolean } | null>(null)
  const overGroupRef = useRef<string | null>(null)

  // Shift drag — move a block onto another staff/day, or fill-copy from the corner handle.
  const [draggingShiftId, setDraggingShiftId] = useState<string | null>(null)
  const [shiftDrop, setShiftDrop] = useState<FillCell | null>(null)
  const [fill, setFill] = useState<{ shift: RosterShift; from: FillCell; to: FillCell } | null>(null)
  const shiftDragRef = useRef<{ shift: RosterShift; from: FillCell; x: number; y: number; moved: boolean } | null>(null)
  const shiftDropRef = useRef<FillCell | null>(null)
  const fillRef = useRef<{ shift: RosterShift; from: FillCell; to: FillCell; x: number; y: number; moved: boolean } | null>(null)
  const suppressShiftClickRef = useRef(false)
  const [pendingDrag, setPendingDrag] = useState<
    | { kind: 'move'; shift: RosterShift; to: FillCell }
    | { kind: 'copy'; shift: RosterShift; copies: { staffId: string; date: string }[] }
    | null
  >(null)

  // Shift modal
  const [modal, setModal] = useState<null | { shift: RosterShift | null; staffId: string; date: string }>(null)
  const [form, setForm] = useState({ staffId: '', date: '', startTime: '09:00', endTime: '17:00', positionId: '', colour: '', tag: '', breakMinutes: '0', note: '', calendarEventId: '' })
  const [editStaffId, setEditStaffId] = useState<string | null>(null)

  // Analyze / Visualize modals
  const [showAnalyze, setShowAnalyze] = useState(false)
  const [showVisualize, setShowVisualize] = useState(false)

  // Events tab (same staff grid + event chips in the day headers)
  const [openEventId, setOpenEventId] = useState<string | null>(null)
  const [editEventId, setEditEventId] = useState<string | null>(null)
  const [createEventOpen, setCreateEventOpen] = useState(false)
  const [showQueue, setShowQueue] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)

  const weekDays = useMemo(() => (view === 'week' ? weekKeys(weekStart) : [weekStart]), [view, weekStart])
  const todayKey = keyOfDay(new Date())
  const rangeEnd = useMemo(() => shiftDay(weekStart, view === 'week' ? 6 : 0), [weekStart, view])

  // Events data loads only on the EVENTS tab (chips overlay the staff grid).
  const eventRoster = useEventRoster(venueId, weekStart, rangeEnd, tab === 'events')
  const eventCells = useMemo(
    () => (eventRoster.data ? eventsByDay(eventRoster.data.events, eventRoster.data.areas, weekStart, rangeEnd) : {}),
    [eventRoster.data, weekStart, rangeEnd],
  )
  const openEvent = openEventId ? eventRoster.data?.events.find((e) => e.id === openEventId) ?? null : null
  const listedSeats = useMemo(
    () =>
      eventRoster.data
        ? eventRoster.data.events.reduce((n, e) => n + e.openShifts.filter((s) => s.status !== 'CANCELLED').length, 0)
        : 0,
    [eventRoster.data],
  )

  async function loadMeta() {
    const [vR, pR] = await Promise.all([fetch('/api/admin/venues'), fetch(`/api/admin/positions?venueId=${venueId}`)])
    const [vData, pData] = await Promise.all([vR.json(), pR.json()])
    setVenues(Array.isArray(vData) ? vData : [])
    setPositions(Array.isArray(pData) ? pData : [])
  }

  // Soft reload (save-triggered) keeps the grid mounted and restores scroll;
  // a hard load is user navigation.
  const load = useCallback(async (soft = false) => {
    if (!venueId) { setLoading(false); return }
    if (soft) { captureScroll(); setRefreshing(true) } else { setLoading(true) }
    setError('')
    const start = weekStart
    const end = shiftDay(weekStart, view === 'week' ? 6 : 0)
    const r = await fetch(`/api/admin/roster?venueId=${venueId}&start=${start}&end=${end}`)
    const d = await r.json()
    if (!r.ok) {
      setError(d.error ?? 'LOAD FAILED')
      setLoading(false)
      setRefreshing(false)
      return
    }
    setData(d)
    setLoading(false)
    setRefreshing(false)
    if (soft) restoreScroll()
  }, [venueId, weekStart, view, captureScroll, restoreScroll])

  useEffect(() => { loadMeta() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (venueId) load(false) }, [venueId, load])

  useEffect(() => {
    function onFs() { setFullscreen(!!document.fullscreenElement) }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const filteredStaff = useMemo(() => {
    if (!data) return []
    return data.staff.filter((s) => {
      if (search && !`${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase())) return false
      if (roleFilter && !s.positions.some((p) => p.id === roleFilter)) return false
      return true
    })
  }, [data, search, roleFilter])

  // Position-grouped view (drag the headers to re-rank the roles; persisted on
  // Position.sortOrder). `NO POSITION` keeps any unassigned staff at the bottom.
  const staffGroups = useMemo(() => {
    if (!data) return []
    return buildStaffGroups(filteredStaff, positions)
  }, [data, filteredStaff, positions])

  // Pinning a day (click its header) floats people with free time that day to
  // the top of their group — split days included; for today only the time still
  // ahead counts, so a morning window doesn't float at 3pm.
  const freeOnPinnedDay = useCallback(
    (staffId: string) => {
      if (!pinnedDay || !data) return false
      const entry = data.availability[staffId]?.[pinnedDay]
      if (!entry) return false
      const state = availabilityState(entry)
      if (state === 'DEFAULT') return false
      if (pinnedDay === todayKey) return freeWindowsFrom(entry, nowMinutes()).length > 0
      return state !== 'UNAVAILABLE'
    },
    [pinnedDay, data, todayKey],
  )

  const displayGroups = useMemo(
    () =>
      pinnedDay
        ? staffGroups.map((g) => ({ ...g, items: sortByPinnedAvailability(g.items, (s) => freeOnPinnedDay(s.id)) }))
        : staffGroups,
    [staffGroups, pinnedDay, freeOnPinnedDay],
  )

  const displayStaff = useMemo(
    () => (pinnedDay ? sortByPinnedAvailability(filteredStaff, (s) => freeOnPinnedDay(s.id)) : filteredStaff),
    [filteredStaff, pinnedDay, freeOnPinnedDay],
  )

  const rowStaff = useMemo(
    () => (groupByPosition ? displayGroups.flatMap((g) => g.items) : displayStaff),
    [groupByPosition, displayGroups, displayStaff],
  )

  const rowNumber = useMemo(() => {
    const map = new Map<string, number>()
    rowStaff.forEach((s, i) => map.set(s.id, i + 1))
    return map
  }, [rowStaff])

  const staffLabel = (id: string) => {
    const person = data?.staff.find((s) => s.id === id)
    return person ? `${person.firstName} ${person.lastName}` : 'STAFF'
  }

  const pendingMoveTarget = pendingDrag?.kind === 'move'
    ? { staff: rowStaff[pendingDrag.to.row], date: weekDays[pendingDrag.to.col] }
    : null

  const visibleGroupKeys = useMemo(
    () => staffGroups.filter((g) => g.positionId).map((g) => g.key),
    [staffGroups],
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
    const next = fullOrder.map((id) => byId.get(id)).filter((p): p is { id: string; name: string; colour: string | null } => !!p)
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

  function cellFromPoint(x: number, y: number): FillCell | null {
    const el = typeof document !== 'undefined' ? document.elementFromPoint?.(x, y) ?? null : null
    const cell = (el as HTMLElement | null)?.closest?.('[data-fill-row]') as HTMLElement | null
    if (!cell) return null
    const row = Number(cell.dataset.fillRow)
    const col = Number(cell.dataset.fillCol)
    if (!Number.isFinite(row) || !Number.isFinite(col)) return null
    return { row, col }
  }

  function onShiftPointerDown(e: React.PointerEvent, shift: RosterShift, from: FillCell) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    suppressShiftClickRef.current = false
    shiftDragRef.current = { shift, from, x: e.clientX, y: e.clientY, moved: false }
  }

  function onShiftPointerMove(e: React.PointerEvent) {
    const drag = shiftDragRef.current
    if (!drag) return
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true
    if (!drag.moved) return
    suppressShiftClickRef.current = true
    setDraggingShiftId(drag.shift.id)
    const cell = cellFromPoint(e.clientX, e.clientY)
    shiftDropRef.current = cell
    setShiftDrop(cell)
  }

  function onShiftPointerUp() {
    const drag = shiftDragRef.current
    const drop = shiftDropRef.current
    shiftDragRef.current = null
    shiftDropRef.current = null
    setDraggingShiftId(null)
    setShiftDrop(null)
    if (!drag || !drag.moved || !drop) return
    if (drop.row === drag.from.row && drop.col === drag.from.col) return
    setError('')
    setPendingDrag({ kind: 'move', shift: drag.shift, to: drop })
  }

  function onShiftPointerCancel() {
    shiftDragRef.current = null
    shiftDropRef.current = null
    setDraggingShiftId(null)
    setShiftDrop(null)
  }

  function onFillPointerDown(e: React.PointerEvent, shift: RosterShift, from: FillCell) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    fillRef.current = { shift, from, to: from, x: e.clientX, y: e.clientY, moved: false }
    setFill({ shift, from, to: from })
  }

  function onFillPointerMove(e: React.PointerEvent) {
    const drag = fillRef.current
    if (!drag) return
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true
    if (!drag.moved) return
    const cell = cellFromPoint(e.clientX, e.clientY)
    if (!cell) return
    drag.to = cell
    setFill({ shift: drag.shift, from: drag.from, to: cell })
  }

  function onFillPointerUp() {
    const drag = fillRef.current
    fillRef.current = null
    setFill(null)
    if (!drag || !drag.moved) return
    const targets = fillTargets(drag.from, fillRect(drag.from, drag.to))
    const copies = targets
      .map((c) => ({ staff: rowStaff[c.row], date: weekDays[c.col] }))
      .filter((x): x is { staff: RosterStaff; date: string } => !!x.staff && !!x.date)
      .filter((x) => !(data?.blockedDays[x.staff.id] ?? []).includes(x.date))
      .filter((x) => !(x.staff.id === drag.shift.staffId && x.date === drag.shift.date))
      .map((x) => ({ staffId: x.staff.id, date: x.date }))
    if (copies.length === 0) return
    setError('')
    setPendingDrag({ kind: 'copy', shift: drag.shift, copies })
  }

  function onFillPointerCancel() {
    fillRef.current = null
    setFill(null)
  }

  function confirmDrag() {
    const pending = pendingDrag
    setPendingDrag(null)
    if (!pending) return
    if (pending.kind === 'move') void moveShift(pending.shift, pending.to)
    else void copyShifts(pending.shift, pending.copies)
  }

  async function copyShifts(shift: RosterShift, copies: { staffId: string; date: string }[]) {
    if (copies.length === 0) return
    setBusy(true); setError('')
    const body = {
      startTime: shift.startTime,
      endTime: shift.endTime,
      positionId: shift.positionId ?? null,
      colour: shift.colour ?? null,
      tag: shift.tag ?? null,
      breakMinutes: shift.breakMinutes ?? 0,
      note: shift.note ?? null,
      calendarEventId: shift.calendarEventId ?? null,
    }
    const results = await Promise.all(copies.map((x) =>
      fetch('/api/admin/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, staffId: x.staffId, date: x.date }),
      }),
    ))
    setBusy(false)
    const failed = results.filter((r) => !r.ok).length
    if (failed) setError(`${failed} SHIFT${failed === 1 ? '' : 'S'} FAILED TO COPY`)
    load(true)
  }

  async function moveShift(shift: RosterShift, target: FillCell) {
    const staff = rowStaff[target.row]
    const date = weekDays[target.col]
    if (!staff || !date) return
    setBusy(true); setError('')
    const r = await fetch(`/api/admin/shifts/${shift.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: staff.id, date }),
    })
    setBusy(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError((d.error ?? 'COULD NOT MOVE THE SHIFT').toUpperCase())
      return
    }
    load(true)
  }

  const totals = useMemo(() => {
    if (!data) return { byStaff: new Map<string, { hours: number; cost: number; shiftCount: number }>(), summary: { totalCost: 0, budgetedSales: 0, staffingRatio: 0, totalPaidHours: 0 } }
    const byStaff = staffWeekTotals(data.shifts, ratesFor(data.staff))
    const summary = rosterWeekSummary(data.shifts, ratesFor(data.staff), data.budgetedSalesByDate)
    return { byStaff, summary }
  }, [data])

  const publishedStatus = useMemo(() => {
    if (!data || data.shifts.length === 0) return 'DRAFT'
    const allPublished = data.shifts.every((s) => s.status === 'PUBLISHED')
    const anyPublished = data.shifts.some((s) => s.status === 'PUBLISHED')
    return allPublished ? 'PUBLISHED' : anyPublished ? 'MIXED' : 'DRAFT'
  }, [data])

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await rootRef.current?.requestFullscreen()
    }
  }

  // The DateNav picks a single day/range; a WEEK view snaps to that week's Monday.
  function onChangeDate(next: string, _range: DateRange) {
    setWeekStart(view === 'week' ? mondayOf(next) : next)
  }

  async function handlePublish(published: boolean) {
    if (!venueId) return
    setBusy(true); setError('')
    const start = weekStart
    const end = shiftDay(weekStart, view === 'week' ? 6 : 0)
    const r = await fetch('/api/admin/roster/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, start, end, published }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'FAILED'); return }
    load(true)
  }

  function defaultPositionFor(staffId: string): string {
    const member = data?.staff.find((x) => x.id === staffId)
    return topPositionId(member?.positions ?? [], positions.map((p) => p.id)) ?? ''
  }

  function openModal(staffId: string, date: string, shift: RosterShift | null = null) {
    setModal({ shift, staffId, date })
    setForm(shift ? {
      staffId: shift.staffId,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      positionId: shift.positionId ?? defaultPositionFor(shift.staffId),
      colour: shift.colour ?? '',
      tag: shift.tag ?? '',
      breakMinutes: String(shift.breakMinutes ?? 0),
      note: shift.note ?? '',
      calendarEventId: shift.calendarEventId ?? '',
    } : { staffId, date, startTime: '09:00', endTime: '17:00', positionId: defaultPositionFor(staffId), colour: '', tag: '', breakMinutes: '0', note: '', calendarEventId: '' })
    setError('')
  }

  async function saveShift() {
    if (!form.staffId || !form.date || !form.startTime || !form.endTime) { setError('ALL FIELDS EXCEPT TAG/COLOUR ARE REQUIRED'); return }
    // Soft warning: the person has flagged this day (or window) as unavailable.
    const avail = data?.availability[form.staffId]?.[form.date]
    if (conflictsWithShift(avail, form.startTime, form.endTime)) {
      const person = data?.staff.find((s) => s.id === form.staffId)
      const who = person ? `${person.firstName} ${person.lastName}` : 'THIS STAFF MEMBER'
      if (!confirm(`${who} IS MARKED UNAVAILABLE AT THIS TIME. ASSIGN THIS SHIFT ANYWAY?`)) return
    }
    // Soft warning: the person is not yet trained for this role's requirements.
    if (form.positionId) {
      try {
        const rr = await fetch(`/api/admin/positions/${form.positionId}/readiness`)
        if (rr.ok) {
          const rows: { staffId: string; readiness: { requiredCount: number; completedCount: number; ready: boolean } }[] = await rr.json()
          const row = rows.find((x) => x.staffId === form.staffId)
          if (row && row.readiness.requiredCount > 0 && !row.readiness.ready) {
            const person = data?.staff.find((s) => s.id === form.staffId)
            const who = person ? `${person.firstName} ${person.lastName}` : 'THIS STAFF MEMBER'
            if (!confirm(`${who} IS NOT YET TRAINED FOR THIS ROLE (${row.readiness.completedCount}/${row.readiness.requiredCount} REQUIRED GUIDES). ASSIGN THIS SHIFT ANYWAY?`)) return
          }
        }
      } catch { /* warning only — never block the save */ }
    }
    setBusy(true); setError('')
    const body = {
      staffId: form.staffId,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      positionId: form.positionId || null,
      colour: form.colour || null,
      tag: form.tag || null,
      breakMinutes: Number(form.breakMinutes) || 0,
      note: form.note || null,
      calendarEventId: form.calendarEventId || null,
    }
    const r = modal?.shift
      ? await fetch(`/api/admin/shifts/${modal.shift.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/admin/shifts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setBusy(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'SAVE FAILED'); return }
    setModal(null)
    load(true)
  }

  async function deleteShift(id: string) {
    if (!confirm('DELETE THIS SHIFT?')) return
    await fetch(`/api/admin/shifts/${id}`, { method: 'DELETE' })
    setModal(null)
    load(true)
  }

  async function reviewQueueClaim(claimId: string, action: 'APPROVE' | 'DECLINE') {
    setBusy(true); setError('')
    const r = await fetch(`/api/admin/open-shift-claims/${claimId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setError((d.error ?? 'FAILED').toUpperCase()); return }
    eventRoster.reload()
    load(true)
  }

  function printRoster() {
    if (!data) return
    const end = shiftDay(weekStart, view === 'week' ? 6 : 0)
    const doc = generateRosterPdf({
      venueName: venues.find((v) => v.id === venueId)?.name ?? 'ROSTER',
      weekLabel: `${formatDateLong(weekStart)} — ${formatDateLong(end)}`,
      weekDates: weekDays,
      staff: filteredStaff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` })),
      shifts: data.shifts,
      rates: ratesFor(data.staff),
    })
    doc.save(`ROSTER-${weekStart}.pdf`)
  }

  const positionTotals = useMemo(() => {
    if (!data) return []
    const map = new Map<string, { name: string; hours: number; cost: number; count: number }>()
    const rateIndex = new Map(ratesFor(data.staff).map((r) => [r.staffId, r]))
    for (const s of data.shifts) {
      const name = s.positionName ?? 'GENERAL'
      const e = map.get(name) ?? { name, hours: 0, cost: 0, count: 0 }
      const [sh, sm] = s.startTime.split(':').map(Number)
      const [eh, em] = s.endTime.split(':').map(Number)
      let mins = eh * 60 + em - (sh * 60 + sm)
      if (mins < 0) mins += 24 * 60
      mins -= Math.min(s.breakMinutes ?? 0, mins)
      e.hours = Math.round((e.hours + mins / 60) * 100) / 100
      const rate = rateForShift(s, rateIndex.get(s.staffId)) ?? 0
      e.cost = Math.round((e.cost + (mins / 60) * rate) * 100) / 100
      e.count += 1
      map.set(name, e)
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours)
  }, [data])

  const coverage = useMemo(() => {
    if (!data) return []
    return weekDays.map((day) => {
      const dayShifts = data.shifts.filter((s) => s.date === day)
      const hours = dayShifts.reduce((t, s) => {
        const [sh, sm] = s.startTime.split(':').map(Number)
        const [eh, em] = s.endTime.split(':').map(Number)
        let mins = eh * 60 + em - (sh * 60 + sm)
        if (mins < 0) mins += 24 * 60
        return t + Math.max(0, mins - Math.min(s.breakMinutes ?? 0, mins)) / 60
      }, 0)
      return { day, count: dayShifts.length, hours: Math.round(hours * 100) / 100 }
    })
  }, [data, weekDays])

  function renderStaffRow(s: RosterStaff) {
    const t = totals.byStaff.get(s.id)
    const n = rowNumber.get(s.id) ?? 0
    const ri = n - 1
    return (
      <div key={s.id} className="contents">
        {/* Staff cell — sticky left */}
        <div className={`sticky left-0 z-10 bg-grey-dark border-b border-r ${GRID_LINE} ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}>
          <button onClick={() => setEditStaffId(s.id)} title="EDIT STAFF" className={`font-mono text-accent hover:text-white underline decoration-dotted underline-offset-2 ${compact ? 'text-2xs' : 'text-xs'}`}>
            {n} — {s.firstName} {s.lastName}
          </button>
          <div className="font-mono text-2xs text-grey-light mt-0.5">
            {t ? `${t.hours.toFixed(2)}HRS / $${t.cost.toFixed(2)}` : '0HRS / $0.00'}
          </div>
          {s.positions.length > 0 && (
            <div className="font-mono text-2xs text-grey-light mt-0.5 truncate">{s.positions.map((p) => p.name).join(' · ')}</div>
          )}
        </div>
        {weekDays.map((d, di) => {
          const dayShifts = data!.shifts.filter((sh) => sh.staffId === s.id && sh.date === d)
          const blocked = (data!.blockedDays[s.id] ?? []).includes(d)
          const avail = data!.availability[s.id]?.[d]
          const state = availabilityState(avail)
          const meta = availabilityMeta(state, s.employmentType)
          // Today is judged from the current time — a window that has passed
          // doesn't count as available.
          const isToday = d === todayKey
          const freeText = avail && state !== 'DEFAULT' ? describeFreeWindows(avail, isToday ? nowMinutes() : undefined) : null
          const noFreeLeft = isToday && state === 'PARTIAL' && freeText === 'NO FREE TIME'
          // FT/PT default is implied-available (no badge). A casual's
          // UNSET only matters where they're not already rostered.
          const showBadge = !blocked && (state !== 'DEFAULT' || (isCasual(s.employmentType) && dayShifts.length === 0))
          const dropTarget = shiftDrop?.row === ri && shiftDrop?.col === di
          const inFill = fill ? inFillRect({ row: ri, col: di }, fillRect(fill.from, fill.to)) : false
          return (
            <div key={d} data-fill-row={ri} data-fill-col={di}
              className={`border-b border-r ${GRID_LINE} ${compact ? 'min-h-[44px] p-0.5' : 'min-h-[72px] p-1'} relative ${blocked ? 'bg-danger/5' : meta.tint} ${blocked ? '' : 'hover:bg-black/20'} ${dropTarget ? 'ring-2 ring-inset ring-accent' : ''} ${inFill ? 'ring-1 ring-inset ring-accent/70 bg-accent/10' : ''}`}
              onClick={() => { if (suppressShiftClickRef.current) { suppressShiftClickRef.current = false; return } if (!blocked) openModal(s.id, d) }}>
              {showBadge && (
                <div className="absolute top-0.5 right-0.5 z-0 pointer-events-none flex flex-col items-end gap-0.5">
                  <span
                    className={`font-mono text-2xs uppercase px-1 border ${noFreeLeft ? 'border-danger text-danger' : meta.badge}`}
                    title={avail
                      ? `${meta.label} · ${freeText}${avail.status !== 'APPROVED' ? ` · ${avail.status}` : ''}${avail.timeOff ? ' · TIME OFF' : ''}${avail.notes ? ` · ${avail.notes}` : ''}`
                      : 'NO PREFERENCE LOGGED'}>
                    {noFreeLeft ? 'NO FREE LEFT' : meta.label}
                  </span>
                  {state === 'PARTIAL' && avail && (
                    <span className="font-mono text-2xs uppercase px-1 border border-warning/50 text-warning bg-black/50">
                      {freeText}
                    </span>
                  )}
                  {avail?.status === 'PENDING' && (
                    <span className="font-mono text-2xs uppercase px-1 border border-warning text-warning bg-black/50">PENDING</span>
                  )}
                  {avail?.timeOff && (
                    <span className="font-mono text-2xs uppercase text-warning">TIME OFF</span>
                  )}
                </div>
              )}
              {blocked && (
                <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none">
                  <span className="font-mono text-2xs uppercase text-danger tracking-widest bg-black/60 px-2 py-0.5">TIME OFF</span>
                </div>
              )}
              <div className="space-y-1 relative z-10">
                {dayShifts.map((sh) => (
                  <div key={sh.id}
                    onPointerDown={(e) => onShiftPointerDown(e, sh, { row: ri, col: di })}
                    onPointerMove={onShiftPointerMove}
                    onPointerUp={onShiftPointerUp}
                    onPointerCancel={onShiftPointerCancel}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (suppressShiftClickRef.current) { suppressShiftClickRef.current = false; return }
                      openModal(s.id, d, sh)
                    }}
                    className={`group/shift relative ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1'} cursor-grab hover:opacity-80 transition-opacity ${draggingShiftId === sh.id ? 'opacity-40' : ''}`}
                    style={{ backgroundColor: colourForShift(sh), touchAction: 'none' }}>
                    <div className="font-mono text-2xs font-bold text-white leading-tight">{sh.startTime} — {sh.endTime}</div>
                    <div className="font-mono text-2xs text-white/90 leading-tight truncate">
                      {sh.tag ?? sh.positionName ?? 'SHIFT'}{sh.breakMinutes ? ` · ${sh.breakMinutes}M BRK` : ''}
                    </div>
                    {sh.status === 'DRAFT' && <div className="font-mono text-2xs uppercase text-black/60 mt-0.5">DRAFT</div>}
                    <span
                      title="DRAG TO COPY THIS SHIFT"
                      onPointerDown={(e) => onFillPointerDown(e, sh, { row: ri, col: di })}
                      onPointerMove={onFillPointerMove}
                      onPointerUp={onFillPointerUp}
                      onPointerCancel={onFillPointerCancel}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute -top-1 -right-1 z-10 flex h-3.5 w-3.5 items-center justify-center border border-white/80 bg-black/70 font-mono text-2xs leading-none text-white cursor-copy opacity-0 transition-opacity group-hover/shift:opacity-100"
                      style={{ touchAction: 'none' }}>
                      ⤡
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div ref={rootRef} className="p-4 md:p-6 space-y-4 bg-black">
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-mono text-xl font-bold uppercase tracking-widest">ROSTER EDITOR</h1>
            <div className="flex gap-1 mt-2">
              {(['staff', 'events'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`font-mono text-xs uppercase px-3 py-1.5 border transition-colors ${tab === t ? 'bg-white text-black border-white' : 'text-grey-light border-grey-mid hover:border-white hover:text-white'}`}>
                  {t === 'staff' ? 'STAFF' : 'EVENTS'}
                </button>
              ))}
            </div>
          </div>
          <div className="text-right">
            <DateNav
              date={weekStart}
              range={{ start: weekStart, end: shiftDay(weekStart, view === 'week' ? 6 : 0) }}
              onChange={onChangeDate}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {(['day', 'week'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`font-mono text-xs uppercase px-3 py-1.5 border transition-colors ${view === v ? 'bg-white text-black border-white' : 'text-grey-light border-grey-mid hover:border-white hover:text-white'}`}>
                {v === 'day' ? 'DAY' : 'WEEK'}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {(['comfortable', 'compact'] as const).map((dv) => (
              <button key={dv} onClick={() => setDensity(dv)}
                className={`font-mono text-xs uppercase px-3 py-1.5 border transition-colors ${density === dv ? 'bg-white text-black border-white' : 'text-grey-light border-grey-mid hover:border-white hover:text-white'}`}>
                {dv === 'compact' ? 'COMPACT' : 'COMFORT'}
              </button>
            ))}
          </div>
          <button onClick={() => setGroupByPosition(!groupByPosition)} title="GROUP BY POSITION"
            className={`font-mono text-xs uppercase px-3 py-1.5 border transition-colors ${groupByPosition ? 'bg-white text-black border-white' : 'text-grey-light border-grey-mid hover:border-white hover:text-white'}`}>
            GROUP
          </button>
          <div className="w-40">
            <Select value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              options={[{ value: '', label: 'ALL ROLES' }, ...positions.map(p => ({ value: p.id, label: p.name }))]} />
          </div>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="NAME..." className="w-40" />
          <Button size="sm" variant="ghost" onClick={printRoster}>PRINT</Button>
          <Button size="sm" variant="ghost" onClick={toggleFullscreen}>{fullscreen ? 'EXIT FS' : 'FULLSCREEN'}</Button>
          <Button size="sm"
            variant={publishedStatus === 'PUBLISHED' ? 'primary' : 'ghost'}
            onClick={() => handlePublish(publishedStatus !== 'PUBLISHED')}
            loading={busy}>
            {publishedStatus === 'PUBLISHED' ? '✔ PUBLISHED' : publishedStatus === 'MIXED' ? '● MIXED' : 'PUBLISH'}
          </Button>
          {tab === 'events' && (
            <>
              <Button size="sm" variant="ghost" onClick={eventRoster.syncNow} loading={eventRoster.syncing}>↻ SYNC CALENDARS</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowQueue(true)}>
                CLAIMS{eventRoster.data && eventRoster.data.queue.length > 0 ? ` (${eventRoster.data.queue.length})` : ''}
              </Button>
              <Button size="sm" onClick={() => setCreateEventOpen(true)}>+ NEW EVENT</Button>
              <span className="font-mono text-2xs uppercase text-grey-light">
                {listedSeats > 0 ? `${listedSeats} LISTED SHIFT${listedSeats === 1 ? '' : 'S'} THIS WEEK` : 'NO LISTED SHIFTS THIS WEEK'}
              </span>
              <span className="font-mono text-2xs uppercase text-grey-light ml-auto">
                {eventRoster.data?.lastSyncedAt ? `SYNCED ${new Date(eventRoster.data.lastSyncedAt).toLocaleString('en-NZ')}` : 'NOT YET SYNCED'}
              </span>
            </>
          )}
        </div>
      </div>

      {tab === 'events' && (eventRoster.error || error) && (
        <p className="font-mono text-xs text-danger">{(eventRoster.error || error).toUpperCase()}</p>
      )}

      {error && tab === 'staff' && <p className="font-mono text-xs text-danger">{error}</p>}

      {/* Availability legend */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 border border-danger bg-danger/20" /><span className="font-mono text-2xs uppercase text-grey-light">Unavailable</span></span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 border border-success bg-success/20" /><span className="font-mono text-2xs uppercase text-grey-light">Available</span></span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 border border-warning bg-warning/20" /><span className="font-mono text-2xs uppercase text-grey-light">Split (part of day)</span></span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 border border-warning bg-warning/20" /><span className="font-mono text-2xs uppercase text-grey-light">Unset (casual)</span></span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 border border-grey-mid bg-danger/5" /><span className="font-mono text-2xs uppercase text-grey-light">Time off</span></span>
        <span className="font-mono text-2xs uppercase text-grey-light">HOVER A BADGE FOR FREE TIME · CLICK A DAY HEADER TO FLOAT WHO IS FREE TO THE TOP</span>
      </div>

      {/* Grid */}
      {refreshing && !loading && (
        <p className="font-mono text-2xs uppercase text-grey-light loading-cursor">REFRESHING…</p>
      )}
      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : data && filteredStaff.length > 0 ? (
        <div className={`border ${GRID_LINE} overflow-auto max-h-[70vh]`} data-scroll-key="roster-grid">
          <div className="grid" style={{ gridTemplateColumns: `220px repeat(${weekDays.length}, minmax(140px, 1fr))`, minWidth: 220 + weekDays.length * 140 }}>
            {/* Header row */}
            <div className={`sticky top-0 left-0 z-20 bg-black border-b-2 border-r ${GRID_LINE} font-mono text-2xs uppercase text-white ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}>TEAM</div>
            {weekDays.map((d, di) => (
              <div key={d} className={`sticky top-0 z-10 bg-black border-b-2 border-r ${GRID_LINE} ${compact ? 'px-2 py-1' : 'px-3 py-2'} ${d === todayKey ? 'border-l-2 border-l-accent' : ''} ${pinnedDay === d ? 'ring-1 ring-inset ring-accent' : ''}`}>
                <button
                  type="button"
                  onClick={() => setPinnedDay((prev) => (prev === d ? null : d))}
                  title={pinnedDay === d ? 'UNPIN THIS DAY' : 'PIN THIS DAY — FLOAT WHO IS FREE TO THE TOP'}
                  className="w-full text-left"
                >
                  <div className="font-mono text-2xs uppercase text-white">{WEEKDAY[di]} {parseDay(d).getUTCDate()}</div>
                  {d === todayKey && <div className="font-mono text-2xs uppercase text-accent">TODAY</div>}
                  {pinnedDay === d && <div className="font-mono text-2xs uppercase text-accent">PINNED</div>}
                </button>
                {tab === 'events' && (eventCells[d] ?? []).length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {(eventCells[d] ?? []).map(({ event, area }) => {
                      const fill = seatFillStatus(event.openShifts)
                      return (
                        <button
                          key={event.id}
                          onClick={() => setOpenEventId(event.id)}
                          title={[event.title, area?.name, typeof event.pax === 'number' ? `${event.pax} PAX` : null].filter(Boolean).join(' · ')}
                          className="block w-full text-left border border-grey-mid bg-black/40 hover:border-white px-1 py-0.5 transition-colors"
                          style={area?.colour ? { borderLeft: `3px solid ${area.colour}` } : undefined}
                        >
                          <div className="font-mono text-2xs font-bold text-white truncate leading-tight">
                            {formatEventTime(event)} {event.title}
                          </div>
                          <div className="font-mono text-2xs text-grey-light truncate leading-tight">
                            {area?.name ?? 'OTHER'}
                            {typeof event.pax === 'number' ? ` · ${event.pax} PAX` : ''}
                            {fill.total > 0 ? ` · ${fill.filled}/${fill.total}` : ''}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}

            {groupByPosition
              ? displayGroups.map((g) => (
                  <div key={g.key} className="contents">
                    <div
                      ref={(el) => {
                        if (el) groupHeaderRefs.current.set(g.key, el)
                        else groupHeaderRefs.current.delete(g.key)
                      }}
                      style={{ gridColumn: '1 / -1' }}
                      className={`border-b ${GRID_LINE} bg-grey-dark/60 ${
                        draggingGroup === g.key ? 'opacity-40' : ''
                      } ${overGroup === g.key && draggingGroup && draggingGroup !== g.key ? 'ring-1 ring-inset ring-white' : ''}`}
                    >
                      <div
                        className={`sticky left-0 inline-flex items-center gap-2 ${compact ? 'px-2 py-1' : 'px-3 py-1.5'} ${g.positionId ? 'cursor-grab select-none' : ''}`}
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
                    {g.items.map(renderStaffRow)}
                  </div>
                ))
              : displayStaff.map(renderStaffRow)}
          </div>
        </div>
      ) : (
        <p className="font-mono text-xs text-grey-light">NO STAFF OR SHIFTS FOR THIS RANGE.</p>
      )}

      {/* Analyze / Visualize + summary footer */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowAnalyze(true)}>ANALYZE</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowVisualize(true)}>VISUALIZE</Button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-1 max-w-3xl">
          {[
            { label: 'TOTAL COST', value: `$${totals.summary.totalCost.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}` },
            { label: 'BUDGETED SALES (EXCL GST)', value: `$${totals.summary.budgetedSales.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}` },
            { label: 'STAFFING RATIO', value: `${totals.summary.staffingRatio.toFixed(2)}%` },
            { label: 'TOTAL PAID HOURS', value: totals.summary.totalPaidHours.toFixed(2) },
          ].map((x) => (
            <div key={x.label} className="border border-grey-mid p-3">
              <div className="font-mono text-2xs uppercase text-grey-light tracking-wider mb-1">{x.label}</div>
              <div className="font-mono text-sm font-bold text-white">{x.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Drag confirmation — copy or move */}
      {pendingDrag && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => { if (!busy) setPendingDrag(null) }}>
          <div className="bg-grey-dark border border-grey-mid p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-mono text-xs uppercase tracking-widest text-white">
              {pendingDrag.kind === 'move' ? 'MOVE SHIFT' : 'COPY SHIFT'}
            </h2>
            <div className="font-mono text-sm text-white">{pendingDrag.shift.startTime} — {pendingDrag.shift.endTime}</div>
            {pendingDrag.kind === 'move' ? (
              <div className="space-y-1">
                <p className="font-mono text-2xs uppercase text-grey-light">FROM</p>
                <p className="font-mono text-xs uppercase text-white">
                  {staffLabel(pendingDrag.shift.staffId)} · {formatDateLong(pendingDrag.shift.date)}
                </p>
                <p className="font-mono text-2xs uppercase text-grey-light pt-2">TO</p>
                <p className="font-mono text-xs uppercase text-white">
                  {pendingMoveTarget?.staff ? `${pendingMoveTarget.staff.firstName} ${pendingMoveTarget.staff.lastName}` : 'STAFF'} · {pendingMoveTarget?.date ? formatDateLong(pendingMoveTarget.date) : '—'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="font-mono text-2xs uppercase text-grey-light">
                  FROM {staffLabel(pendingDrag.shift.staffId)} · {formatDateLong(pendingDrag.shift.date)}
                </p>
                <p className="font-mono text-2xs uppercase text-grey-light">
                  COPY TO {pendingDrag.copies.length} CELL{pendingDrag.copies.length === 1 ? '' : 'S'}
                </p>
                <div className="max-h-40 overflow-y-auto border border-grey-mid divide-y divide-grey-mid">
                  {pendingDrag.copies.map((c) => (
                    <div key={`${c.staffId}:${c.date}`} className="px-2 py-1 font-mono text-2xs uppercase text-white">
                      {staffLabel(c.staffId)} · {formatDateLong(c.date)}
                    </div>
                  ))}
                </div>
                <p className="font-mono text-2xs uppercase text-grey-light">SHIFTS ARE SINGLE DAYS — NO SERIES IS CREATED.</p>
              </div>
            )}
            {error && <p className="font-mono text-xs text-danger">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button size="sm" loading={busy} onClick={confirmDrag}>CONFIRM</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPendingDrag(null)}>CANCEL</Button>
            </div>
          </div>
        </div>
      )}

      {/* Shift modal */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-grey-dark border border-grey-mid p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-mono text-xs uppercase tracking-widest text-white">{modal.shift ? 'EDIT SHIFT' : 'NEW SHIFT'} — {formatDateLong(modal.date)}</h2>
            <Select label="Staff"
              value={form.staffId}
              onChange={(e) => setForm({ ...form, staffId: e.target.value })}
              options={[{ value: '', label: 'SELECT STAFF' }, ...(data?.staff ?? []).map(s => ({ value: s.id, label: `${s.firstName} ${s.lastName}` }))]} />
            {tab === 'events' && eventRoster.data && (
              <Select label="Event (optional)"
                value={form.calendarEventId}
                onChange={(e) => setForm({ ...form, calendarEventId: e.target.value })}
                options={[
                  { value: '', label: 'NO EVENT' },
                  ...eventRoster.data.events
                    .filter((e) => !modal.date || utcDayKey(e.startsAt) === modal.date)
                    .map((e) => ({ value: e.id, label: `${e.title} · ${formatEventTime(e)}` })),
                ]} />
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input label="Start" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              <Input label="End" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Role"
                value={form.positionId}
                onChange={(e) => setForm({ ...form, positionId: e.target.value })}
                options={[{ value: '', label: 'NO ROLE' }, ...positions.map(p => ({ value: p.id, label: p.name }))]} />
              <Input label="Break (minutes)" type="number" min="0" value={form.breakMinutes} onChange={(e) => setForm({ ...form, breakMinutes: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-mono text-xs uppercase text-grey-light block mb-1">Colour</label>
                <input type="color" value={form.colour || '#0E7490'} onChange={(e) => setForm({ ...form, colour: e.target.value })} className="w-full h-9 bg-black border border-grey-mid" />
              </div>
              <Input label="Tag (optional)" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="EVENT / ALT LEAVE" />
            </div>
            <Input label="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="OPTIONAL" />
            {error && <p className="font-mono text-xs text-danger">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={saveShift} loading={busy}>SAVE</Button>
              {modal.shift && <Button size="sm" variant="danger" onClick={() => deleteShift(modal.shift!.id)}>DELETE</Button>}
              <Button size="sm" variant="ghost" onClick={() => setModal(null)}>CANCEL</Button>
            </div>
          </div>
        </div>
      )}

      {/* Staff editor — opened from the name in the grid */}
      {editStaffId && (
        <StaffEditModal
          staffId={editStaffId}
          role={role}
          onClose={() => setEditStaffId(null)}
          onSaved={() => { setEditStaffId(null); load(true) }}
        />
      )}

      {/* Analyze modal — per-role totals */}
      {showAnalyze && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowAnalyze(false)}>
          <div className="bg-grey-dark border border-grey-mid p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-mono text-xs uppercase tracking-widest text-white">ROLE ANALYSIS — {view === 'week' ? `${formatDateLong(weekStart)} → ${formatDateLong(shiftDay(weekStart, 6))}` : formatDateLong(weekStart)}</h2>
            <div className="space-y-1 max-h-[50vh] overflow-y-auto">
              {positionTotals.length === 0 && <p className="font-mono text-xs text-grey-light">NO SHIFTS.</p>}
              {positionTotals.map((p) => (
                <div key={p.name} className="flex items-center justify-between border border-grey-mid px-3 py-2">
                  <div>
                    <div className="font-mono text-xs text-white">{p.name}</div>
                    <div className="font-mono text-2xs text-grey-light">{p.count} SHIFT{p.count !== 1 ? 'S' : ''}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs text-white">{p.hours.toFixed(2)}HRS</div>
                    <div className="font-mono text-2xs text-grey-light">${p.cost.toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <Button size="sm" variant="ghost" onClick={() => setShowAnalyze(false)}>CLOSE</Button>
            </div>
          </div>
        </div>
      )}

      {/* Visualize modal — per-day coverage */}
      {showVisualize && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowVisualize(false)}>
          <div className="bg-grey-dark border border-grey-mid p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-mono text-xs uppercase tracking-widest text-white">COVERAGE</h2>
            <div className="space-y-1 max-h-[50vh] overflow-y-auto">
              {coverage.map((c) => (
                <div key={c.day} className="flex items-center justify-between border border-grey-mid px-3 py-2">
                  <div className="font-mono text-xs text-white">{formatDateLong(c.day)}</div>
                  <div className="font-mono text-xs text-grey-light">
                    {c.count} ON · {c.hours.toFixed(2)}HRS
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <Button size="sm" variant="ghost" onClick={() => setShowVisualize(false)}>CLOSE</Button>
            </div>
          </div>
        </div>
      )}

      {/* Event staffing — opened from the EVENTS tab chips */}
      {openEvent && (
        <EventStaffingModal
          key={openEvent.id}
          venueId={venueId}
          event={openEvent}
          positions={eventRoster.data?.positions ?? positions}
          onClose={() => setOpenEventId(null)}
          onSaved={() => { eventRoster.reload(); load(true) }}
          onEdit={() => { setEditEventId(openEvent.id); setOpenEventId(null) }}
        />
      )}

      {showQueue && (
        <EventClaimsModal
          queue={eventRoster.data?.queue ?? []}
          busy={busy}
          onReview={reviewQueueClaim}
          onClose={() => setShowQueue(false)}
        />
      )}

      {(createEventOpen || editEventId) && (
        <CalendarEventFormModal
          venueId={venueId}
          eventId={editEventId}
          defaultDate={weekStart}
          onClose={() => { setCreateEventOpen(false); setEditEventId(null) }}
          onSaved={() => { setCreateEventOpen(false); setEditEventId(null); eventRoster.reload() }}
        />
      )}
    </div>
  )
}
