'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { formatDateLong } from '@/lib/date-nav'
import { describeRosterSlot, SLOT_HEADCOUNT_MAX } from '@/lib/roster-slot'

interface PositionOption {
  id: string
  name: string
  colour: string | null
}

interface StaffOption {
  id: string
  firstName: string
  lastName: string
}

interface SlotRow {
  id: string
  name: string
  positionId: string | null
  positionName: string | null
  startTime: string
  endTime: string
  breakMinutes: number
  headcount: number
  colour: string | null
  tag: string | null
  isActive: boolean
  sortOrder: number
}

interface SlotForm {
  name: string
  positionId: string
  startTime: string
  endTime: string
  breakMinutes: string
  headcount: string
  colour: string
  tag: string
  isActive: boolean
  sortOrder: string
}

const EMPTY_FORM: SlotForm = {
  name: '',
  positionId: '',
  startTime: '07:00',
  endTime: '16:00',
  breakMinutes: '0',
  headcount: '1',
  colour: '',
  tag: '',
  isActive: true,
  sortOrder: '0',
}

export function RosterSlotsModal({
  venueId,
  positions,
  staff,
  defaultDate,
  onClose,
  onPlaced,
}: {
  venueId: string
  positions: PositionOption[]
  staff: StaffOption[]
  defaultDate: string
  onClose: () => void
  onPlaced: () => void
}) {
  const [slots, setSlots] = useState<SlotRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<SlotRow | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<SlotForm>(EMPTY_FORM)

  const [placing, setPlacing] = useState<SlotRow | null>(null)
  const [placeDate, setPlaceDate] = useState(defaultDate)
  const [placeStaff, setPlaceStaff] = useState<string[]>([])

  const loadSlots = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/admin/roster/slots?venueId=${venueId}`)
    const d = await r.json().catch(() => ({}))
    setLoading(false)
    if (!r.ok) { setError((d.error ?? 'LOAD FAILED').toUpperCase()); return }
    setSlots(Array.isArray(d.slots) ? d.slots : [])
  }, [venueId])

  useEffect(() => { loadSlots() }, [loadSlots])

  function startCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
    setError('')
    setNotice('')
  }

  function startEdit(slot: SlotRow) {
    setEditing(slot)
    setForm({
      name: slot.name,
      positionId: slot.positionId ?? '',
      startTime: slot.startTime,
      endTime: slot.endTime,
      breakMinutes: String(slot.breakMinutes),
      headcount: String(slot.headcount),
      colour: slot.colour ?? '',
      tag: slot.tag ?? '',
      isActive: slot.isActive,
      sortOrder: String(slot.sortOrder),
    })
    setShowForm(true)
    setError('')
    setNotice('')
  }

  async function saveSlot() {
    setBusy(true); setError(''); setNotice('')
    const payload = {
      venueId,
      name: form.name,
      positionId: form.positionId || null,
      startTime: form.startTime,
      endTime: form.endTime,
      breakMinutes: Number(form.breakMinutes) || 0,
      headcount: Number(form.headcount) || 1,
      colour: form.colour || null,
      tag: form.tag || null,
      isActive: form.isActive,
      sortOrder: Number(form.sortOrder) || 0,
    }
    const r = await fetch(
      editing ? `/api/admin/roster/slots/${editing.id}` : '/api/admin/roster/slots',
      { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    )
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setError((d.error ?? 'SAVE FAILED').toUpperCase()); return }
    setShowForm(false)
    setEditing(null)
    setNotice(editing ? 'SLOT UPDATED' : 'SLOT CREATED')
    loadSlots()
  }

  async function deleteSlot(slot: SlotRow) {
    if (!confirm(`DELETE SLOT "${slot.name}"?`)) return
    setBusy(true); setError(''); setNotice('')
    const r = await fetch(`/api/admin/roster/slots/${slot.id}`, { method: 'DELETE' })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setError((d.error ?? 'DELETE FAILED').toUpperCase()); return }
    setNotice(`DELETED ${slot.name}`)
    loadSlots()
  }

  function openPlace(slot: SlotRow) {
    setPlacing(slot)
    setPlaceDate(defaultDate)
    setPlaceStaff([])
    setError('')
    setNotice('')
  }

  function togglePlaceStaff(id: string) {
    if (!placing) return
    setPlaceStaff((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= placing.headcount) return prev
      return [...prev, id]
    })
  }

  async function placeSlot() {
    if (!placing) return
    if (placeStaff.length === 0) { setError('SELECT AT LEAST ONE STAFF MEMBER'); return }
    setBusy(true); setError(''); setNotice('')
    const r = await fetch(`/api/admin/roster/slots/${placing.id}/place`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: placeDate, staffIds: placeStaff }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setError((d.error ?? 'PLACE FAILED').toUpperCase()); return }
    const skipped = d.skippedSeats ?? 0
    setNotice(
      `PLACED ${placing.name} — ${d.created ?? 0} SHIFT${d.created === 1 ? '' : 'S'} CREATED${skipped ? ` · ${skipped} SEAT${skipped === 1 ? '' : 'S'} UNFILLED` : ''}`,
    )
    setPlacing(null)
    onPlaced()
  }

  return (
    <Modal isOpen onClose={onClose} title={placing ? `PLACE — ${placing.name}` : 'WORKING SLOTS'} size="lg">
      {placing ? (
        <div className="space-y-4">
          <div className="border border-grey-mid p-3 space-y-1">
            <div className="font-mono text-xs uppercase text-white">{describeRosterSlot(placing)}</div>
            <div className="font-mono text-2xs uppercase text-grey-light">
              {placing.breakMinutes ? `${placing.breakMinutes}M BREAK · ` : ''}SELECT UP TO {placing.headcount} STAFF
            </div>
          </div>
          <Input label="Day" type="date" value={placeDate} onChange={(e) => setPlaceDate(e.target.value)} />
          <div>
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Staff</label>
              <span className="font-mono text-2xs uppercase text-grey-light">{placeStaff.length} / {placing.headcount} SELECTED</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {staff.map((s) => {
                const selected = placeStaff.includes(s.id)
                const full = !selected && placeStaff.length >= placing.headcount
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => togglePlaceStaff(s.id)}
                    disabled={full}
                    className={`font-mono text-xs px-2 py-1.5 border transition-colors disabled:opacity-40 ${selected ? 'bg-white text-black border-white' : 'bg-transparent text-grey-light border-grey-mid hover:border-white hover:text-white'}`}
                  >
                    {s.firstName} {s.lastName}
                  </button>
                )
              })}
            </div>
            {placing.headcount - placeStaff.length > 0 && (
              <p className="font-mono text-2xs uppercase text-warning mt-1">
                {placing.headcount - placeStaff.length} SEAT{placing.headcount - placeStaff.length === 1 ? '' : 'S'} WILL BE LEFT UNFILLED.
              </p>
            )}
          </div>
          <p className="font-mono text-2xs uppercase text-grey-light">PLACING ON {formatDateLong(placeDate)} — DRAFT SHIFTS.</p>
          {error && <p className="font-mono text-xs text-danger">{error}</p>}
          {notice && <p className="font-mono text-xs text-success">{notice}</p>}
          <div className="flex gap-2 border-t border-grey-mid pt-3">
            <Button size="sm" onClick={placeSlot} loading={busy}>PLACE SLOT</Button>
            <Button size="sm" variant="ghost" onClick={() => setPlacing(null)} disabled={busy}>BACK</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {error && <p className="font-mono text-xs text-danger">{error}</p>}
          {notice && <p className="font-mono text-xs text-success">{notice}</p>}

          {showForm ? (
            <div className="border border-grey-mid p-3 space-y-3">
              <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">{editing ? 'EDIT SLOT' : 'NEW SLOT'}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="DUTY MANAGER" />
                <Select label="Role" value={form.positionId} onChange={(e) => setForm({ ...form, positionId: e.target.value })} options={[{ value: '', label: 'NO ROLE' }, ...positions.map((p) => ({ value: p.id, label: p.name }))]} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Input label="Start" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                <Input label="End" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                <Input label="Break (min)" type="number" min="0" value={form.breakMinutes} onChange={(e) => setForm({ ...form, breakMinutes: e.target.value })} />
                <Input label={`Headcount (1–${SLOT_HEADCOUNT_MAX})`} type="number" min="1" max={String(SLOT_HEADCOUNT_MAX)} value={form.headcount} onChange={(e) => setForm({ ...form, headcount: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="font-mono text-xs uppercase text-grey-light block mb-1">Colour</label>
                  <input type="color" value={form.colour || '#0E7490'} onChange={(e) => setForm({ ...form, colour: e.target.value })} className="w-full h-9 bg-black border border-grey-mid" />
                </div>
                <Input label="Tag (optional)" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="EVENT / ALT LEAVE" />
                <Input label="Sort Order" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 font-mono text-xs uppercase text-grey-light cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="accent-white" />
                ACTIVE (AVAILABLE TO PLACE)
              </label>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveSlot} loading={busy}>SAVE SLOT</Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setEditing(null) }} disabled={busy}>CANCEL</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" onClick={startCreate}>+ NEW SLOT</Button>
          )}

          <div className="space-y-2">
            <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">SAVED SLOTS</h3>
            {loading ? (
              <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
            ) : slots.length === 0 ? (
              <p className="font-mono text-xs text-grey-light">NO SLOTS YET. CREATE ONE ABOVE.</p>
            ) : (
              slots.map((slot) => (
                <div key={slot.id} className="border border-grey-mid p-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs uppercase text-white flex items-center gap-2">
                      {slot.colour && <span className="w-2 h-2 shrink-0" style={{ backgroundColor: slot.colour }} />}
                      {slot.name}
                      {!slot.isActive && <span className="font-mono text-2xs uppercase border border-grey-mid px-1 text-grey-light">INACTIVE</span>}
                    </div>
                    <div className="font-mono text-2xs uppercase text-grey-light">{describeRosterSlot(slot)}</div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openPlace(slot)} disabled={busy || !slot.isActive}>PLACE</Button>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(slot)} disabled={busy}>EDIT</Button>
                    <Button size="sm" variant="danger" onClick={() => deleteSlot(slot)} disabled={busy}>DELETE</Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex justify-end border-t border-grey-mid pt-3">
            <Button size="sm" variant="ghost" onClick={onClose}>CLOSE</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
