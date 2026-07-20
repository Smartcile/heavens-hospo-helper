'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'

interface BookingTable { id: string; setupItem: { id: string; assignedNumber: string | null; label: string | null } }
interface Booking {
  id: string; date: string; startTime: string; endTime: string; partySize: number
  contactName: string; contactPhone: string | null; contactEmail: string | null
  source: string; status: string; notes: string | null
  tables: BookingTable[]
}
interface SetupLite { id: string; name: string; floorPlan: { id: string; slug: string } }
interface VenueLite { id: string; name: string }

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

  const loadBookings = useCallback(async (d: string, vid: string) => {
    if (!vid) return
    setLoading(true)
    const r = await fetch(`/api/admin/bookings?date=${d}&venueId=${vid}`)
    if (r.ok) setBookings(await r.json())
    setLoading(false)
  }, [])

  const loadSetups = useCallback(async (vid: string) => {
    if (!vid) return
    const r = await fetch(`/api/admin/floorplan/setups?venueId=${vid}`)
    if (!r.ok) return
    const data = await r.json()
    setSetups(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => {
    fetch('/api/admin/venues').then((r) => r.json()).then((data: VenueLite[]) => {
      const vs = Array.isArray(data) ? data : []
      setVenues(vs)
      if (vs.length > 0) {
        setVenueId(vs[0].id)
        loadBookings(date, vs[0].id)
        loadSetups(vs[0].id)
      }
    })
  }, [])

  useEffect(() => {
    if (venueId) { loadBookings(date, venueId); loadSetups(venueId) }
  }, [date, venueId, loadBookings, loadSetups])

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
    setFormSource('PHONE'); setFormSetupId(''); setFormNotes(''); setAvailMsg('')
    setShowModal(true)
  }

  function openEdit(b: Booking) {
    setEditing(b)
    setFormName(b.contactName); setFormPhone(b.contactPhone ?? ''); setFormEmail(b.contactEmail ?? '')
    setFormPartySize(String(b.partySize)); setFormStartTime(b.startTime); setFormEndTime(b.endTime)
    setFormSource(b.source); setFormNotes(b.notes ?? '')
    setAvailMsg('')
    setShowModal(true)
  }

  async function handleSave() {
    if (!formName) { setError('NAME REQUIRED'); return }
    setSaving(true); setError('')
    if (editing) {
      const r = await fetch(`/api/admin/bookings/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactName: formName, contactPhone: formPhone || null, contactEmail: formEmail || null, partySize: formPartySize, startTime: formStartTime, endTime: formEndTime, source: formSource, notes: formNotes || null }),
      })
      if (!r.ok) { setError('SAVE FAILED'); setSaving(false); return }
    } else {
      const r = await fetch('/api/admin/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, startTime: formStartTime, endTime: formEndTime, partySize: parseInt(formPartySize), contactName: formName, contactPhone: formPhone || null, contactEmail: formEmail || null, source: formSource, notes: formNotes || null, venueId, setupId: formSetupId || null, floorPlanSlug: formSetupId ? setups.find((s) => s.id === formSetupId)?.floorPlan?.slug ?? null : null }),
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
    <div className="space-y-4 pb-12">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">BOOKINGS</h1>
        <Button size="sm" onClick={openCreate}>+ NEW BOOKING</Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center border border-grey-mid">
          <button onClick={prevDay} className="px-2 py-1.5 font-mono text-xs text-grey-light hover:text-white border-r border-grey-mid">◂</button>
          <span className="px-3 py-1.5 font-mono text-xs text-white font-bold">{formatDate(date)}</span>
          <button onClick={() => { const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + 1); setDate(d.toISOString().slice(0, 10)) }} className="px-2 py-1.5 font-mono text-xs text-grey-light hover:text-white">{`${new Date(date + 'T00:00:00').toLocaleDateString('en-NZ', { weekday: 'short' }).toUpperCase()} ${new Date(date + 'T00:00:00').getDate() + 1}`}</button>
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
                      // Only render the booking card on its first slot
                      const bStart = (parseInt(b.startTime.slice(0, 2)) * 60) + parseInt(b.startTime.slice(3))
                      const slotMin = (parseInt(slot.slice(0, 2)) * 60) + parseInt(slot.slice(3))
                      if (slotMin !== bStart && slotMin % 30 === 0 && slotMin !== bStart + 30) return null
                      // Show at start slot, and also every hour mark for long bookings
                      if (slotMin !== bStart && slotMin % 60 !== 0) return null

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
      )}

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
            <Select label="STATUS" value={editing.status} onChange={(v) => updateStatus(editing.id, v)} options={STATUS_OPTIONS} />
          )}
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
              <Button onClick={handleSave} loading={saving} disabled={!formName}>CREATE BOOKING</Button>
              <Button variant="ghost" onClick={() => setShowModal(false)}>CANCEL</Button>
            </div>
          )}
          {error && <p className="font-mono text-xs text-danger">{error}</p>}
        </div>
      </Modal>
    </div>
  )
}
