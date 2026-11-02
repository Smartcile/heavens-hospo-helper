'use client'

// The event staffing editor — requirements, FIND STAFF, listed seats, claims
// and the roster shifts linked to the event. Opened from the roster's EVENTS
// tab event chips. Manual events can be edited/deleted from here too.

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { formatDateLong } from '@/lib/date-nav'
import { formatEventTime } from '@/lib/event-roster'
import { openShiftRoleName, seatFillStatus } from '@/lib/open-shifts'
import {
  draftFromStaffingLine,
  newStaffingDraft,
  staffingPayload,
  StaffingLinesEditor,
  type StaffingDraftLine,
} from '@/components/admin/StaffingLinesEditor'
import type { EventPosition, EventQueueClaim, EventRosterEvent } from '@/lib/use-event-roster'

function hhmmOf(date: Date): string {
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

export function EventStaffingModal({
  venueId,
  event,
  positions,
  onClose,
  onSaved,
  onEdit,
}: {
  venueId: string
  event: EventRosterEvent
  positions: EventPosition[]
  onClose: () => void
  onSaved: () => void
  onEdit: () => void
}) {
  const [draftLines, setDraftLines] = useState<StaffingDraftLine[]>(() =>
    event.staffing.map(draftFromStaffingLine),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmFind, setConfirmFind] = useState(false)

  const seatSummary = seatFillStatus(event.openShifts)
  const hasListed = seatSummary.total > 0
  const isManual = event.source === 'MANUAL'

  const roles = useMemo(
    () => new Set(event.staffing.map((l) => l.positionName ?? l.label ?? 'ROLE')),
    [event.staffing],
  )

  async function saveStaffing() {
    setBusy(true)
    setError('')
    const r = await fetch(`/api/admin/event-roster/${event.id}/staffing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, lines: staffingPayload(draftLines) }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) {
      setError((d.error ?? 'SAVE FAILED').toUpperCase())
      return
    }
    onSaved()
  }

  async function findStaff() {
    setBusy(true)
    setError('')
    const r = await fetch(`/api/admin/event-roster/${event.id}/find-staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    setConfirmFind(false)
    if (!r.ok) {
      setError((d.error ?? 'FAILED').toUpperCase())
      return
    }
    onSaved()
  }

  async function cancelSeat(openShiftId: string) {
    if (!confirm('CANCEL THIS LISTED SHIFT? ANY PENDING CLAIMS ARE DECLINED.')) return
    setBusy(true)
    const r = await fetch(`/api/admin/open-shifts/${openShiftId}`, { method: 'DELETE' })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) {
      setError((d.error ?? 'FAILED').toUpperCase())
      return
    }
    onSaved()
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
      setError((d.error ?? 'FAILED').toUpperCase())
      return
    }
    onSaved()
  }

  async function deleteEvent() {
    if (!confirm(`DELETE "${event.title}"? LISTED SHIFTS ARE PULLED.`)) return
    setBusy(true)
    const r = await fetch(`/api/admin/calendar-events/${event.id}`, { method: 'DELETE' })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) {
      setError((d.error ?? 'FAILED').toUpperCase())
      return
    }
    onSaved()
    onClose()
  }

  const pdfLink = event.pdfPath || event.pdfUrl

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-grey-dark border border-grey-mid p-5 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-mono text-xs uppercase tracking-widest text-white">{event.title}</h2>
            <p className="font-mono text-2xs uppercase text-grey-light mt-1">
              {formatDateLong(`${event.startsAt.getUTCFullYear()}-${String(event.startsAt.getUTCMonth() + 1).padStart(2, '0')}-${String(event.startsAt.getUTCDate()).padStart(2, '0')}`)}
              {' — '}
              {event.allDay ? 'ALL DAY' : `${formatEventTime(event)}${event.endsAt ? ` – ${hhmmOf(event.endsAt)}` : ''}`}
              {event.location ? ` · ${event.location}` : ''}
              {typeof event.pax === 'number' ? ` · ${event.pax} PAX` : ''}
              {event.floorPlanName ? ` · LAYOUT: ${event.floorPlanName}` : ''}
            </p>
            {event.description && <p className="font-mono text-2xs text-grey-light mt-1 max-w-xl">{event.description}</p>}
            {pdfLink && (
              <a href={pdfLink} target="_blank" rel="noreferrer" className="inline-block font-mono text-2xs uppercase text-accent hover:text-white mt-1">
                📄 EVENT PDF ↗
              </a>
            )}
            {event.source !== 'MANUAL' && (
              <p className="font-mono text-2xs uppercase text-grey-light mt-1">
                IMPORTED FROM {event.source === 'GOOGLE' ? 'GOOGLE CALENDAR' : 'ICAL FEED'}
              </p>
            )}
          </div>
          <span className={`font-mono text-2xs border px-2 py-1 shrink-0 ${hasListed ? (seatSummary.filled >= seatSummary.total ? 'border-success text-success' : 'border-warning text-warning') : 'border-grey-mid text-grey-light'}`}>
            {hasListed ? `${seatSummary.filled}/${seatSummary.total} FILLED` : 'NOT LISTED'}
          </span>
        </div>

        {error && <p className="font-mono text-xs text-danger">{error}</p>}

        {/* Requirements editor */}
        <div className="border border-grey-mid p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">REQUIRED STAFF</h3>
            {roles.size > 0 && (
              <span className="font-mono text-2xs uppercase text-accent truncate">{[...roles].join(' · ')}</span>
            )}
          </div>
          <StaffingLinesEditor lines={draftLines} positions={positions} onChange={setDraftLines} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDraftLines((prev) => [...prev, newStaffingDraft()])}>+ ADD ROLE</Button>
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
          {event.openShifts.length === 0 && (
            <p className="font-mono text-2xs uppercase text-grey-light">NOTHING LISTED YET.</p>
          )}
          {event.openShifts.map((seat) => {
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
              </div>
            )
          })}
        </div>

        {/* Roster shifts linked to this event */}
        <div className="border border-grey-mid p-3 space-y-2">
          <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">ROSTERED SHIFTS ({event.shifts.length})</h3>
          {event.shifts.length === 0 && (
            <p className="font-mono text-2xs uppercase text-grey-light">NO SHIFTS LINKED — APPROVE A CLAIM OR ASSIGN ONE ON THE ROSTER.</p>
          )}
          {event.shifts.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border border-grey-mid px-3 py-2">
              <div className="font-mono text-xs text-white">
                {s.staffName} · {s.startTime}–{s.endTime}
                {s.positionName ? <span className="text-grey-light"> · {s.positionName}</span> : null}
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-mono text-2xs uppercase border px-1 ${s.fromClaim ? 'border-accent text-accent' : 'border-grey-mid text-grey-light'}`}>
                  {s.fromClaim ? 'CLAIMED' : 'ASSIGNED'}
                </span>
                <span className={`font-mono text-2xs uppercase border px-1 ${s.status === 'PUBLISHED' ? 'border-success text-success' : 'border-warning text-warning'}`}>
                  {s.status}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {isManual && (
            <>
              <Button size="sm" variant="ghost" onClick={onEdit} disabled={busy}>EDIT EVENT</Button>
              <Button size="sm" variant="danger" onClick={deleteEvent} disabled={busy}>DELETE EVENT</Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>CLOSE</Button>
        </div>
      </div>

      {confirmFind && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={() => setConfirmFind(false)}>
          <div className="bg-grey-dark border border-grey-mid p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-mono text-xs uppercase tracking-widest text-white">FIND STAFF</h2>
            <p className="font-mono text-xs text-grey-light">
              LIST {draftLines.reduce((n, l) => n + (Number(l.count) || 1), 0)} SHIFT(S) FOR &ldquo;{event.title}&rdquo; FOR WORKERS TO PICK UP?
            </p>
            <ul className="space-y-1">
              {draftLines.map((l) => {
                const pos = positions.find((p) => p.id === l.positionId)
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
    </div>
  )
}

export function EventClaimsModal({
  queue,
  busy,
  onReview,
  onClose,
}: {
  queue: EventQueueClaim[]
  busy: boolean
  onReview: (claimId: string, action: 'APPROVE' | 'DECLINE') => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-grey-dark border border-grey-mid p-5 w-full max-w-lg space-y-3 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-mono text-xs uppercase tracking-widest text-white">CLAIMS TO REVIEW ({queue.length})</h2>
        {queue.length === 0 && <p className="font-mono text-xs text-grey-light">NOTHING WAITING.</p>}
        {queue.map((c) => (
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
                <Button size="sm" onClick={() => onReview(c.id, 'APPROVE')} disabled={busy}>APPROVE</Button>
                <Button size="sm" variant="ghost" onClick={() => onReview(c.id, 'DECLINE')} disabled={busy}>DECLINE</Button>
              </div>
            </div>
          </div>
        ))}
        <div className="flex justify-end pt-1">
          <Button size="sm" variant="ghost" onClick={onClose}>CLOSE</Button>
        </div>
      </div>
    </div>
  )
}
