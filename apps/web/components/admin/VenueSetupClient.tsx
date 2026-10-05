'use client'

// SETTINGS → VENUE SETUP. One place to stand up a venue: departments, roles
// (positions, with their training requirements + default access) and — for an
// admin — the venue list itself (create / remove test venues).

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PositionsPanel } from '@/components/admin/PositionsPanel'
import { DepartmentsClient } from '@/components/admin/DepartmentsClient'
import { getActiveVenueId } from '@/lib/active-venue'

interface Venue { id: string; name: string; isActive: boolean }

export function VenueSetupClient({
  role,
  sessionVenueId,
  defaultVenueId,
}: {
  role: string
  sessionVenueId: string
  defaultVenueId?: string | null
}) {
  const venueId = getActiveVenueId(role, sessionVenueId, defaultVenueId ?? undefined)
  const [venues, setVenues] = useState<Venue[]>([])
  const [newVenue, setNewVenue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function loadVenues() {
    if (role !== 'ADMIN') return
    const r = await fetch('/api/admin/venues')
    setVenues(r.ok ? await r.json() : [])
  }

  useEffect(() => { loadVenues() }, [role])

  async function createVenue() {
    if (!newVenue.trim()) return
    setBusy(true); setError('')
    const r = await fetch('/api/admin/venues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newVenue }),
    })
    setBusy(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? 'COULD NOT CREATE')
      return
    }
    setNewVenue('')
    loadVenues()
  }

  async function removeVenue(v: Venue) {
    if (!confirm(`REMOVE VENUE "${v.name}"? THIS SOFT-DELETES IT AND HIDES IT EVERYWHERE.`)) return
    setBusy(true); setError('')
    const r = await fetch(`/api/admin/venues/${v.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? 'COULD NOT REMOVE')
      return
    }
    loadVenues()
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest">VENUE SETUP</h1>
        <p className="font-mono text-xs text-grey-light mt-1 uppercase">
          DEPARTMENTS · ROLES (WITH TRAINING REQUIREMENTS + DEFAULT ACCESS){role === 'ADMIN' ? ' · VENUES' : ''}
        </p>
      </div>

      {role === 'ADMIN' && (
        <div className="border border-grey-mid p-4 space-y-3">
          <div>
            <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">VENUES</h3>
            <p className="font-mono text-[10px] uppercase text-grey-light mt-0.5">
              CREATE A VENUE OR REMOVE A TEST ONE (SOFT DELETE — HIDDEN EVERYWHERE).
            </p>
          </div>
          <div className="divide-y divide-grey-mid border border-grey-mid">
            {venues.length === 0 ? (
              <p className="font-mono text-xs text-grey-light px-3 py-2">NO VENUES.</p>
            ) : (
              venues.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="font-mono text-xs uppercase text-white">
                    {v.name}
                    {!v.isActive && <span className="font-mono text-[10px] text-danger ml-2">INACTIVE</span>}
                  </span>
                  <button
                    onClick={() => removeVenue(v)}
                    className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors"
                  >
                    REMOVE
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input label="New venue name" value={newVenue} onChange={(e) => setNewVenue(e.target.value)} placeholder="NEW VENUE" />
            </div>
            <Button size="sm" variant="ghost" onClick={createVenue} loading={busy}>+ ADD VENUE</Button>
          </div>
          {error && <p className="font-mono text-xs text-danger">{error}</p>}
        </div>
      )}

      <PositionsPanel venueId={venueId} />

      <DepartmentsClient role={role} venueId={venueId} />
    </div>
  )
}
