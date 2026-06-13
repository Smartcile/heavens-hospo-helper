'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { formatTime } from '@/lib/utils'

interface Note {
  id: string
  category: string
  content: string
  resolved: boolean
  authorName: string | null
  linkedModuleTitle: string | null
  createdAt: string
}

interface StaffRow {
  id: string
  name: string
  role: string
  departmentName: string | null
  completed: { taskTitle: string; completedAt: string; note: string | null }[]
  notes: Note[]
}

interface Venue { id: string; name: string }
interface ModuleLite { id: string; title: string }

const CATEGORY_OPTIONS = [
  { value: 'AREA TO WORK ON', label: 'AREA TO WORK ON' },
  { value: 'PRAISE', label: 'PRAISE' },
  { value: 'INCIDENT', label: 'INCIDENT' },
  { value: 'GENERAL', label: 'GENERAL' },
]

function localToday() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ReviewClient({ role, sessionVenueId }: { role: string; sessionVenueId: string }) {
  const [date, setDate] = useState(localToday())
  const [venueId, setVenueId] = useState(role === 'MANAGER' ? sessionVenueId : '')
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [modules, setModules] = useState<ModuleLite[]>([])
  const [loading, setLoading] = useState(true)

  // Per-staff draft note form
  const [draft, setDraft] = useState<Record<string, { category: string; content: string; assignModuleId: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ date })
    if (venueId) params.set('venueId', venueId)
    const r = await fetch(`/api/admin/review?${params}`)
    const data = await r.json()
    setStaff(data.staff ?? [])
    setLoading(false)
  }

  async function loadMeta() {
    const [vR, mR] = await Promise.all([fetch('/api/admin/venues'), fetch('/api/admin/training')])
    const [vData, mData] = await Promise.all([vR.json(), mR.json()])
    setVenues(vData)
    setModules((mData ?? []).map((m: ModuleLite) => ({ id: m.id, title: m.title })))
  }

  useEffect(() => { loadMeta() }, [])
  useEffect(() => { load() }, [date, venueId])

  function setDraftFor(id: string, patch: Partial<{ category: string; content: string; assignModuleId: string }>) {
    setDraft((prev) => {
      const current = prev[id] ?? { category: 'AREA TO WORK ON', content: '', assignModuleId: '' }
      return { ...prev, [id]: { ...current, ...patch } }
    })
  }

  async function addNote(staffId: string) {
    const d = draft[staffId]
    if (!d?.content?.trim()) return
    setBusy(staffId)
    await fetch('/api/admin/review/note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staffId,
        shiftDate: date,
        category: d.category,
        content: d.content,
        assignModuleId: d.assignModuleId || null,
      }),
    })
    setDraft((prev) => ({ ...prev, [staffId]: { category: 'AREA TO WORK ON', content: '', assignModuleId: '' } }))
    await load()
    setBusy(null)
  }

  async function toggleResolved(note: Note) {
    await fetch(`/api/admin/review/note/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved: !note.resolved }),
    })
    load()
  }

  async function deleteNote(id: string) {
    if (!confirm('DELETE THIS NOTE?')) return
    await fetch(`/api/admin/review/note/${id}`, { method: 'DELETE' })
    load()
  }

  const moduleOptions = [
    { value: '', label: 'NO TRAINING ASSIGNED' },
    ...modules.map((m) => ({ value: m.id, label: m.title })),
  ]
  const venueOptions = [{ value: '', label: 'ALL VENUES' }, ...venues.map((v) => ({ value: v.id, label: v.name }))]

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest">END-OF-DAY REVIEW</h1>
          <p className="font-mono text-xs text-grey-light mt-1 uppercase">
            REVIEW THE SHIFT, NOTE AREAS TO WORK ON, ASSIGN FOLLOW-UP TRAINING
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {role === 'ADMIN' && (
            <div className="w-44">
              <Select value={venueId} onChange={(e) => setVenueId(e.target.value)} options={venueOptions} />
            </div>
          )}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-grey-dark border border-grey-mid text-white font-mono text-xs px-3 py-2 outline-none focus:border-white"
          />
        </div>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : staff.length === 0 ? (
        <p className="font-mono text-xs text-grey-light">NO STAFF IN SCOPE.</p>
      ) : (
        <div className="space-y-3">
          {staff.map((s) => {
            const d = draft[s.id] ?? { category: 'AREA TO WORK ON', content: '', assignModuleId: '' }
            return (
              <div key={s.id} className="bg-grey-dark border border-grey-mid">
                <div className="p-4 border-b border-grey-mid flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold uppercase text-white">{s.name}</span>
                    {s.departmentName && <Badge>{s.departmentName}</Badge>}
                  </div>
                  <Badge variant={s.completed.length > 0 ? 'success' : 'warning'}>
                    {s.completed.length} DONE
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                  {/* What they did */}
                  <div>
                    <div className="font-mono text-xs uppercase tracking-wider text-grey-light mb-2">COMPLETED THIS SHIFT</div>
                    {s.completed.length === 0 ? (
                      <p className="font-mono text-xs text-grey-light">NOTHING RECORDED.</p>
                    ) : (
                      <ul className="space-y-1">
                        {s.completed.map((c, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 bg-success flex-shrink-0 mt-1.5" />
                            <span className="font-mono text-xs text-white">{c.taskTitle}</span>
                            <span className="font-mono text-xs text-grey-light ml-auto flex-shrink-0">{formatTime(c.completedAt)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Notes */}
                  <div className="space-y-3">
                    <div className="font-mono text-xs uppercase tracking-wider text-grey-light">NOTES</div>
                    {s.notes.map((n) => (
                      <div key={n.id} className={`border border-grey-mid p-2 ${n.resolved ? 'opacity-50' : ''}`}>
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant={n.category === 'PRAISE' ? 'success' : n.category === 'INCIDENT' ? 'danger' : 'warning'}>
                            {n.category}
                          </Badge>
                          <div className="flex gap-2">
                            <button onClick={() => toggleResolved(n)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">
                              {n.resolved ? 'REOPEN' : 'RESOLVE'}
                            </button>
                            <button onClick={() => deleteNote(n.id)} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">DEL</button>
                          </div>
                        </div>
                        <p className="font-sans text-xs text-white mt-1">{n.content}</p>
                        {n.linkedModuleTitle && (
                          <p className="font-mono text-xs text-grey-light mt-1">→ TRAINING: {n.linkedModuleTitle}</p>
                        )}
                      </div>
                    ))}

                    {/* Add note */}
                    <div className="space-y-2 border-t border-grey-mid pt-2">
                      <Select value={d.category} onChange={(e) => setDraftFor(s.id, { category: e.target.value })} options={CATEGORY_OPTIONS} />
                      <textarea
                        value={d.content}
                        onChange={(e) => setDraftFor(s.id, { content: e.target.value })}
                        placeholder="Add a note for this person..."
                        className="w-full bg-grey-dark border border-grey-mid text-white font-sans text-xs px-3 py-2 outline-none focus:border-white min-h-[60px] resize-y placeholder:text-grey-light"
                      />
                      <Select value={d.assignModuleId} onChange={(e) => setDraftFor(s.id, { assignModuleId: e.target.value })} options={moduleOptions} />
                      <Button size="sm" onClick={() => addNote(s.id)} loading={busy === s.id} disabled={!d.content?.trim()}>
                        ADD NOTE
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
