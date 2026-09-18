'use client'

// BEO planner: the event list, the create flow (blank or from a template), and
// the switch into the block builder.

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { EventBuilder, type BeoRefs, type EventDetail } from '@/components/admin/EventBuilder'
import { summariseBlock } from '@/lib/beo-blocks'

interface EventListItem {
  id: string
  name: string
  eventType: string | null
  status: string
  eventDate: string
  startTime: string | null
  guestCount: number
  diningStyle: string | null
  customer: { id: string; name: string } | null
  menu: { id: string; name: string } | null
  setup: { id: string; name: string } | null
  blocks: { id: string; type: string; title: string | null; config: Record<string, unknown>; sortOrder: number }[]
  _count?: { changeRequests: number }
}

interface TemplateOption { id: string; name: string; defaultPax: number | null }

const STATUSES = ['', 'DRAFT', 'TENTATIVE', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']

async function safeArray<T>(url: string): Promise<T[]> {
  try {
    const r = await fetch(url)
    if (!r.ok) return []
    const d = await r.json()
    return Array.isArray(d) ? (d as T[]) : []
  } catch {
    return []
  }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export function EventsPlanner({
  role,
  sessionVenueId,
  defaultVenueId,
  initialEventId,
  onInitialOpened,
}: {
  role: string
  sessionVenueId: string
  defaultVenueId?: string | null
  initialEventId?: string | null
  onInitialOpened?: () => void
}) {
  const venueId = defaultVenueId || sessionVenueId

  const [events, setEvents] = useState<EventListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refs, setRefs] = useState<BeoRefs>({ menus: [], menuItems: [], services: [], setups: [] })
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [selected, setSelected] = useState<EventDetail | null>(null)
  const [opening, setOpening] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [error, setError] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState(todayKey())
  const [newPax, setNewPax] = useState('0')
  const [newTemplate, setNewTemplate] = useState('')
  const [creating, setCreating] = useState(false)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    const q = new URLSearchParams({ venueId })
    if (statusFilter) q.set('status', statusFilter)
    if (search.trim()) q.set('q', search.trim())
    const list = await safeArray<EventListItem>(`/api/admin/events?${q.toString()}`)
    setEvents(list)
    setLoading(false)
  }, [venueId, statusFilter, search])

  useEffect(() => { loadEvents() }, [loadEvents])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [menus, menuItems, services, setups, templates] = await Promise.all([
        safeArray<{ id: string; name: string }>(`/api/admin/menus?venueId=${venueId}`),
        safeArray<{ id: string; name: string; price?: number }>(`/api/admin/menu-items?venueId=${venueId}`),
        safeArray<{ id: string; name: string }>(`/api/admin/services?venueId=${venueId}`),
        safeArray<{ id: string; name: string }>(`/api/admin/floorplan-setups?venueId=${venueId}`),
        safeArray<TemplateOption>(`/api/admin/event-templates?venueId=${venueId}`),
      ])
      if (!alive) return
      setRefs({ menus, menuItems, services, setups })
      setTemplates(templates)
    })()
    return () => { alive = false }
  }, [venueId])

  async function openEvent(id: string) {
    setOpening(true)
    setError('')
    const r = await fetch(`/api/admin/events/${id}`)
    setOpening(false)
    if (!r.ok) {
      setError('COULD NOT OPEN EVENT')
      return
    }
    setSelected((await r.json()) as EventDetail)
  }

  // Opened from another tab (a template was applied, or a request was opened).
  useEffect(() => {
    if (!initialEventId) return
    openEvent(initialEventId)
    onInitialOpened?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEventId])

  async function createEvent() {
    if (!newName.trim()) return
    setCreating(true)
    setError('')
    const payload = {
      venueId,
      name: newName,
      eventDate: newDate,
      guestCount: Number(newPax) || 0,
    }
    const url = newTemplate
      ? `/api/admin/event-templates/${newTemplate}/apply`
      : '/api/admin/events'
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setCreating(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? 'COULD NOT CREATE EVENT')
      return
    }
    const created = (await r.json()) as EventDetail
    setCreateOpen(false)
    setNewName('')
    setNewPax('0')
    setNewTemplate('')
    await loadEvents()
    setSelected(created)
  }

  const grouped = events

  if (selected) {
    return (
      <EventBuilder
        event={selected}
        venueId={venueId}
        refs={refs}
        onBack={() => { setSelected(null); loadEvents() }}
        onSaved={async () => {
          const r = await fetch(`/api/admin/events/${selected.id}`)
          if (r.ok) setSelected((await r.json()) as EventDetail)
          loadEvents()
        }}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white">EVENTS / BEO</h1>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setCreateOpen(true)}>+ NEW EVENT</Button>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <div className="w-48">
          <Input label="Search" value={search} placeholder="EVENT NAME" onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-40">
          <Select
            label="Status"
            value={statusFilter}
            options={STATUSES.map((s) => ({ value: s, label: s || 'ALL' }))}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>
        {opening && <span className="font-mono text-[10px] text-grey-light uppercase loading-cursor pb-1.5">OPENING</span>}
      </div>

      {error && <p className="font-mono text-xs text-danger uppercase">{error}</p>}

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : grouped.length === 0 ? (
        <div className="border border-grey-mid p-6 text-center">
          <p className="font-mono text-xs uppercase text-grey-light">NO EVENTS YET.</p>
          <p className="font-mono text-[10px] uppercase text-grey-light mt-1">CREATE ONE, OR START FROM A TEMPLATE.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {grouped.map((e) => (
            <button
              key={e.id}
              type="button"
              data-testid="event-card"
              onClick={() => openEvent(e.id)}
              className="text-left border border-grey-mid hover:border-white transition-colors p-3 space-y-1"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs uppercase text-white truncate">{e.name}</span>
                {e._count && e._count.changeRequests > 0 && (
                  <span className="font-mono text-[9px] uppercase text-danger border border-danger px-1">
                    {e._count.changeRequests} REQ
                  </span>
                )}
                <div className="flex-1" />
                <span className="font-mono text-[9px] uppercase text-grey-light">{e.status}</span>
              </div>
              <div className="font-mono text-[10px] uppercase text-grey-light">
                {new Date(e.eventDate).toISOString().slice(0, 10)}
                {e.startTime ? ` · ${e.startTime}` : ''} · {e.guestCount} PAX
                {e.eventType ? ` · ${e.eventType}` : ''}
              </div>
              <div className="font-mono text-[10px] uppercase text-grey-light truncate">
                {[e.menu?.name, e.setup?.name].filter(Boolean).join(' · ') || 'NO MENU / LAYOUT'}
              </div>
              <div className="font-mono text-[9px] uppercase text-grey-light truncate">
                {e.blocks.length === 0 ? 'NO BLOCKS' : e.blocks.map((b) => summariseBlock(b)).join(' · ')}
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="NEW EVENT">
        <div className="space-y-3">
          <Input label="Event name" value={newName} placeholder="SMITH WEDDING" onChange={(e) => setNewName(e.target.value)} />
          <Input label="Date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <Input label="Guests" type="number" value={newPax} onChange={(e) => setNewPax(e.target.value)} />
          <Select
            label="Start from template"
            value={newTemplate}
            options={[{ value: '', label: 'BLANK EVENT' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]}
            onChange={(e) => setNewTemplate(e.target.value)}
          />
          {error && <p className="font-mono text-xs text-danger uppercase">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => setCreateOpen(false)}>CANCEL</Button>
            <Button size="sm" onClick={createEvent} loading={creating} disabled={!newName.trim()}>CREATE</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
