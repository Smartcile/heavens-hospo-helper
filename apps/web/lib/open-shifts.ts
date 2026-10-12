// Open-shift logic — pure, Prisma-free, shared by the admin event roster, the
// worker claim screen and both APIs, so the rules cannot drift between them.
//
// Flow: a manager writes EventStaffing requirement lines on an event, FIND
// STAFF expands each line into `count` OpenShift seats, workers claim a seat,
// and an approved claim creates a DRAFT roster Shift.

import { isValidTime } from '@/lib/calendar'

export type OpenShiftStatus = 'OPEN' | 'FILLED' | 'CANCELLED'
export type OpenShiftClaimStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN'

export const MAX_SEATS_PER_LINE = 50

export interface StaffingLineInput {
  id: string
  positionId: string | null
  label: string | null
  count: number
  startTime: string
  endTime: string
  breakMinutes: number
  note: string | null
  sortOrder: number
}

export type StaffingLineValidation =
  | { ok: true; value: Omit<StaffingLineInput, 'id' | 'sortOrder'> & { label: string | null } }
  | { ok: false; error: string }

/** Validate one requirement line as sent by the event roster editor. */
export function validateStaffingLine(raw: unknown): StaffingLineValidation {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'INVALID LINE' }
  const r = raw as Record<string, unknown>

  const positionId =
    typeof r.positionId === 'string' && r.positionId.trim() ? r.positionId.trim() : null
  const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim().toUpperCase() : null
  if (!positionId && !label) return { ok: false, error: 'PICK A POSITION OR ENTER A ROLE LABEL' }

  const count = Math.round(Number(r.count ?? 1))
  if (!Number.isFinite(count) || count < 1 || count > MAX_SEATS_PER_LINE) {
    return { ok: false, error: `STAFF COUNT MUST BE 1–${MAX_SEATS_PER_LINE}` }
  }

  const startTime = typeof r.startTime === 'string' ? r.startTime : ''
  const endTime = typeof r.endTime === 'string' ? r.endTime : ''
  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    return { ok: false, error: 'START AND END TIMES ARE REQUIRED' }
  }
  if (startTime === endTime) return { ok: false, error: 'START AND END CANNOT MATCH' }

  const breakMinutes = Math.max(0, Math.round(Number(r.breakMinutes ?? 0) || 0))
  const note = typeof r.note === 'string' && r.note.trim() ? r.note.trim() : null

  return {
    ok: true,
    value: { positionId, label, count, startTime, endTime, breakMinutes, note },
  }
}

export interface SeatDraft {
  staffingId: string
  positionId: string | null
  label: string | null
  startTime: string
  endTime: string
  breakMinutes: number
  note: string | null
}

/** One seat per required headcount — the OpenShift rows FIND STAFF creates. */
export function expandSeats(lines: StaffingLineInput[]): SeatDraft[] {
  const seats: SeatDraft[] = []
  for (const line of lines) {
    const count = Math.min(Math.max(Math.round(line.count), 1), MAX_SEATS_PER_LINE)
    for (let i = 0; i < count; i++) {
      seats.push({
        staffingId: line.id,
        positionId: line.positionId,
        label: line.label,
        startTime: line.startTime,
        endTime: line.endTime,
        breakMinutes: line.breakMinutes,
        note: line.note,
      })
    }
  }
  return seats
}

export interface ClaimableShift {
  positionId: string | null
  status: OpenShiftStatus
}

/** Workers see a shift when it has no role requirement or they hold the role. */
export function claimableForPositions(shift: ClaimableShift, positionIds: string[]): boolean {
  if (shift.status !== 'OPEN') return false
  if (!shift.positionId) return true
  return positionIds.includes(shift.positionId)
}

export function openShiftRoleName(shift: { positionName?: string | null; label?: string | null }): string {
  return shift.positionName ?? shift.label ?? 'SHIFT'
}

export function claimStatusMeta(status: OpenShiftClaimStatus): { label: string; tone: 'warn' | 'good' | 'bad' } {
  switch (status) {
    case 'APPROVED':
      return { label: 'CONFIRMED', tone: 'good' }
    case 'DECLINED':
      return { label: 'NOT THIS TIME', tone: 'bad' }
    case 'WITHDRAWN':
      return { label: 'WITHDRAWN', tone: 'bad' }
    default:
      return { label: 'WAITING FOR REVIEW', tone: 'warn' }
  }
}

/** FILLED / total seats for a group of open shifts (cancelled excluded). */
export function seatFillStatus(seats: { status: OpenShiftStatus }[]): { filled: number; total: number } {
  let filled = 0
  let total = 0
  for (const s of seats) {
    if (s.status === 'CANCELLED') continue
    total++
    if (s.status === 'FILLED') filled++
  }
  return { filled, total }
}

export function pendingClaimCount(claims: { status: OpenShiftClaimStatus }[]): number {
  return claims.filter((c) => c.status === 'PENDING').length
}
