// Server half of section-work reviews. Prisma-backed — never import from a
// client component.
//
// Reconcile is the ONLY thing that raises reviews. It never writes StaffSection.
// Confirm is the only path that grants the section.

import { prisma } from '@hospo-ops/db'
import { resolvePathwayForStaff } from '@/lib/pathway-for-staff'
import {
  combineSectionWorkEvidence,
  describeSectionWorkEvidence,
  isPathwayComplete,
  sectionGuideProgress,
  sectionWorkSourceForEvidence,
  type SectionWorkSource,
  type SectionWorkStatus,
} from '@/lib/section-work'

export interface SectionWorkReconcileResult {
  created: number
  reopened: number
  updated: number
  dismissed: number
}

export interface SectionWorkReviewSummary {
  id: string
  staffId: string
  staffName: string
  sectionId: string
  sectionName: string
  source: SectionWorkSource
  status: SectionWorkStatus
  evidence: string | null
  evidenceLabel: string
  requestedAt: Date
  note: string | null
}

export type SectionWorkAction = 'CONFIRM' | 'DISMISS' | 'REOPEN'

export type SectionWorkActionResult =
  | { ok: true; review: { id: string; status: SectionWorkStatus } }
  | { ok: false; status: number; error: string }

/**
 * Raise / refresh review rows for one person. Idempotent and best-effort.
 *
 * Rules:
 * - Only sections the person does NOT already hold are considered.
 * - No qualifying evidence → a still-PENDING review is auto-dismissed (stale).
 *   A system auto-dismiss clears the evidence signature so restoring the same
 *   work reopens it; a manager DISMISS keeps the signature so it stays closed
 *   until the evidence actually changes.
 * - A CONFIRMED review is never touched automatically.
 * - A soft-deleted row is restored (unique key is staff + section) rather than
 *   re-created, which would trip P2002.
 */
export async function reconcileSectionWork(
  staffId: string,
): Promise<SectionWorkReconcileResult | null> {
  const staff = await prisma.staff.findFirst({
    where: { id: staffId, deletedAt: null },
    select: {
      id: true,
      venueId: true,
      sections: { select: { sectionId: true } },
    },
  })
  if (!staff) return null

  const result: SectionWorkReconcileResult = {
    created: 0,
    reopened: 0,
    updated: 0,
    dismissed: 0,
  }

  const held = new Set(staff.sections.map((s) => s.sectionId))
  const sections = await prisma.section.findMany({
    where: { venueId: staff.venueId, deletedAt: null, isActive: true },
    select: { id: true },
  })
  const missing = sections.filter((s) => !held.has(s.id))
  if (missing.length === 0) return result

  const sectionIds = missing.map((s) => s.id)

  const [audienceRows, pathways, existingReviews] = await Promise.all([
    prisma.guideAudience.findMany({
      where: {
        kind: 'SECTION',
        targetId: { in: sectionIds },
        guide: { venueId: staff.venueId, deletedAt: null, status: 'PUBLISHED', isTracked: true },
      },
      select: {
        guideId: true,
        targetId: true,
        guide: { select: { status: true, isTracked: true } },
      },
    }),
    prisma.pathway.findMany({
      where: {
        venueId: staff.venueId,
        deletedAt: null,
        status: 'PUBLISHED',
        sectionId: { in: sectionIds },
      },
      select: { id: true, sectionId: true },
    }),
    // Include soft-deleted rows: the unique key is (staffId, sectionId), so a
    // re-create would hit P2002. Reuse the row instead.
    prisma.sectionWorkReview.findMany({
      where: { staffId },
      select: {
        id: true,
        sectionId: true,
        status: true,
        evidence: true,
        deletedAt: true,
      },
    }),
  ])

  const catalog = audienceRows.map((r) => ({
    guideId: r.guideId,
    sectionId: r.targetId,
    status: r.guide.status,
    isTracked: r.guide.isTracked,
  }))
  const guideIds = [...new Set(catalog.map((c) => c.guideId))]
  const completions = guideIds.length
    ? await prisma.guideCompletion.findMany({
        where: { staffId, guideId: { in: guideIds } },
        select: { guideId: true },
      })
    : []
  const completedGuideIds = new Set(completions.map((c) => c.guideId))

  const pathwayBySection = new Map<string, string>()
  for (const pathway of pathways) {
    if (!pathway.sectionId || pathwayBySection.has(pathway.sectionId)) continue
    const view = await resolvePathwayForStaff(pathway.id, staffId)
    if (isPathwayComplete(view)) pathwayBySection.set(pathway.sectionId, pathway.id)
  }

  const existingBySection = new Map(existingReviews.map((r) => [r.sectionId, r]))
  const now = new Date()

  for (const section of missing) {
    const progress = sectionGuideProgress(section.id, catalog, completedGuideIds)
    const pathwayId = pathwayBySection.get(section.id) ?? null
    const evidence = combineSectionWorkEvidence({
      guideIds: progress.complete ? progress.requiredGuideIds : undefined,
      pathwayId,
    })
    const current = existingBySection.get(section.id)

    if (!evidence) {
      if (current && !current.deletedAt && current.status === 'PENDING') {
        // SYSTEM auto-dismiss: clear the signature, otherwise restoring the
        // same work would look unchanged and never reopen. A manager DISMISS
        // keeps its signature on purpose (see reviewSectionWork).
        await prisma.sectionWorkReview.update({
          where: { id: current.id },
          data: {
            status: 'DISMISSED',
            reviewedAt: now,
            note: 'EVIDENCE REMOVED',
            evidence: null,
            pathwayId: null,
          },
        })
        result.dismissed++
      }
      continue
    }

    const source = sectionWorkSourceForEvidence(evidence)

    if (!current) {
      await prisma.sectionWorkReview.create({
        data: {
          venueId: staff.venueId,
          staffId,
          sectionId: section.id,
          source,
          pathwayId,
          evidence,
          status: 'PENDING',
        },
      })
      result.created++
      continue
    }

    // A soft-deleted row still owns the unique key — restore it in place.
    if (current.deletedAt) {
      await prisma.sectionWorkReview.update({
        where: { id: current.id },
        data: {
          deletedAt: null,
          status: 'PENDING',
          source,
          pathwayId,
          evidence,
          requestedAt: now,
          reviewedById: null,
          reviewedAt: null,
          note: null,
        },
      })
      result.reopened++
      continue
    }

    // A manager already granted it — reconciliation must not undo that.
    if (current.status === 'CONFIRMED') continue
    // Same evidence → no nagging.
    if (current.evidence === evidence) continue

    if (current.status === 'DISMISSED') {
      await prisma.sectionWorkReview.update({
        where: { id: current.id },
        data: {
          status: 'PENDING',
          source,
          pathwayId,
          evidence,
          requestedAt: now,
          reviewedById: null,
          reviewedAt: null,
          note: null,
        },
      })
      result.reopened++
    } else {
      await prisma.sectionWorkReview.update({
        where: { id: current.id },
        data: { source, pathwayId, evidence },
      })
      result.updated++
    }
  }

  return result
}

/** Lazy safety net for the board — never allowed to break the page. */
export async function reconcileVenueSectionWork(venueId: string): Promise<void> {
  const staff = await prisma.staff.findMany({
    where: { venueId, deletedAt: null, isActive: true },
    select: { id: true },
  })
  for (const person of staff) {
    try {
      await reconcileSectionWork(person.id)
    } catch {
      /* best-effort */
    }
  }
}

/**
 * Review rows for the STATUS board. A review is hidden once the person already
 * holds the section (for example after a manual grant in StaffEditModal).
 */
export async function listSectionWorkReviews(
  venueId: string,
  status?: SectionWorkStatus,
): Promise<SectionWorkReviewSummary[]> {
  const reviews = await prisma.sectionWorkReview.findMany({
    where: { venueId, deletedAt: null, ...(status ? { status } : {}) },
    select: {
      id: true,
      staffId: true,
      sectionId: true,
      source: true,
      status: true,
      evidence: true,
      requestedAt: true,
      note: true,
      staff: {
        select: {
          firstName: true,
          lastName: true,
          deletedAt: true,
          sections: { select: { sectionId: true } },
        },
      },
      section: { select: { name: true, deletedAt: true } },
    },
    orderBy: { requestedAt: 'asc' },
  })

  return reviews.flatMap((review) => {
    if (review.staff.deletedAt || review.section.deletedAt) return []
    if (review.staff.sections.some((s) => s.sectionId === review.sectionId)) return []
    return [
      {
        id: review.id,
        staffId: review.staffId,
        staffName: `${review.staff.lastName}, ${review.staff.firstName}`,
        sectionId: review.sectionId,
        sectionName: review.section.name,
        source: review.source as SectionWorkSource,
        status: review.status as SectionWorkStatus,
        evidence: review.evidence,
        evidenceLabel: describeSectionWorkEvidence(review.evidence),
        requestedAt: review.requestedAt,
        note: review.note,
      },
    ]
  })
}

/**
 * The legal moves, validated server-side so a stale board cannot create a
 * granted section without a PENDING review (e.g. DISMISS a CONFIRMED row).
 */
const ALLOWED_FROM: Record<SectionWorkAction, SectionWorkStatus> = {
  CONFIRM: 'PENDING',
  DISMISS: 'PENDING',
  REOPEN: 'DISMISSED',
}

/** CONFIRM grants the section; DISMISS/REOPEN only move the review. */
export async function reviewSectionWork(input: {
  reviewId: string
  action: SectionWorkAction
  reviewerId: string
  note?: string | null
}): Promise<SectionWorkActionResult> {
  const review = await prisma.sectionWorkReview.findFirst({
    where: { id: input.reviewId, deletedAt: null },
    select: { id: true, staffId: true, sectionId: true, status: true },
  })
  if (!review) return { ok: false, status: 404, error: 'Not found' }

  const expected = ALLOWED_FROM[input.action]
  if (review.status !== expected) {
    return {
      ok: false,
      status: 409,
      error: `Cannot ${input.action} a ${review.status} review`,
    }
  }

  const note = input.note?.trim() || null
  const now = new Date()

  if (input.action === 'CONFIRM') {
    const [, updated] = await prisma.$transaction([
      prisma.staffSection.upsert({
        where: { staffId_sectionId: { staffId: review.staffId, sectionId: review.sectionId } },
        create: { staffId: review.staffId, sectionId: review.sectionId },
        update: {},
      }),
      prisma.sectionWorkReview.update({
        where: { id: review.id },
        data: { status: 'CONFIRMED', reviewedById: input.reviewerId, reviewedAt: now, note },
      }),
    ])
    return { ok: true, review: { id: updated.id, status: updated.status as SectionWorkStatus } }
  }

  const data =
    input.action === 'DISMISS'
      ? { status: 'DISMISSED' as const, reviewedById: input.reviewerId, reviewedAt: now, note }
      : {
          status: 'PENDING' as const,
          reviewedById: null,
          reviewedAt: null,
          note: null,
          requestedAt: now,
        }

  const updated = await prisma.sectionWorkReview.update({ where: { id: review.id }, data })
  return { ok: true, review: { id: updated.id, status: updated.status as SectionWorkStatus } }
}

/**
 * A manager can grant a section directly from the Staff modal. Close any
 * matching PENDING review at the same time so it cannot resurface later.
 * Keeps the evidence signature (a manager decision, not a system dismissal).
 */
export async function dismissPendingSectionWorkForGrant(
  staffId: string,
  sectionIds: readonly string[],
  reviewerId: string,
): Promise<number> {
  if (sectionIds.length === 0) return 0
  const result = await prisma.sectionWorkReview.updateMany({
    where: {
      staffId,
      sectionId: { in: [...sectionIds] },
      status: 'PENDING',
      deletedAt: null,
    },
    data: {
      status: 'DISMISSED',
      reviewedById: reviewerId,
      reviewedAt: new Date(),
      note: 'GRANTED MANUALLY',
    },
  })
  return result.count
}
