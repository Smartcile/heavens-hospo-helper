// Server half of the training warnings list: one batched read builds every
// warning for a venue (or one staff member), reusing the SAME applicability
// resolver as the worker's guide list (`guideSource`). Prisma-backed — never
// import from a client component.

import { prisma } from '@hospo-ops/db'
import { guideSource, type GuideAudienceRow, type StaffContext } from '@/lib/guides'
import { getTodayDate } from '@/lib/utils'
import {
  buildWarnings,
  warningSummary,
  type GuideWarning,
  type WarningFolder,
  type WarningFollowUp,
  type WarningGuide,
  type WarningRetrainRequest,
  type WarningStaffInput,
} from '@/lib/guide-warnings'

export interface VenueGuideWarnings {
  venueName: string
  date: string
  warnings: GuideWarning[]
  folders: WarningFolder[]
  staff: { id: string; name: string }[]
  guides: { id: string; title: string; folderId: string | null }[]
  summary: { total: number; critical: number; warning: number }
}

export interface GuideWarningsOptions {
  /** Only include this staff member (the worker's own warnings). */
  staffId?: string
}

/**
 * Every open training warning for a venue. Fixed query count regardless of the
 * number of staff/guides; the applicability predicate is the shared
 * `guideSource`, so this list agrees with the guide lists and the status board.
 */
export async function guideWarningsForVenue(
  venueId: string,
  opts: GuideWarningsOptions = {},
): Promise<VenueGuideWarnings | null> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { name: true, timezone: true },
  })
  if (!venue) return null

  const today = getTodayDate(venue.timezone ?? 'Pacific/Auckland')

  const staff = await prisma.staff.findMany({
    where: {
      venueId,
      deletedAt: null,
      isActive: true,
      ...(opts.staffId ? { id: opts.staffId } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      departmentId: true,
      positions: { select: { positionId: true } },
      sections: { select: { sectionId: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
  const staffIds = staff.map((s) => s.id)

  const [guides, folders, assignments, completions, retrainRequests, followUps] = await Promise.all([
    prisma.guide.findMany({
      where: { venueId, deletedAt: null, status: 'PUBLISHED', isTracked: true },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        isOnboarding: true,
        departmentId: true,
        requiresSignOff: true,
        folderId: true,
        audiences: { select: { kind: true, targetId: true } },
      },
    }),
    prisma.guideFolder.findMany({
      where: { venueId, deletedAt: null },
      select: { id: true, name: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
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
          select: {
            staffId: true,
            guideId: true,
            completedAt: true,
            selfCompleted: true,
            signedOffById: true,
          },
        })
      : [],
    staffIds.length
      ? prisma.guideRetrainRequest.findMany({
          where: {
            venueId,
            staffId: { in: staffIds },
            status: 'PENDING',
            deletedAt: null,
          },
          select: {
            id: true,
            staffId: true,
            guideId: true,
            reason: true,
            createdAt: true,
          },
        })
      : [],
    staffIds.length
      ? prisma.followUp.findMany({
          where: { staffId: { in: staffIds }, venueId, status: 'OPEN' },
          select: {
            id: true,
            staffId: true,
            kind: true,
            guideId: true,
            dueDate: true,
            detail: true,
          },
        })
      : [],
  ])

  const guideMap: Record<string, WarningGuide> = {}
  for (const g of guides) {
    guideMap[g.id] = {
      id: g.id,
      title: g.title,
      folderId: g.folderId,
      requiresSignOff: g.requiresSignOff,
      updatedAt: g.updatedAt.toISOString(),
    }
  }
  const folderList: WarningFolder[] = folders.map((f) => ({
    id: f.id,
    name: f.name,
    sortOrder: f.sortOrder,
  }))
  const folderMap: Record<string, WarningFolder> = {}
  for (const f of folderList) folderMap[f.id] = f

  const assignedByStaff = new Map<string, Set<string>>()
  for (const a of assignments) {
    const set = assignedByStaff.get(a.staffId) ?? new Set<string>()
    set.add(a.guideId)
    assignedByStaff.set(a.staffId, set)
  }

  type CompletionRow = (typeof completions)[number]
  const completionByStaff = new Map<string, Record<string, CompletionRow>>()
  for (const c of completions) {
    const map = completionByStaff.get(c.staffId) ?? {}
    map[c.guideId] = c
    completionByStaff.set(c.staffId, map)
  }

  const requestsByStaff = new Map<string, WarningRetrainRequest[]>()
  for (const r of retrainRequests) {
    const list = requestsByStaff.get(r.staffId) ?? []
    list.push({
      id: r.id,
      guideId: r.guideId,
      reason: r.reason,
      requestedAt: r.createdAt.toISOString(),
    })
    requestsByStaff.set(r.staffId, list)
  }

  const followUpsByStaff = new Map<string, WarningFollowUp[]>()
  for (const f of followUps) {
    const list = followUpsByStaff.get(f.staffId) ?? []
    list.push({
      id: f.id,
      kind: f.kind as WarningFollowUp['kind'],
      guideId: f.guideId,
      dueDate: f.dueDate ? f.dueDate.toISOString() : null,
      detail: f.detail,
    })
    followUpsByStaff.set(f.staffId, list)
  }

  const warningStaff: WarningStaffInput[] = staff.map((s) => {
    const ctx: StaffContext = {
      departmentId: s.departmentId,
      sectionIds: new Set(s.sections.map((x) => x.sectionId)),
      positionIds: new Set(s.positions.map((x) => x.positionId)),
      assignedGuideIds: assignedByStaff.get(s.id) ?? new Set<string>(),
    }
    const requiredGuideIds = guides
      .filter((g) =>
        guideSource(
          {
            id: g.id,
            isOnboarding: g.isOnboarding,
            departmentId: g.departmentId,
            audiences: g.audiences as GuideAudienceRow[],
          },
          ctx,
        ),
      )
      .map((g) => g.id)

    const completionRows = completionByStaff.get(s.id) ?? {}
    const completionInput: WarningStaffInput['completions'] = {}
    for (const [guideId, c] of Object.entries(completionRows)) {
      completionInput[guideId] = {
        completedAt: c.completedAt.toISOString(),
        selfCompleted: c.selfCompleted,
        signedOffById: c.signedOffById,
      }
    }

    return {
      id: s.id,
      name: `${s.lastName}, ${s.firstName}`,
      requiredGuideIds,
      completions: completionInput,
      retrainRequests: requestsByStaff.get(s.id) ?? [],
      followUps: followUpsByStaff.get(s.id) ?? [],
    }
  })

  const warnings = buildWarnings({
    staff: warningStaff,
    guides: guideMap,
    folders: folderMap,
  })

  return {
    venueName: venue.name,
    date: today.toISOString().slice(0, 10),
    warnings,
    folders: folderList,
    staff: staff.map((s) => ({ id: s.id, name: `${s.lastName}, ${s.firstName}` })),
    guides: guides
      .map((g) => ({ id: g.id, title: g.title, folderId: g.folderId }))
      .sort((a, b) => a.title.localeCompare(b.title)),
    summary: warningSummary(warnings),
  }
}

// ── Retrain requests ───────────────────────────────────────────────────────

export interface CreateRetrainResult {
  created: { id: string; guideId: string }[]
  skipped: { guideId: string; reason: string }[]
}

export type RetrainCreateOutcome =
  | { ok: true; result: CreateRetrainResult }
  | { ok: false; status: number; error: string }

/**
 * Raise retrain requests for one person + one or more guides. Venue-checked
 * server-side. Repeating a request for a guide that is already PENDING is
 * skipped rather than duplicated, and each guided is explicitly assigned so it
 * lands in the person's My Guides / training list even when it did not
 * previously apply.
 */
export async function createRetrainRequests(args: {
  venueId: string
  staffId: string
  guideIds: string[]
  reason?: string | null
  requestedById?: string | null
}): Promise<RetrainCreateOutcome> {
  const guideIds = [...new Set(args.guideIds.map((id) => String(id).trim()).filter(Boolean))]
  if (!guideIds.length) return { ok: false, status: 400, error: 'PICK AT LEAST ONE GUIDE' }

  const staff = await prisma.staff.findFirst({
    where: { id: args.staffId, venueId: args.venueId, deletedAt: null },
    select: { id: true, isActive: true },
  })
  if (!staff) return { ok: false, status: 404, error: 'STAFF NOT FOUND' }
  if (!staff.isActive) return { ok: false, status: 400, error: 'STAFF IS INACTIVE' }

  const guides = await prisma.guide.findMany({
    where: { id: { in: guideIds }, venueId: args.venueId, deletedAt: null },
    select: { id: true, status: true, isTracked: true },
  })
  const guideById = new Map(guides.map((g) => [g.id, g]))

  const existing = await prisma.guideRetrainRequest.findMany({
    where: {
      venueId: args.venueId,
      staffId: args.staffId,
      status: 'PENDING',
      deletedAt: null,
      guideId: { in: guideIds },
    },
    select: { guideId: true },
  })
  const alreadyPending = new Set(existing.map((r) => r.guideId))

  const skipped: CreateRetrainResult['skipped'] = []
  const toCreate: string[] = []
  for (const guideId of guideIds) {
    const guide = guideById.get(guideId)
    if (!guide) skipped.push({ guideId, reason: 'GUIDE NOT FOUND' })
    else if (guide.status !== 'PUBLISHED') skipped.push({ guideId, reason: 'GUIDE IS NOT PUBLISHED' })
    else if (!guide.isTracked) skipped.push({ guideId, reason: 'GUIDE IS REFERENCE-ONLY' })
    else if (alreadyPending.has(guideId)) skipped.push({ guideId, reason: 'ALREADY REQUESTED' })
    else toCreate.push(guideId)
  }

  if (!toCreate.length) return { ok: true, result: { created: [], skipped } }

  const reason = args.reason?.trim() || null
  const created = await prisma.$transaction(async (tx) => {
    const rows: { id: string; guideId: string }[] = []
    for (const guideId of toCreate) {
      await tx.guideAssignment.upsert({
        where: { guideId_staffId: { guideId, staffId: args.staffId } },
        update: { deletedAt: null },
        create: {
          guideId,
          staffId: args.staffId,
          assignedById: args.requestedById ?? null,
          reason: 'RETRAIN REQUEST',
        },
        select: { id: true },
      })
      rows.push(
        await tx.guideRetrainRequest.create({
          data: {
            venueId: args.venueId,
            staffId: args.staffId,
            guideId,
            reason,
            requestedById: args.requestedById ?? null,
          },
          select: { id: true, guideId: true },
        }),
      )
    }
    return rows
  })

  return { ok: true, result: { created, skipped } }
}

export type RetrainTransitionOutcome =
  | { ok: true; request: { id: string; status: string } }
  | { ok: false; status: number; error: string }

/** Close a request as DONE (training redone) or DISMISSED (manager ack). */
export async function resolveRetrainRequest(args: {
  id: string
  venueId: string
  status: 'DONE' | 'DISMISSED'
  resolvedById: string
  note?: string | null
}): Promise<RetrainTransitionOutcome> {
  const request = await prisma.guideRetrainRequest.findFirst({
    where: { id: args.id, deletedAt: null },
    select: { id: true, venueId: true, status: true },
  })
  if (!request) return { ok: false, status: 404, error: 'REQUEST NOT FOUND' }
  if (request.venueId !== args.venueId) return { ok: false, status: 403, error: 'FORBIDDEN' }
  if (request.status !== 'PENDING') {
    return { ok: false, status: 409, error: 'REQUEST ALREADY CLOSED' }
  }

  const updated = await prisma.guideRetrainRequest.update({
    where: { id: args.id },
    data: {
      status: args.status,
      resolvedById: args.resolvedById,
      resolvedAt: new Date(),
      note: args.note?.trim() || null,
    },
    select: { id: true, status: true },
  })
  return { ok: true, request: updated }
}
