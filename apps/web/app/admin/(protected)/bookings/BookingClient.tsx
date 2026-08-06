'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { planAutoSeat } from '@/lib/auto-seat'

interface BookingTable { id: string; setupItem: { id: string; assignedNumber: string | null; label: string | null } }
interface Booking {
  id: string; date: string; startTime: string; endTime: string; partySize: number
  contactName: string; contactPhone: string | null; contactEmail: string | null
  source: string; status: string; notes: string | null
  tables: BookingTable[]
}
interface SetupLite { id: string; name: string; floorPlan: { id: string; slug: string } }
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

const SLOT_W = 22
const START_HOUR = 6
const END_HOUR = 22
const TOTAL_SLOTS = (END_HOUR - START_HOUR) * 4

function formatDate(d: string) {
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function BookingClient() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(todayStr())
  const [venues, setVenues] = useState<VenueLite[]>([])
  const [venueId, setVenueId] = useState('')
  const [setups, setSetups] = useState<SetupLite[]>([])
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
  const [formNotes, setFormNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [availMsg, setAvailMsg] = useState('')
  const [viewMode, setViewMode] = useState<'diary' | 'table'>('diary')
  const [tableRows, setTableRows] = useState<TableRow[]>([])
  const [tableBookings, setTableBookings] = useState<TableBooking[]>([])
  const [tableLoading, setTableLoading] = useState(false)
  const [resizeDrag, setResizeDrag] = useState<{ bookingId: string; startX: number; originalEndTime: string } | null>(null)
  const [editSelectedTableIds, setEditSelectedTableIds] = useState<string[]>([])
  const [createSelectedTableIds, setCreateSelectedTableIds] = useState<string[]>([])
  const [createTableSearchValue, setCreateTableSearchValue] = useState('')
  const [editTableSearchValue, setEditTableSearchValue] = useState('')
  const [moveDrag, setMoveDrag] = useState<{ bookingId: string; sourceTableId: string; startTime: string; endTime: string; partySize: number; contactName: string; status: string; startX: number; startY: number } | null>(null)
  const [movePreviewTableId, setMovePreviewTableId] = useState<string | null>(null)
  const [movePreviewStartMins, setMovePreviewStartMins] = useState<number | null>(null)
  const [timeChangeConfirm, setTimeChangeConfirm] = useState<{ bookingId: string; targetTableId?: string; originalStart: string; originalEnd: string; newStart: string; newEnd: string } | null>(null)
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

  // Derive setup list from tableRows
  useEffect(() => {
    const map = new Map<string, string>()
    for (const t of tableRows) { if (!map.has(t.setupId)) map.set(t.setupId, t.setupName) }
    const list = Array.from(map.entries()).map(([id, name]) => ({ id, name, floorPlan: { id: '', slug: '' } }))
    setSetups(list)
    if (list.length > 0) setSelectedSetupId((prev) => prev || list[0].id)
  }, [tableRows])

  useEffect(() => {
    fetch('/api/admin/venues').then((r) => r.json()).then((data: VenueLite[]) => {
      const vs = Array.isArray(data) ? data : []
      setVenues(vs)
      if (vs.length > 0) {
        setVenueId(vs[0].id)
        loadBookings(date, vs[0].id)
      }
    })
  }, [])

  useEffect(() => {
    if (venueId) { loadBookings(date, venueId); loadTableData(date, venueId) }
  }, [date, venueId, loadBookings, loadTableData])

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
    setFormSource('PHONE'); setFormSetupId(selectedSetupId || (setups.length > 0 ? setups[0].id : '')); setFormNotes(''); setAvailMsg('')
    setCreateSelectedTableIds([])
    setCreateTableSearchValue('')
    setShowModal(true)
  }

  function openEdit(b: Booking) {
    setEditing(b)
    setFormName(b.contactName); setFormPhone(b.contactPhone ?? ''); setFormEmail(b.contactEmail ?? '')
    setFormPartySize(String(b.partySize)); setFormStartTime(b.startTime); setFormEndTime(b.endTime)
    setFormSource(b.source); setFormNotes(b.notes ?? '')
    setEditSelectedTableIds(b.tables.map((t) => t.setupItem.id))
    setEditTableSearchValue('')
    setAvailMsg('')
    setShowModal(true)
  }

  function timeToMins(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  function minsToTime(m: number) { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }

  function openCreateOnTable(startMins: number, endMins: number, sid?: string) {
    setEditing(null)
    setFormName(''); setFormPhone(''); setFormEmail('')
    setFormPartySize('2'); setFormSource('PHONE'); setFormSetupId(sid ?? ''); setFormNotes(''); setAvailMsg('')
    setCreateSelectedTableIds([])
    setCreateTableSearchValue('')
    setFormStartTime(minsToTime(startMins)); setFormEndTime(minsToTime(endMins))
    setShowModal(true)
  }

  async function resizeBooking(id: string, newEndTime: string) {
    await fetch(`/api/admin/bookings/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endTime: newEndTime }),
    })
    loadBookings(date, venueId); loadTableData(date, venueId)
  }

  async function moveBookingToTable(bookingId: string, tableId: string) {
    const r = await fetch(`/api/admin/bookings/${bookingId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableIds: [tableId] }),
    })
    if (r.ok) { loadBookings(date, venueId); loadTableData(date, venueId) }
  }

  async function updateBookingTime(bookingId: string, startTime: string, endTime: string) {
    const r = await fetch(`/api/admin/bookings/${bookingId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startTime, endTime }),
    })
    if (r.ok) { loadBookings(date, venueId); loadTableData(date, venueId) }
  }

  async function updateBookingTableAndTime(bookingId: string, tableId: string, startTime: string, endTime: string) {
    const r = await fetch(`/api/admin/bookings/${bookingId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableIds: [tableId], startTime, endTime }),
    })
    if (r.ok) { loadBookings(date, venueId); loadTableData(date, venueId) }
  }

  async function handleSave() {
    if (saving) return
    if (!formName) { setError('NAME REQUIRED'); return }
    setSaving(true); setError('')
    if (editing) {
      const r = await fetch(`/api/admin/bookings/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactName: formName, contactPhone: formPhone || null, contactEmail: formEmail || null, partySize: formPartySize, startTime: formStartTime, endTime: formEndTime, source: formSource, notes: formNotes || null, tableIds: editSelectedTableIds }),
      })
      if (!r.ok) { setError('SAVE FAILED'); setSaving(false); return }
    } else {
      const r = await fetch('/api/admin/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, startTime: formStartTime, endTime: formEndTime, partySize: parseInt(formPartySize), contactName: formName, contactPhone: formPhone || null, contactEmail: formEmail || null, source: formSource, notes: formNotes || null, venueId, setupId: formSetupId || null, floorPlanSlug: formSetupId ? setups.find((s) => s.id === formSetupId)?.floorPlan?.slug ?? null : null, tableIds: createSelectedTableIds.length > 0 ? createSelectedTableIds : undefined }),
      })
      if (!r.ok) { const d = await r.json(); setError(d.error ?? 'SAVE FAILED'); setSaving(false); return }
    }
    setSaving(false); setShowModal(false)
    loadBookings(date, venueId)
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/admin/bookings/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    loadBookings(date, venueId)
  }

  async function deleteBooking(id: string) {
    await fetch(`/api/admin/bookings/${id}`, { method: 'DELETE' })
    loadBookings(date, venueId)
  }

  const prevDay = () => { const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0, 10)) }
  const nextDay = () => { const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + 1); setDate(d.toISOString().slice(0, 10)) }

  // Build time slots for the diary — half-hour increments from 06:00 to 24:00
  const timeSlots: string[] = []
  for (let h = 6; h < 24; h++) {
    timeSlots.push(`${String(h).padStart(2, '0')}:00`)
    timeSlots.push(`${String(h).padStart(2, '0')}:30`)
  }

  function getBookingsForSlot(slot: string) {
    const slotMin = (parseInt(slot.slice(0, 2)) * 60) + parseInt(slot.slice(3))
    return bookings.filter((b) => {
      const bStart = (parseInt(b.startTime.slice(0, 2)) * 60) + parseInt(b.startTime.slice(3))
      const bEnd = (parseInt(b.endTime.slice(0, 2)) * 60) + parseInt(b.endTime.slice(3))
      return slotMin >= bStart && slotMin < bEnd
    })
  }

  return (
    <div className="space-y-4 pb-12 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">BOOKINGS</h1>
        <div className="flex items-center gap-2">
          <div className="flex border border-grey-mid">
            <button onClick={() => setViewMode('diary')} className={`font-mono text-[10px] uppercase px-3 py-1.5 ${viewMode === 'diary' ? 'bg-white text-black' : 'text-grey-light hover:text-white'}`}>DIARY</button>
            <button onClick={() => setViewMode('table')} className={`font-mono text-[10px] uppercase px-3 py-1.5 ${viewMode === 'table' ? 'bg-white text-black' : 'text-grey-light hover:text-white'}`}>TABLE</button>
          </div>
          <Button size="sm" onClick={openCreate}>+ NEW BOOKING</Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center border border-grey-mid">
          <button onClick={prevDay} title="PREVIOUS DAY" className="px-2 py-1.5 font-mono text-xs text-grey-light hover:text-white border-r border-grey-mid">◂</button>
          <span className="px-3 py-1.5 font-mono text-xs text-white font-bold">{formatDate(date)}</span>
          <button onClick={nextDay} title="NEXT DAY" className="px-2 py-1.5 font-mono text-xs text-grey-light hover:text-white border-l border-grey-mid">▸</button>
          <input
            type="date"
            value={date}
            onChange={(e) => { if (e.target.value) setDate(e.target.value) }}
            className="bg-black border-l border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white"
          />
          <button onClick={() => setDate(todayStr())} className="px-2 py-1.5 font-mono text-xs text-grey-light hover:text-white border-l border-grey-mid">TODAY</button>
        </div>
        {venues.length > 1 && (
          <select value={venueId} onChange={(e) => setVenueId(e.target.value)}
            className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-hidden focus:border-white">
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        )}
      </div>

      <div className="flex items-center justify-between font-mono text-xs text-grey-light">
        <span>{bookings.length} BOOKING{bookings.length !== 1 ? 'S' : ''} · {bookings.reduce((s, b) => s + b.partySize, 0)} PAX TOTAL</span>
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

          {/* Time slot rows */}
          <div className="divide-y divide-grey-mid">
            {timeSlots.map((slot) => {
              const slotBookings = getBookingsForSlot(slot)
              const isHour = slot.endsWith(':00')
              return (
                <div key={slot} className="grid grid-cols-[80px_1fr] min-h-[28px]">
                  <div className={`px-3 py-1 font-mono text-xs ${isHour ? 'text-grey-light' : 'text-grey-light/40'} ${slotBookings.length > 0 ? 'border-r border-grey-mid' : ''}`}>
                    {isHour ? slot : ''}
                  </div>
                  <div className="flex flex-wrap gap-1 px-1 py-0.5">
                    {slotBookings.map((b) => {
                      const bStart = (parseInt(b.startTime.slice(0, 2)) * 60) + parseInt(b.startTime.slice(3))
                      const slotMin = (parseInt(slot.slice(0, 2)) * 60) + parseInt(slot.slice(3))
                      if (slotMin !== bStart && (slotMin - bStart) % 60 !== 0) return null

                      const durationH = Math.round(((parseInt(b.endTime.slice(0, 2)) * 60) + parseInt(b.endTime.slice(3)) - bStart) / 60 * 10) / 10
                      return (
                        <button
                          key={b.id}
                          onClick={() => openEdit(b)}
                          className="flex-1 min-w-[180px] text-left bg-grey-dark border border-grey-mid p-2 hover:border-white transition-colors cursor-pointer"
                          style={{ borderLeftColor: STATUS_COLORS[b.status] || '#6B6B6B', borderLeftWidth: '3px' }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs text-white font-bold">{b.contactName}</span>
                            <span className="font-mono text-[10px] uppercase" style={{ color: STATUS_COLORS[b.status] || '#6B6B6B' }}>{b.status}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 font-mono text-[10px] text-grey-light">
                            <span>{b.startTime}–{b.endTime} ({durationH}h)</span>
                            <span>· {b.partySize} PAX</span>
                            {b.tables.length > 0 && (
                              <span>· {b.tables.map((t) => t.setupItem.assignedNumber || t.setupItem.label || 'TBL').join(', ')}</span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}</> )}

      {viewMode === 'table' && (() => {
        const timeSlots2: string[] = []
        for (let h = START_HOUR; h < END_HOUR; h++) { timeSlots2.push(`${String(h).padStart(2, '0')}:00`); timeSlots2.push(`${String(h).padStart(2, '0')}:15`); timeSlots2.push(`${String(h).padStart(2, '0')}:30`); timeSlots2.push(`${String(h).padStart(2, '0')}:45`) }

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
          const rightX = ((bEnd - START_HOUR * 60) / 15) * SLOT_W
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
              <div className="border border-grey-mid overflow-auto max-h-[70vh]" ref={tableWrapperRef} data-time-slot-w={SLOT_W}>
                <table className="border-collapse" style={{ minWidth: 110 + TOTAL_SLOTS * SLOT_W }}>
                  <thead className="sticky top-0 z-10 bg-grey-dark">
                    <tr>
                      <th className="border-b border-grey-mid border-r text-left px-2 py-1 font-mono text-[8px] uppercase text-grey-light tracking-wider sticky left-0 bg-grey-dark z-20" style={{ width: 110 }}>TABLE</th>
                      {timeSlots2.map((slot, i) => {
                        const isHour = slot.endsWith(':00')
                        const isHalf = slot.endsWith(':30')
                        return (
                          <th key={i} className={`border-b border-grey-mid font-mono text-[8px] text-center py-1 ${isHour ? 'text-grey-light' : isHalf ? 'text-grey-light/40' : 'text-grey-light/20'} ${isHour ? 'border-r border-grey-mid' : 'border-r border-grey-mid/20'}`} style={{ width: SLOT_W }}>
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
                            {timeSlots2.map((_, i) => <td key={i} className="border-b border-grey-mid/20" style={{ width: SLOT_W }} />)}
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
                              <td colSpan={TOTAL_SLOTS} className={`border-b border-grey-mid/30 relative`}
                                style={{ padding: 0, backgroundImage: `repeating-linear-gradient(to right, rgba(46,46,46,0.12) 0px, rgba(46,46,46,0.12) 1px, transparent 1px, transparent ${SLOT_W}px)` }}>
                                <div className="absolute inset-0 flex">
                                  {tblBookings.map((b) => {
                                    const bStart = timeToMins(b.startTime)
                                    const bEnd = timeToMins(b.endTime)
                                    const gridStart = START_HOUR * 60
                                    const left = ((bStart - gridStart) / 15) * SLOT_W
                                    const width = ((bEnd - bStart) / 15) * SLOT_W
                                    const colour = STATUS_COLORS[b.status] || '#6B6B6B'
                                    const isMoving = moveDrag?.bookingId === b.id
                                    const linkedLabels = b.tableIds.length > 1
                                      ? b.tableIds.map((tid) => tableRows.find((r) => r.id === tid)?.assignedNumber || tableRows.find((r) => r.id === tid)?.label || '?').join(',')
                                      : ''
                                    return (
                                      <div key={b.id} className={`absolute top-0.5 bottom-0.5 rounded-sm flex items-center px-1.5 group z-10 ${isMoving ? 'opacity-30' : 'cursor-grab'}`}
                                        style={{ left, width, backgroundColor: colour + '30', borderLeft: `2px solid ${colour}` }}
                                        onMouseDown={(e) => { e.stopPropagation(); setMoveDrag({ bookingId: b.id, sourceTableId: tbl.id, startTime: b.startTime, endTime: b.endTime, partySize: b.partySize, contactName: b.contactName, status: b.status, startX: e.clientX, startY: e.clientY }) }}
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
                                      ? ((movePreviewStartMins - START_HOUR * 60) / 15) * SLOT_W
                                      : ((timeToMins(moveDrag.startTime) - START_HOUR * 60) / 15) * SLOT_W
                                    const previewWidth = ((timeToMins(moveDrag.endTime) - timeToMins(moveDrag.startTime)) / 15) * SLOT_W
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
                                  {/* Empty-click zone for rows with no bookings at a given slot */}
                                  {tblBookings.length === 0 && timeSlots2.map((slot, si) => (
                                    <div key={si} className="absolute cursor-pointer hover:bg-grey-mid/5"
                                      style={{ left: si * SLOT_W, width: SLOT_W, top: 0, bottom: 0 }}
                                      onClick={() => { const startMins = START_HOUR * 60 + si * 15; openCreateOnTable(startMins, startMins + 120, tbl.setupId) }}
                                    />
                                  ))}
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
            )}
          </div>
        )
      })()}

      {/* Move drag overlay */}
      {moveDrag && (
        <div
          className="fixed inset-0 z-50 cursor-grabbing"
          onMouseMove={(e) => {
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
              const slot = Math.round((e.clientX - r.left - 110 + scrollLeft) / SLOT_W)
              const clamped = Math.max(0, Math.min(slot, TOTAL_SLOTS - 1))
              setMovePreviewStartMins(START_HOUR * 60 + clamped * 15)
            }
          }}
          onMouseUp={() => {
            let handled = false
            const differentTable = movePreviewTableId && movePreviewTableId !== moveDrag.sourceTableId
            const origStart = timeToMins(moveDrag.startTime)
            const duration = timeToMins(moveDrag.endTime) - origStart
            const hasTimeChange = movePreviewStartMins !== null && movePreviewStartMins !== origStart

            if (hasTimeChange) {
              const snappedStart = Math.round(movePreviewStartMins! / 15) * 15
              const snappedEnd = snappedStart + duration
              const maxEnd = END_HOUR * 60
              if (snappedStart >= START_HOUR * 60 && snappedEnd <= maxEnd) {
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
            const deltaMins = Math.round(deltaX / SLOT_W) * 15
            if (deltaMins === 0) return
            const [h, m] = resizeDrag.originalEndTime.split(':').map(Number)
            const newMins = Math.max(START_HOUR * 60 + 15, h * 60 + m + deltaMins)
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
          <div className="grid grid-cols-3 gap-2">
            <Input label="PARTY SIZE" type="number" value={formPartySize} onChange={(e) => { setFormPartySize(e.target.value); setTimeout(checkAvailability, 200) }} min="1" />
            <Input label="START TIME" type="time" value={formStartTime} onChange={(e) => { setFormStartTime(e.target.value); setTimeout(checkAvailability, 200) }} />
            <Input label="END TIME" type="time" value={formEndTime} onChange={(e) => { setFormEndTime(e.target.value); setTimeout(checkAvailability, 200) }} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select label="SOURCE" value={formSource} onChange={(e) => setFormSource(e.target.value)} options={[
              { value: 'PHONE', label: 'PHONE' }, { value: 'ONLINE', label: 'ONLINE' }, { value: 'WALK_IN', label: 'WALK IN' }, { value: 'WOOCOMMERCE', label: 'WOOCOMMERCE' }]} />
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
    </div>
  )
}
