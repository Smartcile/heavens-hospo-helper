'use client'

// Admin availability page (TEAM → AVAILABILITY). Three jobs in one place:
// confirm or decline declared unavailability / time off, resolve workers' edit
// requests, and override any day directly (past, locked and approved included).

import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { getActiveVenueId } from '@/lib/active-venue'
import { AvailabilityBar } from '@/components/availability/AvailabilityBar'
import { AvailabilityDayEditor, type EditorDraft, type EditorSaveOptions } from '@/components/availability/AvailabilityDayEditor'
import { formatDateRange } from '@/lib/date-nav'
import { keyOfDay, mondayOf, parseDay, shiftDay, weekKeys } from '@/lib/date-nav'
import {
  describeSeriesEnd,
  describeWindows,
  statusMeta,
  type AvailabilityEntry,
  type AvailabilityPayloadLike,
  type AvailabilityPreset,
  type AvailabilityScope,
  type AvailabilitySeries,
} from '@/lib/availability'

const WEEKDAY = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

interface AdminStaff {
  id: string
  firstName: string
  lastName: string
  employmentType: string | null
}

interface AdminEditRequest {
  id: string
  staffId: string
  date: string
  scope: AvailabilityScope
  seriesId: string | null
  action: 'SET' | 'CLEAR'
  payload: { availability?: AvailabilityPayloadLike | null } | null
  reason: string | null
  status: string
  reviewNote: string | null
  createdAt: string
}

interface AdminData {
  venueId: string
  staff: AdminStaff[]
  entries: AvailabilityEntry[]
  series: (AvailabilitySeries & { staffId: string })[]
  presets: AvailabilityPreset[]
  queue: {
    pending: AvailabilityEntry[]
    requests: AdminEditRequest[]
  }
}

function payloadSummary(req: AdminEditRequest): string {
  if (req.action === 'CLEAR') return 'CLEAR THIS DAY'
  const av = req.payload?.availability
  if (!av) return '—'
  if (av.isAllDay) return `ALL DAY ${av.type}`
  return describeWindows(av.windows, false, av.type)
}

export function AvailabilityAdminClient({ role, sessionVenueId, defaultVenueId }: {
  role: string
  sessionVenueId: string
  defaultVenueId?: string | null
}) {
  const [venueId] = useState(() => getActiveVenueId(role, sessionVenueId, defaultVenueId))
  const [weekStart, setWeekStart] = useState(() => mondayOf(keyOfDay(new Date())))
  const [data, setData] = useState<AdminData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editor, setEditor] = useState<{ staffId: string; date: string } | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})

  const weekDays = useMemo(() => weekKeys(weekStart), [weekStart])
  const today = keyOfDay(new Date())

  async function load() {
    if (!venueId) { setLoading(false); return }
    setLoading(true); setError('')
    const r = await fetch(`/api/admin/availability?venueId=${venueId}&start=${weekStart}&end=${shiftDay(weekStart, 6)}`)
    const d = await r.json()
    if (!r.ok) { setError((d.error ?? 'LOAD FAILED').toUpperCase()); setLoading(false); return }
    setData(d)
    setLoading(false)
  }

  useEffect(() => { load() }, [venueId, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  const staffName = (id: string) => {
    const s = data?.staff.find((x) => x.id === id)
    return s ? `${s.firstName} ${s.lastName}` : 'STAFF'
  }

  const entryFor = (staffId: string, date: string) =>
    data?.entries.find((e) => e.staffId === staffId && e.date === date) ?? null

  const pendingGroups = useMemo(() => {
    const groups = new Map<string, AvailabilityEntry[]>()
    for (const e of data?.queue.pending ?? []) {
      const key = e.seriesId ? `${e.staffId}:${e.seriesId}` : `${e.staffId}:${e.id}`
      groups.set(key, [...(groups.get(key) ?? []), e])
    }
    return [...groups.entries()]
  }, [data])

  async function review(kind: 'ids' | 'series', ids: string[], staffId: string, seriesId: string | null, action: 'APPROVE' | 'DECLINE', noteKey: string) {
    setBusy(true)
    const body: Record<string, unknown> = { venueId, action, reviewNote: notes[noteKey] ?? null }
    if (kind === 'series' && seriesId) { body.seriesId = seriesId; body.staffId = staffId }
    else body.ids = ids
    const r = await fetch('/api/admin/availability/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError((d.error ?? 'REVIEW FAILED').toUpperCase()); return }
    load()
  }

  async function resolveRequest(id: string, action: 'APPLY' | 'DISCARD') {
    setBusy(true)
    const r = await fetch(`/api/admin/availability/requests/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reviewNote: notes[`req:${id}`] ?? null }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError((d.error ?? 'REQUEST FAILED').toUpperCase()); return }
    load()
  }

  async function save(staffId: string, date: string, draft: EditorDraft, options: EditorSaveOptions) {
    const entry = entryFor(staffId, date)
    setBusy(true); setError('')
    const r = await fetch('/api/admin/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venueId,
        staffId,
        date,
        availability: {
          isAllDay: draft.isAllDay,
          type: draft.type,
          windows: draft.windows,
          timeOff: draft.timeOff,
          notes: draft.notes,
        },
        repeat: options.repeat,
        scope: options.scope,
        seriesId: entry?.seriesId ?? null,
      }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError((d.error ?? 'SAVE FAILED').toUpperCase()); return }
    setEditor(null)
    load()
  }

  async function clear(staffId: string, date: string, options: { scope: AvailabilityScope | null }) {
    const entry = entryFor(staffId, date)
    setBusy(true); setError('')
    const r = await fetch('/api/admin/availability/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, staffId, date, scope: options.scope, seriesId: entry?.seriesId ?? null }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError((d.error ?? 'CLEAR FAILED').toUpperCase()); return }
    setEditor(null)
    load()
  }

  const editorEntry = editor ? entryFor(editor.staffId, editor.date) : null
  const editorSeries = editorEntry?.seriesId
    ? data?.series.find((s) => s.id === editorEntry.seriesId) ?? null
    : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white">AVAILABILITY</h1>
          <p className="font-mono text-xs uppercase text-grey-light mt-1">CONFIRM DECLARATIONS · RESOLVE EDIT REQUESTS · OVERRIDE ANY DAY</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(shiftDay(weekStart, -7))} className="font-mono text-xs text-grey-light border border-grey-mid px-3 py-1.5 hover:border-white hover:text-white">&lt;&lt;</button>
          <button onClick={() => setWeekStart(mondayOf(today))} className="font-mono text-xs text-grey-light border border-grey-mid px-3 py-1.5 hover:border-white hover:text-white">TODAY</button>
          <button onClick={() => setWeekStart(shiftDay(weekStart, 7))} className="font-mono text-xs text-grey-light border border-grey-mid px-3 py-1.5 hover:border-white hover:text-white">&gt;&gt;</button>
          <span className="font-mono text-xs uppercase text-white ml-2">{formatDateRange({ start: weekStart, end: shiftDay(weekStart, 6) })}</span>
        </div>
      </div>

      {error && <p className="font-mono text-xs text-danger border border-danger/50 bg-danger/10 px-3 py-2">{error}</p>}

      {/* Queue */}
      <div className="border border-grey-mid p-4 space-y-4">
        <h2 className="font-mono text-xs uppercase tracking-wider text-grey-light">WAITING FOR CONFIRMATION</h2>

        {pendingGroups.length === 0 && (data?.queue.requests.length ?? 0) === 0 && (
          <p className="font-mono text-xs uppercase text-grey-light">NOTHING WAITING.</p>
        )}

        {pendingGroups.map(([key, rows]) => {
          const first = rows[0]
          const dates = rows.map((r) => r.date).sort()
          const range = dates[0] === dates[dates.length - 1]
            ? dates[0]
            : `${dates[0]} → ${dates[dates.length - 1]}`
          return (
            <div key={key} className="border border-grey-mid p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-sm text-white uppercase">{staffName(first.staffId ?? '')}</span>
                  <span className="font-mono text-xs text-grey-light ml-2">{range}{rows.length > 1 ? ` · ${rows.length} DAYS` : ''}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {first.timeOff && <span className="font-mono text-2xs uppercase px-1.5 py-0.5 border border-warning text-warning">TIME OFF — CHECK LEAVE PAY</span>}
                  {first.seriesId && <span className="font-mono text-2xs uppercase px-1.5 py-0.5 border border-accent text-accent">{describeSeriesEnd(first.seriesEndDate)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1"><AvailabilityBar windows={first.windows} isAllDay={first.isAllDay} type={first.type} /></div>
                <span className="font-mono text-2xs uppercase text-grey-light">{describeWindows(first.windows, first.isAllDay, first.type)}</span>
              </div>
              {first.notes && <p className="font-mono text-2xs uppercase text-grey-light">NOTE: {first.notes}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={notes[key] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [key]: e.target.value })}
                  placeholder="REVIEW NOTE (OPTIONAL)"
                  className="field flex-1 min-w-[10rem]"
                />
                <button disabled={busy} onClick={() => review(first.seriesId ? 'series' : 'ids', rows.map((r) => r.id!).filter(Boolean), first.staffId ?? '', first.seriesId, 'APPROVE', key)}
                  className="h-9 px-3 bg-success text-black font-mono text-xs uppercase font-bold hover:opacity-80 disabled:opacity-40">CONFIRM</button>
                <button disabled={busy} onClick={() => review(first.seriesId ? 'series' : 'ids', rows.map((r) => r.id!).filter(Boolean), first.staffId ?? '', first.seriesId, 'DECLINE', key)}
                  className="h-9 px-3 border border-danger text-danger font-mono text-xs uppercase hover:bg-danger hover:text-black disabled:opacity-40">DECLINE</button>
              </div>
            </div>
          )
        })}

        {data?.queue.requests.map((req) => (
          <div key={req.id} className="border border-accent/50 bg-accent/5 p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-mono text-sm text-white uppercase">{staffName(req.staffId)}</span>
                <span className="font-mono text-xs text-grey-light ml-2">EDIT REQUEST · {req.date} · {req.scope === 'THIS' ? 'JUST THIS DAY' : req.scope === 'FROM' ? 'FROM THIS DAY' : 'ALL IN SERIES'}</span>
              </div>
              <span className="font-mono text-2xs uppercase text-accent">{req.action} · {payloadSummary(req)}</span>
            </div>
            {req.reason && <p className="font-mono text-2xs uppercase text-grey-light">WORKER: {req.reason}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={notes[`req:${req.id}`] ?? ''}
                onChange={(e) => setNotes({ ...notes, [`req:${req.id}`]: e.target.value })}
                placeholder="REVIEW NOTE (OPTIONAL)"
                className="field flex-1 min-w-[10rem]"
              />
              <button disabled={busy} onClick={() => resolveRequest(req.id, 'APPLY')}
                className="h-9 px-3 bg-white text-black font-mono text-xs uppercase font-bold hover:bg-accent disabled:opacity-40">APPLY</button>
              <button disabled={busy} onClick={() => resolveRequest(req.id, 'DISCARD')}
                className="h-9 px-3 border border-grey-mid text-grey-light font-mono text-xs uppercase hover:border-white hover:text-white disabled:opacity-40">DISCARD</button>
            </div>
          </div>
        ))}
      </div>

      {/* Week grid */}
      <div className="border border-grey-mid overflow-auto">
        {loading ? (
          <p className="p-4 font-mono text-xs text-grey-light loading-cursor">LOADING</p>
        ) : data && data.staff.length > 0 ? (
          <div className="grid min-w-[720px]" style={{ gridTemplateColumns: `180px repeat(7, minmax(96px, 1fr))` }}>
            <div className="sticky top-0 left-0 z-20 bg-black border-b border-r border-grey-mid font-mono text-2xs uppercase text-white px-3 py-2">TEAM</div>
            {weekDays.map((d, i) => {
              const dobj = parseDay(d)
              return (
                <div key={d} className={`sticky top-0 z-10 bg-black border-b border-r border-grey-mid px-2 py-2 ${d === today ? 'border-t-2 border-t-accent' : ''}`}>
                  <div className="font-mono text-2xs uppercase text-white">{WEEKDAY[i]} {dobj.getUTCDate()}</div>
                </div>
              )
            })}
            {data.staff.map((s) => (
              <div key={s.id} className="contents">
                <div className="sticky left-0 z-10 bg-grey-dark border-b border-r border-grey-mid px-3 py-2">
                  <div className="font-mono text-xs text-white uppercase truncate">{s.firstName} {s.lastName}</div>
                  <div className="font-mono text-2xs text-grey-light uppercase">{s.employmentType ?? ''}</div>
                </div>
                {weekDays.map((d) => {
                  const entry = entryFor(s.id, d)
                  return (
                    <button
                      key={d}
                      onClick={() => setEditor({ staffId: s.id, date: d })}
                      className={`border-b border-r border-grey-mid min-h-[64px] p-1.5 text-left hover:bg-black/30 transition-colors ${entry ? '' : 'bg-black/10'}`}
                    >
                      {entry ? (
                        <div className="space-y-1">
                          <AvailabilityBar windows={entry.windows} isAllDay={entry.isAllDay} type={entry.type} height="h-2" />
                          <div className="flex flex-wrap gap-1 items-center">
                            {entry.status !== 'APPROVED' && (
                              <span className={`font-mono text-2xs uppercase border px-1 ${statusMeta(entry.status).badge}`}>{entry.status}</span>
                            )}
                            {entry.timeOff && <span className="font-mono text-2xs uppercase text-warning">TO</span>}
                            {entry.seriesId && <span className="font-mono text-2xs uppercase text-accent">⟳</span>}
                          </div>
                        </div>
                      ) : (
                        <span className="font-mono text-2xs uppercase text-grey-mid">—</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        ) : (
          <p className="p-4 font-mono text-xs text-grey-light">NO STAFF FOR THIS VENUE.</p>
        )}
      </div>

      {/* Editor */}
      <Modal
        isOpen={!!editor}
        onClose={() => { if (!busy) setEditor(null) }}
        title={editor ? `AVAILABILITY — ${staffName(editor.staffId)}` : 'AVAILABILITY'}
        size="lg"
      >
        {editor && (
          <AvailabilityDayEditor
            key={`${editor.staffId}:${editor.date}`}
            dateKey={editor.date}
            entry={editorEntry}
            series={editorSeries}
            presets={data?.presets ?? []}
            canOverride
            busy={busy}
            error={error || null}
            onSave={(draft, options) => save(editor.staffId, editor.date, draft, options)}
            onClear={(options) => clear(editor.staffId, editor.date, options)}
            onClose={() => { if (!busy) setEditor(null) }}
          />
        )}
      </Modal>
    </div>
  )
}
