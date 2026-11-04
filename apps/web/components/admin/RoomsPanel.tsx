'use client'

// Rooms (Areas) + their calendar feeds — moved out of Settings → GENERAL into
// Events → ROOMS & PLANS → ROOMS. An Area is a physical event space; a calendar
// feed attaches to one area so imported events know which room they belong to.

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

interface RoomArea {
  id: string
  name: string
  colour: string | null
  capacity: number | null
  floorPlanId: string | null
  notes: string | null
  sortOrder: number
  isActive: boolean
}

interface RoomFeed {
  id: string
  name: string
  url: string
  areaId: string | null
  colour: string | null
  floorPlanId: string | null
  isActive: boolean
}

interface PlanOption { id: string; name: string }

export function RoomsPanel({ venueId }: { venueId: string }) {
  const [areas, setAreas] = useState<RoomArea[]>([])
  const [feeds, setFeeds] = useState<RoomFeed[]>([])
  const [floorPlans, setFloorPlans] = useState<PlanOption[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const [newAreaName, setNewAreaName] = useState('')
  const [newAreaCapacity, setNewAreaCapacity] = useState('')
  const [newAreaFloorPlanId, setNewAreaFloorPlanId] = useState('')

  const [newFeedName, setNewFeedName] = useState('')
  const [newFeedUrl, setNewFeedUrl] = useState('')

  async function load() {
    if (!venueId) return
    const r = await fetch(`/api/admin/calendar-feeds?venueId=${venueId}`)
    if (!r.ok) { setAreas([]); setFeeds([]); setFloorPlans([]); return }
    const d = await r.json()
    setAreas(d.areas ?? [])
    setFeeds(d.feeds ?? [])
    setFloorPlans(d.floorPlans ?? [])
  }

  useEffect(() => { void load() }, [venueId])

  function patchArea(id: string, patch: Partial<RoomArea>) {
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  async function addArea() {
    if (!venueId) return
    if (!newAreaName.trim()) { setMessage('AREA NAME IS REQUIRED'); return }
    setBusy(true); setMessage('')
    const r = await fetch('/api/admin/areas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venueId,
        name: newAreaName,
        capacity: newAreaCapacity.trim() || null,
        floorPlanId: newAreaFloorPlanId || null,
      }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMessage((d.error ?? 'ADD FAILED').toUpperCase()); return }
    setNewAreaName(''); setNewAreaCapacity(''); setNewAreaFloorPlanId('')
    setMessage('ROOM ADDED')
    void load()
  }

  async function saveArea(area: RoomArea) {
    setBusy(true); setMessage('')
    const r = await fetch(`/api/admin/areas/${area.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: area.name,
        colour: area.colour,
        capacity: area.capacity,
        floorPlanId: area.floorPlanId,
        notes: area.notes,
      }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setMessage((d.error ?? 'SAVE FAILED').toUpperCase()); return }
    setMessage('SAVED')
    void load()
  }

  async function removeArea(id: string) {
    if (!confirm('REMOVE THIS ROOM? ITS CALENDARS BECOME UNASSIGNED AND KEEP SYNCING; ITS EVENTS STAY BUT FALL BACK TO "OTHER".')) return
    setBusy(true); setMessage('')
    const r = await fetch(`/api/admin/areas/${id}`, { method: 'DELETE' })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setMessage((d.error ?? 'REMOVE FAILED').toUpperCase()); return }
    void load()
  }

  async function moveArea(id: string, dir: -1 | 1) {
    const index = areas.findIndex((a) => a.id === id)
    const target = index + dir
    if (index < 0 || target < 0 || target >= areas.length) return
    const next = [...areas]
    const [row] = next.splice(index, 1)
    next.splice(target, 0, row)
    setAreas(next)
    await fetch('/api/admin/areas/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, order: next.map((a) => a.id) }),
    })
  }

  function patchFeed(id: string, patch: Partial<RoomFeed>) {
    setFeeds((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  async function addFeed() {
    if (!venueId) return
    if (!newFeedName.trim() || !newFeedUrl.trim()) { setMessage('ROOM NAME AND CALENDAR LINK ARE REQUIRED'); return }
    setBusy(true); setMessage('')
    const r = await fetch('/api/admin/calendar-feeds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, name: newFeedName, url: newFeedUrl }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMessage((d.error ?? 'ADD FAILED').toUpperCase()); return }
    setNewFeedName(''); setNewFeedUrl('')
    setMessage('CALENDAR ADDED — SYNC CALENDARS ON THE ROSTER PAGE TO IMPORT IT')
    void load()
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

  async function moveFeed(id: string, dir: -1 | 1) {
    const index = feeds.findIndex((f) => f.id === id)
    const target = index + dir
    if (index < 0 || target < 0 || target >= feeds.length) return
    const next = [...feeds]
    const [row] = next.splice(index, 1)
    next.splice(target, 0, row)
    setFeeds(next)
    await fetch('/api/admin/calendar-feeds/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, orderedIds: next.map((f) => f.id) }),
    })
  }

  const planOptions = [{ value: '', label: 'NO FLOOR PLAN' }, ...floorPlans.map((p) => ({ value: p.id, label: p.name }))]
  const areaOptions = [{ value: '', label: 'UNASSIGNED' }, ...areas.map((a) => ({ value: a.id, label: a.name }))]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">ROOMS</h1>
        <p className="font-mono text-xs uppercase text-grey-light mt-1">
          A ROOM IS A PHYSICAL EVENT SPACE. LINK IT TO A TABLE PLAN AND ATTACH THE CALENDARS THAT IMPORT ITS EVENTS.
        </p>
      </div>

      {message && <p className="font-mono text-xs uppercase text-accent">{message}</p>}

      <div className="border border-grey-mid p-3 space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-wider text-grey-light">ROOMS ({areas.length})</h2>
        {areas.length === 0 && <p className="font-mono text-2xs uppercase text-grey-light">NO ROOMS YET — ADD THE FIRST ONE BELOW.</p>}
        <div className="space-y-2">
          {areas.map((a, i) => (
            <div key={a.id} className="border border-grey-mid p-2 space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[160px]">
                  <Input label="Room name" value={a.name} onChange={(e) => patchArea(a.id, { name: e.target.value.toUpperCase() })} />
                </div>
                <div className="w-24">
                  <Input label="Pax max" type="number" min="0" value={a.capacity == null ? '' : String(a.capacity)} onChange={(e) => patchArea(a.id, { capacity: e.target.value.trim() === '' ? null : Number(e.target.value) })} />
                </div>
                <div className="w-36">
                  <Select label="Table plan" value={a.floorPlanId ?? ''} onChange={(e) => patchArea(a.id, { floorPlanId: e.target.value || null })} options={planOptions} />
                </div>
                <div className="flex items-center gap-1 pb-1">
                  <button onClick={() => moveArea(a.id, -1)} disabled={i === 0} className="w-8 h-8 border border-grey-mid text-grey-light font-mono text-xs hover:border-white hover:text-white disabled:opacity-30">↑</button>
                  <button onClick={() => moveArea(a.id, 1)} disabled={i === areas.length - 1} className="w-8 h-8 border border-grey-mid text-grey-light font-mono text-xs hover:border-white hover:text-white disabled:opacity-30">↓</button>
                  <Button size="sm" variant="ghost" onClick={() => void saveArea(a)} loading={busy}>SAVE</Button>
                  <Button size="sm" variant="danger" onClick={() => void removeArea(a.id)} disabled={busy}>✕</Button>
                </div>
              </div>
              <Input label="Setup notes" value={a.notes ?? ''} onChange={(e) => patchArea(a.id, { notes: e.target.value })} placeholder="HOW THE ROOM IS SET UP" />
            </div>
          ))}
        </div>
        <div className="border-t border-grey-mid pt-3 grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <Input label="New room name" value={newAreaName} onChange={(e) => setNewAreaName(e.target.value.toUpperCase())} placeholder="FUNCTION ROOM" />
          <Input label="Pax max" type="number" min="0" value={newAreaCapacity} onChange={(e) => setNewAreaCapacity(e.target.value)} />
          <div className="flex gap-2 items-end">
            <div className="flex-1"><Select label="Table plan" value={newAreaFloorPlanId} onChange={(e) => setNewAreaFloorPlanId(e.target.value)} options={planOptions} /></div>
            <Button size="sm" onClick={() => void addArea()} loading={busy} disabled={!newAreaName.trim()}>+ ADD ROOM</Button>
          </div>
        </div>
      </div>

      <div className="border border-grey-mid p-3 space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-wider text-grey-light">CALENDAR FEEDS ({feeds.length})</h2>
        <p className="font-mono text-2xs uppercase text-grey-light">
          PASTE A GOOGLE CALENDAR EMBED URL OR AN .ICS/WIBCAL LINK. EACH FEED IMPORTS INTO ONE ROOM.
        </p>
        {feeds.map((f, i) => (
          <div key={f.id} className="border border-grey-mid p-2 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input label="Calendar name" value={f.name} onChange={(e) => patchFeed(f.id, { name: e.target.value })} />
              <Input label="Calendar link" value={f.url} onChange={(e) => patchFeed(f.id, { url: e.target.value })} />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-48"><Select label="Room" value={f.areaId ?? ''} onChange={(e) => patchFeed(f.id, { areaId: e.target.value || null })} options={areaOptions} /></div>
              <div className="w-44"><Select label="Table plan" value={f.floorPlanId ?? ''} onChange={(e) => patchFeed(f.id, { floorPlanId: e.target.value || null })} options={planOptions} /></div>
              <label className="flex items-center gap-2 pb-2 font-mono text-2xs uppercase text-grey-light">
                <input type="checkbox" checked={f.isActive} onChange={(e) => patchFeed(f.id, { isActive: e.target.checked })} className="accent-white" />
                ACTIVE
              </label>
              <div className="flex items-center gap-1 pb-1">
                <button onClick={() => moveFeed(f.id, -1)} disabled={i === 0} className="w-8 h-8 border border-grey-mid text-grey-light font-mono text-xs hover:border-white hover:text-white disabled:opacity-30">↑</button>
                <button onClick={() => moveFeed(f.id, 1)} disabled={i === feeds.length - 1} className="w-8 h-8 border border-grey-mid text-grey-light font-mono text-xs hover:border-white hover:text-white disabled:opacity-30">↓</button>
                <Button size="sm" variant="ghost" onClick={() => void saveFeed(f)} loading={busy}>SAVE</Button>
                <Button size="sm" variant="danger" onClick={() => void removeFeed(f.id)} disabled={busy}>✕</Button>
              </div>
            </div>
          </div>
        ))}
        <div className="border-t border-grey-mid pt-3 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <Input label="New calendar name" value={newFeedName} onChange={(e) => setNewFeedName(e.target.value)} placeholder="ROOM CALENDAR" />
          <Input label="Calendar link" value={newFeedUrl} onChange={(e) => setNewFeedUrl(e.target.value)} placeholder="HTTPS://..." />
          <Button size="sm" onClick={() => void addFeed()} loading={busy} disabled={!newFeedName.trim() || !newFeedUrl.trim()}>+ ADD CALENDAR</Button>
        </div>
      </div>
    </div>
  )
}
