'use client'

// Space availability — one day across every room shared into this venue:
// events + bookings together, plus an UNASSIGNED bucket. Group bookings and
// section holds are bookings, so CREATE BOOKING here makes an ordinary booking
// against the room (#189). It is not a hard gate: an event can still be planned
// without one.

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { formatDateDMY } from '@/lib/date-nav'

interface SpaceItem {
  kind: 'EVENT' | 'BOOKING'
  id: string
  title: string
  start: string
  end: string | null
  pax: number | null
  status: string | null
  source: string | null
}

interface SpaceRoom {
  areaId: string
  name: string
  colour: string | null
  ownerVenueId: string | null
  items: SpaceItem[]
}

interface SpaceView {
  date: string
  rooms: SpaceRoom[]
  unassigned: SpaceItem[]
}

function shiftDay(key: string, delta: number): string {
  const d = new Date(`${key}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

const EMPTY_HOLD = { areaId: '', name: '', partySize: '2', start: '18:00', end: '20:00' }

export function SpaceAvailabilityModal({
  venueId,
  initialDate,
  onClose,
}: {
  venueId: string
  initialDate: string
  onClose: () => void
}) {
  const [date, setDate] = useState(initialDate)
  const [view, setView] = useState<SpaceView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hold, setHold] = useState<typeof EMPTY_HOLD | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!venueId || !date) return
    setLoading(true)
    const r = await fetch(`/api/admin/space-availability?venueId=${venueId}&date=${date}`)
    if (r.ok) setView(await r.json())
    else { setView(null); setError('COULD NOT LOAD SPACE') }
    setLoading(false)
  }, [venueId, date])

  useEffect(() => { void load() }, [load])

  function startHold(room: SpaceRoom) {
    setError('')
    setHold({ ...EMPTY_HOLD, areaId: room.areaId })
  }

  async function createHold() {
    if (!hold || saving) return
    if (!hold.name.trim()) { setError('CONTACT NAME IS REQUIRED'); return }
    setSaving(true)
    setError('')
    const r = await fetch('/api/admin/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venueId,
        hold: true,
        date,
        areaId: hold.areaId,
        startTime: hold.start,
        endTime: hold.end,
        partySize: hold.partySize,
        contactName: hold.name,
        source: 'PHONE',
        notes: 'SPACE HOLD',
      }),
    })
    const d = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { setError((d.error ?? 'COULD NOT CREATE THE BOOKING').toUpperCase()); return }
    setHold(null)
    void load()
  }

  const row = (item: SpaceItem) => (
    <div key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-2 border-t border-grey-mid px-2 py-1">
      <div className="min-w-0">
        <span className="font-mono text-xs text-white truncate">{item.title}</span>
        <span className="font-mono text-2xs uppercase text-grey-light ml-2">
          {item.start}{item.end ? `–${item.end}` : ''}{item.pax != null ? ` · ${item.pax} PAX` : ''}
        </span>
      </div>
      <span className={`font-mono text-2xs uppercase border px-1 shrink-0 ${item.kind === 'EVENT' ? 'border-accent text-accent' : 'border-grey-mid text-grey-light'}`}>
        {item.kind}{item.status ? ` · ${item.status}` : ''}
      </span>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-grey-dark border border-grey-mid p-5 w-full max-w-2xl space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-mono text-xs uppercase tracking-widest text-white">SPACE AVAILABILITY</h2>
            <p className="font-mono text-2xs uppercase text-grey-light mt-1">{formatDateDMY(date)} · EVENTS AND BOOKINGS TOGETHER PER ROOM</p>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setDate(shiftDay(date, -1))}>←</Button>
            <input
              aria-label="Space date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white"
            />
            <Button size="sm" variant="ghost" onClick={() => setDate(shiftDay(date, 1))}>→</Button>
          </div>
        </div>

        {error && <p className="font-mono text-xs text-danger">{error}</p>}
        {loading && <p className="font-mono text-xs uppercase text-grey-light loading-cursor">LOADING</p>}

        {!loading && view && (
          <div className="space-y-2">
            {view.rooms.map((room) => {
              const shared = !!room.ownerVenueId && room.ownerVenueId !== venueId
              return (
                <div key={room.areaId} className="border border-grey-mid" data-testid={`space-room-${room.areaId}`}>
                  <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-grey-dark/30">
                    <div className="font-mono text-xs uppercase text-white">
                      {room.name}
                      {shared && <span className="font-mono text-2xs uppercase text-accent ml-2">SHARED</span>}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => startHold(room)}>+ CREATE BOOKING</Button>
                  </div>
                  {room.items.length === 0 ? (
                    <p className="font-mono text-2xs uppercase text-grey-light px-2 py-1.5">NOTHING BOOKED</p>
                  ) : room.items.map(row)}
                </div>
              )
            })}

            {view.unassigned.length > 0 && (
              <div className="border border-grey-mid" data-testid="space-unassigned">
                <div className="px-2 py-1.5 bg-grey-dark/30 font-mono text-xs uppercase text-grey-light">UNASSIGNED</div>
                {view.unassigned.map(row)}
              </div>
            )}
          </div>
        )}

        {hold && (
          <div className="border border-accent p-3 space-y-2">
            <h3 className="font-mono text-xs uppercase text-accent tracking-wider">NEW BOOKING</h3>
            <div className="grid grid-cols-2 gap-2">
              <Input aria-label="Contact name" label="Contact name" value={hold.name} onChange={(e) => setHold({ ...hold, name: e.target.value.toUpperCase() })} />
              <Input aria-label="Party size" label="Party size" type="number" min="1" value={hold.partySize} onChange={(e) => setHold({ ...hold, partySize: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input aria-label="Start" label="Start" type="time" value={hold.start} onChange={(e) => setHold({ ...hold, start: e.target.value })} />
              <Input aria-label="End" label="End" type="time" value={hold.end} onChange={(e) => setHold({ ...hold, end: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void createHold()} loading={saving}>SAVE BOOKING</Button>
              <Button size="sm" variant="ghost" onClick={() => setHold(null)} disabled={saving}>CANCEL</Button>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button size="sm" variant="ghost" onClick={onClose}>CLOSE</Button>
        </div>
      </div>
    </div>
  )
}
