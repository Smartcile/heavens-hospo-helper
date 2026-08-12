'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { pushToast } from '@/components/ui/Toast'
import { getActiveVenueId } from '@/lib/active-venue'

const DAYS = [
  { code: 'SUN', name: 'SUNDAY' },
  { code: 'MON', name: 'MONDAY' },
  { code: 'TUE', name: 'TUESDAY' },
  { code: 'WED', name: 'WEDNESDAY' },
  { code: 'THU', name: 'THURSDAY' },
  { code: 'FRI', name: 'FRIDAY' },
  { code: 'SAT', name: 'SATURDAY' },
]

interface ServiceSlot {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
  maxCovers: number
}

interface ServiceException {
  id: string
  date: string
  closed: boolean
  startTime: string | null
  endTime: string | null
  maxCovers: number | null
}

interface Service {
  id: string
  name: string
  description: string | null
  wooCategoryId: string | null
  wooCategoryName: string | null
  requiresBooking: boolean
  isActive: boolean
  bookingIntervalMinutes: number
  bookableTimes: string[] | null
  slots: ServiceSlot[]
  exceptions: ServiceException[]
  tablePlanSetup: { id: string; name: string; floorPlan: { id: string; name: string } } | null
  venue: { id: string; name: string }
  _count: { orders: number }
}

interface SetupLite { id: string; name: string; floorPlan: { id: string; name: string; slug: string } }

/** Local editing shapes — numbers stay strings so a cleared box isn't 0. */
interface DraftSlot { dayOfWeek: number; startTime: string; endTime: string; maxCovers: string }
interface DraftException { date: string; closed: boolean; startTime: string; endTime: string; maxCovers: string }

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

const timeInputClass =
  'w-full bg-black border border-grey-mid text-white font-mono text-[10px] px-1 py-1 outline-none focus:border-white text-center'

export function ServicesClient({ role, sessionVenueId, defaultVenueId }: { role: string; sessionVenueId: string; defaultVenueId?: string | null }) {
  const [venueId, setVenueId] = useState(() => getActiveVenueId(role, sessionVenueId, defaultVenueId))
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [wooCategoryId, setWooCategoryId] = useState('')
  const [wooCategoryName, setWooCategoryName] = useState('')
  const [requiresBooking, setRequiresBooking] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [tablePlanSetupId, setTablePlanSetupId] = useState('')
  const [bookingIntervalMinutes, setBookingIntervalMinutes] = useState('15')
  const [bookableTimes, setBookableTimes] = useState<string[]>([])
  const [bookableTimeInput, setBookableTimeInput] = useState('')
  const [slots, setSlots] = useState<DraftSlot[]>([])
  const [exceptions, setExceptions] = useState<DraftException[]>([])

  const [wooCategories, setWooCategories] = useState<{ value: string; label: string }[]>([])
  const wooLoaded = useRef(false)
  const [setups, setSetups] = useState<SetupLite[]>([])
  const [newDay, setNewDay] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    // The sidebar venue selection drives this page: a specific venue loads
    // just that venue; "ALL VENUES" (empty) loads every venue's services.
    const qs = venueId ? `?venueId=${encodeURIComponent(venueId)}` : ''
    const res = await fetch(`/api/admin/services${qs}`)
    if (res.ok) setServices(await res.json())
    setLoading(false)
  }, [venueId])

  useEffect(() => { load() }, [load])

  // The table-plan picker needs the venue's floor plan setups. When the venue
  // is scoped ("ALL VENUES" has no single plan list), clear the list.
  useEffect(() => {
    if (!venueId) { setSetups([]); return }
    fetch(`/api/admin/floorplan-setups?venueId=${encodeURIComponent(venueId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: SetupLite[]) => setSetups(Array.isArray(data) ? data : []))
  }, [venueId])

  async function loadWooCategories() {
    if (wooLoaded.current) return
    const res = await fetch('/api/admin/woocommerce/categories')
    if (res.ok) {
      const data = await res.json()
      const cats = data.categories ?? []
      setWooCategories(cats.map((c: { id: number; name: string }) => ({ value: String(c.id), label: c.name })))
    }
    wooLoaded.current = true
  }

  function openService(s: Service) {
    setSelectedId(s.id)
    setName(s.name)
    setDescription(s.description ?? '')
    setWooCategoryId(s.wooCategoryId ?? '')
    setWooCategoryName(s.wooCategoryName ?? '')
    setRequiresBooking(s.requiresBooking)
    setIsActive(s.isActive)
    setTablePlanSetupId(s.tablePlanSetup?.id ?? '')
    setBookingIntervalMinutes(String(s.bookingIntervalMinutes ?? 15))
    setBookableTimes(Array.isArray(s.bookableTimes) ? s.bookableTimes : [])
    setBookableTimeInput('')
    setSlots(s.slots.map((x) => ({ dayOfWeek: x.dayOfWeek, startTime: x.startTime, endTime: x.endTime, maxCovers: String(x.maxCovers) })))
    setExceptions(s.exceptions.map((x) => ({
      date: x.date.slice(0, 10),
      closed: x.closed,
      startTime: x.startTime ?? '',
      endTime: x.endTime ?? '',
      maxCovers: x.maxCovers?.toString() ?? '',
    })))
    loadWooCategories()
  }

  function newService() {
    setSelectedId('new')
    setName(''); setDescription(''); setWooCategoryId(''); setWooCategoryName('')
    setRequiresBooking(false); setIsActive(true); setTablePlanSetupId('')
    setBookingIntervalMinutes('15'); setBookableTimes([]); setBookableTimeInput('')
    setSlots([]); setExceptions([])
    loadWooCategories()
  }

  function closeEditor() {
    setSelectedId(null)
  }

  function addSlot(dayOfWeek: number) {
    setSlots([...slots, { dayOfWeek, startTime: '17:00', endTime: '18:00', maxCovers: '10' }])
  }

  function addDay(dayOfWeek: number) {
    setSlots([...slots, { dayOfWeek, startTime: '17:00', endTime: '18:00', maxCovers: '10' }])
    setNewDay('')
  }

  function removeDay(dayOfWeek: number) {
    if (!confirm(`REMOVE ALL TIMES ON ${DAYS[dayOfWeek].name}?`)) return
    setSlots(slots.filter((s) => s.dayOfWeek !== dayOfWeek))
  }

  function updateSlot(index: number, patch: Partial<DraftSlot>) {
    setSlots(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  function addException() {
    setExceptions([...exceptions, { date: '', closed: false, startTime: '17:00', endTime: '18:00', maxCovers: '10' }])
  }

  function updateException(index: number, patch: Partial<DraftException>) {
    setExceptions(exceptions.map((e, i) => (i === index ? { ...e, ...patch } : e)))
  }

  function pickCategory(value: string) {
    setWooCategoryId(value)
    setWooCategoryName(wooCategories.find((c) => c.value === value)?.label ?? '')
  }

  function validate(): string | null {
    if (!name.trim()) return 'SERVICE NAME IS REQUIRED'
    const bad = slots.find((s) => !HHMM.test(s.startTime) || !HHMM.test(s.endTime) || s.startTime >= s.endTime)
    if (bad) return 'CHECK SLOT TIMES — START MUST BE BEFORE END'
    const seen = new Set(slots.map((s) => `${s.dayOfWeek}|${s.startTime}`))
    if (seen.size !== slots.length) return 'DUPLICATE SLOT TIMES ON THE SAME DAY'
    const badEx = exceptions.find((e) => !e.date)
    if (badEx) return 'EVERY EXCEPTION NEEDS A DATE'
    const interval = parseInt(bookingIntervalMinutes, 10)
    if (!Number.isInteger(interval) || interval < 5 || interval > 120) return 'BOOKING INTERVAL MUST BE 5-120 MINUTES'
    const badTime = bookableTimes.find((t) => !HHMM.test(t))
    if (badTime) return 'BOOKABLE TIMES MUST BE HH:MM'
    return null
  }

  async function save() {
    const invalid = validate()
    if (invalid) { pushToast(invalid, 'error'); return }

    const payload = {
      name: name.toUpperCase().trim(),
      description: description || null,
      wooCategoryId: wooCategoryId || null,
      wooCategoryName: wooCategoryName || null,
      requiresBooking,
      isActive,
      tablePlanSetupId: tablePlanSetupId || null,
      bookingIntervalMinutes: parseInt(bookingIntervalMinutes, 10) || 15,
      bookableTimes: bookableTimes.length > 0 ? bookableTimes : null,
      slots: slots.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        maxCovers: parseInt(s.maxCovers, 10) || 10,
      })),
      exceptions: exceptions.map((e) => ({
        date: e.date,
        closed: e.closed,
        startTime: e.closed ? null : e.startTime || null,
        endTime: e.closed ? null : e.endTime || null,
        maxCovers: e.closed ? null : parseInt(e.maxCovers, 10) || null,
      })),
    }

    setSaving(true)
    let res: Response
    if (selectedId === 'new') {
      res = await fetch('/api/admin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: payload.name, venueId }),
      })
      if (res.ok) {
        const created = await res.json()
        res = await fetch(`/api/admin/services/${created.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
    } else {
      res = await fetch(`/api/admin/services/${selectedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }
    setSaving(false)

    if (res.ok) {
      pushToast('SERVICE SAVED', 'success')
      closeEditor()
      load()
    } else {
      const err = await res.json().catch(() => ({}))
      pushToast((err.error ?? 'SAVE FAILED').toUpperCase(), 'error')
    }
  }

  async function remove(id: string) {
    const service = services.find((s) => s.id === id)
    if (!confirm(`DELETE THIS SERVICE?${service && service._count.orders > 0 ? ` (${service._count.orders} ORDER${service._count.orders === 1 ? '' : 'S'} LINKED)` : ''}`)) return
    const res = await fetch(`/api/admin/services/${id}`, { method: 'DELETE' })
    if (res.ok) { pushToast('SERVICE DELETED', 'success'); closeEditor(); load() }
    else pushToast('DELETE FAILED', 'error')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      </div>
    )
  }

  return (
    <>
    <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">SERVICES</h1>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-grey-light">{services.length} SERVICES</span>
            <Button size="sm" variant="ghost" onClick={newService} disabled={!venueId}>+ NEW SERVICE</Button>
          </div>
        </div>

        {services.length === 0 ? (
          <div className="border border-grey-mid p-8 text-center">
            <p className="font-mono text-xs text-grey-light uppercase">NO SERVICES YET</p>
            <p className="font-mono text-[10px] text-grey-light mt-1">
              CREATE ONE FOR EACH DATED ORDERING OPTION — E.G. FRIDAY MENU, SUNDAY ROAST
              {!venueId ? ' — PICK A VENUE IN THE SIDEBAR TO ADD SERVICES.' : ''}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {services.map((s) => (
              <button
                key={s.id}
                onClick={() => openService(s)}
                className="w-full text-left border border-grey-mid p-3 hover:bg-grey-mid/10"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-white uppercase truncate">{s.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`font-mono text-[9px] uppercase border px-1 ${
                        s.isActive ? 'text-success border-success' : 'text-grey-light border-grey-mid'
                      }`}
                    >
                      {s.isActive ? 'ACTIVE' : 'OFF'}
                    </span>
                  </div>
                </div>
                <p className="font-mono text-[10px] text-grey-light mt-1">
                  {!venueId && <span>{s.venue.name.toUpperCase()} · </span>}
                  {s.slots.length} SLOT{s.slots.length === 1 ? '' : 'S'}
                  {s.wooCategoryName ? ` · MENU: ${s.wooCategoryName.toUpperCase()}` : ''}
                  {s.tablePlanSetup ? ` · PLAN: ${s.tablePlanSetup.floorPlan.name.toUpperCase()} / ${s.tablePlanSetup.name.toUpperCase()}` : ''}
                  {s.requiresBooking ? ' · BOOKING REQUIRED' : ''}
                </p>
              </button>
            ))}
        </div>
        )}
      </div>

      <Modal isOpen={!!selectedId} onClose={closeEditor} title={selectedId === 'new' ? 'NEW SERVICE' : 'EDIT SERVICE'} size="lg">
        <div className="space-y-4">
          <Input label="NAME" value={name} onChange={(e) => setName(e.target.value)} placeholder="FRIDAY MENU" />
          <Input label="DESCRIPTION" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="OPTIONAL" />

          <Select
            label="MENU (WOO CATEGORY)"
            value={wooCategoryId}
            onChange={(e) => pickCategory(e.target.value)}
            options={wooCategories}
            placeholder={wooCategories.length === 0 ? 'NO WOO CATEGORIES — PULL PRODUCTS FIRST' : 'SELECT THE MENU FOR THIS SERVICE'}
          />
          <p className="font-mono text-[9px] text-grey-light -mt-2">
            THE CATEGORY IS THE MENU AVAILABLE FOR ORDERING ON THIS SERVICE.
          </p>

          <Select
            label="TABLE PLAN"
            value={tablePlanSetupId}
            onChange={(e) => setTablePlanSetupId(e.target.value)}
            options={setups.map((s) => ({
              value: s.id,
              label: `${s.floorPlan.name.toUpperCase()} — ${s.name.toUpperCase()}`,
            }))}
            placeholder={setups.length === 0 ? 'NO FLOOR PLANS WITH SETUPS — CREATE ONE FIRST' : '— NO TABLE PLAN —'}
          />
          <p className="font-mono text-[9px] text-grey-light -mt-2">
            THE LAYOUT WHOSE TABLES SEAT BOOKINGS AND ORDERS FOR THIS SERVICE. BOOKINGS THAT
            CANNOT BE SEATED ON THIS PLAN ARE REJECTED.
          </p>

          {/* Booking settings: the window is the full service length (walk-ins
              → last calls → clock-out); these control which start times are
              actually bookable. */}
          <div className="border-t border-grey-mid pt-3 space-y-2">
            <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">BOOKING TIMES</h3>
            <div className="flex items-end gap-2">
              <div className="w-32">
                <Input
                  label="BOOKING INTERVAL (MIN)"
                  type="number"
                  min={5}
                  max={120}
                  value={bookingIntervalMinutes}
                  onChange={(e) => setBookingIntervalMinutes(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <Input
                  label="BOOKABLE TIMES (HH:MM — EMPTY = EVERY INTERVAL)"
                  value={bookableTimeInput}
                  onChange={(e) => setBookableTimeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && HHMM.test(bookableTimeInput)) {
                      e.preventDefault()
                      if (!bookableTimes.includes(bookableTimeInput)) setBookableTimes([...bookableTimes, bookableTimeInput])
                      setBookableTimeInput('')
                    }
                  }}
                  placeholder="17:00"
                />
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={!HHMM.test(bookableTimeInput)}
                onClick={() => {
                  if (!bookableTimes.includes(bookableTimeInput)) setBookableTimes([...bookableTimes, bookableTimeInput])
                  setBookableTimeInput('')
                }}
              >
                + ADD
              </Button>
            </div>
            {bookableTimes.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {bookableTimes.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 border border-grey-mid px-2 py-0.5 font-mono text-[10px] text-white bg-grey-dark">
                    {t}
                    <button
                      onClick={() => setBookableTimes(bookableTimes.filter((x) => x !== t))}
                      className="text-grey-light hover:text-danger ml-1 leading-none"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="font-mono text-[9px] text-grey-light">
              THE SERVICE WINDOW ABOVE IS THE FULL SERVICE LENGTH (WALK-INS, LAST CALLS, CUSTOMERS GONE, CLOCK-OUT).
              BOOKINGS ARE ONLY TAKEN AT THE START TIMES HERE — EVERY 15 MIN BY DEFAULT, OR EXACTLY THE TIMES LISTED.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setRequiresBooking(!requiresBooking)}
              className={`font-mono text-xs uppercase px-3 py-1.5 border ${
                requiresBooking ? 'border-[#60A5FA] text-[#60A5FA]' : 'border-grey-mid text-grey-light'
              }`}
            >
              BOOKING REQUIRED
            </button>
            <button
              onClick={() => setIsActive(!isActive)}
              className={`font-mono text-xs uppercase px-3 py-1.5 border ${
                isActive ? 'border-success text-success' : 'border-grey-mid text-grey-light'
              }`}
            >
              {isActive ? 'ACTIVE' : 'INACTIVE'}
            </button>
          </div>
          <p className="font-mono text-[9px] text-grey-light -mt-2">
            BOOKING REQUIRED = CUSTOMERS MUST BOOK A TABLE WHEN ORDERING THIS SERVICE.
          </p>

          {/* Weekly slots */}
          <div className="border-t border-grey-mid pt-3 space-y-2">
            <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">WEEKLY TIMES ({slots.length})</h3>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Select
                  label="ADD A DAY"
                  value={newDay}
                  onChange={(e) => setNewDay(e.target.value)}
                  options={DAYS.map((d, i) => ({ value: String(i), label: d.name })).filter((d) => !slots.some((s) => s.dayOfWeek === Number(d.value)))}
                  placeholder="PICK A DAY..."
                />
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { if (newDay !== '') addDay(parseInt(newDay, 10)) }}
                disabled={newDay === ''}
              >
                + DAY
              </Button>
            </div>
            {slots.length === 0 ? (
              <div className="border border-dashed border-grey-mid p-4 text-center">
                <p className="font-mono text-xs text-grey-light uppercase">NO DAYS SET YET</p>
                <p className="font-mono text-[10px] text-grey-light mt-1">ADD THE DAYS THIS SERVICE RUNS — THEN SET THE TIME SLOTS PER DAY.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                {DAYS.map((day, di) => {
                  const daySlots = slots.map((s, i) => ({ s, i })).filter((x) => x.s.dayOfWeek === di)
                  if (daySlots.length === 0) return null
                  return (
                    <div key={day.code} className="border border-grey-mid">
                      <div className="px-2 py-1 bg-grey-mid/20 flex items-center justify-between border-b border-grey-mid">
                        <div>
                          <span className="font-mono text-xs font-bold text-white tracking-wider">{day.code}</span>
                          <span className="font-mono text-[9px] text-grey-light tracking-wider ml-1">{day.name}</span>
                        </div>
                        <button
                          onClick={() => removeDay(di)}
                          title={`REMOVE ${day.name}`}
                          className="font-mono text-[10px] text-grey-light hover:text-danger"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="p-2 space-y-2">
                        {daySlots.map(({ s, i }) => (
                          <div key={i} className="space-y-1">
                            <div className="grid grid-cols-2 gap-1">
                              <div className="space-y-0.5">
                                <div className="text-center font-mono text-[8px] uppercase text-grey-light">START</div>
                                <input
                                  type="time"
                                  value={s.startTime}
                                  onChange={(e) => updateSlot(i, { startTime: e.target.value })}
                                  className={timeInputClass}
                                />
                              </div>
                              <div className="space-y-0.5">
                                <div className="text-center font-mono text-[8px] uppercase text-grey-light">END</div>
                                <input
                                  type="time"
                                  value={s.endTime}
                                  onChange={(e) => updateSlot(i, { endTime: e.target.value })}
                                  className={timeInputClass}
                                />
                              </div>
                            </div>
                            <div className="flex items-end gap-1">
                              <div className="flex-1 space-y-0.5">
                                <div className="text-center font-mono text-[8px] uppercase text-grey-light">MAX COVERS</div>
                                <input
                                  type="number"
                                  min={1}
                                  value={s.maxCovers}
                                  onChange={(e) => updateSlot(i, { maxCovers: e.target.value })}
                                  className={timeInputClass}
                                />
                              </div>
                              <button
                                onClick={() => setSlots(slots.filter((_, x) => x !== i))}
                                className="font-mono text-[10px] text-danger border border-danger px-1 py-1 hover:bg-danger hover:text-black"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                        <button
                          onClick={() => addSlot(di)}
                          className="w-full text-center font-mono text-[9px] uppercase text-grey-light border border-dashed border-grey-mid py-1 hover:text-white hover:border-white"
                        >
                          + TIME
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <p className="font-mono text-[9px] text-grey-light">
              START/END DEFINE A TIME SLOT. MAX COVERS CAPS HOW MANY PEOPLE A SLOT ACCEPTS.
            </p>
          </div>

          {/* Exceptions */}
          <div className="border-t border-grey-mid pt-3 space-y-2">
            <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">DATE EXCEPTIONS ({exceptions.length})</h3>
            {exceptions.length > 0 && (
              <div className="space-y-1.5">
                <div className="grid grid-cols-12 gap-2 font-mono text-[9px] uppercase text-grey-light">
                  <div className="col-span-4">DATE</div>
                  <div className="col-span-2">CLOSED</div>
                  <div className="col-span-2">START</div>
                  <div className="col-span-2">END</div>
                  <div className="col-span-1">MAX</div>
                  <div className="col-span-1"></div>
                </div>
                {exceptions.map((e, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="date"
                      value={e.date}
                      onChange={(ev) => updateException(i, { date: ev.target.value })}
                      className="col-span-4 bg-black border border-grey-mid text-white font-mono text-[10px] px-1 py-1 outline-none focus:border-white"
                    />
                    <input
                      type="checkbox"
                      checked={e.closed}
                      onChange={(ev) => updateException(i, { closed: ev.target.checked })}
                      className="col-span-2 accent-[#4ADE80]"
                    />
                    <input
                      type="time"
                      value={e.startTime}
                      disabled={e.closed}
                      onChange={(ev) => updateException(i, { startTime: ev.target.value })}
                      className="col-span-2 bg-black border border-grey-mid text-white font-mono text-[10px] px-1 py-1 outline-none focus:border-white disabled:opacity-30"
                    />
                    <input
                      type="time"
                      value={e.endTime}
                      disabled={e.closed}
                      onChange={(ev) => updateException(i, { endTime: ev.target.value })}
                      className="col-span-2 bg-black border border-grey-mid text-white font-mono text-[10px] px-1 py-1 outline-none focus:border-white disabled:opacity-30"
                    />
                    <input
                      type="number"
                      min={1}
                      value={e.maxCovers}
                      disabled={e.closed}
                      onChange={(ev) => updateException(i, { maxCovers: ev.target.value })}
                      className="col-span-1 bg-black border border-grey-mid text-white font-mono text-[10px] px-1 py-1 outline-none focus:border-white text-right disabled:opacity-30"
                    />
                    <button
                      onClick={() => setExceptions(exceptions.filter((_, x) => x !== i))}
                      className="col-span-1 font-mono text-[10px] text-danger border border-danger px-1 hover:bg-danger hover:text-black"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Button size="sm" variant="ghost" onClick={addException}>+ DATE EXCEPTION</Button>
            <p className="font-mono text-[9px] text-grey-light">
              CLOSED = NO ORDERS THAT DATE. OPEN WITH TIMES = OVERRIDES THE WEEKLY RULE.
            </p>
          </div>

          <div className="border-t border-grey-mid pt-3 flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={save} loading={saving}>SAVE SERVICE</Button>
            {selectedId && selectedId !== 'new' && (
              <Button size="sm" variant="danger" onClick={() => remove(selectedId)}>DELETE</Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}