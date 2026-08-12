'use client'

import { Fragment, useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { pushToast } from '@/components/ui/Toast'
import { DateNav } from '@/components/admin/DateNav'
import { CustomerDrawer } from '@/components/admin/CustomerDrawer'
import { planAutoSeat } from '@/lib/auto-seat'
import { getActiveVenueId } from '@/lib/active-venue'
import { serviceWindowsForDate, bookableSlotsForService, type ServiceWindow } from '@/lib/service-windows'

interface BookingTable { id: string; setupItem: { id: string; assignedNumber: string | null; label: string | null } }
interface BookingOrderItem { id: string; menuItemId: string; productName: string | null; qty: number; unitPrice: number | null; allergenNote: string | null; customerNote: string | null }
interface BookingOrder { id: string; orderNumber: string | null; source: string; items: BookingOrderItem[] }
interface Booking {
  id: string; date: string; startTime: string; endTime: string; partySize: number
  contactName: string; contactPhone: string | null; contactEmail: string | null
  source: string; status: string; notes: string | null
  deletedAt: string | null
  tables: BookingTable[]
  service: { id: string; name: string } | null
  orders: BookingOrder[]
}

/** "HOUSE BURGER ×2" lines for the linked pre-order(s), null when none. */
function preOrderLines(b: Booking): string[] | null {
  const lines = b.orders.flatMap((o) =>
    o.items
      .filter((i) => i.productName)
      .map((i) => `${i.productName}${i.qty > 1 ? ` ×${i.qty}` : ''}`),
  )
  return lines.length > 0 ? lines : null
}
interface SetupLite { id: string; name: string; floorPlan: { id: string; slug: string } }
interface ServiceLite {
  id: string
  name: string
  isActive: boolean
  bookingIntervalMinutes: number | null
  bookableTimes: string[] | null
  slots: { dayOfWeek: number; startTime: string; endTime: string }[]
  exceptions: { date: string; closed: boolean; startTime: string | null; endTime: string | null }[]
  tablePlanSetup: { id: string; name: string } | null
}
interface VenueLite { id: string; name: string }
interface TableRow { id: string; assignedNumber: string | null; label: string | null; profile: { id: string; name: string; capacity: number; colour: string | null }; section: { id: string; name: string; colour: string | null; department: { id: string; name: string; colour: string | null } } | null; setupId: string; setupName: string }
interface TableBooking { id: string; startTime: string; endTime: string; partySize: number; contactName: string; status: string; tableIds: string[] }

const STATUS_OPTIONS = [
  { value: 'CONFIRMED', label: 'CONFIRMED' },
  { value: 'PENDING', label: 'PENDING' },
  { value: 'SEATED', label: 'SEATED' },
  { value: 'COMPLETED', label: 'COMPLETED' },
  { value: 'CANCELLED', label: 'CANCELLED' },
  { value: 'NO_SHOW', label: 'NO SHOW' },
]

const SOURCE_COLORS: Record<string, string> = {
  ONLINE: '#4ADE80', PHONE: '#60A5FA', WALK_IN: '#FACC15', WOOCOMMERCE: '#C084FC',
}
const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: '#4ADE80', PENDING: '#FACC15', SEATED: '#60A5FA', COMPLETED: '#6B6B6B', CANCELLED: '#F87171', NO_SHOW: '#F87171',
}

// Column width is MEASURED from the rendered table (`slotW` state), not a
// constant: the grid stretches to fill the screen (table-fixed + width:100%,
// no min-width, no horizontal slider), so the real pixel width of a column
// depends on the screen. Every position formula (zones, blocks, previews,
// drag math) must use the measured width or the grid drifts.
const START_HOUR = 6
const END_HOUR = 22

// Diary timeline geometry — 30-min rows from 06:00 to 24:00.
const DIARY_START = 6 * 60
const DIARY_ROW_H = 28

// Diagonal "no service" hatching for blocked time columns.
const HATCH = 'repeating-linear-gradient(45deg, rgba(248,113,113,0.10) 0px, rgba(248,113,113,0.10) 3px, transparent 3px, transparent 7px)'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function BookingClient({ role, sessionVenueId, defaultVenueId }: { role: string; sessionVenueId: string; defaultVenueId?: string | null }) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(todayStr())
  const [venues, setVenues] = useState<VenueLite[]>([])
  const [venueId, setVenueId] = useState(() => getActiveVenueId(role, sessionVenueId, defaultVenueId))
  const [setups, setSetups] = useState<SetupLite[]>([])
  const [services, setServices] = useState<ServiceLite[]>([])
  const [error, setError] = useState('')

  // Create / edit modal
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Booking | null>(null)
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPartySize, setFormPartySize] = useState('2')
  const [formStartTime, setFormStartTime] = useState('18:00')
  const [formEndTime, setFormEndTime] = useState('20:00')
  const [formSource, setFormSource] = useState('PHONE')
  const [formSetupId, setFormSetupId] = useState('')
  const [formServiceId, setFormServiceId] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Pre-order editor (edit the linked WooCommerce order's line items)
  const [preOrderEdit, setPreOrderEdit] = useState<BookingOrder | null>(null)
  const [preOrderDraft, setPreOrderDraft] = useState<{ id: string; menuItemId: string; productName: string | null; qty: number; unitPrice: number | null }[]>([])
  const [savingPreOrder, setSavingPreOrder] = useState(false)
  const [availMsg, setAvailMsg] = useState('')
  const [viewMode, setViewMode] = useState<'diary' | 'table' | 'deleted'>('table')
  const [tableRows, setTableRows] = useState<TableRow[]>([])
  const [tableBookings, setTableBookings] = useState<TableBooking[]>([])
  const [tableLoading, setTableLoading] = useState(false)
  const [resizeDrag, setResizeDrag] = useState<{ bookingId: string; startX: number; originalEndTime: string } | null>(null)
  const [editSelectedTableIds, setEditSelectedTableIds] = useState<string[]>([])
  const [createSelectedTableIds, setCreateSelectedTableIds] = useState<string[]>([])
  const [createTableSearchValue, setCreateTableSearchValue] = useState('')
  const [editTableSearchValue, setEditTableSearchValue] = useState('')

  // Deleted bookings — venue-wide recover flow (any date). Restore reseats
  // through the API, which re-checks occupancy so a restore cannot
  // double-book a table.
  const [deletedBookings, setDeletedBookings] = useState<Booking[]>([])
  const [deletedLoading, setDeletedLoading] = useState(false)
  const [recoverTarget, setRecoverTarget] = useState<Booking | null>(null)
  const [recoverSelectedTableIds, setRecoverSelectedTableIds] = useState<string[]>([])
  const [recoverTableSearchValue, setRecoverTableSearchValue] = useState('')
  const [recoverTableRows, setRecoverTableRows] = useState<TableRow[]>([])
  const [recoverTableBookings, setRecoverTableBookings] = useState<TableBooking[]>([])
  const [recoverError, setRecoverError] = useState('')
  const [recoverSaving, setRecoverSaving] = useState(false)
  const [moveDrag, setMoveDrag] = useState<{ bookingId: string; sourceTableId: string; startTime: string; endTime: string; partySize: number; contactName: string; status: string; startX: number; startY: number } | null>(null)
  // Becomes true only once the mouse travels >5px from the press — until
  // then the gesture is a click, not a drag (prevents jittery clicks from
  // moving bookings).
  const [dragMoved, setDragMoved] = useState(false)
  const [movePreviewTableId, setMovePreviewTableId] = useState<string | null>(null)
  const [movePreviewStartMins, setMovePreviewStartMins] = useState<number | null>(null)
  const [timeChangeConfirm, setTimeChangeConfirm] = useState<{ bookingId: string; targetTableId?: string; originalStart: string; originalEnd: string; newStart: string; newEnd: string } | null>(null)
  const [customerDrawer, setCustomerDrawer] = useState<{ name: string; phone: string | null; email: string | null } | null>(null)
  const [selectedSetupId, setSelectedSetupId] = useState('')
  const tableWrapperRef = useRef<HTMLDivElement>(null)

  const loadBookings = useCallback(async (d: string, vid: string) => {
    if (!vid) return
    setLoading(true)
    const r = await fetch(`/api/admin/bookings?date=${d}&venueId=${vid}`)
    if (r.ok) setBookings(await r.json())
    setLoading(false)
  }, [])

  const loadTableData = useCallback(async (d: string, vid: string) => {
    if (!vid || !d) return
    setTableLoading(true)
    const r = await fetch(`/api/admin/booking-tables?venueId=${vid}&date=${d}`)
    if (r.ok) {
      const data = await r.json()
      setTableRows(data.tables ?? [])
      setTableBookings(data.bookings ?? [])
    }
    setTableLoading(false)
  }, [])

  const loadDeleted = useCallback(async (vid: string) => {
    if (!vid) return
    setDeletedLoading(true)
    const r = await fetch(`/api/admin/bookings?deleted=1&venueId=${vid}`)
    if (r.ok) setDeletedBookings(await r.json())
    setDeletedLoading(false)
  }, [])

  // Auto-select best table(s) when creating — uses planAutoSeat for multi-table combinations
  useEffect(() => {
    if (editing || !showModal || !formSetupId) return
    const ps = parseInt(formPartySize)
    if (!ps || ps <= 0) return

    const csStart = timeToMins(formStartTime)
    const csEnd = timeToMins(formEndTime)
    const conflictingIds = new Set<string>()
    for (const tb of tableBookings) {
      const tbStart = timeToMins(tb.startTime)
      const tbEnd = timeToMins(tb.endTime)
      if (tbStart < csEnd && tbEnd > csStart) {
        for (const tid of tb.tableIds) conflictingIds.add(tid)
      }
    }

    const available = tableRows.filter((t) => t.setupId === formSetupId && !conflictingIds.has(t.id))

    const seatProfiles = available.map((t) => ({
      id: t.profile.id,
      capacity: t.profile.capacity,
      chairCount: 0,
      width: 100,
      depth: 100,
      tableNumbers: t.assignedNumber ? [t.assignedNumber] : [],
    }))

    const placements = planAutoSeat(ps, seatProfiles)
    const ids: string[] = []
    const used = new Set<string>()

    for (const placement of placements) {
      let match: typeof available[number] | undefined
      if (placement.assignedNumber) {
        match = available.find(
          (t) => t.profile.id === placement.profileId && t.assignedNumber === placement.assignedNumber && !used.has(t.id),
        )
      }
      if (!match) {
        match = available.find((t) => t.profile.id === placement.profileId && !used.has(t.id))
      }
      if (match) { ids.push(match.id); used.add(match.id) }
    }

    setCreateSelectedTableIds(ids)
  }, [formPartySize, formStartTime, formEndTime, formSetupId, tableRows, tableBookings, showModal, editing])

  // Derive setup list from tableRows. The selected plan must track the
  // venue: when the rows come from a different venue the old setup id is
  // stale, so fall back to the first plan of the new list.
  useEffect(() => {
    const map = new Map<string, string>()
    for (const t of tableRows) { if (!map.has(t.setupId)) map.set(t.setupId, t.setupName) }
    const list = Array.from(map.entries()).map(([id, name]) => ({ id, name, floorPlan: { id: '', slug: '' } }))
    setSetups(list)
    setSelectedSetupId((prev) => (list.some((s) => s.id === prev) ? prev : (list[0]?.id ?? '')))
  }, [tableRows])

  useEffect(() => {
    fetch('/api/admin/venues').then((r) => r.json()).then((data: VenueLite[]) => {
      const vs = Array.isArray(data) ? data : []
      setVenues(vs)
      // The sidebar selection (admin-active-venue cookie) or the user's
      // default venue wins; fall back to the first venue only when neither
      // is part of the list.
      const preferred = getActiveVenueId(role, sessionVenueId, defaultVenueId) || vs[0]?.id || ''
      const effective = vs.some((v) => v.id === preferred) ? preferred : (vs[0]?.id ?? '')
      setVenueId((prev) => (vs.some((v) => v.id === prev) ? prev : effective))
      if (effective) loadBookings(date, effective)
      if (effective) loadDeleted(effective)
    })
  }, [])

  // Services with their table plans, for the SERVICE picker in the modal.
  useEffect(() => {
    if (!venueId) { setServices([]); return }
    fetch(`/api/admin/services?venueId=${venueId}`).then((r) => (r.ok ? r.json() : [])).then((data: ServiceLite[]) => {
      setServices(Array.isArray(data) ? data : [])
    })
  }, [venueId])

  // AVAILABLE windows on the selected date — the union of every active
  // service's slots (exceptions applied), clamped to the grid's hours. The
  // same windows the API enforces on booking create.
  const serviceWindows = useMemo<ServiceWindow[]>(() => {
    const windows = serviceWindowsForDate(services.filter((s) => s.isActive), date)
    const GRID_START = START_HOUR * 60
    const GRID_END = END_HOUR * 60
    return windows
      .map((w) => ({ ...w, startMins: Math.max(w.startMins, GRID_START), endMins: Math.min(w.endMins, GRID_END) }))
      .filter((w) => w.startMins < w.endMins)
  }, [services, date])

  const windowAt = (mins: number): ServiceWindow | undefined =>
    serviceWindows.find((w) => mins >= w.startMins && mins < w.endMins)

  // The chosen service drives the create modal's clickable time boxes: its
  // bookable slots for the date (interval steps or the explicit bookable
  // times), with the 2h default clamped to the window end — exactly what the
  // server enforces for that service.
  const selectedService = services.find((s) => s.id === formServiceId && s.isActive)
  const timeBoxes = useMemo(() => {
    if (!selectedService) return []
    return bookableSlotsForService(selectedService, date)
      .map((s) => ({ startMins: s.startMins, endMins: Math.min(s.startMins + 120, s.endMins) }))
  }, [selectedService, date])

  // Focused grid: when services run, show only the windows ±30 min padding so
  // the table isn't dominated by dead columns. "SHOW ENTIRE OPENING HOURS"
  // restores the full 06:00–22:00 range.
  const [showEntireHours, setShowEntireHours] = useState(false)
  const tableGrid = useMemo(() => {
    const fullStart = START_HOUR * 60
    const fullEnd = END_HOUR * 60
    if (showEntireHours || serviceWindows.length === 0) return { start: fullStart, end: fullEnd }
    const PAD = 30
    return {
      start: Math.max(fullStart, serviceWindows[0].startMins - PAD),
      end: Math.min(fullEnd, serviceWindows[serviceWindows.length - 1].endMins + PAD),
    }
  }, [serviceWindows, showEntireHours])

  // Measure the real rendered time-column width. table-fixed + width:100%
  // divides the table evenly, so the first time cell's width IS the column
  // width for every column. Re-measured when the grid focuses/unfocuses
  // (column count changes) and on window resize.
  const [slotW, setSlotW] = useState(23)
  useEffect(() => {
    const measure = () => {
      const th = document.querySelector('table thead tr:last-child th:nth-child(2)') as HTMLElement | null
      if (th) setSlotW(th.getBoundingClientRect().width)
    }
    const raf = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
    }
  }, [tableLoading, tableGrid.start, tableGrid.end])

  useEffect(() => {
    if (venueId) { loadBookings(date, venueId); loadTableData(date, venueId); loadDeleted(venueId) }
  }, [date, venueId, loadBookings, loadTableData, loadDeleted])

  async function checkAvailability() {
    if (!formPartySize || !venueId) return
    const r = await fetch(`/api/admin/bookings/availability?date=${date}&startTime=${formStartTime}&endTime=${formEndTime}&partySize=${formPartySize}&venueId=${venueId}`)
    if (!r.ok) { setAvailMsg('COULD NOT CHECK'); return }
    const data = await r.json()
    const setups = data.setups ?? []
    const chosen = setups.find((s: any) => s.id === formSetupId)
    if (chosen) {
      setAvailMsg(chosen.available
        ? `${chosen.availableTables} TABLES · ${chosen.totalCapacity} PAX CAPACITY`
        : `NOT ENOUGH CAPACITY (${chosen.totalCapacity} PAX)`)
    } else if (setups.length > 0) {
      const anyAvail = setups.some((s: any) => s.available)
      setAvailMsg(anyAvail ? 'SETUP AVAILABLE' : 'NO SETUPS AVAILABLE FOR THIS PARTY SIZE')
    }
  }

  function openCreate() {
    setEditing(null)
    setFormName(''); setFormPhone(''); setFormEmail('')
    setFormPartySize('2'); setFormStartTime('18:00'); setFormEndTime('20:00')
    setFormSource('PHONE'); setFormSetupId(selectedSetupId || (setups.length > 0 ? setups[0].id : '')); setFormServiceId(''); setFormNotes(''); setAvailMsg('')
    setCreateSelectedTableIds([])
    setCreateTableSearchValue('')
    setShowModal(true)
  }

  function openEdit(b: Booking) {
    setEditing(b)
    setFormName(b.contactName); setFormPhone(b.contactPhone ?? ''); setFormEmail(b.contactEmail ?? '')
    setFormPartySize(String(b.partySize)); setFormStartTime(b.startTime); setFormEndTime(b.endTime)
    setFormSource(b.source); setFormNotes(b.notes ?? '')
    setFormServiceId(b.service?.id ?? '')
    setEditSelectedTableIds(b.tables.map((t) => t.setupItem.id))
    setEditTableSearchValue('')
    setAvailMsg('')
    setShowModal(true)
  }

  function openPreOrderEdit(o: BookingOrder) {
    setPreOrderEdit(o)
    setPreOrderDraft(o.items.map((i) => ({ id: i.id, menuItemId: i.menuItemId, productName: i.productName, qty: i.qty, unitPrice: i.unitPrice })))
  }

  /** Save the edited pre-order: replace local line items, then push to WooCommerce. */
  async function savePreOrder() {
    if (!preOrderEdit) return
    setSavingPreOrder(true)
    const res = await fetch(`/api/admin/orders/${preOrderEdit.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: preOrderDraft.map((l, i) => ({
          id: l.id,
          menuItemId: l.menuItemId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          sortOrder: i,
        })),
      }),
    })
    setSavingPreOrder(false)
    if (res.ok) {
      pushToast('PRE-ORDER SAVED — SYNCED TO WOOCOMMERCE', 'success')
      setPreOrderEdit(null)
      loadBookings(date, venueId)
    } else {
      const err = await res.json().catch(() => ({}))
      pushToast((err.error ?? 'SAVE FAILED').toUpperCase(), 'error')
    }
  }

  // The active service whose window covers a time on the current date —
  // used to auto-select the service when clicking a grid slot.
  function serviceAt(mins: number): ServiceLite | undefined {
    for (const s of services) {
      if (!s.isActive) continue
      if (serviceWindowsForDate([s], date).some((w) => mins >= w.startMins && mins < w.endMins)) return s
    }
    return undefined
  }

  // Picking a service whose table plan exists points the booking at that
  // setup — the seating engine then uses the plan's physical tables. When
  // the current time isn't inside the service's windows, snap to the first
  // bookable slot.
  function pickService(id: string) {
    setFormServiceId(id)
    const svc = services.find((s) => s.id === id)
    if (!editing && svc) {
      const wins = serviceWindowsForDate([svc], date)
      const cur = timeToMins(formStartTime)
      const hit = wins.some((w) => cur >= w.startMins && cur < w.endMins)
      if (!hit) {
        const first = bookableSlotsForService(svc, date)[0]
        if (first) {
          const end = Math.min(first.startMins + 120, first.endMins)
          setFormStartTime(minsToTime(first.startMins))
          setFormEndTime(minsToTime(end))
        }
      }
      setTimeout(checkAvailability, 200)
    }
    if (svc?.tablePlanSetup?.id) {
      setFormSetupId(svc.tablePlanSetup.id)
      setTimeout(checkAvailability, 200)
    }
  }

  function selectBox(startMins: number, endMins: number) {
    setFormStartTime(minsToTime(startMins))
    setFormEndTime(minsToTime(endMins))
    setTimeout(checkAvailability, 200)
  }

  function timeToMins(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  function minsToTime(m: number) { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }

  function openCreateOnTable(startMins: number, endMins: number, sid?: string) {
    setEditing(null)
    setFormName(''); setFormPhone(''); setFormEmail('')
    setFormPartySize('2'); setFormSource('PHONE'); setFormSetupId(sid ?? ''); setFormServiceId(''); setFormNotes(''); setAvailMsg('')
    setCreateSelectedTableIds([])
    setCreateTableSearchValue('')
    setFormStartTime(minsToTime(startMins)); setFormEndTime(minsToTime(endMins))
    // The clicked slot sits inside a service's window — pre-select that
    // service (and its table plan) so the booking is for the right service.
    // Set directly rather than via pickService: the clicked time is
    // intentional and must not be snapped.
    const svc = serviceAt(startMins)
    if (svc) {
      setFormServiceId(svc.id)
      if (svc.tablePlanSetup?.id) setFormSetupId(svc.tablePlanSetup.id)
      setTimeout(checkAvailability, 200)
    }
    setShowModal(true)
  }

  // Every mutation refreshes both datasets — the diary reads `bookings`, the
  // TABLE view reads `tableBookings`/`tableRows`. Refreshing only one left the
  // other stale (a cancelled booking kept its block on the table grid). The
  // deleted list refreshes too so a restore removes its row immediately.
  const refresh = useCallback(() => {
    loadBookings(date, venueId)
    loadTableData(date, venueId)
    loadDeleted(venueId)
  }, [date, venueId, loadBookings, loadTableData, loadDeleted])

  async function resizeBooking(id: string, newEndTime: string) {
    await fetch(`/api/admin/bookings/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endTime: newEndTime }),
    })
    refresh()
  }

  async function moveBookingToTable(bookingId: string, tableId: string) {
    const r = await fetch(`/api/admin/bookings/${bookingId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableIds: [tableId] }),
    })
    if (r.ok) refresh()
  }

  async function updateBookingTime(bookingId: string, startTime: string, endTime: string) {
    const r = await fetch(`/api/admin/bookings/${bookingId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startTime, endTime }),
    })
    if (r.ok) refresh()
  }

  async function updateBookingTableAndTime(bookingId: string, tableId: string, startTime: string, endTime: string) {
    const r = await fetch(`/api/admin/bookings/${bookingId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableIds: [tableId], startTime, endTime }),
    })
    if (r.ok) refresh()
  }

  async function handleSave() {
    if (saving) return
    if (!formName) { setError('NAME REQUIRED'); return }
    if (!editing) {
      if (!formServiceId) { setError('SELECT A SERVICE'); return }
      if (timeBoxes.length === 0) { setError('NO SERVICE RUNS ON THIS DATE'); return }
      if (!timeBoxes.some((b) => b.startMins === timeToMins(formStartTime))) { setError('PICK AN AVAILABLE TIME'); return }
    }
    setSaving(true); setError('')
    if (editing) {
      const r = await fetch(`/api/admin/bookings/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactName: formName, contactPhone: formPhone || null, contactEmail: formEmail || null, partySize: formPartySize, startTime: formStartTime, endTime: formEndTime, source: formSource, notes: formNotes || null, serviceId: formServiceId || null, tableIds: editSelectedTableIds }),
      })
      if (!r.ok) { setError('SAVE FAILED'); setSaving(false); return }
    } else {
      const r = await fetch('/api/admin/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, startTime: formStartTime, endTime: formEndTime, partySize: parseInt(formPartySize), contactName: formName, contactPhone: formPhone || null, contactEmail: formEmail || null, source: formSource, notes: formNotes || null, venueId, serviceId: formServiceId || undefined, setupId: formSetupId || null, floorPlanSlug: formSetupId ? setups.find((s) => s.id === formSetupId)?.floorPlan?.slug ?? null : null, tableIds: createSelectedTableIds.length > 0 ? createSelectedTableIds : undefined }),
      })
      if (!r.ok) { const d = await r.json(); setError(d.error ?? 'SAVE FAILED'); setSaving(false); return }
    }
    setSaving(false); setShowModal(false)
    refresh()
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/admin/bookings/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    refresh()
  }

  async function deleteBooking(id: string) {
    await fetch(`/api/admin/bookings/${id}`, { method: 'DELETE' })
    refresh()
  }

  function openRecover(b: Booking) {
    setRecoverTarget(b)
    setRecoverSelectedTableIds(b.tables.map((t) => t.setupItem.id))
    setRecoverTableSearchValue('')
    setRecoverError('')
  }

  async function doRecover() {
    if (!recoverTarget || recoverSaving) return
    setRecoverSaving(true); setRecoverError('')
    const r = await fetch(`/api/admin/bookings/${recoverTarget.id}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableIds: recoverSelectedTableIds }),
    })
    setRecoverSaving(false)
    if (r.ok) {
      pushToast('BOOKING RECOVERED', 'success')
      setRecoverTarget(null)
      refresh()
    } else {
      const d = await r.json().catch(() => ({}))
      setRecoverError((d.error ?? 'RESTORE FAILED').toUpperCase())
    }
  }

  // Load the recover target's own date so the reseat picker shows real
  // occupancy — the main grid state only covers the selected date.
  useEffect(() => {
    if (!recoverTarget) { setRecoverTableRows([]); setRecoverTableBookings([]); return }
    fetch(`/api/admin/booking-tables?venueId=${venueId}&date=${String(recoverTarget.date).slice(0, 10)}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: { tables?: TableRow[]; bookings?: TableBooking[] }) => {
        setRecoverTableRows(data.tables ?? [])
        setRecoverTableBookings(data.bookings ?? [])
      })
  }, [recoverTarget, venueId])

  // Build time slots for the diary — half-hour increments from 06:00 to 24:00
  const timeSlots: string[] = []
  for (let h = 6; h < 24; h++) {
    timeSlots.push(`${String(h).padStart(2, '0')}:00`)
    timeSlots.push(`${String(h).padStart(2, '0')}:30`)
  }

  // Diary booking blocks — ONE block per booking, absolutely positioned to
  // span its full duration across the 30-min rows (a 17:00–19:00 booking is a
  // single 4-row block, not two entries). Bookings sharing a start time split
  // the column side by side.
  const diaryBlocks = useMemo(() => {
    const groups = new Map<number, Booking[]>()
    for (const b of bookings) {
      const start = timeToMins(b.startTime)
      const list = groups.get(start) ?? []
      list.push(b)
      groups.set(start, list)
    }
    return bookings.map((b) => {
      const start = timeToMins(b.startTime)
      const end = timeToMins(b.endTime)
      const group = groups.get(start) ?? [b]
      const idx = group.indexOf(b)
      return {
        booking: b,
        top: Math.max(0, ((start - DIARY_START) / 30) * DIARY_ROW_H),
        height: Math.max(((end - start) / 30) * DIARY_ROW_H, DIARY_ROW_H),
        leftPct: (idx * 100) / group.length,
        widthPct: 100 / group.length,
      }
    })
  }, [bookings])

  return (
    <div className="space-y-4 pb-12">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">BOOKINGS</h1>
        <div className="flex items-center gap-2">
          <div className="flex border border-grey-mid">
            <button onClick={() => setViewMode('diary')} className={`font-mono text-[10px] uppercase px-3 py-1.5 ${viewMode === 'diary' ? 'bg-white text-black' : 'text-grey-light hover:text-white'}`}>DIARY</button>
            <button onClick={() => setViewMode('table')} className={`font-mono text-[10px] uppercase px-3 py-1.5 ${viewMode === 'table' ? 'bg-white text-black' : 'text-grey-light hover:text-white'}`}>TABLE</button>
            <button onClick={() => setViewMode('deleted')} className={`font-mono text-[10px] uppercase px-3 py-1.5 ${viewMode === 'deleted' ? 'bg-danger text-black' : 'text-grey-light hover:text-white'}`}>DELETED</button>
          </div>
          <Button size="sm" onClick={openCreate}>+ NEW BOOKING</Button>
        </div>
      </div>

      {/* Date bar — same navigation as the Orders page */}
      <div className="border border-grey-mid p-3 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 font-mono text-xs pt-2">
          {venues.length > 1 && (
            <Select label="VENUE" value={venueId} onChange={(e) => setVenueId(e.target.value)}
              options={venues.map((v) => ({ value: v.id, label: v.name.toUpperCase() }))} />
          )}
          <span className="text-grey-light">
            BOOKINGS <span className="text-white">{bookings.length}</span>
          </span>
          <span className="text-grey-light">
            PAX <span className="text-white">{bookings.reduce((s, b) => s + b.partySize, 0)}</span>
          </span>
        </div>
        <DateNav
          date={date}
          onChange={(d) => setDate(d)}
        />
      </div>

      {viewMode === 'diary' && (<>
      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <div className="border border-grey-mid">
          {/* Diary header */}
          <div className="grid grid-cols-[80px_1fr] bg-grey-dark border-b border-grey-mid">
            <div className="px-3 py-2 font-mono text-xs uppercase text-grey-light tracking-wider">TIME</div>
            <div className="px-3 py-2 font-mono text-xs uppercase text-grey-light tracking-wider">BOOKINGS</div>
          </div>

          {/* Time rows with a booking overlay spanning them */}
          <div className="relative overflow-hidden">
            {timeSlots.map((slot) => {
              const isHour = slot.endsWith(':00')
              return (
                <div key={slot} className="grid grid-cols-[80px_1fr] min-h-[28px] border-b border-grey-mid/40">
                  <div className={`px-3 py-1 font-mono text-xs border-r border-grey-mid ${isHour ? 'text-grey-light' : 'text-grey-light/40'}`}>
                    {isHour ? slot : ''}
                  </div>
                </div>
              )
            })}

            {/* One block per booking, spanning its duration */}
            <div className="absolute left-[80px] right-0 top-0 bottom-0 pointer-events-none">
              {diaryBlocks.map(({ booking: b, top, height, leftPct, widthPct }) => {
                const durationH = Math.round((timeToMins(b.endTime) - timeToMins(b.startTime)) / 60 * 10) / 10
                return (
                  <button
                    key={b.id}
                    onClick={() => openEdit(b)}
                    className="absolute text-left bg-grey-dark border border-grey-mid p-1.5 hover:border-white transition-colors cursor-pointer pointer-events-auto overflow-hidden"
                    style={{
                      top,
                      height,
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      borderLeftColor: STATUS_COLORS[b.status] || '#6B6B6B',
                      borderLeftWidth: '3px',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-white font-bold truncate">{b.contactName}</span>
                      <span className="font-mono text-[10px] uppercase shrink-0" style={{ color: STATUS_COLORS[b.status] || '#6B6B6B' }}>{b.status}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 font-mono text-[10px] text-grey-light">
                      <button
                        onClick={(e) => { e.stopPropagation(); setCustomerDrawer({ name: b.contactName, phone: b.contactPhone, email: b.contactEmail }) }}
                        className="font-mono text-[9px] uppercase text-grey-light hover:text-white border border-grey-mid px-1 py-0.5 shrink-0"
                        title="VIEW CUSTOMER"
                      >CUSTOMER</button>
                      <span>{b.startTime}–{b.endTime} ({durationH}h)</span>
                      <span>· {b.partySize} PAX</span>
                      {b.tables.length > 0 && (
                        <span>· {b.tables.map((t) => t.setupItem.assignedNumber || t.setupItem.label || 'TBL').join(', ')}</span>
                      )}
                    </div>
                    {preOrderLines(b) && (
                      <div className="mt-0.5 font-mono text-[9px] text-[#c4a530] truncate">
                        PRE-ORDER: {preOrderLines(b)!.join(', ')}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}</> )}

      {viewMode === 'table' && (() => {
        const gridStart = tableGrid.start
        const gridEnd = tableGrid.end
        const totalSlots = (gridEnd - gridStart) / 15
        const timeSlots2: string[] = []
        for (let m = gridStart; m < gridEnd; m += 15) { timeSlots2.push(minsToTime(m)) }

        const filteredRows = selectedSetupId ? tableRows.filter((t) => t.setupId === selectedSetupId) : tableRows

        // Group tables by section
        const sectionGroups = new Map<string, { name: string; colour: string | null; dept: { name: string; colour: string | null }; tables: TableRow[] }>()
        for (const t of filteredRows) {
          const key = t.section?.id ?? '_unsorted'
          if (!sectionGroups.has(key)) sectionGroups.set(key, { name: t.section?.name ?? 'UNSORTED', colour: t.section?.colour ?? null, dept: t.section?.department ?? { name: 'VENUE', colour: null }, tables: [] })
          sectionGroups.get(key)!.tables.push(t)
        }

        // Compute linked booking connectors across non-adjacent rows
        const flatRows: { tbl: TableRow; idx: number }[] = []
        let ri = 0
        for (const [, grp] of sectionGroups) { for (const t of grp.tables) { flatRows.push({ tbl: t, idx: ri++ }) } }
        const connectorMap = new Map<number, { colour: string; rightX: number; heightPx: number }[]>()
        for (const b of tableBookings) {
          if (b.tableIds.length <= 1) continue
          const linked = flatRows.filter((r) => b.tableIds.includes(r.tbl.id))
          if (linked.length < 2) continue
          const firstIdx = linked[0].idx
          const lastIdx = linked[linked.length - 1].idx
          const span = lastIdx - firstIdx
          if (span === 0) continue
          const bEnd = timeToMins(b.endTime)
          const rightX = ((bEnd - gridStart) / 15) * slotW
          if (!connectorMap.has(firstIdx)) connectorMap.set(firstIdx, [])
          connectorMap.get(firstIdx)!.push({ colour: STATUS_COLORS[b.status] || '#6B6B6B', rightX, heightPx: span * 32 })
        }

        return (
          <div className="space-y-3">
            {setups.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase text-grey-light tracking-wider">TABLE PLAN</span>
                <select value={selectedSetupId} onChange={(e) => setSelectedSetupId(e.target.value)}
                  className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-hidden focus:border-white">
                  {setups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            {tableLoading ? <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p> : filteredRows.length === 0 ? (
              <p className="font-mono text-xs text-grey-light">NO TABLES FOUND IN THIS SETUP. ADD TABLES TO THE FLOOR PLAN FIRST.</p>
            ) : (
              <>
              {services.some((s) => s.isActive) && (
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4 font-mono text-[9px] uppercase text-grey-light">
                    <span><span className="inline-block w-3 h-3 border border-success/50 bg-success/15 mr-1 align-middle" />AVAILABLE (SERVICE TIMES)</span>
                    <span><span className="inline-block w-3 h-3 border border-danger/40 mr-1 align-middle" style={{ backgroundImage: HATCH, backgroundColor: 'rgba(248,113,113,0.08)' }} />NO SERVICE — CANNOT BOOK</span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showEntireHours}
                      onChange={(e) => setShowEntireHours(e.target.checked)}
                      className="accent-[#60A5FA]"
                    />
                    <span className="font-mono text-[9px] uppercase text-grey-light">SHOW ENTIRE OPENING HOURS</span>
                  </label>
                </div>
              )}
              {services.some((s) => s.isActive) && serviceWindows.length === 0 && (
                <p className="font-mono text-[10px] uppercase text-danger">NO SERVICE RUNS ON THIS DATE — BOOKINGS ARE BLOCKED</p>
              )}
              {/* w-fit keeps the scroll container exactly the table's width —
                  a full-width container left the focused grid hugging the left
                  with a dead void on the right, and made the drag math
                  (`getBoundingClientRect` on the wrapper) anchor to a box far
                  wider than the columns it maps to. */}
              <div className="border border-grey-mid overflow-auto max-h-[70vh]" ref={tableWrapperRef} data-time-slot-w={slotW}>
                <table className="border-collapse table-fixed" style={{ width: '100%' }}>
                  <thead className="sticky top-0 z-10 bg-grey-dark">
                    {serviceWindows.length > 0 && (
                      <tr>
                        <th className="border-b border-grey-mid border-r sticky left-0 bg-grey-dark z-20" style={{ width: 110 }} />
                        {serviceWindows.map((w, wi) => (
                          <Fragment key={wi}>
                            {(w.startMins - gridStart) / 15 > 0 && (
                              <th colSpan={(w.startMins - gridStart) / 15} className="border-b border-grey-mid" />
                            )}
                            <th
                              colSpan={(w.endMins - w.startMins) / 15}
                              className="border-b border-grey-mid border-r bg-success/15 px-1 py-0.5 text-center"
                            >
                              <span className="font-mono text-[8px] uppercase tracking-wider text-success">
                                {w.names.length > 0 ? w.names.join(' / ') : 'SERVICE'} · {minsToTime(w.startMins)}–{minsToTime(w.endMins)}
                              </span>
                            </th>
                          </Fragment>
                        ))}
                      </tr>
                    )}
                    <tr>
                      <th className="border-b border-grey-mid border-r text-left px-2 py-1 font-mono text-[8px] uppercase text-grey-light tracking-wider sticky left-0 bg-grey-dark z-20" style={{ width: 110 }}>TABLE</th>
                      {timeSlots2.map((slot, i) => {
                        const isHour = slot.endsWith(':00')
                        const isHalf = slot.endsWith(':30')
                        const colStart = gridStart + i * 15
                        const avail = serviceWindows.some((w) => colStart >= w.startMins && colStart < w.endMins)
                        return (
                          <th key={i} className={`border-b border-grey-mid font-mono text-center py-1 ${isHour ? 'text-grey-light' : isHalf ? 'text-grey-light/40' : 'text-grey-light/20'} ${isHour ? 'border-r border-grey-mid' : 'border-r border-grey-mid/20'}`} style={{ fontSize: Math.min(8, Math.max(5, slotW * 0.34)), ...(avail ? { backgroundColor: 'rgba(74,222,128,0.08)' } : { backgroundColor: 'rgba(248,113,113,0.06)', backgroundImage: HATCH }) }}>
                            {isHour || isHalf ? slot.slice(0, 5) : ''}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let rowNum = 0
                      return Array.from(sectionGroups.entries()).map(([key, grp]) => (
                        <>
                          <tr key={`h-${key}`} className="bg-grey-dark/50">
                            <td className="border-b border-grey-mid border-r px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-grey-light sticky left-0 bg-grey-dark/50" style={grp.colour ? { color: grp.colour } : {}}>
                              {grp.name} <span className="font-normal text-grey-light/60">({grp.dept.name})</span>
                            </td>
                            {timeSlots2.map((_, i) => <td key={i} className="border-b border-grey-mid/20" />)}
                          </tr>
                          {grp.tables.map((tbl) => {
                            const label = tbl.assignedNumber || tbl.label || tbl.profile.name.slice(0, 6)
                            const tblBookings = tableBookings.filter((b) => b.tableIds.includes(tbl.id))
                            const isMoveTarget = movePreviewTableId === tbl.id && moveDrag && moveDrag.sourceTableId !== tbl.id
                            const isSameTablePreview = movePreviewTableId === tbl.id && moveDrag && moveDrag.sourceTableId === tbl.id && movePreviewStartMins !== null
                            const showPreview = (isMoveTarget || isSameTablePreview) && moveDrag
                            const currentRow = rowNum++
                            return (
                            <tr key={tbl.id} className="h-8" data-table-id={tbl.id}>
                              <td className="border-b border-grey-mid/30 border-r px-2 sticky left-0 bg-grey-dark">
                                <span className="font-mono text-[10px] text-white truncate block" title={`${tbl.profile.name} · CAP ${tbl.profile.capacity}`}>{label}</span>
                              </td>
                              <td colSpan={totalSlots} className={`border-b border-grey-mid/30 relative`}
                                style={{ padding: 0, backgroundImage: `repeating-linear-gradient(to right, rgba(46,46,46,0.12) 0px, rgba(46,46,46,0.12) 1px, transparent 1px, transparent ${slotW}px)` }}>
                                <div className="absolute inset-0 flex">
                                  {tblBookings.map((b) => {
                                    const bStart = timeToMins(b.startTime)
                                    const bEnd = timeToMins(b.endTime)
                                    const left = ((bStart - gridStart) / 15) * slotW
                                    const width = ((bEnd - bStart) / 15) * slotW
                                    const colour = STATUS_COLORS[b.status] || '#6B6B6B'
                                    const isMoving = moveDrag?.bookingId === b.id
                                    const linkedLabels = b.tableIds.length > 1
                                      ? b.tableIds.map((tid) => tableRows.find((r) => r.id === tid)?.assignedNumber || tableRows.find((r) => r.id === tid)?.label || '?').join(',')
                                      : ''
                                    return (
                                      <div key={b.id} className={`absolute top-0.5 bottom-0.5 rounded-sm flex items-center px-1.5 group z-10 ${isMoving ? 'opacity-30' : 'cursor-grab'}`}
                                        style={{ left, width, backgroundColor: colour + '30', borderLeft: `2px solid ${colour}` }}
                                        onMouseDown={(e) => { e.stopPropagation(); setDragMoved(false); setMoveDrag({ bookingId: b.id, sourceTableId: tbl.id, startTime: b.startTime, endTime: b.endTime, partySize: b.partySize, contactName: b.contactName, status: b.status, startX: e.clientX, startY: e.clientY }) }}
                                        onClick={() => { const found = bookings.find((bk) => bk.id === b.id); if (found) openEdit(found) }}
                                        title={`${b.contactName} · ${b.partySize} PAX · ${b.startTime}-${b.endTime}${linkedLabels ? ' · ' + linkedLabels : ''}`}>
                                        <span className="font-mono text-[8px] text-white truncate leading-none">{b.contactName} {b.partySize}p{linkedLabels ? <span className="text-grey-light/50 group-hover:text-grey-light transition-colors duration-300"> · {linkedLabels}</span> : null}</span>
                                        {b.tableIds.length > 1 && <span className="font-mono text-[8px] text-grey-light/30 group-hover:text-grey-light ml-auto flex-shrink-0 pl-1 transition-colors duration-300">⟐</span>}
                                        <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20"
                                          onMouseDown={(e) => { e.stopPropagation(); setResizeDrag({ bookingId: b.id, startX: e.clientX, originalEndTime: b.endTime }) }} />
                                      </div>
                                    )
                                  })}
                                  {/* Preview on target row during drag */}
                                  {showPreview && moveDrag && (() => {
                                    const previewLeft = movePreviewStartMins !== null
                                      ? ((movePreviewStartMins - gridStart) / 15) * slotW
                                      : ((timeToMins(moveDrag.startTime) - gridStart) / 15) * slotW
                                    const previewWidth = ((timeToMins(moveDrag.endTime) - timeToMins(moveDrag.startTime)) / 15) * slotW
                                    return (
                                      <div className="absolute top-0.5 bottom-0.5 flex items-center px-1.5 z-20 pointer-events-none"
                                        style={{
                                          left: previewLeft,
                                          width: previewWidth,
                                          border: `2px dashed ${STATUS_COLORS[moveDrag.status] || '#6B6B6B'}`,
                                          backgroundColor: (STATUS_COLORS[moveDrag.status] || '#6B6B6B') + '15',
                                        }}>
                                        <span className="font-mono text-[8px] text-grey-light truncate leading-none">{moveDrag.contactName} {moveDrag.partySize}p</span>
                                      </div>
                                    )
                                  })()}
                                  {/* Connector lines for linked bookings across non-adjacent rows */}
                                  {(() => {
                                    const conns = connectorMap.get(currentRow)
                                    if (!conns) return null
                                    return conns.map((c, ci) => (
                                      <div key={ci} className="absolute z-20 pointer-events-none" style={{ left: c.rightX, top: 0, width: 1, height: c.heightPx }}>
                                        <div className="absolute left-0 top-0 bottom-0 border-r border-dashed" style={{ borderColor: c.colour, opacity: 0.35 }} />
                                      </div>
                                    ))
                                  })()}
                                  {/* Empty-click zone for rows with no bookings at a given slot.
                                      Only service-time columns are clickable — the rest are
                                      hatched and inert. Clicking clamps the 2h default to the
                                      window end, so the final partial column stays bookable and
                                      the grid matches the service header exactly. */}
                                  {tblBookings.length === 0 && timeSlots2.map((slot, si) => {
                                    const colStart = gridStart + si * 15
                                    const win = windowAt(colStart)
                                    const endMins = win ? Math.min(colStart + 120, win.endMins) : colStart + 120
                                    const clickable = !!win
                                    return (
                                      <div key={si} className={clickable ? 'absolute cursor-pointer hover:bg-success/10' : 'absolute cursor-not-allowed'}
                                        style={{ left: si * slotW, width: slotW, top: 0, bottom: 0, ...(clickable ? {} : { backgroundColor: 'rgba(248,113,113,0.05)', backgroundImage: HATCH }) }}
                                        onClick={clickable ? () => openCreateOnTable(colStart, endMins, tbl.setupId) : undefined}
                                        title={clickable ? undefined : 'NO SERVICE AT THIS TIME'}
                                      />
                                    )
                                  })}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </>
                      ))
                    })()}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        )
      })()}

      {viewMode === 'deleted' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-mono text-[10px] uppercase text-grey-light">SOFT-DELETED BOOKINGS — RECOVER AND RESEAT (AVAILABILITY RE-CHECKED ON RESTORE)</p>
            <span className="font-mono text-xs text-white">{deletedBookings.length} DELETED</span>
          </div>
          {deletedLoading ? (
            <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
          ) : deletedBookings.length === 0 ? (
            <p className="border border-grey-mid p-4 font-mono text-xs text-grey-light">NO DELETED BOOKINGS</p>
          ) : (
            <div className="border border-grey-mid divide-y divide-grey-mid">
              {deletedBookings.map((b) => (
                <div key={b.id} className="px-3 py-2 flex items-center gap-3 flex-wrap">
                  <div className="font-mono text-xs text-white w-24 shrink-0">{String(b.date).slice(0, 10)}</div>
                  <div className="font-mono text-[10px] text-grey-light w-24 shrink-0">{b.startTime}–{b.endTime}</div>
                  <div className="font-mono text-xs text-white uppercase flex-1 min-w-[120px] truncate">
                    {b.contactName} <span className="text-grey-light">· {b.partySize} PAX</span>
                  </div>
                  <div className="font-mono text-[10px] text-grey-light uppercase">
                    {b.tables.length > 0 ? b.tables.map((t) => t.setupItem.assignedNumber || t.setupItem.label || '?').join(', ') : 'NO TABLES'}
                  </div>
                  <span className="font-mono text-[9px] uppercase border border-grey-mid text-grey-light px-1">{b.source}</span>
                  <Button size="sm" onClick={() => openRecover(b)}>RECOVER</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Move drag overlay — a booking only becomes a drag once the mouse
          travels beyond 5px: a click with slight jitter must stay a click. */}
      {moveDrag && (
        <div
          className={`fixed inset-0 z-50 ${dragMoved ? 'cursor-grabbing' : 'cursor-default'}`}
          onMouseMove={(e) => {
            if (!dragMoved && Math.hypot(e.clientX - moveDrag.startX, e.clientY - moveDrag.startY) < 5) return
            if (!dragMoved) setDragMoved(true)
            const els = document.elementsFromPoint(e.clientX, e.clientY)
            let targetId: string | null = null
            for (const el of els) {
              const row = (el as HTMLElement).closest?.('[data-table-id]') as HTMLElement | null
              if (row) { targetId = row.getAttribute('data-table-id'); break }
            }
            setMovePreviewTableId(targetId)
            // Calculate time position from cursor x
            const wrapper = tableWrapperRef.current
            if (wrapper) {
              const r = wrapper.getBoundingClientRect()
              const scrollLeft = wrapper.scrollLeft
              const slot = Math.round((e.clientX - r.left - 110 + scrollLeft) / slotW)
              const total = (tableGrid.end - tableGrid.start) / 15
              const clamped = Math.max(0, Math.min(slot, total - 1))
              setMovePreviewStartMins(tableGrid.start + clamped * 15)
            }
          }}
          onMouseUp={() => {
            // Never travelled past the threshold — this was a click, not a
            // drag. Open the booking and skip all move logic.
            if (!dragMoved) {
              const found = bookings.find((bk) => bk.id === moveDrag.bookingId)
              if (found) openEdit(found)
              setMoveDrag(null)
              setMovePreviewTableId(null)
              setMovePreviewStartMins(null)
              return
            }
            let handled = false
            const differentTable = movePreviewTableId && movePreviewTableId !== moveDrag.sourceTableId
            const origStart = timeToMins(moveDrag.startTime)
            const duration = timeToMins(moveDrag.endTime) - origStart
            const hasTimeChange = movePreviewStartMins !== null && movePreviewStartMins !== origStart

            if (hasTimeChange) {
              const snappedStart = Math.round(movePreviewStartMins! / 15) * 15
              const snappedEnd = snappedStart + duration
              const maxEnd = tableGrid.end
              if (snappedStart >= tableGrid.start && snappedEnd <= maxEnd) {
                setTimeChangeConfirm({
                  bookingId: moveDrag.bookingId,
                  targetTableId: differentTable ? movePreviewTableId! : undefined,
                  originalStart: moveDrag.startTime,
                  originalEnd: moveDrag.endTime,
                  newStart: minsToTime(snappedStart),
                  newEnd: minsToTime(snappedEnd),
                })
                handled = true
              }
            }

            if (!handled && differentTable) {
              moveBookingToTable(moveDrag.bookingId, movePreviewTableId!)
              handled = true
            }
            if (!handled) {
              const found = bookings.find((bk) => bk.id === moveDrag.bookingId)
              if (found) openEdit(found)
            }
            setMoveDrag(null)
            setMovePreviewTableId(null)
            setMovePreviewStartMins(null)
          }}>
        </div>
      )}

      {/* Resize drag handler */}
      {resizeDrag && (
        <div
          className="fixed inset-0 z-50 cursor-ew-resize"
          onMouseMove={(e) => {
            const deltaX = e.clientX - resizeDrag.startX
            const deltaMins = Math.round(deltaX / slotW) * 15
            if (deltaMins === 0) return
            const [h, m] = resizeDrag.originalEndTime.split(':').map(Number)
            const newMins = Math.max(tableGrid.start + 15, h * 60 + m + deltaMins)
            const newTime = minsToTime(newMins)
            resizeBooking(resizeDrag.bookingId, newTime)
            setResizeDrag({ bookingId: resizeDrag.bookingId, startX: e.clientX, originalEndTime: newTime })
          }}
          onMouseUp={() => setResizeDrag(null)}
        />
      )}

      {/* Time / table change confirmation modal */}
      <Modal isOpen={!!timeChangeConfirm} onClose={() => setTimeChangeConfirm(null)} title="CONFIRM CHANGE" size="sm">
        {timeChangeConfirm && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div>
                <div className="text-grey-light uppercase text-[10px] mb-1">FROM</div>
                <div className="text-white">{timeChangeConfirm.originalStart} – {timeChangeConfirm.originalEnd}</div>
              </div>
              <div>
                <div className="text-grey-light uppercase text-[10px] mb-1">TO</div>
                <div className="text-success">{timeChangeConfirm.newStart} – {timeChangeConfirm.newEnd}</div>
              </div>
            </div>
            {timeChangeConfirm.targetTableId && (() => {
              const tgt = tableRows.find((r) => r.id === timeChangeConfirm.targetTableId)
              return (
                <div className="font-mono text-xs">
                  <div className="text-grey-light uppercase text-[10px] mb-1">TABLE</div>
                  <div className="text-success">{tgt?.assignedNumber || tgt?.label || tgt?.profile?.name || timeChangeConfirm.targetTableId}</div>
                </div>
              )
            })()}
            <div className="flex gap-2 pt-2">
              <Button onClick={() => {
                if (timeChangeConfirm.targetTableId) {
                  updateBookingTableAndTime(timeChangeConfirm.bookingId, timeChangeConfirm.targetTableId, timeChangeConfirm.newStart, timeChangeConfirm.newEnd)
                } else {
                  updateBookingTime(timeChangeConfirm.bookingId, timeChangeConfirm.newStart, timeChangeConfirm.newEnd)
                }
                setTimeChangeConfirm(null)
              }}>ACCEPT</Button>
              <Button variant="ghost" onClick={() => setTimeChangeConfirm(null)}>GO BACK</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create / Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'EDIT BOOKING' : 'NEW BOOKING'} size="md">
        <div className="space-y-3">
          <Input label="CONTACT NAME" value={formName} onChange={(e) => setFormName(e.target.value.toUpperCase())} placeholder="JOHN SMITH" />
          <div className="grid grid-cols-2 gap-2">
            <Input label="PHONE" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="021 123 456" />
            <Input label="EMAIL" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="john@example.com" />
          </div>
          {editing && editing.orders.length > 0 && (
            <div className="border border-grey-mid p-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-[9px] uppercase text-grey-light">PRE-ORDER</div>
                <Button size="sm" variant="ghost" onClick={() => openPreOrderEdit(editing.orders[0])}>EDIT PRE-ORDER</Button>
              </div>
              {editing.orders.map((o) => (
                <div key={o.id} className="space-y-0.5">
                  {o.items.filter((i) => i.productName).map((i) => (
                    <div key={`${o.id}-${i.productName}`} className="flex items-center justify-between gap-2 font-mono text-[10px] text-white">
                      <span className="truncate">{i.productName}{i.qty > 1 ? ` ×${i.qty}` : ''}</span>
                      {i.allergenNote && <span className="font-mono text-[8px] text-danger border border-danger px-1 shrink-0">{i.allergenNote.toUpperCase()}</span>}
                    </div>
                  ))}
                  {o.orderNumber && <div className="font-mono text-[9px] text-grey-light">ORDER {o.orderNumber}</div>}
                </div>
              ))}
            </div>
          )}
          {editing ? (
            <div className="grid grid-cols-3 gap-2">
              <Input label="PARTY SIZE" type="number" value={formPartySize} onChange={(e) => { setFormPartySize(e.target.value); setTimeout(checkAvailability, 200) }} min="1" />
              <Input label="START TIME" type="time" value={formStartTime} onChange={(e) => { setFormStartTime(e.target.value); setTimeout(checkAvailability, 200) }} />
              <Input label="END TIME" type="time" value={formEndTime} onChange={(e) => { setFormEndTime(e.target.value); setTimeout(checkAvailability, 200) }} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Input label="PARTY SIZE" type="number" value={formPartySize} onChange={(e) => { setFormPartySize(e.target.value); setTimeout(checkAvailability, 200) }} min="1" />
              <Select label="SOURCE" value={formSource} onChange={(e) => setFormSource(e.target.value)} options={[
                { value: 'PHONE', label: 'PHONE' }, { value: 'ONLINE', label: 'ONLINE' }, { value: 'WALK_IN', label: 'WALK IN' }, { value: 'WOOCOMMERCE', label: 'WOOCOMMERCE' }]} />
            </div>
          )}
          {services.length > 0 && (
            <Select label={editing ? 'SERVICE' : 'SERVICE (REQUIRED)'} value={formServiceId} onChange={(e) => pickService(e.target.value)}
              options={[{ value: '', label: '— SELECT A SERVICE —' }, ...services.map((s) => ({ value: s.id, label: s.name }))]} />
          )}
          {!editing && formServiceId && (
            <div className="border border-grey-mid p-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[9px] uppercase text-grey-light">AVAILABLE TIMES</span>
                <span className="font-mono text-[10px] text-white">{formStartTime} – {formEndTime}</span>
              </div>
              {timeBoxes.length === 0 ? (
                <p className="font-mono text-[10px] uppercase text-danger">NO SERVICE RUNS ON THIS DATE — NO TIMES AVAILABLE</p>
              ) : (
                <div className="grid grid-cols-4 gap-1">
                  {timeBoxes.map((b) => {
                    const active = formStartTime === minsToTime(b.startMins)
                    return (
                      <button
                        key={b.startMins}
                        onClick={() => selectBox(b.startMins, b.endMins)}
                        title={`${minsToTime(b.startMins)} – ${minsToTime(b.endMins)}`}
                        className={`font-mono text-[10px] uppercase py-1.5 border ${active ? 'bg-white text-black border-white' : 'text-grey-light border-grey-mid hover:border-white hover:text-white'}`}
                      >
                        {minsToTime(b.startMins)}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          {!editing && !formServiceId && (
            <p className="font-mono text-[9px] text-grey-light">SELECT A SERVICE TO SEE ITS AVAILABLE TIMES — BOOKINGS REQUIRE A SERVICE.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {services.length > 0 && (
              <p className="font-mono text-[9px] text-grey-light -mt-1">
                {formServiceId ? (services.find((s) => s.id === formServiceId)?.tablePlanSetup
                  ? 'USES THE SERVICE\u2019S TABLE PLAN FOR SEATING'
                  : 'NO TABLE PLAN ON THIS SERVICE — SEATS MANUALLY')
                  : 'PICKING A SERVICE WITH A TABLE PLAN AUTO-SELECTS ITS SETUP.'}
              </p>
            )}
            {setups.length > 0 && (
              <Select label="ROOM / SETUP" value={formSetupId} onChange={(e) => { setFormSetupId(e.target.value); setTimeout(checkAvailability, 200) }}
                options={[{ value: '', label: '— NO AUTO-SEAT —' }, ...setups.map((s) => ({ value: s.id, label: s.name }))]} />
            )}
          </div>
          {availMsg && (
            <div className="border border-grey-mid px-3 py-1.5 font-mono text-[10px] uppercase"
              style={{ color: availMsg.includes('NOT') || availMsg.includes('NO ') ? '#F87171' : '#4ADE80' }}>
              {availMsg}
            </div>
          )}
          {editing && (
            <Select label="STATUS" value={editing.status} onChange={(e) => updateStatus(editing.id, e.target.value)} options={STATUS_OPTIONS} />
          )}
          {editing && (() => {
            const editStart = timeToMins(editing.startTime)
            const editEnd = timeToMins(editing.endTime)
            const conflictingIds = new Set<string>()
            for (const tb of tableBookings) {
              if (tb.id === editing.id) continue
              const tbStart = timeToMins(tb.startTime)
              const tbEnd = timeToMins(tb.endTime)
              if (tbStart < editEnd && tbEnd > editStart) {
                for (const tid of tb.tableIds) conflictingIds.add(tid)
              }
            }
            const sectionGroupMap = new Map<string, { name: string; colour: string | null; tables: TableRow[] }>()
            for (const t of tableRows) {
              const key = t.section?.id ?? '_unsorted'
              if (!sectionGroupMap.has(key)) sectionGroupMap.set(key, { name: t.section?.name ?? 'UNSORTED', colour: t.section?.colour ?? null, tables: [] })
              sectionGroupMap.get(key)!.tables.push(t)
            }
            const groups = Array.from(sectionGroupMap.entries()).map(([_, grp]) => ({
              label: grp.name,
              options: grp.tables
                .filter((t) => !conflictingIds.has(t.id) || editSelectedTableIds.includes(t.id))
                .map((t) => ({
                  value: t.id,
                  label: `${t.assignedNumber || t.label || t.profile.name.slice(0, 6)} (${t.profile.name})`.toUpperCase(),
                })),
            })).filter((g) => g.options.length > 0)
            return (
              <div className="space-y-2">
                {editSelectedTableIds.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {editSelectedTableIds.map((tid) => {
                      const t = tableRows.find((r) => r.id === tid)
                      const label = t?.assignedNumber || t?.label || t?.profile?.name?.slice(0, 6) || tid.slice(0, 6)
                      return (
                        <span key={tid} className="inline-flex items-center gap-1 border border-grey-mid px-2 py-0.5 font-mono text-[10px] text-white bg-grey-dark">
                          {label}
                          <button onClick={() => setEditSelectedTableIds((prev) => prev.filter((id) => id !== tid))}
                            className="text-grey-light hover:text-danger ml-1 leading-none">&times;</button>
                        </span>
                      )
                    })}
                  </div>
                )}
                <div className="flex gap-1">
                  <div className="flex-1">
                    <SearchSelect
                      groups={groups}
                      value={editTableSearchValue}
                      onChange={(v) => {
                        if (v) {
                          setEditSelectedTableIds((prev) => [...new Set([...prev, v])])
                          setEditTableSearchValue('')
                        }
                      }}
                      placeholder={editSelectedTableIds.length > 0 ? '+ ADD TABLE' : 'SELECT TABLE...'}
                    />
                  </div>
                  <button onClick={() => {
                    const ps = parseInt(formPartySize)
                    if (!ps || ps <= 0) return
                    const available = tableRows.filter((t) => !conflictingIds.has(t.id))
                    const seatProfiles = available.map((t) => ({
                      id: t.profile.id, capacity: t.profile.capacity, chairCount: 0, width: 100, depth: 100,
                      tableNumbers: t.assignedNumber ? [t.assignedNumber] : [],
                    }))
                    const placements = planAutoSeat(ps, seatProfiles)
                    const ids: string[] = []
                    const used = new Set<string>()
                    for (const p of placements) {
                      let m = available.find((t) => t.profile.id === p.profileId && t.assignedNumber === p.assignedNumber && !used.has(t.id))
                      if (!m) m = available.find((t) => t.profile.id === p.profileId && !used.has(t.id))
                      if (m) { ids.push(m.id); used.add(m.id) }
                    }
                    setEditSelectedTableIds(ids)
                  }}
                    className="border border-grey-mid text-grey-light hover:text-white hover:border-white font-mono text-[10px] px-2 py-1.5 uppercase flex-shrink-0"
                    title="AUTO-SELECT TABLES">⟐</button>
                </div>
              </div>
            )
          })()}
          {!editing && (() => {
            const csStart = timeToMins(formStartTime)
            const csEnd = timeToMins(formEndTime)
            const conflictingIds = new Set<string>()
            for (const tb of tableBookings) {
              const tbStart = timeToMins(tb.startTime)
              const tbEnd = timeToMins(tb.endTime)
              if (tbStart < csEnd && tbEnd > csStart) {
                for (const tid of tb.tableIds) conflictingIds.add(tid)
              }
            }
            const selectedSet = new Set(createSelectedTableIds)
            const sectionMap = new Map<string, { name: string; tables: TableRow[] }>()
            for (const t of tableRows) {
              if (formSetupId && t.setupId !== formSetupId) continue
              const key = t.section?.id ?? '_unsorted'
              if (!sectionMap.has(key)) sectionMap.set(key, { name: t.section?.name ?? 'UNSORTED', tables: [] })
              sectionMap.get(key)!.tables.push(t)
            }
            const groups = Array.from(sectionMap.entries()).map(([_, grp]) => ({
              label: grp.name,
              options: grp.tables
                .filter((t) => !conflictingIds.has(t.id) || selectedSet.has(t.id))
                .map((t) => ({
                  value: t.id,
                  label: `${t.assignedNumber || t.label || t.profile.name.slice(0, 6)} (${t.profile.name})`.toUpperCase(),
                })),
            })).filter((g) => g.options.length > 0)
            return (
              <div className="space-y-2">
                {createSelectedTableIds.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {createSelectedTableIds.map((tid) => {
                      const t = tableRows.find((r) => r.id === tid)
                      const label = t?.assignedNumber || t?.label || t?.profile?.name?.slice(0, 6) || tid.slice(0, 6)
                      return (
                        <span key={tid} className="inline-flex items-center gap-1 border border-grey-mid px-2 py-0.5 font-mono text-[10px] text-white bg-grey-dark">
                          {label}
                          <button onClick={() => setCreateSelectedTableIds((prev) => prev.filter((id) => id !== tid))}
                            className="text-grey-light hover:text-danger ml-1 leading-none">&times;</button>
                        </span>
                      )
                    })}
                  </div>
                )}
                <div className="flex gap-1">
                  <div className="flex-1">
                    <SearchSelect
                      groups={groups}
                      value={createTableSearchValue}
                      onChange={(v) => {
                        if (v) {
                          setCreateSelectedTableIds((prev) => [...new Set([...prev, v])])
                          setCreateTableSearchValue('')
                        }
                      }}
                      placeholder={createSelectedTableIds.length > 0 ? '+ ADD TABLE' : 'SELECT TABLE...'}
                    />
                  </div>
                  <button onClick={() => {
                    const ps = parseInt(formPartySize)
                    if (!ps || ps <= 0) return
                    const available = tableRows.filter((t) => !conflictingIds.has(t.id))
                    const seatProfiles = available.map((t) => ({
                      id: t.profile.id, capacity: t.profile.capacity, chairCount: 0, width: 100, depth: 100,
                      tableNumbers: t.assignedNumber ? [t.assignedNumber] : [],
                    }))
                    const placements = planAutoSeat(ps, seatProfiles)
                    const ids: string[] = []
                    const used = new Set<string>()
                    for (const p of placements) {
                      let m = available.find((t) => t.profile.id === p.profileId && t.assignedNumber === p.assignedNumber && !used.has(t.id))
                      if (!m) m = available.find((t) => t.profile.id === p.profileId && !used.has(t.id))
                      if (m) { ids.push(m.id); used.add(m.id) }
                    }
                    setCreateSelectedTableIds(ids)
                  }}
                    className="border border-grey-mid text-grey-light hover:text-white hover:border-white font-mono text-[10px] px-2 py-1.5 uppercase flex-shrink-0"
                    title="AUTO-SELECT TABLES">⟐</button>
                </div>
              </div>
            )
          })()}
          {editing ? (
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} loading={saving}>SAVE</Button>
              <Button variant="danger" onClick={() => { if (confirm('CANCEL THIS BOOKING?')) deleteBooking(editing.id); setShowModal(false) }}>CANCEL BOOKING</Button>
              <Button variant="ghost" onClick={() => setShowModal(false)}>CLOSE</Button>
            </div>
          ) : (
            <Input label="NOTES (optional)" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="ALLERGIES, SPECIAL REQUESTS..." />
          )}
          {!editing && (
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} loading={saving} disabled={!formName || createSelectedTableIds.length === 0}>CREATE BOOKING</Button>
              <Button variant="ghost" onClick={() => setShowModal(false)}>CANCEL</Button>
            </div>
          )}
          {error && <p className="font-mono text-xs text-danger">{error}</p>}
        </div>
      </Modal>

      {/* Recover / reseat a deleted booking. Table chips default to the old
          tables; the occupancy set below is the booking's OWN date (fetched
          when the modal opens) so the availability readout is honest even
          when that date differs from the selected one. */}
      <Modal isOpen={recoverTarget != null} onClose={() => setRecoverTarget(null)} title="RECOVER BOOKING" size="md">
        {recoverTarget && (() => {
          const rStart = timeToMins(recoverTarget.startTime)
          const rEnd = timeToMins(recoverTarget.endTime)
          const conflictingIds = new Set<string>()
          for (const tb of recoverTableBookings) {
            if (tb.id === recoverTarget.id) continue
            const s = timeToMins(tb.startTime)
            const e = timeToMins(tb.endTime)
            if (s < rEnd && e > rStart) for (const tid of tb.tableIds) conflictingIds.add(tid)
          }
          const selectedSet = new Set(recoverSelectedTableIds)
          const clashes = recoverSelectedTableIds.filter((id) => conflictingIds.has(id))
          const sectionMap = new Map<string, { name: string; tables: TableRow[] }>()
          for (const t of recoverTableRows) {
            const key = t.section?.id ?? '_unsorted'
            if (!sectionMap.has(key)) sectionMap.set(key, { name: t.section?.name ?? 'UNSORTED', tables: [] })
            sectionMap.get(key)!.tables.push(t)
          }
          const groups = Array.from(sectionMap.entries()).map(([_, grp]) => ({
            label: grp.name,
            options: grp.tables
              .filter((t) => !conflictingIds.has(t.id) || selectedSet.has(t.id))
              .map((t) => ({
                value: t.id,
                label: `${t.assignedNumber || t.label || t.profile.name.slice(0, 6)} (${t.profile.name})`.toUpperCase(),
              })),
          })).filter((g) => g.options.length > 0)
          return (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                <span className="text-grey-light uppercase">DATE</span>
                <span className="col-span-2 text-white">{String(recoverTarget.date).slice(0, 10)}</span>
                <span className="text-grey-light uppercase">TIME</span>
                <span className="col-span-2 text-white">{recoverTarget.startTime}–{recoverTarget.endTime} · {recoverTarget.partySize} PAX</span>
                <span className="text-grey-light uppercase">OLD TABLES</span>
                <span className="col-span-2 text-grey-light">
                  {recoverTarget.tables.length > 0
                    ? recoverTarget.tables.map((t) => t.setupItem.assignedNumber || t.setupItem.label || '?').join(', ')
                    : '—'}
                </span>
              </div>
              {recoverTarget.orders.length > 0 && (
                <p className="font-mono text-[9px] uppercase text-grey-light">
                  LINKED ORDER{recoverTarget.orders.length > 1 ? 'S' : ''} RE-CONNECTS ON RESTORE
                </p>
              )}
              {recoverSelectedTableIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {recoverSelectedTableIds.map((tid) => {
                    const t = recoverTableRows.find((r) => r.id === tid)
                    const label = t?.assignedNumber || t?.label || t?.profile?.name?.slice(0, 6) || tid.slice(0, 6)
                    return (
                      <span key={tid} className={`inline-flex items-center gap-1 border px-2 py-0.5 font-mono text-[10px] bg-grey-dark ${conflictingIds.has(tid) ? 'border-danger text-danger' : 'border-grey-mid text-white'}`}>
                        {label}
                        <button onClick={() => setRecoverSelectedTableIds((prev) => prev.filter((id) => id !== tid))}
                          className="text-grey-light hover:text-danger ml-1 leading-none">&times;</button>
                      </span>
                    )
                  })}
                </div>
              )}
              <div className="flex gap-1">
                <div className="flex-1">
                  <SearchSelect
                    groups={groups}
                    value={recoverTableSearchValue}
                    onChange={(v) => {
                      if (v) {
                        setRecoverSelectedTableIds((prev) => [...new Set([...prev, v])])
                        setRecoverTableSearchValue('')
                      }
                    }}
                    placeholder={recoverSelectedTableIds.length > 0 ? '+ ADD TABLE' : 'SELECT TABLE...'}
                  />
                </div>
                <button onClick={() => {
                  const ps = recoverTarget.partySize
                  if (!ps || ps <= 0) return
                  const available = recoverTableRows.filter((t) => !conflictingIds.has(t.id))
                  const seatProfiles = available.map((t) => ({
                    id: t.profile.id, capacity: t.profile.capacity, chairCount: 0, width: 100, depth: 100,
                    tableNumbers: t.assignedNumber ? [t.assignedNumber] : [],
                  }))
                  const placements = planAutoSeat(ps, seatProfiles)
                  const ids: string[] = []
                  const used = new Set<string>()
                  for (const p of placements) {
                    let m = available.find((t) => t.profile.id === p.profileId && t.assignedNumber === p.assignedNumber && !used.has(t.id))
                    if (!m) m = available.find((t) => t.profile.id === p.profileId && !used.has(t.id))
                    if (m) { ids.push(m.id); used.add(m.id) }
                  }
                  setRecoverSelectedTableIds(ids)
                }}
                  className="border border-grey-mid text-grey-light hover:text-white hover:border-white font-mono text-[10px] px-2 py-1.5 uppercase flex-shrink-0"
                  title="AUTO-SELECT TABLES">⟐</button>
              </div>
              {recoverSelectedTableIds.length === 0 ? (
                <p className="font-mono text-[9px] uppercase text-grey-light">NO TABLES SELECTED — RESTORES WITHOUT SEATING</p>
              ) : clashes.length > 0 ? (
                <p className="border border-danger px-2 py-1.5 font-mono text-[10px] uppercase text-danger">
                  {clashes.length} TABLE(S) BOOKED AT THIS TIME — PICK OTHERS
                </p>
              ) : (
                <p className="border border-grey-mid px-2 py-1.5 font-mono text-[10px] uppercase text-success">
                  TABLES FREE — SAFE TO RESTORE
                </p>
              )}
              {recoverError && <p className="font-mono text-xs text-danger">{recoverError}</p>}
              <div className="flex gap-2 pt-1">
                <Button onClick={doRecover} loading={recoverSaving}>RECOVER BOOKING</Button>
                <Button variant="ghost" onClick={() => setRecoverTarget(null)}>CANCEL</Button>
              </div>
            </div>
          )
        })()}
      </Modal>

      <Modal isOpen={preOrderEdit != null} onClose={() => setPreOrderEdit(null)} title="EDIT PRE-ORDER" size="md">
        {preOrderEdit && (
          <div className="space-y-3">
            {preOrderEdit.orderNumber && (
              <p className="font-mono text-[10px] text-grey-light">ORDER {preOrderEdit.orderNumber} — CHANGES SYNC BACK TO WOOCOMMERCE ON SAVE.</p>
            )}
            {preOrderDraft.length === 0 ? (
              <p className="font-mono text-xs text-grey-light">NO LINE ITEMS</p>
            ) : (
              <div className="divide-y divide-grey-mid border border-grey-mid">
                {preOrderDraft.map((l, i) => (
                  <div key={l.id} className="flex items-center gap-2 px-2 py-1.5">
                    <span className="flex-1 min-w-0 font-mono text-xs text-white uppercase truncate">{l.productName ?? '—'}</span>
                    <span className="font-mono text-[10px] text-grey-light shrink-0">{l.unitPrice != null ? `$${l.unitPrice.toFixed(2)}` : ''}</span>
                    <input
                      type="number"
                      min="1"
                      value={l.qty}
                      onChange={(e) => {
                        const q = Math.max(1, parseInt(e.target.value) || 1)
                        setPreOrderDraft((prev) => prev.map((x, j) => (j === i ? { ...x, qty: q } : x)))
                      }}
                      className="w-16 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white text-right"
                    />
                    <button
                      onClick={() => setPreOrderDraft((prev) => prev.filter((_, j) => j !== i))}
                      className="font-mono text-xs text-danger hover:bg-danger hover:text-black border border-danger px-1 shrink-0"
                      title="REMOVE LINE"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button onClick={savePreOrder} loading={savingPreOrder} disabled={preOrderDraft.length === 0}>SAVE & SYNC</Button>
              <Button variant="ghost" onClick={() => setPreOrderEdit(null)}>CANCEL</Button>
            </div>
          </div>
        )}
      </Modal>

      <CustomerDrawer
        isOpen={customerDrawer != null}
        onClose={() => setCustomerDrawer(null)}
        name={customerDrawer?.name ?? ''}
        phone={customerDrawer?.phone}
        email={customerDrawer?.email}
        venueId={venueId}
      />
    </div>
  )
}
