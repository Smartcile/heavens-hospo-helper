// Server half of staff attendance events — Prisma only, never imported by a
// client component. Publishing keeps the linked Notice and the invite rows in
// step with the event's audiences.

import { prisma } from '@hospo-ops/db'
import {
  resolveStaffEventTargets,
  type AudienceStaffMember,
  type StaffEventAudienceRef,
} from './staff-events'

type Tx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export type StaffEventWithAudiences = {
  id: string
  venueId: string
  title: string
  description: string | null
  location: string | null
  startsAt: Date
  endsAt: Date | null
  allDay: boolean
  attendanceRequired: boolean
  status: string
  audiences: { kind: string; targetId: string }[]
}

function audienceRefs(event: StaffEventWithAudiences): StaffEventAudienceRef[] {
  return event.audiences.map((a) => ({ kind: a.kind as StaffEventAudienceRef['kind'], targetId: a.targetId }))
}

/** Plain-text Notice body; the worker card renders the real details inline. */
export function staffEventNoticeBody(event: Pick<StaffEventWithAudiences, 'startsAt' | 'endsAt' | 'allDay' | 'location' | 'attendanceRequired' | 'description'>): string {
  const when = event.allDay
    ? event.startsAt.toISOString().slice(0, 10)
    : `${event.startsAt.toISOString().slice(0, 10)} ${event.startsAt.toISOString().slice(11, 16)}–${(event.endsAt ?? event.startsAt).toISOString().slice(11, 16)}`
  const lines = [when]
  lines.push(event.location?.trim() || 'LOCATION TO BE CONFIRMED')
  lines.push(event.attendanceRequired ? 'ATTENDANCE REQUIRED' : 'OPTIONAL')
  if (event.description?.trim()) lines.push(event.description.trim())
  return lines.join('\n')
}

async function loadAudienceStaff(tx: Tx, venueId: string): Promise<AudienceStaffMember[]> {
  const staff = await tx.staff.findMany({
    where: { venueId, deletedAt: null, isActive: true },
    select: {
      id: true,
      departmentId: true,
      sections: { select: { sectionId: true } },
      positions: { select: { positionId: true } },
    },
  })
  return staff.map((s) => ({
    id: s.id,
    departmentId: s.departmentId,
    sectionIds: new Set(s.sections.map((x) => x.sectionId)),
    positionIds: new Set(s.positions.map((x) => x.positionId)),
  }))
}

/**
 * Create/revive the invite for every targeted staff member and retire PENDING
 * invites for people no longer targeted. People who already responded keep
 * their invite so an attendance record is never silently lost.
 */
export async function materialiseStaffEventInvites(
  tx: Tx,
  event: StaffEventWithAudiences,
  explicitStaffIds?: readonly string[],
): Promise<{ invited: number; removed: number }> {
  const staff = await loadAudienceStaff(tx, event.venueId)
  const existing = await tx.staffEventInvite.findMany({
    where: { staffEventId: event.id },
    select: { staffId: true, response: true },
  })
  const audiences = audienceRefs(event)
  const existingIds = existing.map((i) => i.staffId)
  const audienceTargets = audiences.length ? resolveStaffEventTargets(staff, audiences, []) : []

  // `undefined` means "derive the explicit set from the rows already there";
  // an empty array means the manager deliberately cleared them. Deriving keeps
  // historical clients from dropping invitees, while an explicit empty list
  // must be honoured (and, on an audience-less event, falls back to whole venue).
  const explicit = explicitStaffIds !== undefined
    ? explicitStaffIds
    : audiences.length === 0
      ? existingIds
      : existingIds.filter((id) => !audienceTargets.includes(id))

  const targets = audiences.length === 0
    ? (explicit.length ? explicit : staff.map((s) => s.id))
    : resolveStaffEventTargets(staff, audiences, explicit)
  const targetList = [...targets]

  const targetSet = new Set(targetList)
  const removed = await tx.staffEventInvite.updateMany({
    where: {
      staffEventId: event.id,
      deletedAt: null,
      response: 'PENDING',
      staffId: { notIn: targetList.length ? targetList : ['__none__'] },
    },
    data: { deletedAt: new Date() },
  })

  for (const staffId of targetList) {
    await tx.staffEventInvite.upsert({
      where: { staffEventId_staffId: { staffEventId: event.id, staffId } },
      update: { deletedAt: null },
      create: { staffEventId: event.id, staffId },
    })
  }

  return { invited: targetSet.size, removed: removed.count }
}

/** Create or update the single linked Notice for a published event. */
export async function syncStaffEventNotice(tx: Tx, event: StaffEventWithAudiences): Promise<void> {
  if (event.status !== 'PUBLISHED') return

  const body = staffEventNoticeBody(event)
  const endsAt = event.endsAt ?? event.startsAt
  const audiences = audienceRefs(event)
  const existing = await tx.notice.findUnique({ where: { staffEventId: event.id }, select: { id: true } })

  const base = {
    title: event.title,
    body,
    priority: 'IMPORTANT' as const,
    pinned: true,
    requiresAck: false,
    endsAt,
    isActive: true,
    deletedAt: null,
  }
  const audienceRows = audiences.map((a) => ({ kind: a.kind, targetId: a.targetId }))

  if (existing) {
    await tx.notice.update({
      where: { id: existing.id },
      data: { ...base, audiences: { deleteMany: {}, create: audienceRows } },
    })
    return
  }
  await tx.notice.create({
    data: {
      venueId: event.venueId,
      staffEventId: event.id,
      ...base,
      audiences: audienceRows.length ? { create: audienceRows } : undefined,
    },
  })
}

/** Load an event with audiences inside any transaction client. */
export async function findStaffEvent(tx: Tx, id: string): Promise<StaffEventWithAudiences | null> {
  return tx.staffEvent.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      venueId: true,
      title: true,
      description: true,
      location: true,
      startsAt: true,
      endsAt: true,
      allDay: true,
      attendanceRequired: true,
      status: true,
      audiences: { select: { kind: true, targetId: true } },
    },
  })
}
