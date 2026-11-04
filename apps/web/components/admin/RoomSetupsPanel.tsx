'use client'

// Venue-wide room setups — every FloorPlanSetup with room metadata, across all
// table plans. Edit presentation (room/pax/style/photos/notes) without opening
// the canvas; the table plan geometry stays in the floor-plan editor.

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import {
  RoomSetupModal,
  roomSetupDraftFrom,
  roomSetupPayload,
  type RoomSetupDraft,
} from '@/components/RoomSetupModal'

interface SetupRow {
  id: string
  name: string
  roomName: string | null
  areaId: string | null
  guestCapacity: number | null
  setupStyle: string | null
  imageUrls: string[]
  floorPlan: { id: string; name: string }
}

interface Area { id: string; name: string }

export function RoomSetupsPanel({ venueId }: { venueId: string }) {
  const [setups, setSetups] = useState<SetupRow[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<{ setup: SetupRow; draft: RoomSetupDraft } | null>(null)

  async function load() {
    if (!venueId) return
    setLoading(true)
    const [sRes, aRes] = await Promise.all([
      fetch(`/api/admin/floorplan-setups?venueId=${venueId}`),
      fetch(`/api/admin/calendar-feeds?venueId=${venueId}`),
    ])
    if (sRes.ok) setSetups(await sRes.json())
    if (aRes.ok) {
      const d = await aRes.json().catch(() => ({}))
      setAreas(d.areas ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [venueId])

  async function setRoom(setup: SetupRow, areaId: string) {
    setBusy(true); setError('')
    const r = await fetch(`/api/admin/floorplan/${setup.floorPlan.id}/setups/${setup.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ areaId: areaId || null }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError((d.error ?? 'COULD NOT LINK THE ROOM').toUpperCase()); return }
    void load()
  }

  async function saveSetup() {
    if (!editing) return
    setBusy(true); setError('')
    const payload = roomSetupPayload(editing.draft)
    const r = await fetch(`/api/admin/floorplan/${editing.setup.floorPlan.id}/setups/${editing.setup.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError((d.error ?? 'SAVE FAILED').toUpperCase()); return }
    setEditing(null)
    void load()
  }

  const areaOptions = [{ value: '', label: 'UNASSIGNED' }, ...areas.map((a) => ({ value: a.id, label: a.name }))]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">ROOM SETUPS</h1>
        <p className="font-mono text-xs uppercase text-grey-light mt-1">
          EVERY NAMED SETUP ACROSS ALL TABLE PLANS. LINK EACH TO A ROOM, THEN EDIT THE DRESSED-ROOM DETAILS.
        </p>
      </div>

      {error && <p className="font-mono text-xs uppercase text-danger">{error}</p>}

      {loading ? (
        <p className="font-mono text-xs uppercase text-grey-light loading-cursor">LOADING</p>
      ) : setups.length === 0 ? (
        <div className="border border-grey-mid p-8 text-center">
          <p className="font-mono text-xs uppercase text-grey-light">NO ROOM SETUPS YET</p>
          <p className="font-mono text-xs text-grey-light mt-1">CREATE ONE FROM A TABLE PLAN IN ROOMS &amp; PLANS → TABLE PLANS.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {setups.map((s) => {
            const linkedArea = areas.find((a) => a.id === s.areaId)
            const label = [s.roomName || linkedArea?.name, s.guestCapacity != null ? `${s.guestCapacity}PAX` : null, s.setupStyle]
              .filter(Boolean)
              .join(' · ')
            return (
              <div key={s.id} className="border border-grey-mid p-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs uppercase text-white truncate">{s.name}</p>
                  <p className="font-mono text-2xs uppercase text-grey-light truncate">
                    {s.floorPlan.name}{label ? ` · ${label}` : ''}{s.imageUrls.length > 0 ? ` · ${s.imageUrls.length} PHOTO${s.imageUrls.length === 1 ? '' : 'S'}` : ''}
                  </p>
                </div>
                <div className="w-48">
                  <Select
                    value={s.areaId ?? ''}
                    onChange={(e) => void setRoom(s, e.target.value)}
                    options={areaOptions}
                    aria-label={`Room for ${s.name}`}
                  />
                </div>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing({ setup: s, draft: roomSetupDraftFrom(s) })}>
                  EDIT SETUP
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <RoomSetupModal
          isOpen
          title={`EDIT SETUP — ${editing.setup.name}`}
          value={editing.draft}
          onChange={(draft) => setEditing((prev) => (prev ? { ...prev, draft } : prev))}
          onClose={() => { if (!busy) setEditing(null) }}
          onSave={() => void saveSetup()}
          saving={busy}
          error={error}
        />
      )}
    </div>
  )
}
