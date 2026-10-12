'use client'

// Client hook: the event-roster week payload (areas, events with staffing +
// listed seats + linked roster shifts, the venue claim queue, positions). Fetches
// only while `enabled` — the roster wires it up on its EVENTS tab.

import { useCallback, useEffect, useState } from 'react'

export interface EventArea {
  id: string
  name: string
  colour: string | null
  capacity: number | null
  floorPlanSlug: string | null
  floorPlanName: string | null
}

export interface EventStaffingLine {
  id: string
  positionId: string | null
  positionName: string | null
  positionColour: string | null
  label: string | null
  count: number
  startTime: string
  endTime: string
  breakMinutes: number
  note: string | null
  sortOrder: number
}

export interface EventClaim {
  id: string
  staffId: string
  staffName: string
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN'
  note: string | null
  createdAt: string
}

export interface EventOpenShift {
  id: string
  staffingId: string | null
  positionId: string | null
  positionName: string | null
  positionColour: string | null
  label: string | null
  date: string
  startTime: string
  endTime: string
  breakMinutes: number
  note: string | null
  status: 'OPEN' | 'FILLED' | 'CANCELLED'
  filledById: string | null
  filledByName: string | null
  filledShiftId: string | null
  claims: EventClaim[]
}

export interface EventLinkedShift {
  id: string
  staffId: string
  staffName: string
  positionName: string | null
  positionColour: string | null
  date: string
  startTime: string
  endTime: string
  breakMinutes: number
  tag: string | null
  status: string
  fromClaim: boolean
}

export interface EventRosterEvent {
  id: string
  feedId: string | null
  areaId: string | null
  title: string
  description: string | null
  location: string | null
  source: string
  startsAt: Date
  endsAt: Date | null
  allDay: boolean
  pax: number | null
  pdfPath: string | null
  pdfUrl: string | null
  floorPlanSlug: string | null
  floorPlanName: string | null
  staffing: EventStaffingLine[]
  openShifts: EventOpenShift[]
  shifts: EventLinkedShift[]
}

export interface EventQueueClaim {
  id: string
  openShiftId: string
  staffId: string
  staffName: string
  note: string | null
  createdAt: string
  date: string
  startTime: string
  endTime: string
  positionName: string | null
  label: string | null
  eventTitle: string | null
  eventId: string | null
}

export interface EventPosition {
  id: string
  name: string
  colour: string | null
}

export interface EventRosterPayload {
  areas: EventArea[]
  events: EventRosterEvent[]
  queue: EventQueueClaim[]
  positions: EventPosition[]
  lastSyncedAt: string | null
}

export function useEventRoster(
  venueId: string | null,
  start: string,
  end: string,
  enabled: boolean,
) {
  const [data, setData] = useState<EventRosterPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    if (!enabled || !venueId) return
    setLoading(true)
    setError('')
    const r = await fetch(`/api/admin/event-roster?venueId=${venueId}&start=${start}&end=${end}`)
    const d = await r.json().catch(() => null)
    if (!r.ok || !d) {
      setError((d?.error ?? 'LOAD FAILED').toUpperCase())
      setLoading(false)
      return
    }
    setData({
      areas: d.areas ?? [],
      events: (d.events ?? []).map((e: EventRosterEvent & { startsAt: string; endsAt: string | null }) => ({
        ...e,
        startsAt: new Date(e.startsAt),
        endsAt: e.endsAt ? new Date(e.endsAt) : null,
      })),
      queue: d.queue ?? [],
      positions: d.positions ?? [],
      lastSyncedAt: d.lastSyncedAt ?? null,
    })
    setLoading(false)
  }, [enabled, venueId, start, end])

  useEffect(() => {
    void load()
  }, [load])

  const syncNow = useCallback(async () => {
    if (!venueId) return
    setSyncing(true)
    setError('')
    const r = await fetch('/api/admin/calendar/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId }),
    })
    const d = await r.json().catch(() => ({}))
    setSyncing(false)
    if (!r.ok) {
      setError((d.error ?? 'SYNC FAILED').toUpperCase())
      return
    }
    if (d.errors?.length) setError(d.errors.join(' · ').toUpperCase())
    await load()
  }, [venueId, load])

  return { data, loading, error, setError, syncing, reload: load, syncNow }
}
