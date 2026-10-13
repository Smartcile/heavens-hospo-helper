// Server half of the open-shift (event staffing) flow — Prisma-backed, never
// imported by a client component. One place for every mutation so the admin
// APIs and the worker APIs can never drift:
//
//   saveEventStaffing  — requirement lines on a calendar event
//   findStaffForEvent  — expand the lines into OpenShift seats (FIND STAFF)
//   claimOpenShift     — a worker claims a seat (PENDING)
//   withdrawOpenShiftClaim — worker backs out before review
//   reviewOpenShiftClaim   — APPROVE creates the DRAFT roster Shift; DECLINE
//   cancelOpenShift    — pull an un-filled seat

import { prisma } from '@hospo-ops/db'
import type { Prisma } from '@hospo-ops/db'
import { formatDateKey } from '@/lib/scheduling'
import { getTodayDate } from '@/lib/utils'
import { expandSeats, validateStaffingLine, type StaffingLineInput } from '@/lib/open-shifts'

const utcDay = (key: string) => new Date(`${key}T00:00:00Z`)

export interface EventStaffingResult {
  ok: true
  lines: {
    id: string
    positionId: string | null
    label: string | null
    count: number
    startTime: string
    endTime: string
    breakMinutes: number
    note: string | null
    sortOrder: number
  }[]
}
export type EventStaffingOutcome = EventStaffingResult | { ok: false; error: string; status?: number }

/**
 * Replace an event's requirement lines. Blocked while any seat is listed
 * (open shifts exist) so FIND STAFF seats can never be orphaned from their
 * requirement line.
 */
export async function saveEventStaffing(input: {
  venueId: string
  calendarEventId: string
  lines: unknown
}): Promise<EventStaffingOutcome> {
  const event = await prisma.calendarEvent.findFirst({
    where: { id: input.calendarEventId, venueId: input.venueId, deletedAt: null },
    select: { id: true },
  })
  if (!event) return { ok: false, error: 'EVENT NOT FOUND', status: 404 }

  const listed = await prisma.openShift.count({
    where: { calendarEventId: event.id, deletedAt: null, status: { not: 'CANCELLED' } },
  })
  if (listed > 0) {
    return { ok: false, error: 'CANCEL THE LISTED SHIFTS BEFORE EDITING REQUIREMENTS', status: 409 }
  }

  const rawLines = Array.isArray(input.lines) ? input.lines : []
  const lines: (Omit<StaffingLineInput, 'id' | 'sortOrder'> & { sortOrder: number })[] = []
  for (let i = 0; i < rawLines.length; i++) {
    const parsed = validateStaffingLine(rawLines[i])
    if (!parsed.ok) return { ok: false, error: parsed.error, status: 400 }
    lines.push({ ...parsed.value, sortOrder: i })
  }

  if (lines.length > 0) {
    const positionIds = Array.from(new Set(lines.map((l) => l.positionId).filter((v): v is string => !!v)))
    const positions = await prisma.position.count({
      where: { id: { in: positionIds }, venueId: input.venueId, deletedAt: null },
    })
    if (positions !== positionIds.length) {
      return { ok: false, error: 'UNKNOWN POSITION', status: 400 }
    }
  }

  const saved = await prisma.$transaction(async (tx) => {
    await tx.eventStaffing.updateMany({
      where: { calendarEventId: event.id, deletedAt: null },
      data: { deletedAt: new Date() },
    })
    const created: EventStaffingResult['lines'] = []
    for (const line of lines) {
      const row = await tx.eventStaffing.create({
        data: {
          venueId: input.venueId,
          calendarEventId: event.id,
          ...line,
        },
      })
      created.push(row)
    }
    return created
  })

  return {
    ok: true,
    lines: saved.map((l) => ({
      id: l.id,
      positionId: l.positionId,
      label: l.label,
      count: l.count,
      startTime: l.startTime,
      endTime: l.endTime,
      breakMinutes: l.breakMinutes,
      note: l.note,
      sortOrder: l.sortOrder,
    })),
  }
}

/** FIND STAFF — one OpenShift seat per required headcount. */
export async function findStaffForEvent(input: {
  venueId: string
  calendarEventId: string
  actorId: string | null
}): Promise<{ ok: true; created: number } | { ok: false; error: string; status?: number }> {
  const event = await prisma.calendarEvent.findFirst({
    where: { id: input.calendarEventId, venueId: input.venueId, deletedAt: null },
    include: {
      staffing: {
        where: { deletedAt: null },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })
  if (!event) return { ok: false, error: 'EVENT NOT FOUND', status: 404 }

  const lines = event.staffing.filter((l) => l.startTime && l.endTime)
  if (lines.length === 0) return { ok: false, error: 'ADD REQUIRED STAFF FIRST', status: 400 }

  const listed = await prisma.openShift.count({
    where: { calendarEventId: event.id, deletedAt: null, status: { not: 'CANCELLED' } },
  })
  if (listed > 0) {
    return { ok: false, error: 'SHIFTS ARE ALREADY LISTED — CANCEL THEM TO RE-LIST', status: 409 }
  }

  const date = utcDay(formatDateKey(event.startsAt))
  const seats = expandSeats(
    lines.map((l) => ({
      id: l.id,
      positionId: l.positionId,
      label: l.label,
      count: l.count,
      startTime: l.startTime,
      endTime: l.endTime,
      breakMinutes: l.breakMinutes,
      note: l.note,
      sortOrder: l.sortOrder,
    })),
  )

  await prisma.openShift.createMany({
    data: seats.map((seat) => ({
      venueId: input.venueId,
      calendarEventId: event.id,
      staffingId: seat.staffingId,
      positionId: seat.positionId,
      label: seat.label,
      date,
      startTime: seat.startTime,
      endTime: seat.endTime,
      breakMinutes: seat.breakMinutes,
      note: seat.note,
      createdById: input.actorId,
    })),
  })

  return { ok: true, created: seats.length }
}

/** A worker claims a seat. Revives a previously declined/withdrawn claim. */
export async function claimOpenShift(input: {
  venueId: string
  staffId: string
  openShiftId: string
  note?: string | null
}): Promise<{ ok: true; claimId: string } | { ok: false; error: string; status?: number }> {
  const shift = await prisma.openShift.findFirst({
    where: { id: input.openShiftId, venueId: input.venueId, deletedAt: null },
    select: { id: true, positionId: true, date: true, status: true },
  })
  if (!shift) return { ok: false, error: 'SHIFT NOT FOUND', status: 404 }
  if (shift.status !== 'OPEN') return { ok: false, error: 'THIS SHIFT IS NO LONGER OPEN', status: 409 }

  const positions = await prisma.staffPosition.findMany({
    where: { staffId: input.staffId },
    select: { positionId: true },
  })
  const positionIds = positions.map((p) => p.positionId)
  if (shift.positionId && !positionIds.includes(shift.positionId)) {
    return { ok: false, error: 'THIS SHIFT IS FOR ANOTHER ROLE', status: 403 }
  }

  const venue = await prisma.venue.findFirst({
    where: { id: input.venueId, deletedAt: null },
    select: { timezone: true },
  })
  const todayKey = formatDateKey(getTodayDate(venue?.timezone ?? 'Pacific/Auckland'))
  if (formatDateKey(shift.date) < todayKey) {
    return { ok: false, error: 'THIS SHIFT IS IN THE PAST', status: 409 }
  }

  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null
  const existing = await prisma.openShiftClaim.findUnique({
    where: { openShiftId_staffId: { openShiftId: shift.id, staffId: input.staffId } },
    select: { id: true, status: true },
  })
  if (existing && (existing.status === 'PENDING' || existing.status === 'APPROVED')) {
    return { ok: false, error: 'YOU HAVE ALREADY CLAIMED THIS SHIFT', status: 409 }
  }

  const claim = existing
    ? await prisma.openShiftClaim.update({
        where: { id: existing.id },
        data: { status: 'PENDING', note, deletedAt: null },
      })
    : await prisma.openShiftClaim.create({
        data: { openShiftId: shift.id, staffId: input.staffId, venueId: input.venueId, note },
      })

  return { ok: true, claimId: claim.id }
}

/** Worker backs out of a PENDING claim. */
export async function withdrawOpenShiftClaim(claimId: string, staffId: string): Promise<boolean> {
  const res = await prisma.openShiftClaim.updateMany({
    where: { id: claimId, staffId, status: 'PENDING', deletedAt: null },
    data: { status: 'WITHDRAWN' },
  })
  return res.count > 0
}

/**
 * Manager review. APPROVE creates the DRAFT roster Shift, fills the seat and
 * declines every other pending claim on it. DECLINE just closes the claim.
 */
export async function reviewOpenShiftClaim(input: {
  claimId: string
  venueId: string
  actorId: string | null
  action: 'APPROVE' | 'DECLINE'
  reviewNote?: string | null
}): Promise<{ ok: true; shiftId: string | null } | { ok: false; error: string; status?: number }> {
  const claim = await prisma.openShiftClaim.findFirst({
    where: { id: input.claimId, venueId: input.venueId, deletedAt: null },
    include: { openShift: true },
  })
  if (!claim) return { ok: false, error: 'CLAIM NOT FOUND', status: 404 }
  if (claim.status !== 'PENDING') return { ok: false, error: 'CLAIM ALREADY REVIEWED', status: 409 }
  if (!claim.openShift || claim.openShift.deletedAt) return { ok: false, error: 'SHIFT NOT FOUND', status: 404 }

  const reviewNote =
    typeof input.reviewNote === 'string' && input.reviewNote.trim() ? input.reviewNote.trim() : null
  const now = new Date()

  if (input.action === 'DECLINE') {
    await prisma.openShiftClaim.update({
      where: { id: claim.id },
      data: {
        status: 'DECLINED',
        reviewedById: input.actorId,
        reviewedAt: now,
        reviewNote,
      },
    })
    return { ok: true, shiftId: null }
  }

  if (claim.openShift.status !== 'OPEN') {
    return { ok: false, error: 'THIS SEAT IS ALREADY FILLED OR CANCELLED', status: 409 }
  }

  const shiftId = await prisma.$transaction(async (tx) => {
    const fresh = await tx.openShift.findFirst({
      where: { id: claim.openShiftId, status: 'OPEN', deletedAt: null },
      include: {
        position: { select: { departmentId: true, colour: true } },
      },
    })
    if (!fresh || fresh.status !== 'OPEN') return null

    const staff = await tx.staff.findFirst({
      where: { id: claim.staffId, deletedAt: null },
      select: { id: true, departmentId: true },
    })
    if (!staff) return null

    const shift = await tx.shift.create({
      data: {
        staffId: claim.staffId,
        venueId: input.venueId,
        departmentId: fresh.position?.departmentId ?? staff.departmentId ?? null,
        positionId: fresh.positionId,
        calendarEventId: fresh.calendarEventId,
        date: fresh.date,
        startTime: fresh.startTime,
        endTime: fresh.endTime,
        breakMinutes: fresh.breakMinutes,
        colour: fresh.position?.colour ?? null,
        tag: 'EVENT',
        note: fresh.note,
        status: 'DRAFT',
        createdById: input.actorId,
      },
    })

    await tx.openShiftClaim.update({
      where: { id: claim.id },
      data: {
        status: 'APPROVED',
        shiftId: shift.id,
        reviewedById: input.actorId,
        reviewedAt: now,
        reviewNote,
      },
    })
    await tx.openShift.update({
      where: { id: fresh.id },
      data: { status: 'FILLED', filledById: claim.staffId, filledShiftId: shift.id },
    })
    await tx.openShiftClaim.updateMany({
      where: { openShiftId: fresh.id, status: 'PENDING', id: { not: claim.id }, deletedAt: null },
      data: {
        status: 'DECLINED',
        reviewedById: input.actorId,
        reviewedAt: now,
        reviewNote: 'SHIFT FILLED BY ANOTHER',
      },
    })
    return shift.id
  })

  if (!shiftId) return { ok: false, error: 'THIS SEAT IS ALREADY FILLED OR CANCELLED', status: 409 }
  return { ok: true, shiftId }
}

/** Pull an un-filled seat; pending claims are declined. */
export async function cancelOpenShift(
  openShiftId: string,
  venueId: string,
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const shift = await prisma.openShift.findFirst({
    where: { id: openShiftId, venueId, deletedAt: null },
    select: { id: true, status: true },
  })
  if (!shift) return { ok: false, error: 'SHIFT NOT FOUND', status: 404 }
  if (shift.status === 'FILLED') {
    return { ok: false, error: 'SEAT IS FILLED — DELETE THE ROSTERED SHIFT FIRST', status: 409 }
  }
  if (shift.status === 'CANCELLED') return { ok: true }

  await prisma.$transaction(async (tx) => {
    await tx.openShift.update({ where: { id: shift.id }, data: { status: 'CANCELLED' } })
    await tx.openShiftClaim.updateMany({
      where: { openShiftId: shift.id, status: 'PENDING', deletedAt: null },
      data: { status: 'DECLINED', reviewNote: 'SHIFT CANCELLED', reviewedAt: new Date() },
    })
  })
  return { ok: true }
}

/** Re-open a seat when its resulting roster shift is removed or unlinked. */
export async function releaseSeatForShift(
  shiftId: string,
  db: Pick<Prisma.TransactionClient, 'openShift' | 'openShiftClaim'> = prisma,
): Promise<number> {
  await db.openShiftClaim.updateMany({
    where: { shiftId, status: 'APPROVED', deletedAt: null },
    data: { status: 'DECLINED', reviewNote: 'ROSTERED SHIFT REMOVED', reviewedAt: new Date() },
  })
  const res = await db.openShift.updateMany({
    where: { filledShiftId: shiftId, deletedAt: null },
    data: { status: 'OPEN', filledById: null, filledShiftId: null },
  })
  return res.count
}

interface ShiftForSeats {
  id: string
  venueId: string
  calendarEventId: string | null
  positionId: string | null
  staffId: string
  date: Date
  startTime: string
  endTime: string
}

/**
 * A manually rostered event shift consumes an open seat on the same event and
 * day. Prefers an exact time + role match, then role, then time, then any.
 */
export async function fillSeatForShift(
  shift: ShiftForSeats,
  db: Pick<Prisma.TransactionClient, 'openShift'> = prisma,
): Promise<string | null> {
  if (!shift.calendarEventId) return null
  const seats = await db.openShift.findMany({
    where: {
      calendarEventId: shift.calendarEventId,
      venueId: shift.venueId,
      date: shift.date,
      status: 'OPEN',
      deletedAt: null,
    },
    select: { id: true, positionId: true, startTime: true, endTime: true },
    orderBy: { createdAt: 'asc' },
  })
  if (seats.length === 0) return null
  const exact = (s: { startTime: string; endTime: string }) =>
    s.startTime === shift.startTime && s.endTime === shift.endTime
  const best =
    seats.find((s) => exact(s) && s.positionId === shift.positionId) ??
    seats.find((s) => s.positionId === shift.positionId) ??
    seats.find((s) => exact(s)) ??
    seats[0]
  await db.openShift.update({
    where: { id: best.id },
    data: { status: 'FILLED', filledById: shift.staffId, filledShiftId: shift.id },
  })
  return best.id
}

/**
 * Reconcile seats after a shift create/update: an event change releases the old
 * seat (pending/approved claims included) and fills one on the new event; a
 * person change keeps the link and updates who holds it.
 */
export async function syncShiftSeatLinks(input: {
  shift: ShiftForSeats
  previousEventId: string | null
}): Promise<void> {
  const { shift, previousEventId } = input
  const eventChanged = (previousEventId ?? null) !== (shift.calendarEventId ?? null)
  if (eventChanged) {
    await releaseSeatForShift(shift.id)
    if (shift.calendarEventId) await fillSeatForShift(shift)
    return
  }
  if (!shift.calendarEventId) return
  await prisma.openShift.updateMany({
    where: { filledShiftId: shift.id, deletedAt: null },
    data: { status: 'FILLED', filledById: shift.staffId },
  })
}
