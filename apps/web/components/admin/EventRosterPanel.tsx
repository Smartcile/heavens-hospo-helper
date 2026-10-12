'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { formatDateLong, keyOfDay, parseDay } from '@/lib/date-nav'
import { buildRoomGrid, formatEventTime } from '@/lib/event-roster'
import { openShiftRoleName, seatFillStatus } from '@/lib/open-shifts'

interface Feed {
  id: string
  name: string
  colour: string | null
  floorPlanSlug: string | null
  floorPlanName: string | null
  lastSyncedAt: string | null
}

interface StaffingLine {
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

interface Claim {
  id: string
  staffId: string
  staffName: string
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN'
  note: string | null
  createdAt: string
}

interface OpenShift {
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
  claims: Claim[]
}

interface RosterEvent {
  id: string
  feedId: string | null
  title: string
  description: string | null
  location: string | null
  startsAt: Date
  endsAt: Date | null
  allDay: boolean
  floorPlanSlug: string | null
  floorPlanName: string | null
  staffing: StaffingLine[]
  openShifts: OpenShift[]
}

interface QueueClaim {
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

interface Position {
  id: string
  name: string
  colour: string | null
}

interface Payload {
  feeds: Feed[]
  events: RosterEvent[]
  queue: QueueClaim[]
  positions: Position[]
  lastSyncedAt: string | null
}

interface DraftLine {
  key: string
  positionId: string
  label: string
  count: string
  startTime: string
  endTime: string
  breakMinutes: string
  note: string
}

const WEEKDAY = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const GRID_LINE = 'border-grey-light/50'

function hhmmOf(date: Date): string {
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

function draftFromLine(line: StaffingLine, i: number): DraftLine {
  return {
    key: line.id || `line-${i}`,
    positionId: line.positionId ?? '',
    label: line.label ?? '',
    count: String(line.count),
    startTime: line.startTime,
    endTime: line.endTime,
    breakMinutes: String(line.breakMinutes),
    note: line.note ?? '',
  }
}

function newDraft(event: RosterEvent): DraftLine {
  return {
    key: `new-${Math.random().toString(36).slice(2)}`,
    positionId: '',
    label: '',
    count: '1',
    startTime: event.allDay ? '09:00' : hhmmOf(event.startsAt),
    endTime: event.endsAt && !event.allDay ? hhmmOf(event.endsAt) : '17:00',
    breakMinutes: '0',
    note: '',
  }
}

export function EventRosterPanel({
  venueId,
  weekStart,
  weekDays,
}: {
  venueId: string
  weekStart: string
  weekDays: string[]
}) {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const [openEventId, setOpenEventId] = useState<string | null>(null)
  const [draftLines, setDraftLines] = useState<DraftLine[]>([])
  const [confirmFind, setConfirmFind] = useState(false)
  const [showQueue, setShowQueue] = useState(false)

  const start = weekStart
  const end = weekDays[weekDays.length - 1] ?? weekStart
  const todayKey = keyOfDay(new Date())

  const load = useCallback(async () => {
    if (!venueId) return
    setLoading(true)
    setError('')
    const r = await fetch(`/api/admin/event-roster?venueId=${venueId}&start=${start}&end=${end}`)
    const d = await r.json().catch(() => null)
    if (!r.ok || !d) {
      setError(d?.error ?? 'LOAD FAILED')
      setLoading(false)
      return
    }
    setData({
      feeds: d.feeds ?? [],
      events: (d.events ?? []).map((e: RosterEvent & { startsAt: string; endsAt: string | null }) => ({
        ...e,
        startsAt: new Date(e.startsAt),
        endsAt: e.endsAt ? new Date(e.endsAt) : null,
      })),
      queue: d.queue ?? [],
      positions: d.positions ?? [],
      lastSyncedAt: d.lastSyncedAt ?? null,
    })
    setLoading(false)
  }, [venueId, start, end])

  useEffect(() => {
    void load()
  }, [load])

  const grid = useMemo(() => {
    if (!data) return null
    return buildRoomGrid(data.feeds, data.events, start, end)
  }, [data, start, end])

  const openEvent = useMemo(
    () => (openEventId ? data?.events.find((e) => e.id === openEventId) ?? null : null),
    [data, openEventId],
  )

  function openEventModal(event: RosterEvent) {
    setOpenEventId(event.id)
    setDraftLines(event.staffing.map(draftFromLine))
    setError('')
  }

  async function syncNow() {
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
      setError(d.error ?? 'SYNC FAILED')
      return
    }
    if (d.errors?.length) setError(d.errors.join(' · ').toUpperCase())
    void load()
  }

  async function saveStaffing() {
    if (!openEvent) return
    setBusy(true)
    setError('')
    const lines = draftLines
      .filter((l) => l.positionId || l.label.trim())
      .map((l, i) => ({
        id: l.key,
        positionId: l.positionId || null,
        label: l.label.trim() || null,
        count: Number(l.count) || 1,
        startTime: l.startTime,
        endTime: l.endTime,
        breakMinutes: Number(l.breakMinutes) || 0,
        note: l.note.trim() || null,
        sortOrder: i,
      }))
    const r = await fetch(`/api/admin/event-roster/${openEvent.id}/staffing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, lines }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) {
      setError(d.error ?? 'SAVE FAILED')
      return
    }
    await load()
  }

  async function findStaff() {
    if (!openEvent) return
    setBusy(true)
    setError('')
    const r = await fetch(`/api/admin/event-roster/${openEvent.id}/find-staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    setConfirmFind(false)
    if (!r.ok) {
      setError(d.error ?? 'FAILED')
      return
    }
    await load()
  }

  async function cancelSeat(openShiftId: string) {
    if (!confirm('CANCEL THIS LISTED SHIFT? ANY PENDING CLAIMS ARE DECLINED.')) return
    setBusy(true)
    const r = await fetch(`/api/admin/open-shifts/${openShiftId}`, { method: 'DELETE' })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) {
      setError(d.error ?? 'FAILED')
      return
    }
    await load()
  }

  async function reviewClaim(claimId: string, action: 'APPROVE' | 'DECLINE') {
    setBusy(true)
    setError('')
    const r = await fetch(`/api/admin/open-shift-claims/${claimId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) {
      setError(d.error ?? 'FAILED')
      return
    }
    await load()
  }

  const totalSeats = useMemo(() => {
    if (!data) return 0
    return data.events.reduce((n, e) => n + e.openShifts.filter((s) => s.status !== 'CANCELLED').length, 0)
  }, [data])

  const seatSummary = openEvent ? seatFillStatus(openEvent.openShifts) : { filled: 0, total: 0 }
  const hasListed = seatSummary.total > 0

  return (
    <div className="space-y-4">
      {/* Event toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={syncNow} loading={syncing}>↻ SYNC CALENDARS</Button>
        <Button size="sm" variant="ghost" onClick={() => setShowQueue(true)}>
          CLAIMS{data && data.queue.length > 0 ? ` (${data.queue.length})` : ''}
        </Button>
        <span className="font-mono text-2xs uppercase text-grey-light">
          {totalSeats > 0 ? `${totalSeats} LISTED SHIFT${totalSeats === 1 ? '' : 'S'}` : 'NO LISTED SHIFTS THIS WEEK'}
        </span>
        <span className="font-mono text-2xs uppercase text-grey-light ml-auto">
          {data?.lastSyncedAt ? `SYNCED ${new Date(data.lastSyncedAt).toLocaleString('en-NZ')}` : 'NOT YET SYNCED'}
        </span>
      </div>

      {error && <p className="font-mono text-xs text-danger">{error}</p>}

      {/* Rooms × days grid */}
      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : !data || data.events.length === 0 ? (
        <div className="border border-grey-mid p-4 space-y-2">
          <p className="font-mono text-xs text-grey-light">NO EVENTS IMPORTED FOR THIS RANGE.</p>
          <p className="font-mono text-2xs uppercase text-grey-light">
            ADD ROOM CALENDARS IN SETTINGS → INTEGRATIONS, THEN SYNC CALENDARS.
          </p>
        </div>
      ) : (
        <div className={`border ${GRID_LINE} overflow-auto max-h-[70vh]`}>
          <div className="grid" style={{ gridTemplateColumns: `240px repeat(${weekDays.length}, minmax(160px, 1fr))`, minWidth: 240 + weekDays.length * 160 }}>
            <div className={`sticky top-0 left-0 z-20 bg-black border-b-2 border-r ${GRID_LINE} font-mono text-2xs uppercase text-white px-3 py-2`}>ROOM</div>
            {weekDays.map((d, di) => (
              <div key={d} className={`sticky top-0 z-10 bg-black border-b-2 border-r ${GRID_LINE} px-3 py-2 ${todayKey === d ? 'border-l-2 border-l-accent' : ''}`}>
                <div className="font-mono text-2xs uppercase text-white">{WEEKDAY[di]} {parseDay(d).getUTCDate()}</div>
                {todayKey === d && <div className="font-mono text-2xs uppercase text-accent">TODAY</div>}
              </div>
            ))}

            {(grid?.rooms ?? []).map((room) => (
              <div key={room.id} className="contents">
                <div className={`sticky left-0 z-10 bg-grey-dark border-b border-r ${GRID_LINE} px-3 py-2`}>
                  <div className="flex items-center gap-2">
                    {room.colour && <span className="w-2 h-2 shrink-0" style={{ backgroundColor: room.colour }} />}
                    <span className="font-mono text-2xs uppercase tracking-wider text-white">{room.name}</span>
                  </div>
                  {room.floorPlanSlug && <div className="font-mono text-2xs uppercase text-grey-light mt-0.5">LAYOUT LINKED</div>}
                </div>
                {weekDays.map((d) => {
                  const events = grid?.cells[room.id]?.[d] ?? []
                  return (
                    <div key={d} className={`border-b border-r ${GRID_LINE} min-h-[72px] p-1 space-y-1`}>
                      {events.map((e) => {
                        const fill = seatFillStatus(e.openShifts)
                        const roles = new Set(e.staffing.map((l) => l.positionName ?? l.label ?? 'ROLE'))
                        return (
                          <button
                            key={e.id}
                            onClick={() => openEventModal(e)}
                            className="block w-full text-left border border-grey-mid bg-black/40 hover:border-white px-2 py-1 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-2xs font-bold text-white truncate">
                                {formatEventTime(e)} {e.title}
                              </span>
                              {fill.total > 0 && (
                                <span className={`font-mono text-2xs border px-1 shrink-0 ${fill.filled >= fill.total ? 'border-success text-success' : 'border-warning text-warning'}`}>
                                  {fill.filled}/{fill.total}
                                </span>
                              )}
                            </div>
                            {e.location && <div className="font-mono text-2xs text-grey-light truncate">{e.location}</div>}
                            {roles.size > 0 && (
                              <div className="font-mono text-2xs text-accent truncate">
                                {fill.total > 0 ? 'LISTED' : 'REQUIRES'}: {[...roles].join(' · ')}
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event modal */}
      {openEvent && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setOpenEventId(null)}>
          <div className="bg-grey-dark border border-grey-mid p-5 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-mono text-xs uppercase tracking-widest text-white">{openEvent.title}</h2>
                <p className="font-mono text-2xs uppercase text-grey-light mt-1">
                  {formatDateLong(keyOfDay(openEvent.startsAt))} — {openEvent.allDay ? 'ALL DAY' : `${formatEventTime(openEvent)}${openEvent.endsAt ? ` – ${hhmmOf(openEvent.endsAt)}` : ''}`}
                  {openEvent.location ? ` · ${openEvent.location}` : ''}
                  {openEvent.floorPlanName ? ` · LAYOUT: ${openEvent.floorPlanName}` : ''}
                </p>
              </div>
              <span className={`font-mono text-2xs border px-2 py-1 ${hasListed ? (seatSummary.filled >= seatSummary.total ? 'border-success text-success' : 'border-warning text-warning') : 'border-grey-mid text-grey-light'}`}>
                {hasListed ? `${seatSummary.filled}/${seatSummary.total} FILLED` : 'NOT LISTED'}
              </span>
            </div>

            {/* Requirements editor */}
            <div className="border border-grey-mid p-3 space-y-3">
              <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">REQUIRED STAFF</h3>
              {draftLines.length === 0 && (
                <p className="font-mono text-2xs uppercase text-grey-light">NO ROLES YET — ADD THE POSITIONS THIS EVENT NEEDS.</p>
              )}
              {draftLines.map((line, i) => (
                <div key={line.key} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3">
                    <Select label="Position" value={line.positionId}
                      onChange={(e) => setDraftLines((prev) => prev.map((l, j) => (j === i ? { ...l, positionId: e.target.value } : l)))}
                      options={[{ value: '', label: 'CUSTOM LABEL' }, ...(data?.positions ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
                  </div>
                  <div className="col-span-3">
                    <Input label="Label" value={line.label} placeholder="IF NO POSITION"
                      onChange={(e) => setDraftLines((prev) => prev.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))} />
                  </div>
                  <div className="col-span-1">
                    <Input label="#" type="number" min="1" value={line.count}
                      onChange={(e) => setDraftLines((prev) => prev.map((l, j) => (j === i ? { ...l, count: e.target.value } : l)))} />
                  </div>
                  <div className="col-span-2">
                    <Input label="Start" type="time" value={line.startTime}
                      onChange={(e) => setDraftLines((prev) => prev.map((l, j) => (j === i ? { ...l, startTime: e.target.value } : l)))} />
                  </div>
                  <div className="col-span-2">
                    <Input label="End" type="time" value={line.endTime}
                      onChange={(e) => setDraftLines((prev) => prev.map((l, j) => (j === i ? { ...l, endTime: e.target.value } : l)))} />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button size="sm" variant="danger" onClick={() => setDraftLines((prev) => prev.filter((_, j) => j !== i))}>✕</Button>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => setDraftLines((prev) => [...prev, newDraft(openEvent)])}>+ ADD ROLE</Button>
                <Button size="sm" variant="ghost" onClick={saveStaffing} loading={busy} disabled={hasListed}>SAVE REQUIREMENTS</Button>
                {!hasListed && draftLines.some((l) => l.positionId || l.label.trim()) && (
                  <Button size="sm" onClick={() => setConfirmFind(true)}>FIND STAFF</Button>
                )}
              </div>
              {hasListed && (
                <p className="font-mono text-2xs uppercase text-grey-light">SHIFTS ARE LISTED FOR THIS EVENT — CANCEL THEM BELOW TO EDIT REQUIREMENTS.</p>
              )}
            </div>

            {/* Listed shifts + claims */}
            <div className="border border-grey-mid p-3 space-y-2">
              <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">LISTED SHIFTS</h3>
              {openEvent.openShifts.length === 0 && (
                <p className="font-mono text-2xs uppercase text-grey-light">NOTHING LISTED YET.</p>
              )}
              {openEvent.openShifts.map((seat) => {
                const pending = seat.claims.filter((c) => c.status === 'PENDING')
                const approved = seat.claims.find((c) => c.status === 'APPROVED')
                return (
                  <div key={seat.id} className="border border-grey-mid px-3 py-2 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-mono text-xs text-white">
                        {seat.startTime}–{seat.endTime} · {openShiftRoleName(seat)}
                        {seat.note ? <span className="text-grey-light"> · {seat.note}</span> : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-2xs uppercase border px-1 ${
                          seat.status === 'FILLED' ? 'border-success text-success'
                          : seat.status === 'CANCELLED' ? 'border-grey-mid text-grey-light'
                          : 'border-warning text-warning'
                        }`}>
                          {seat.status === 'FILLED' ? `FILLED${seat.filledByName ? ` — ${seat.filledByName}` : ''}` : seat.status}
                        </span>
                        {seat.status === 'OPEN' && (
                          <Button size="sm" variant="danger" onClick={() => cancelSeat(seat.id)}>CANCEL</Button>
                        )}
                      </div>
                    </div>
                    {approved && (
                      <div className="font-mono text-2xs uppercase text-success">
                        ROSTERED: {approved.staffName} (DRAFT — PUBLISH THE WEEK TO SEND IT)
                      </div>
                    )}
                    {pending.length > 0 && (
                      <div className="space-y-1 border-t border-grey-mid pt-1.5">
                        {pending.map((c) => (
                          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-2xs uppercase text-white">
                              {c.staffName} WANTS THIS{c.note ? ` — ${c.note}` : ''}
                            </span>
                            <div className="flex gap-1">
                              <Button size="sm" onClick={() => reviewClaim(c.id, 'APPROVE')} disabled={busy}>APPROVE</Button>
                              <Button size="sm" variant="ghost" onClick={() => reviewClaim(c.id, 'DECLINE')} disabled={busy}>DECLINE</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {seat.status === 'OPEN' && pending.length === 0 && (seat.claims.length > 0) && (
                      <div className="font-mono text-2xs uppercase text-grey-light">NO PENDING CLAIMS.</div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => setOpenEventId(null)}>CLOSE</Button>
            </div>
          </div>
        </div>
      )}

      {/* FIND STAFF confirm */}
      {confirmFind && openEvent && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={() => setConfirmFind(false)}>
          <div className="bg-grey-dark border border-grey-mid p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-mono text-xs uppercase tracking-widest text-white">FIND STAFF</h2>
            <p className="font-mono text-xs text-grey-light">
              LIST {draftLines.reduce((n, l) => n + (Number(l.count) || 1), 0)} SHIFT(S) FOR &ldquo;{openEvent.title}&rdquo; FOR WORKERS TO PICK UP?
            </p>
            <ul className="space-y-1">
              {draftLines.map((l) => {
                const pos = data?.positions.find((p) => p.id === l.positionId)
                return (
                  <li key={l.key} className="font-mono text-2xs uppercase text-white">
                    {Number(l.count) || 1} × {pos?.name ?? (l.label || 'ROLE')} · {l.startTime}–{l.endTime}
                  </li>
                )
              })}
            </ul>
            <p className="font-mono text-2xs uppercase text-grey-light">
              THEY APPEAR ON THE PHONES OF STAFF WHO HOLD THE ROLE. YOU CONFIRM WHO GETS THEM.
            </p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={findStaff} loading={busy}>LIST SHIFTS</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmFind(false)}>CANCEL</Button>
            </div>
          </div>
        </div>
      )}

      {/* Claims queue */}
      {showQueue && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowQueue(false)}>
          <div className="bg-grey-dark border border-grey-mid p-5 w-full max-w-lg space-y-3 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-mono text-xs uppercase tracking-widest text-white">CLAIMS TO REVIEW ({data?.queue.length ?? 0})</h2>
            {(data?.queue.length ?? 0) === 0 && <p className="font-mono text-xs text-grey-light">NOTHING WAITING.</p>}
            {data?.queue.map((c) => (
              <div key={c.id} className="border border-grey-mid px-3 py-2 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-mono text-xs text-white">{c.staffName} — {openShiftRoleName(c)}</div>
                    <div className="font-mono text-2xs uppercase text-grey-light">
                      {formatDateLong(c.date)} · {c.startTime}–{c.endTime}{c.eventTitle ? ` · ${c.eventTitle}` : ''}
                      {c.note ? ` · ${c.note}` : ''}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => reviewClaim(c.id, 'APPROVE')} disabled={busy}>APPROVE</Button>
                    <Button size="sm" variant="ghost" onClick={() => reviewClaim(c.id, 'DECLINE')} disabled={busy}>DECLINE</Button>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex justify-end pt-1">
              <Button size="sm" variant="ghost" onClick={() => setShowQueue(false)}>CLOSE</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
