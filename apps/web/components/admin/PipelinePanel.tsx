'use client'

// The event pipeline: a board of every event by status, and — when one is
// selected — its auto-derived flow (planning areas → prep → event-day moments).
// Read-only; editing happens in the EVENTS tab.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { blockDef, type BlockLibrary } from '@/lib/beo-blocks'
import { linkIdsFor } from '@/lib/beo-links'
import { buildEventFlow, type EventFlowBlock } from '@/lib/event-flow'
import { useBlockLibrary } from '@/lib/use-block-library'

interface EventItem {
  id: string
  name: string
  eventType: string | null
  status: string
  eventDate: string
  guestCount: number
  blocks: { id: string; type: string; title: string | null; config: Record<string, unknown>; sortOrder: number }[]
}

const COLUMNS = ['ENQUIRY', 'DRAFT', 'TENTATIVE', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']

function dateKey(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? String(iso ?? '').slice(0, 10) : d.toISOString().slice(0, 10)
}

function collectLinkIds(blocks: EventFlowBlock[], library: BlockLibrary) {
  const tasks = new Set<string>()
  const checklists = new Set<string>()
  for (const b of blocks) {
    const def = blockDef(b.type, library)
    linkIdsFor(def, 'TASK').forEach((id) => tasks.add(id))
    linkIdsFor(def, 'CHECKLIST').forEach((id) => checklists.add(id))
  }
  return { tasks: [...tasks], checklists: [...checklists] }
}

export function PipelinePanel({
  sessionVenueId,
  defaultVenueId,
  onOpenEvent,
}: {
  sessionVenueId: string
  defaultVenueId?: string | null
  onOpenEvent: (eventId: string) => void
}) {
  const venueId = defaultVenueId || sessionVenueId
  const library = useBlockLibrary(`/api/admin/beo-block-defs?venueId=${venueId}`)

  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<EventItem | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/events?venueId=${venueId}`)
      const d = r.ok ? await r.json() : []
      setEvents(Array.isArray(d) ? (d as EventItem[]) : [])
    } catch {
      setEvents([])
    }
    setLoading(false)
  }, [venueId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!selected) return
    const { tasks, checklists } = collectLinkIds(selected.blocks as EventFlowBlock[], library)
    if (tasks.length === 0 && checklists.length === 0) { setNames({}); return }
    let alive = true
    const q = new URLSearchParams({ venueId })
    if (tasks.length) q.set('tasks', tasks.join(','))
    if (checklists.length) q.set('checklists', checklists.join(','))
    ;(async () => {
      try {
        const r = await fetch(`/api/admin/beo-references?${q.toString()}`)
        if (!r.ok || !alive) return
        const d = await r.json()
        const map: Record<string, string> = {}
        for (const t of d.tasks ?? []) map[t.id] = t.name
        for (const c of d.checklists ?? []) map[c.id] = c.name
        setNames(map)
      } catch { /* labels fall back */ }
    })()
    return () => { alive = false }
  }, [selected, library, venueId])

  const flow = useMemo(
    () => (selected ? buildEventFlow({ blocks: selected.blocks as EventFlowBlock[], library, names }) : null),
    [selected, library, names],
  )

  if (selected && flow) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>← PIPELINE</Button>
          <span className="font-mono text-xs uppercase text-white truncate">{selected.name}</span>
          <span className="font-mono text-[10px] uppercase text-grey-light">{selected.status} · {dateKey(selected.eventDate)} · {selected.guestCount} PAX</span>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => onOpenEvent(selected.id)}>OPEN BEO</Button>
          {([['FULL', 'BEO PDF'], ['KITCHEN', 'KITCHEN'], ['CLIENT', 'CLIENT']] as const).map(([variant, label]) => (
            <a
              key={variant}
              href={`/api/admin/events/${selected.id}/pdf?variant=${variant}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[10px] uppercase tracking-wider border border-grey-mid text-white px-2 py-1 hover:border-white"
            >
              {label}
            </a>
          ))}
        </div>

        <div className="border border-grey-mid p-3">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-mono text-[10px] uppercase text-grey-light tracking-wider">FLOW</span>
            <span className="font-mono text-[10px] uppercase text-white">{flow.areasFilled}/{flow.areasTotal} AREAS FILLED</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {flow.stages.map((stage) => (
              <div key={stage.key} className="border border-grey-mid">
                <div className="px-2 py-1.5 border-b border-grey-mid bg-grey-dark/40 font-mono text-[10px] uppercase text-white tracking-wider">
                  {stage.label} · {stage.nodes.length}
                </div>
                <div className="p-2 space-y-1 min-h-[3rem]">
                  {stage.nodes.length === 0 && (
                    <p className="font-mono text-[9px] uppercase text-grey-light py-2 text-center">EMPTY</p>
                  )}
                  {stage.nodes.map((n) => (
                    <div key={n.id} className="border border-grey-mid px-2 py-1.5 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-[10px] uppercase truncate ${n.filled ? 'text-white' : 'text-grey-light'}`}>{n.label}</span>
                        <div className="flex-1" />
                        <span className="font-mono text-[8px] uppercase text-grey-light border border-grey-mid px-1">{n.kind}</span>
                      </div>
                      {n.detail && <div className="font-mono text-[9px] uppercase text-grey-light truncate">{n.detail}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white">PIPELINE</h1>
        <div className="flex-1" />
        <span className="font-mono text-[10px] uppercase text-grey-light">{events.length} EVENT(S)</span>
      </div>
      <p className="font-mono text-[10px] uppercase text-grey-light">
        ENQUIRY → CONFIRMED → EVENT DAY. CLICK A CARD TO SEE ITS FLOW, PREP AND MOMENTS.
      </p>
      {error && <p className="font-mono text-xs text-danger uppercase">{error}</p>}

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {COLUMNS.map((status) => {
            const col = events.filter((e) => e.status === status)
            return (
              <div key={status} className="w-56 shrink-0 border border-grey-mid">
                <div className="px-2 py-1.5 border-b border-grey-mid bg-grey-dark/40 flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase text-white tracking-wider">{status}</span>
                  <div className="flex-1" />
                  <span className="font-mono text-[9px] uppercase text-grey-light">{col.length}</span>
                </div>
                <div className="p-2 space-y-2 min-h-[4rem]">
                  {col.length === 0 && <p className="font-mono text-[9px] uppercase text-grey-light text-center py-2">—</p>}
                  {col.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      data-testid="pipeline-card"
                      onClick={() => { setError(''); setNames({}); setSelected(e) }}
                      className="w-full text-left border border-grey-mid hover:border-white transition-colors p-2 space-y-1"
                    >
                      <span className="block font-mono text-[10px] uppercase text-white truncate">{e.name}</span>
                      <span className="block font-mono text-[9px] uppercase text-grey-light">
                        {dateKey(e.eventDate)}{e.guestCount ? ` · ${e.guestCount} PAX` : ''}
                      </span>
                      {e.eventType && <span className="block font-mono text-[9px] uppercase text-grey-light truncate">{e.eventType}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
