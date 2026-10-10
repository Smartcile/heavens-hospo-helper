// Server half of the training-status board: batched computation of every
// active staff member's required / missing / stale guides plus open follow-ups.
// Shared by the STATUS tab API and the dashboard TRAINING widget.
//
// Prisma-backed: never import from a client component.

import { prisma } from '@hospo-ops/db'
import { guideSource, type GuideAudienceRow, type StaffContext } from '@/lib/guides'
import { getTodayDate } from '@/lib/utils'
import { sortTrainingRows, trainingLevel, type TrainingLevel } from '@/lib/training-status'

export interface StaffTrainingRow {
  id: string
  name: string
  positions: string[]
  onShift: boolean
  requiredCount: number
  completedCount: number
  missingCount: number
  staleCount: number
  openFollowUps: number
  level: TrainingLevel
}

export interface VenueTrainingStatus {
  venueName: string
  date: string
  staff: StaffTrainingRow[]
  summary: { green: number; yellow: number; red: number }
}

export async function trainingStatusForVenue(venueId: string): Promise<VenueTrainingStatus | null> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { name: true, timezone: true },
  })
  if (!venue) return null

  const today = getTodayDate(venue.timezone ?? 'Pacific/Auckland')

  const staff = await prisma.staff.findMany({
    where: { venueId, deletedAt: null, isActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      departmentId: true,
      positions: { select: { positionId: true, position: { select: { name: true } } } },
      sections: { select: { sectionId: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
  const staffIds = staff.map((s) => s.id)

  const [shifts, guides, assignments, completions, followUps] = await Promise.all([
    prisma.shift.findMany({
      where: { venueId, deletedAt: null, status: 'PUBLISHED', date: today },
      select: { staffId: true },
    }),
    prisma.guide.findMany({
      where: { venueId, deletedAt: null, status: 'PUBLISHED', isTracked: true },
      select: {
        id: true,
        updatedAt: true,
        isOnboarding: true,
        departmentId: true,
        audiences: { select: { kind: true, targetId: true } },
      },
    }),
    staffIds.length
      ? prisma.guideAssignment.findMany({
          where: { staffId: { in: staffIds }, deletedAt: null },
          select: { staffId: true, guideId: true },
        })
      : [],
    staffIds.length
      ? prisma.guideCompletion.findMany({
          where: { staffId: { in: staffIds } },
          select: { staffId: true, guideId: true, completedAt: true },
        })
      : [],
    staffIds.length
      ? prisma.followUp.findMany({
          where: { staffId: { in: staffIds }, venueId, status: 'OPEN' },
          select: { staffId: true },
        })
      : [],
  ])

  const onShift = new Set(shifts.map((s) => s.staffId))
  const assignedByStaff = new Map<string, Set<string>>()
  for (const a of assignments) {
    const set = assignedByStaff.get(a.staffId) ?? new Set<string>()
    set.add(a.guideId)
    assignedByStaff.set(a.staffId, set)
  }
  const completionByStaff = new Map<string, Map<string, Date>>()
  for (const c of completions) {
    const map = completionByStaff.get(c.staffId) ?? new Map<string, Date>()
    map.set(c.guideId, c.completedAt)
    completionByStaff.set(c.staffId, map)
  }
  const followUpsByStaff = new Map<string, number>()
  for (const f of followUps) {
    followUpsByStaff.set(f.staffId, (followUpsByStaff.get(f.staffId) ?? 0) + 1)
  }

  const rows: StaffTrainingRow[] = staff.map((s) => {
    const ctx: StaffContext = {
      departmentId: s.departmentId,
      sectionIds: new Set(s.sections.map((x) => x.sectionId)),
      positionIds: new Set(s.positions.map((x) => x.positionId)),
      assignedGuideIds: assignedByStaff.get(s.id) ?? new Set<string>(),
    }
    const applicable = guides.filter((g) =>
      guideSource(
        { id: g.id, isOnboarding: g.isOnboarding, departmentId: g.departmentId, audiences: g.audiences as GuideAudienceRow[] },
        ctx,
      ),
    )
    const done = completionByStaff.get(s.id) ?? new Map<string, Date>()
    let missing = 0
    let stale = 0
    for (const g of applicable) {
      const completedAt = done.get(g.id)
      if (!completedAt) missing++
      else if (completedAt < g.updatedAt) stale++
    }
    const openFollowUps = followUpsByStaff.get(s.id) ?? 0
    return {
      id: s.id,
      name: `${s.lastName}, ${s.firstName}`,
      positions: s.positions.map((p) => p.position.name),
      onShift: onShift.has(s.id),
      requiredCount: applicable.length,
      completedCount: applicable.length - missing,
      missingCount: missing,
      staleCount: stale,
      openFollowUps,
      level: trainingLevel({ requiredCount: applicable.length, missingCount: missing, staleCount: stale, openFollowUps }),
    }
  })

  const sorted = sortTrainingRows(rows)
  return {
    venueName: venue.name,
    date: today.toISOString().slice(0, 10),
    staff: sorted,
    summary: {
      green: sorted.filter((r) => r.level === 'GREEN').length,
      yellow: sorted.filter((r) => r.level === 'YELLOW').length,
      red: sorted.filter((r) => r.level === 'RED').length,
    },
  }
}
