'use client'

import { useEffect, useState } from 'react'

interface StaffNode { id: string; name: string; role: string }
interface TaskNode { id: string; title: string; schedule: string; active: boolean; scope: string; assignee: string | null }
interface TrainingNode { id: string; title: string; kind: string; signOff: boolean; linkedToTask: boolean }
interface DeptNode { id: string; name: string; colour: string | null; staff: StaffNode[]; tasks: TaskNode[]; training: TrainingNode[] }
interface VenueNode {
  id: string
  name: string
  totals: { departments: number; staff: number; tasks: number; training: number }
  departments: DeptNode[]
  venueWide: { staff: StaffNode[]; tasks: TaskNode[]; training: TrainingNode[] }
}

function Chevron({ open }: { open: boolean }) {
  return <span className="inline-block w-3 text-grey-light">{open ? '▾' : '▸'}</span>
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[10px] uppercase text-grey-light border border-grey-mid px-1.5 py-0.5">{children}</span>
}

function ScopeTag({ scope }: { scope: string }) {
  const cls = scope === 'PERSON' ? 'text-accent' : scope === 'DEPARTMENT' ? 'text-success' : 'text-grey-light'
  return <span className={`font-mono text-[10px] uppercase ${cls}`}>{scope}</span>
}

export function StructureClient({ role }: { role: string }) {
  const [venues, setVenues] = useState<VenueNode[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<Set<string>>(new Set())

  async function load() {
    setLoading(true)
    const r = await fetch('/api/admin/structure')
    const data = await r.json()
    const vs: VenueNode[] = data.venues ?? []
    setVenues(vs)
    // Expand venues by default; deeper levels start collapsed.
    setOpen(new Set(vs.map((v) => `v:${v.id}`)))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const isOpen = (k: string) => open.has(k)
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  function Group({ k, label, count }: { k: string; label: string; count: number }) {
    if (count === 0) return null
    return (
      <button onClick={() => toggle(k)} className="flex items-center gap-2 py-1 font-mono text-xs uppercase tracking-wider text-grey-light hover:text-white transition-colors">
        <Chevron open={isOpen(k)} />
        {label} <Count>{count}</Count>
      </button>
    )
  }

  function StaffList({ items }: { items: StaffNode[] }) {
    return (
      <div className="pl-5 space-y-0.5">
        {items.map((s) => (
          <div key={s.id} className="font-mono text-xs text-white">
            {s.name} <span className="text-grey-light">· {s.role}</span>
          </div>
        ))}
      </div>
    )
  }
  function TaskList({ items }: { items: TaskNode[] }) {
    return (
      <div className="pl-5 space-y-0.5">
        {items.map((t) => (
          <div key={t.id} className="font-mono text-xs text-white flex flex-wrap items-center gap-2">
            <span className={t.active ? '' : 'text-grey-light line-through'}>{t.title}</span>
            <ScopeTag scope={t.scope} />
            <span className="text-grey-light text-[10px] uppercase">{t.schedule}</span>
            {t.assignee && <span className="text-accent text-[10px]">→ {t.assignee}</span>}
          </div>
        ))}
      </div>
    )
  }
  function TrainingList({ items }: { items: TrainingNode[] }) {
    return (
      <div className="pl-5 space-y-0.5">
        {items.map((t) => (
          <div key={t.id} className="font-mono text-xs text-white flex flex-wrap items-center gap-2">
            {t.title}
            <span className="text-grey-light text-[10px] uppercase">{t.kind}</span>
            {t.signOff && <span className="text-warning text-[10px] uppercase">sign-off</span>}
            {t.linkedToTask && <span className="text-success text-[10px] uppercase">↔ task</span>}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest">STRUCTURE</h1>
        <button onClick={load} className="font-mono text-xs uppercase border border-grey-mid px-3 py-1.5 text-white hover:border-white transition-colors">REFRESH</button>
      </div>
      <p className="font-mono text-xs text-grey-light">
        LIVE VIEW OF HOW EVERYTHING LINKS — VENUE → DEPARTMENT → STAFF · TASKS · TRAINING.
        THE PLANNED <span className="text-white">SECTION</span> LAYER (BAR · COFFEE · CABINET …) SLOTS BETWEEN DEPARTMENT AND TASKS — SEE ECOSYSTEM.MD.
      </p>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : venues.length === 0 ? (
        <p className="font-mono text-xs text-grey-light">NO VENUES FOUND.</p>
      ) : (
        <div className="space-y-3">
          {venues.map((v) => {
            const vwTotal = v.venueWide.staff.length + v.venueWide.tasks.length + v.venueWide.training.length
            return (
              <div key={v.id} className="border border-grey-mid bg-grey-dark">
                {/* Venue header */}
                <button onClick={() => toggle(`v:${v.id}`)} className="w-full flex items-center justify-between gap-3 p-3 hover:bg-black/20 transition-colors text-left">
                  <span className="flex items-center gap-2 font-mono text-sm font-bold uppercase tracking-wider text-white">
                    <Chevron open={isOpen(`v:${v.id}`)} /> {v.name}
                  </span>
                  <span className="flex items-center gap-1.5 flex-wrap justify-end">
                    <Count>{v.totals.departments} DEPTS</Count>
                    <Count>{v.totals.staff} STAFF</Count>
                    <Count>{v.totals.tasks} TASKS</Count>
                    <Count>{v.totals.training} TRAINING</Count>
                  </span>
                </button>

                {isOpen(`v:${v.id}`) && (
                  <div className="px-3 pb-3 space-y-3 border-t border-grey-mid pt-2">
                    {/* Venue-wide bucket */}
                    {vwTotal > 0 && (
                      <div className="border-l-2 border-grey-mid pl-3">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-grey-light mb-1">VENUE-WIDE (NO DEPARTMENT)</div>
                        <Group k={`vws:${v.id}`} label="Staff" count={v.venueWide.staff.length} />
                        {isOpen(`vws:${v.id}`) && <StaffList items={v.venueWide.staff} />}
                        <Group k={`vwt:${v.id}`} label="Tasks" count={v.venueWide.tasks.length} />
                        {isOpen(`vwt:${v.id}`) && <TaskList items={v.venueWide.tasks} />}
                        <Group k={`vwr:${v.id}`} label="Training" count={v.venueWide.training.length} />
                        {isOpen(`vwr:${v.id}`) && <TrainingList items={v.venueWide.training} />}
                      </div>
                    )}

                    {/* Departments */}
                    {v.departments.length === 0 ? (
                      <p className="font-mono text-xs text-grey-light pl-3">NO DEPARTMENTS YET.</p>
                    ) : (
                      v.departments.map((d) => (
                        <div key={d.id} className="border-l-2 pl-3" style={{ borderColor: d.colour ?? '#6B6B6B' }}>
                          <button onClick={() => toggle(`d:${d.id}`)} className="w-full flex items-center justify-between gap-3 py-1 text-left">
                            <span className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-white">
                              <Chevron open={isOpen(`d:${d.id}`)} />
                              {d.colour && <span className="inline-block w-2.5 h-2.5 border border-grey-mid" style={{ backgroundColor: d.colour }} />}
                              {d.name}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Count>{d.staff.length} STAFF</Count>
                              <Count>{d.tasks.length} TASKS</Count>
                              <Count>{d.training.length} TRAINING</Count>
                            </span>
                          </button>

                          {isOpen(`d:${d.id}`) && (
                            <div className="pl-5 py-1 space-y-0.5">
                              <div className="font-mono text-[10px] uppercase text-grey-light italic">
                                ▸ SECTIONS — PLANNED (e.g. BAR · COFFEE · CABINET · FLOOR)
                              </div>
                              <Group k={`ds:${d.id}`} label="Staff" count={d.staff.length} />
                              {isOpen(`ds:${d.id}`) && <StaffList items={d.staff} />}
                              <Group k={`dt:${d.id}`} label="Tasks" count={d.tasks.length} />
                              {isOpen(`dt:${d.id}`) && <TaskList items={d.tasks} />}
                              <Group k={`dr:${d.id}`} label="Training" count={d.training.length} />
                              {isOpen(`dr:${d.id}`) && <TrainingList items={d.training} />}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {role === 'MANAGER' && (
        <p className="font-mono text-[10px] text-grey-light">SHOWING YOUR VENUE ONLY.</p>
      )}
    </div>
  )
}
