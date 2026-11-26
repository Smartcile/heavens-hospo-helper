'use client'

// Rooms (Areas) + their calendar feeds — Settings → ROOMS.
//
// A room is a physical event space. Rooms are a compact table with a modal
// editor (not one permanently expanded form per row); each room shows how many
// calendars it owns. Calendar feeds are listed below and must always be
// attached to a room or deliberately left UNASSIGNED — a feed never creates a
// room on its own.

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useBeforeUnload, useDirty } from '@/lib/use-dirty'
import { roomNameFromFeed } from '@/lib/room-names'

interface RoomArea {
  id: string
  name: string
  colour: string | null
  capacity: number | null
  floorPlanId: string | null
  notes: string | null
  sortOrder: number
  isActive: boolean
  feedCount: number
  eventCount?: number
}

interface RoomFeed {
  id: string
  areaId: string | null
  name: string
  url: string
  source: 'GOOGLE' | 'ICAL'
  colour: string | null
  floorPlanId: string | null
  sortOrder: number
  isActive: boolean
  lastSyncedAt: string | null
}

interface PlanOption { id: string; name: string }
interface JunkRoom { id: string; name: string; feedCount: number; eventCount: number }

// The add-calendar room picker must be an explicit choice — not a silent
// default — so a feed can never quietly land somewhere unexpected.
const PICK_ROOM = '__pick__'
const UNASSIGNED = '__unassigned__'

export function RoomsPanel({ venueId }: { venueId: string }) {
  const [areas, setAreas] = useState<RoomArea[]>([])
  const [feeds, setFeeds] = useState<RoomFeed[]>([])
  const [floorPlans, setFloorPlans] = useState<PlanOption[]>([])
  const [junk, setJunk] = useState<JunkRoom[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const [editing, setEditing] = useState<RoomArea | 'new' | null>(null)

  const [newFeedName, setNewFeedName] = useState('')
  const [newFeedUrl, setNewFeedUrl] = useState('')
  const [newFeedRoom, setNewFeedRoom] = useState(PICK_ROOM)
  const [junkTargets, setJunkTargets] = useState<Record<string, string>>({})

  async function load() {
    if (!venueId) return
    const [feedsRes, junkRes] = await Promise.all([
      fetch(`/api/admin/calendar-feeds?venueId=${venueId}`),
      fetch(`/api/admin/areas/cleanup?venueId=${venueId}`),
    ])
    if (feedsRes.ok) {
      const d = await feedsRes.json()
      setAreas(d.areas ?? [])
      setFeeds(d.feeds ?? [])
      setFloorPlans(d.floorPlans ?? [])
    } else {
      setAreas([]); setFeeds([]); setFloorPlans([])
    }
    if (junkRes.ok) {
      const d = await junkRes.json()
      setJunk(d.rooms ?? [])
    } else {
      setJunk([])
    }
  }

  useEffect(() => { void load() }, [venueId])

  function patchFeed(id: string, patch: Partial<RoomFeed>) {
    setFeeds((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  async function saveFeed(feed: RoomFeed) {
    setBusy(true); setMessage('')
    const r = await fetch(`/api/admin/calendar-feeds/${feed.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: feed.name,
        url: feed.url,
        areaId: feed.areaId,
        colour: feed.colour,
        floorPlanId: feed.floorPlanId,
        isActive: feed.isActive,
      }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setMessage((d.error ?? 'SAVE FAILED').toUpperCase()); return }
    setMessage('SAVED')
    void load()
  }

  async function removeFeed(id: string) {
    if (!confirm('REMOVE THIS CALENDAR? ITS IMPORTED EVENTS DISAPPEAR FROM THE EVENT ROSTER.')) return
    setBusy(true); setMessage('')
    const r = await fetch(`/api/admin/calendar-feeds/${id}`, { method: 'DELETE' })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setMessage((d.error ?? 'REMOVE FAILED').toUpperCase()); return }
    void load()
  }

  function onFeedUrl(value: string) {
    setNewFeedUrl(value)
    if (!newFeedName.trim()) setNewFeedName(roomNameFromFeed('', value))
  }

  async function addFeed() {
    if (!venueId) return
    if (!newFeedUrl.trim()) { setMessage('A CALENDAR LINK IS REQUIRED'); return }
    if (!newFeedName.trim()) { setMessage('A CALENDAR NAME IS REQUIRED'); return }
    if (newFeedRoom === PICK_ROOM) { setMessage('CHOOSE A ROOM OR UNASSIGNED'); return }
    setBusy(true); setMessage('')
    const r = await fetch('/api/admin/calendar-feeds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venueId,
        name: newFeedName,
        url: newFeedUrl,
        areaId: newFeedRoom === UNASSIGNED ? null : newFeedRoom,
      }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMessage((d.error ?? 'ADD FAILED').toUpperCase()); return }
    setNewFeedName(''); setNewFeedUrl(''); setNewFeedRoom(PICK_ROOM)
    setMessage('CALENDAR ADDED — SYNC CALENDARS ON THE ROSTER PAGE TO IMPORT IT')
    void load()
  }

  async function removeRoom(room: RoomArea) {
    const feedText = `${room.feedCount} CALENDAR${room.feedCount === 1 ? '' : 'S'} BECOME UNASSIGNED AND KEEP SYNCING`
    const eventText = `${room.eventCount ?? 0} EVENT${room.eventCount === 1 ? '' : 'S'} STAY BUT FALL BACK TO "OTHER"`
    if (!confirm(`REMOVE ${room.name}? ${feedText}; ${eventText}.`)) return
    setBusy(true); setMessage('')
    const r = await fetch(`/api/admin/areas/${room.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setMessage((d.error ?? 'REMOVE FAILED').toUpperCase()); return }
    setMessage('ROOM REMOVED')
    void load()
  }

  async function cleanUp(junkRoom: JunkRoom, action: 'REHOME' | 'REMOVE') {
    const targetAreaId = junkTargets[junkRoom.id] || null
    if (action === 'REHOME' && !targetAreaId) { setMessage('CHOOSE A ROOM TO MOVE TO'); return }
    if (action === 'REMOVE' && !confirm(`REMOVE ${junkRoom.name}? ITS ${junkRoom.feedCount} CALENDAR(S) BECOME UNASSIGNED.`)) return
    setBusy(true); setMessage('')
    const r = await fetch('/api/admin/areas/cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, areaId: junkRoom.id, action, targetAreaId }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMessage((d.error ?? 'CLEANUP FAILED').toUpperCase()); return }
    setMessage(action === 'REHOME' ? 'ROOM RE-HOMED' : 'ROOM REMOVED')
    void load()
  }

  const planName = (id: string | null) => floorPlans.find((p) => p.id === id)?.name ?? '—'
  const roomOptions = [{ value: '', label: 'UNASSIGNED' }, ...areas.map((a) => ({ value: a.id, label: a.name }))]
  const feedRoomOptions = [
    { value: PICK_ROOM, label: 'CHOOSE A ROOM OR UNASSIGNED' },
    { value: UNASSIGNED, label: 'UNASSIGNED' },
    ...areas.map((a) => ({ value: a.id, label: a.name })),
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">ROOMS</h1>
        <p className="font-mono text-xs uppercase text-grey-light mt-1">
          A ROOM IS A PHYSICAL EVENT SPACE. LINK IT TO A TABLE PLAN AND ATTACH THE CALENDARS THAT IMPORT ITS EVENTS.
          CALENDARS NEVER CREATE ROOMS.
        </p>
      </div>

      {message && <p className="font-mono text-xs uppercase text-accent">{message}</p>}

      {junk.length > 0 && (
        <div className="border border-danger p-3 space-y-2">
          <h2 className="font-mono text-xs uppercase tracking-wider text-danger">
            LIKELY JUNK ROOMS ({junk.length})
          </h2>
          <p className="font-mono text-2xs uppercase text-grey-light">
            THESE NAMES LOOK LIKE CALENDAR IDENTIFIERS, NOT ROOMS. MOVE THEIR CALENDARS INTO A REAL ROOM OR REMOVE THEM.
          </p>
          {junk.map((j) => (
            <div key={j.id} className="flex flex-wrap items-end gap-2 border-t border-grey-mid pt-2">
              <div className="flex-1 min-w-[180px]">
                <div className="font-mono text-xs text-white break-all">{j.name}</div>
                <div className="font-mono text-2xs uppercase text-grey-light">
                  {j.feedCount} CALENDAR{j.feedCount === 1 ? '' : 'S'} · {j.eventCount} EVENT{j.eventCount === 1 ? '' : 'S'}
                </div>
              </div>
              <div className="w-48">
                <Select
                  aria-label="Junk room target"
                  label="Move to room"
                  value={junkTargets[j.id] ?? ''}
                  onChange={(e) => setJunkTargets((prev) => ({ ...prev, [j.id]: e.target.value }))}
                  options={[{ value: '', label: 'CHOOSE A ROOM' }, ...areas.filter((a) => a.id !== j.id).map((a) => ({ value: a.id, label: a.name }))]}
                />
              </div>
              <Button size="sm" variant="ghost" onClick={() => void cleanUp(j, 'REHOME')} disabled={busy}>RE-HOME</Button>
              <Button size="sm" variant="danger" onClick={() => void cleanUp(j, 'REMOVE')} disabled={busy}>REMOVE</Button>
            </div>
          ))}
        </div>
      )}

      <div className="border border-grey-mid p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-mono text-xs uppercase tracking-wider text-grey-light">ROOMS ({areas.length})</h2>
          <Button size="sm" onClick={() => setEditing('new')} data-testid="add-room">+ ADD ROOM</Button>
        </div>
        {areas.length === 0 && (
          <p className="font-mono text-2xs uppercase text-grey-light">NO ROOMS YET — ADD THE FIRST ONE.</p>
        )}
        {areas.length > 0 && (
          <table className="w-full border border-grey-mid">
            <thead>
              <tr className="border-b border-grey-mid">
                {['ROOM', 'PAX MAX', 'TABLE PLAN', 'CALENDARS', ''].map((h) => (
                  <th key={h} className="px-3 py-2 font-mono text-2xs uppercase text-grey-light text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-grey-mid font-mono text-xs text-white">
              {areas.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2">{a.name}</td>
                  <td className="px-3 py-2">{a.capacity ?? '—'}</td>
                  <td className="px-3 py-2">{planName(a.floorPlanId)}</td>
                  <td className="px-3 py-2">{a.feedCount}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>EDIT</Button>
                      <Button size="sm" variant="danger" onClick={() => void removeRoom(a)} disabled={busy}>✕</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="border border-grey-mid p-3 space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-wider text-grey-light">CALENDARS ({feeds.length})</h2>
        <p className="font-mono text-2xs uppercase text-grey-light">
          EVERY CALENDAR BELONGS TO A ROOM OR IS DELIBERATELY UNASSIGNED. IMPORTED EVENTS GROUP BY ROOM ON THE ROSTER.
        </p>
        {feeds.length === 0 && (
          <p className="font-mono text-2xs uppercase text-grey-light">NO CALENDARS YET — ADD THE FIRST ONE BELOW.</p>
        )}
        {feeds.map((f) => (
          <div key={f.id} className="border border-grey-mid p-2 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input label="Calendar name" value={f.name} onChange={(e) => patchFeed(f.id, { name: e.target.value })} />
              <Input label="Calendar link" value={f.url} onChange={(e) => patchFeed(f.id, { url: e.target.value })} />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-48">
                <Select label="Room" value={f.areaId ?? ''} onChange={(e) => patchFeed(f.id, { areaId: e.target.value || null })} options={roomOptions} />
              </div>
              <label className="flex items-center gap-2 pb-2 font-mono text-2xs uppercase text-grey-light">
                <input type="checkbox" checked={f.isActive} onChange={(e) => patchFeed(f.id, { isActive: e.target.checked })} className="accent-white" />
                ACTIVE
              </label>
              <span className="font-mono text-2xs uppercase text-grey-light pb-2">{f.source}</span>
              <div className="flex items-center gap-1 ml-auto">
                <Button size="sm" variant="ghost" onClick={() => void saveFeed(f)} loading={busy}>SAVE</Button>
                <Button size="sm" variant="danger" onClick={() => void removeFeed(f.id)} disabled={busy}>✕</Button>
              </div>
            </div>
          </div>
        ))}

        <div className="border-t border-grey-mid pt-3 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
          <Input
            aria-label="New calendar link"
            label="Calendar link"
            value={newFeedUrl}
            onChange={(e) => onFeedUrl(e.target.value)}
            placeholder="GOOGLE EMBED / .ICS / webcal://"
          />
          <Input
            aria-label="New calendar name"
            label="Calendar name"
            value={newFeedName}
            onChange={(e) => setNewFeedName(e.target.value.toUpperCase())}
            placeholder="ROOM CALENDAR"
          />
          <div className="w-48">
            <Select
              aria-label="New calendar room"
              label="Room"
              value={newFeedRoom}
              onChange={(e) => setNewFeedRoom(e.target.value)}
              options={feedRoomOptions}
            />
          </div>
          <Button
            size="sm"
            onClick={() => void addFeed()}
            loading={busy}
            disabled={!newFeedUrl.trim() || !newFeedName.trim() || newFeedRoom === PICK_ROOM}
          >
            + ADD CALENDAR
          </Button>
        </div>
      </div>

      {editing && (
        <RoomEditorModal
          key={editing === 'new' ? 'new' : editing.id}
          venueId={venueId}
          room={editing === 'new' ? null : editing}
          floorPlans={floorPlans}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setMessage('SAVED'); void load() }}
        />
      )}
    </div>
  )
}

function RoomEditorModal({
  venueId,
  room,
  floorPlans,
  onClose,
  onSaved,
}: {
  venueId: string
  room: RoomArea | null
  floorPlans: PlanOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(room?.name ?? '')
  const [capacity, setCapacity] = useState(room?.capacity == null ? '' : String(room.capacity))
  const [floorPlanId, setFloorPlanId] = useState(room?.floorPlanId ?? '')
  const [colour, setColour] = useState(room?.colour ?? '')
  const [notes, setNotes] = useState(room?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const { dirty, markClean } = useDirty({ name, capacity, floorPlanId, colour, notes })
  useBeforeUnload(dirty)

  async function save() {
    if (!name.trim()) { setError('ROOM NAME IS REQUIRED'); return }
    const payload = {
      name: name.trim().toUpperCase(),
      colour: colour.trim() || null,
      capacity: capacity.trim() === '' ? null : Number(capacity),
      floorPlanId: floorPlanId || null,
      notes: notes.trim() || null,
    }
    setBusy(true); setError('')
    const r = await fetch(room ? `/api/admin/areas/${room.id}` : '/api/admin/areas', {
      method: room ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(room ? payload : { ...payload, venueId }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setError((d.error ?? 'SAVE FAILED').toUpperCase()); return }
    markClean()
    onSaved()
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      dirty={dirty}
      title={room ? `EDIT ${room.name}` : 'NEW ROOM'}
      size="md"
    >
      <div className="space-y-3">
        <Input label="Room name" value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="FUNCTION ROOM" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Pax max" type="number" min="0" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="OPTIONAL" />
          <div>
            <label className="label" htmlFor="room-colour">Colour</label>
            <input
              id="room-colour"
              type="color"
              value={colour || '#0E7490'}
              onChange={(e) => setColour(e.target.value)}
              className="w-full h-9 bg-black border border-grey-mid"
            />
          </div>
        </div>
        <Select
          label="Table plan"
          value={floorPlanId}
          onChange={(e) => setFloorPlanId(e.target.value)}
          options={[{ value: '', label: 'NO FLOOR PLAN' }, ...floorPlans.map((p) => ({ value: p.id, label: p.name }))]}
        />
        <Input label="Setup notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="HOW THE ROOM IS SET UP" />
        {error && <p className="font-mono text-xs text-danger">{error}</p>}
        <div className="border-t border-grey-mid pt-3 flex items-center gap-2">
          <Button size="sm" onClick={() => void save()} loading={busy}>SAVE ROOM</Button>
          <Button size="sm" variant="ghost" onClick={onClose}>CANCEL</Button>
        </div>
      </div>
    </Modal>
  )
}
