'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Modal } from '@/components/ui/Modal'
import { TaskEditModal } from '@/components/admin/TaskEditModal'
import { TrainingEditModal } from '@/components/admin/TrainingEditModal'
import { StaffEditModal } from '@/components/admin/StaffEditModal'

const StructureGraph = dynamic(
  () => import('@/components/admin/StructureGraph').then((m) => m.StructureGraph),
  { ssr: false, loading: () => <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p> },
)

interface StaffNode { id: string; name: string; role: string }
interface TaskLink { label: string; colour: string; kind: string; targetId: string; targetType: string; targetSub: string }
interface TaskNode { id: string; title: string; schedule: string; active: boolean; scope: string; assignee: string | null; links?: TaskLink[] }
interface TrainingNode { id: string; title: string; kind: string; signOff: boolean; linkedToTask: boolean }
interface SectionNode { id: string; name: string; colour: string | null; staff: StaffNode[]; tasks: TaskNode[]; floorPlan?: { tables: number; chairs: number; equip: number }; inventoryItems?: { id: string; name: string; unit: string; storageNotes: string | null; totalQty: number; imageUrls: string[] | null }[] }
interface DeptNode { id: string; name: string; colour: string | null; staff: StaffNode[]; tasks: TaskNode[]; training: TrainingNode[]; sections: SectionNode[]; linkedDepartments?: { id: string; name: string; colour: string | null }[] }
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
  const [view, setView] = useState<'tree' | 'map'>('tree')
  const [connection, setConnection] = useState<{ task: TaskNode; link: TaskLink } | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editTarget, setEditTarget] = useState<{ type: 'task' | 'training' | 'staff'; id: string } | null>(null)

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

  function allKeys(): string[] {
    const keys: string[] = []
    for (const v of venues) {
      keys.push(`v:${v.id}`, `vws:${v.id}`, `vwt:${v.id}`, `vwr:${v.id}`)
      for (const d of v.departments) {
        keys.push(`d:${d.id}`, `ds:${d.id}`, `dt:${d.id}`, `dr:${d.id}`)
        for (const sec of d.sections) {
          keys.push(`s:${sec.id}`, `ss:${sec.id}`, `st:${sec.id}`, `sf:${sec.id}`, `si:${sec.id}`)
        }
      }
    }
    return keys
  }
  const expandAll = () => setOpen(new Set(allKeys()))
  const collapseAll = () => setOpen(new Set())

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
      <div className="pl-5 divide-y divide-grey-mid border-t border-grey-mid">
        {items.map((s) => (
          <div
            key={s.id}
            onClick={editMode ? () => setEditTarget({ type: 'staff', id: s.id }) : undefined}
            className={`font-mono text-xs text-white py-1 flex items-center gap-2 ${editMode ? 'cursor-pointer hover:bg-grey-mid/20 -mx-2 px-2' : ''}`}
          >
            <span>{s.name} <span className="text-grey-light">· {s.role}</span></span>
            {editMode && <span className="ml-auto font-mono text-[10px] uppercase text-accent">EDIT</span>}
          </div>
        ))}
      </div>
    )
  }
  function TaskList({ items }: { items: TaskNode[] }) {
    return (
      <div className="pl-5 divide-y divide-grey-mid border-t border-grey-mid">
        {items.map((t) => (
          <div
            key={t.id}
            onClick={editMode ? () => setEditTarget({ type: 'task', id: t.id }) : undefined}
            className={`font-mono text-xs text-white flex flex-wrap items-center gap-2 py-1 ${editMode ? 'cursor-pointer hover:bg-grey-mid/20 -mx-2 px-2' : ''}`}
          >
            <span className={t.active ? '' : 'text-grey-light line-through'}>{t.title}</span>
            <ScopeTag scope={t.scope} />
            <span className="text-grey-light text-[10px] uppercase">{t.schedule}</span>
            {t.assignee && <span className="text-accent text-[10px]">→ {t.assignee}</span>}
            {(t.links ?? []).map((l, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => { e.stopPropagation(); setConnection({ task: t, link: l }) }}
                className="inline-flex items-center gap-1 font-mono text-[10px] uppercase px-1.5 py-0.5 border-l-2 hover:bg-grey-mid/30 transition-colors cursor-pointer"
                style={{ borderColor: l.colour, color: l.colour }}
                title={`${l.kind === 'requires' ? 'REQUIRES TRAINING' : l.kind === 'how-to' ? 'HOW-TO GUIDE' : 'IN LIST'}: ${l.label} — CLICK FOR DETAILS`}
              >
                {l.kind === 'requires' ? '⊢ ' : l.kind === 'how-to' ? '↳ ' : '☰ '}{l.label}
              </button>
            ))}
            {editMode && <span className="ml-auto font-mono text-[10px] uppercase text-accent">EDIT</span>}
          </div>
        ))}
      </div>
    )
  }
  function TrainingList({ items }: { items: TrainingNode[] }) {
    return (
      <div className="pl-5 divide-y divide-grey-mid border-t border-grey-mid">
        {items.map((t) => (
          <div
            key={t.id}
            onClick={editMode ? () => setEditTarget({ type: 'training', id: t.id }) : undefined}
            className={`font-mono text-xs text-white flex flex-wrap items-center gap-2 py-1 ${editMode ? 'cursor-pointer hover:bg-grey-mid/20 -mx-2 px-2' : ''}`}
          >
            {t.title}
            <span className="text-grey-light text-[10px] uppercase">{t.kind}</span>
            {t.signOff && <span className="text-warning text-[10px] uppercase">sign-off</span>}
            {t.linkedToTask && <span className="text-success text-[10px] uppercase">↔ task</span>}
            {editMode && <span className="ml-auto font-mono text-[10px] uppercase text-accent">EDIT</span>}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest">STRUCTURE</h1>
        <div className="flex items-center gap-2">
          <div className="flex border border-grey-mid">
            <button
              onClick={() => setView('tree')}
              className={`font-mono text-xs uppercase px-3 py-1.5 transition-colors ${view === 'tree' ? 'bg-white text-black' : 'text-grey-light hover:text-white'}`}
            >
              TREE
            </button>
            <button
              onClick={() => setView('map')}
              className={`font-mono text-xs uppercase px-3 py-1.5 transition-colors ${view === 'map' ? 'bg-white text-black' : 'text-grey-light hover:text-white'}`}
            >
              MAP
            </button>
          </div>
          {view === 'tree' && (
            <>
              <button onClick={() => setEditMode((v) => !v)} className={`font-mono text-xs uppercase border px-3 py-1.5 transition-colors ${editMode ? 'bg-accent text-black border-accent' : 'border-grey-mid text-white hover:border-white'}`}>{editMode ? 'EDIT MODE: ON' : 'EDIT MODE'}</button>
              <button onClick={expandAll} className="font-mono text-xs uppercase border border-grey-mid px-3 py-1.5 text-white hover:border-white transition-colors">EXPAND ALL</button>
              <button onClick={collapseAll} className="font-mono text-xs uppercase border border-grey-mid px-3 py-1.5 text-white hover:border-white transition-colors">COLLAPSE ALL</button>
              <button onClick={load} className="font-mono text-xs uppercase border border-grey-mid px-3 py-1.5 text-white hover:border-white transition-colors">REFRESH</button>
            </>
          )}
        </div>
      </div>
      <p className="font-mono text-xs text-grey-light">
        {view === 'tree'
          ? editMode
            ? <span className="text-accent">EDIT MODE ON — CLICK ANY STAFF, TASK OR TRAINING ITEM TO EDIT IT.</span>
            : <>LIVE VIEW OF HOW EVERYTHING LINKS — VENUE → DEPARTMENT → <span className="text-white">SECTION</span> → STAFF · TASKS · TRAINING.</>
          : <>VISUAL LINK MAP — TRACE HOW <span className="text-white">LISTS</span>, <span className="text-white">TASKS</span> AND <span className="text-white">TRAINING/SOP</span> CONNECT TO MAP OUT WORKFLOWS.</>}
      </p>

      {view === 'map' ? (
        <StructureGraph />
      ) : loading ? (
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
                              {d.linkedDepartments && d.linkedDepartments.length > 0 && (
                                <span className="font-mono text-[9px] text-[#60A5FA] normal-case">
                                  → {d.linkedDepartments.map((l) => l.name).join(', ')}
                                </span>
                              )}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Count>{d.staff.length} STAFF</Count>
                              <Count>{d.tasks.length} TASKS</Count>
                              <Count>{d.training.length} TRAINING</Count>
                            </span>
                          </button>

                          {isOpen(`d:${d.id}`) && (
                            <div className="pl-5 py-1 space-y-1">
                              {/* Sections within this department */}
                              {d.sections.length === 0 ? (
                                <div className="font-mono text-[10px] uppercase text-grey-light italic">NO SECTIONS YET — ADD UNDER SECTIONS</div>
                              ) : (
                                d.sections.map((sec) => (
                                  <div key={sec.id} className="border-l-2 pl-3" style={{ borderColor: sec.colour ?? '#6B6B6B' }}>
                                    <button onClick={() => toggle(`s:${sec.id}`)} className="w-full flex items-center justify-between gap-2 py-0.5 text-left">
                                      <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-white">
                                        <Chevron open={isOpen(`s:${sec.id}`)} />
                                        {sec.colour && <span className="inline-block w-2 h-2 border border-grey-mid" style={{ backgroundColor: sec.colour }} />}
                                        {sec.name}
                                      </span>
                                      <span className="flex items-center gap-1.5">
                                        <Count>{sec.staff.length} STAFF</Count>
                                        <Count>{sec.tasks.length} TASKS</Count>
                                        {sec.floorPlan && (sec.floorPlan.tables > 0 || sec.floorPlan.chairs > 0) && (
                                          <Count>{sec.floorPlan.tables} TBL · {sec.floorPlan.chairs} CHR · {sec.floorPlan.equip} EQP</Count>
                                        )}
                                      </span>
                                    </button>
                                    {isOpen(`s:${sec.id}`) && (
                                      <div className="pl-3 py-0.5">
                                        <Group k={`ss:${sec.id}`} label="Staff" count={sec.staff.length} />
                                        {isOpen(`ss:${sec.id}`) && <StaffList items={sec.staff} />}
                                        <Group k={`st:${sec.id}`} label="Tasks" count={sec.tasks.length} />
                                        {isOpen(`st:${sec.id}`) && <TaskList items={sec.tasks} />
                                        }
                                        {(sec.inventoryItems ?? []).length > 0 && (
                                          <>
                                            <Group k={`si:${sec.id}`} label="Stored Items" count={sec.inventoryItems!.length} />
                                            {isOpen(`si:${sec.id}`) && (
                                              <div className="pl-5 divide-y divide-grey-mid border-t border-grey-mid">
                                                {sec.inventoryItems!.map((inv) => (
                                                  <div key={inv.id} className="flex items-center gap-2 py-1 font-mono text-xs text-white">
                                                    {inv.imageUrls && Array.isArray(inv.imageUrls) && inv.imageUrls.length > 0 && (
                                                      // eslint-disable-next-line @next/next/no-img-element
                                                      <img src={inv.imageUrls[0]} alt={inv.name} className="w-5 h-5 object-cover border border-grey-mid" />
                                                    )}
                                                    <span>{inv.name}</span>
                                                    <span className="text-grey-light text-[10px]">{inv.unit} · QTY {inv.totalQty}</span>
                                                    {inv.storageNotes && <span className="text-grey-light text-[10px] truncate max-w-[200px]">{inv.storageNotes}</span>}
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </>
                                        )}
                                        {sec.floorPlan && (sec.floorPlan.tables > 0 || sec.floorPlan.chairs > 0) && (
                                          <>
                                            <Group k={`sf:${sec.id}`} label="Floor Plan" count={sec.floorPlan.tables + sec.floorPlan.chairs} />
                                            {isOpen(`sf:${sec.id}`) && (
                                              <div className="pl-5 space-y-0.5">
                                                <div className="font-mono text-[10px] text-white">{sec.floorPlan.tables} TABLES{sec.floorPlan.tables > 0 ? ` · ${sec.floorPlan.equip} EQUIPMENT ITEMS` : ''}</div>
                                                <div className="font-mono text-[10px] text-white">{sec.floorPlan.chairs} CHAIRS</div>
                                              </div>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ))
                              )}

                              {/* Department-level (not in any section) */}
                              <Group k={`ds:${d.id}`} label="Dept staff" count={d.staff.length} />
                              {isOpen(`ds:${d.id}`) && <StaffList items={d.staff} />}
                              <Group k={`dt:${d.id}`} label="Dept tasks (no section)" count={d.tasks.length} />
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

      {editTarget?.type === 'task' && (
        <TaskEditModal taskId={editTarget.id} role={role} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); load() }} />
      )}
      {editTarget?.type === 'training' && (
        <TrainingEditModal moduleId={editTarget.id} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); load() }} />
      )}
      {editTarget?.type === 'staff' && (
        <StaffEditModal staffId={editTarget.id} role={role} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); load() }} />
      )}

      <Modal isOpen={connection != null} onClose={() => setConnection(null)} title="CONNECTION" size="sm">
        {connection && (() => {
          const { task, link } = connection
          const meta = link.kind === 'requires'
            ? { title: 'REQUIRES TRAINING', desc: 'This task can only be completed by staff who hold this training (competency). Staff without it are flagged for follow-up.', from: task.title, arrow: 'REQUIRES', to: link.label, href: `/admin/training?module=${link.targetId}` }
            : link.kind === 'how-to'
            ? { title: 'HOW-TO GUIDE', desc: 'This training/SOP is the how-to guide for the task. It surfaces alongside the task so staff can learn how to do it.', from: link.label, arrow: 'GUIDES', to: task.title, href: `/admin/training?module=${link.targetId}` }
            : { title: 'IN CHECKLIST', desc: 'This task is part of the checklist. Editing the task updates it everywhere the checklist is used.', from: link.label, arrow: 'INCLUDES', to: task.title, href: `/admin/tasks` }
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 border-l-2" style={{ borderColor: link.colour }} />
                <span className="font-mono text-xs uppercase tracking-wider" style={{ color: link.colour }}>{meta.title}</span>
              </div>
              <div className="border border-grey-mid divide-y divide-grey-mid">
                <div className="px-3 py-2 font-mono text-xs text-white uppercase">{meta.from}</div>
                <div className="px-3 py-1 font-mono text-[10px] uppercase tracking-widest" style={{ color: link.colour }}>↓ {meta.arrow}</div>
                <div className="px-3 py-2 font-mono text-xs text-white uppercase">{meta.to}</div>
              </div>
              <p className="font-mono text-xs text-grey-light">{meta.desc}</p>
              <div className="border-l-2 pl-3 py-1 space-y-0.5" style={{ borderColor: link.colour }}>
                <div className="font-mono text-[10px] uppercase tracking-wider text-grey-light">YOU CLICKED · {link.targetType}</div>
                <div className="font-mono text-xs text-white uppercase">{link.label}</div>
                <div className="font-mono text-[10px] uppercase text-grey-light">{link.targetSub}</div>
              </div>
              <div className="flex gap-2 pt-1">
                <a href={meta.href} target="_blank" rel="noreferrer" className="font-mono text-xs uppercase border border-grey-mid px-3 py-1.5 text-white hover:border-white transition-colors">OPEN ↗</a>
                <button onClick={() => setConnection(null)} className="font-mono text-xs uppercase border border-grey-mid px-3 py-1.5 text-grey-light hover:text-white hover:border-white transition-colors">CLOSE</button>
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
