// Guide applicability — the single answer to "which guides apply to this person?".
//
// This logic previously lived inline in three route files that had drifted apart:
// the worker route omitted GuideAssignment entirely, so individually-assigned
// guides showed in the admin modal but never reached the worker's phone.
//
// The predicate is pure so it can be unit-tested without Prisma; resolveStaffGuides
// does the DB work and uses the predicate for the source label, keeping the SQL
// filter and the in-memory answer in agreement.

import { prisma } from '@hospo-ops/db'
import { attachTargets, type ResolvedStepLink, type StepLinkRow } from '@/lib/guide-links'
import { buildTargetIndex } from '@/lib/guide-links.server'

export type GuideSource =
  | 'ASSIGNED'
  | 'ONBOARDING'
  | 'SECTION'
  | 'POSITION'
  | 'DEPARTMENT'

export type AudienceKind = 'DEPARTMENT' | 'SECTION' | 'POSITION'

export interface GuideAudienceRow {
  kind: AudienceKind
  targetId: string
}

/** The targeting fields of a guide — the minimum needed to decide applicability. */
export interface GuideAudienceInput {
  id: string
  isOnboarding: boolean
  /** Deprecated single-department targeting; still honoured until backfilled. */
  departmentId: string | null
  audiences: readonly GuideAudienceRow[]
}

/** Who we are deciding for. */
export interface StaffContext {
  departmentId: string | null
  sectionIds: ReadonlySet<string>
  positionIds: ReadonlySet<string>
  assignedGuideIds: ReadonlySet<string>
}

function hasAudience(
  guide: GuideAudienceInput,
  kind: AudienceKind,
  held: ReadonlySet<string>,
): boolean {
  return guide.audiences.some((a) => a.kind === kind && held.has(a.targetId))
}

/**
 * Why this guide applies to this person, or null if it doesn't.
 *
 * Precedence runs most-specific-first so the badge a manager sees explains the
 * real reason: an explicit assignment beats a station, which beats a job title,
 * which beats a whole department. ONBOARDING sits second because "this is part
 * of induction" is the more useful label whenever it's true.
 */
export function guideSource(
  guide: GuideAudienceInput,
  ctx: StaffContext,
): GuideSource | null {
  if (ctx.assignedGuideIds.has(guide.id)) return 'ASSIGNED'
  if (guide.isOnboarding) return 'ONBOARDING'
  if (hasAudience(guide, 'SECTION', ctx.sectionIds)) return 'SECTION'
  if (hasAudience(guide, 'POSITION', ctx.positionIds)) return 'POSITION'
  if (ctx.departmentId) {
    const deptSet: ReadonlySet<string> = new Set([ctx.departmentId])
    if (hasAudience(guide, 'DEPARTMENT', deptSet)) return 'DEPARTMENT'
    // Legacy single-column targeting, kept until every guide is backfilled.
    if (guide.departmentId === ctx.departmentId) return 'DEPARTMENT'
  }
  return null
}

export function guideAppliesTo(guide: GuideAudienceInput, ctx: StaffContext): boolean {
  return guideSource(guide, ctx) !== null
}

/**
 * The Prisma `OR` matching `guideSource`. Kept beside the predicate so the two
 * can't drift — every clause here has a counterpart above.
 */
export function guideWhereOr(ctx: StaffContext) {
  const assigned = [...ctx.assignedGuideIds]
  const sectionIds = [...ctx.sectionIds]
  const positionIds = [...ctx.positionIds]
  return [
    { isOnboarding: true },
    ...(assigned.length ? [{ id: { in: assigned } }] : []),
    ...(sectionIds.length
      ? [{ audiences: { some: { kind: 'SECTION' as const, targetId: { in: sectionIds } } } }]
      : []),
    ...(positionIds.length
      ? [{ audiences: { some: { kind: 'POSITION' as const, targetId: { in: positionIds } } } }]
      : []),
    ...(ctx.departmentId
      ? [
          { audiences: { some: { kind: 'DEPARTMENT' as const, targetId: ctx.departmentId } } },
          { departmentId: ctx.departmentId },
        ]
      : []),
  ]
}

export interface ResolvedGuideCompletion {
  completedAt: Date
  selfCompleted: boolean
  signedOffById: string | null
  note: string | null
}

export interface ResolvedGuide {
  id: string
  title: string
  description: string | null
  category: string | null
  requiresSignOff: boolean
  isOnboarding: boolean
  source: GuideSource
  assignmentReason: string | null
  completed: boolean
  completion: ResolvedGuideCompletion | null
  department: { id: string; name: string } | null
  steps: {
    id: string
    order: number
    heading: string | null
    content: string
    imageUrl: string | null
    videoUrl: string | null
    links: ResolvedStepLink[]
  }[]
}

/**
 * Every published, tracked guide that applies to this staff member, with their
 * completion state. Fixed query count (4) regardless of how many guides apply.
 *
 * `items` is the tracked set — what "My Guides", the pathway tree, completions
 * and the staff modal operate on. `reference` is the untracked set (SOPs,
 * FAQs, HOW-TOs): they are published and apply to the person, so they belong
 * in the worker BIBLE as read-only documents, but nothing tracks them.
 */
export async function resolveStaffGuides(
  staffId: string,
  opts: { includeSteps?: boolean } = {},
): Promise<{ staffId: string; items: ResolvedGuide[]; reference: ResolvedGuide[] } | null> {
  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: {
      id: true,
      departmentId: true,
      venueId: true,
      sections: { select: { sectionId: true } },
      positions: { select: { positionId: true } },
    },
  })
  if (!staff) return null

  const assignments = await prisma.guideAssignment.findMany({
    where: { staffId, deletedAt: null },
    select: { guideId: true, reason: true },
  })
  const ctx: StaffContext = {
    departmentId: staff.departmentId,
    sectionIds: new Set(staff.sections.map((s) => s.sectionId)),
    positionIds: new Set(staff.positions.map((p) => p.positionId)),
    assignedGuideIds: new Set(assignments.map((a) => a.guideId)),
  }
  const reasonMap = new Map(assignments.map((a) => [a.guideId, a.reason]))

  const guides = await prisma.guide.findMany({
    where: {
      venueId: staff.venueId,
      status: 'PUBLISHED',
      deletedAt: null,
      OR: guideWhereOr(ctx),
    },
    include: {
      department: { select: { id: true, name: true } },
      audiences: { select: { kind: true, targetId: true } },
      ...(opts.includeSteps
        ? { steps: { orderBy: { order: 'asc' as const }, include: { links: true } } }
        : {}),
    },
    orderBy: [{ isOnboarding: 'desc' }, { title: 'asc' }],
  })

  const tracked = guides.filter((g) => g.isTracked)
  const guideIds = tracked.map((g) => g.id)
  const completions = guideIds.length
    ? await prisma.guideCompletion.findMany({
        where: { guideId: { in: guideIds }, staffId },
        select: {
          guideId: true,
          completedAt: true,
          selfCompleted: true,
          signedOffById: true,
          note: true,
        },
      })
    : []
  const completionMap = new Map(completions.map((c) => [c.guideId, c]))

  // `steps` is conditionally included, so Prisma's inferred type doesn't carry
  // it. This local shape is the contract the include above actually produces.
  type StepWithLinks = {
    id: string
    order: number
    heading: string | null
    content: string
    imageUrl: string | null
    videoUrl: string | null
    links: StepLinkRow[]
  }
  const stepsOf = (g: unknown): StepWithLinks[] => {
    const s = (g as { steps?: unknown }).steps
    return Array.isArray(s) ? (s as StepWithLinks[]) : []
  }

  // One batched target lookup across every step of every guide, rather than one
  // per step. Empty when steps weren't requested.
  const allLinks: StepLinkRow[] = guides.flatMap((g) => stepsOf(g).flatMap((s) => s.links))
  const targetIndex = allLinks.length ? await buildTargetIndex(allLinks) : new Map()

  const items: ResolvedGuide[] = tracked.flatMap((g) => {
    const source = guideSource(g, ctx)
    // The SQL OR and the predicate agree, so this is belt-and-braces — but it
    // keeps a schema change from silently widening what a worker can see.
    if (!source) return []

    const comp = completionMap.get(g.id) ?? null
    const steps = stepsOf(g)

    return [{
      id: g.id,
      title: g.title,
      description: g.description,
      category: g.category,
      requiresSignOff: g.requiresSignOff,
      isOnboarding: g.isOnboarding,
      source,
      assignmentReason: reasonMap.get(g.id) ?? null,
      completed: !!comp,
      completion: comp
        ? {
            completedAt: comp.completedAt,
            selfCompleted: comp.selfCompleted,
            signedOffById: comp.signedOffById,
            note: comp.note,
          }
        : null,
      department: g.department,
      steps: steps.map((s) => ({
        id: s.id,
        order: s.order,
        heading: s.heading,
        content: s.content,
        imageUrl: s.imageUrl,
        videoUrl: s.videoUrl,
        links: attachTargets(s.links, targetIndex),
      })),
    }]
  })

  const reference: ResolvedGuide[] = guides.flatMap((g) => {
    if (g.isTracked) return []
    const source = guideSource(g, ctx)
    if (!source) return []
    return [{
      id: g.id,
      title: g.title,
      description: g.description,
      category: g.category,
      requiresSignOff: g.requiresSignOff,
      isOnboarding: g.isOnboarding,
      source,
      assignmentReason: reasonMap.get(g.id) ?? null,
      completed: false,
      completion: null,
      department: g.department,
      steps: stepsOf(g).map((s) => ({
        id: s.id,
        order: s.order,
        heading: s.heading,
        content: s.content,
        imageUrl: s.imageUrl,
        videoUrl: s.videoUrl,
        links: attachTargets(s.links, targetIndex),
      })),
    }]
  })

  return { staffId: staff.id, items, reference }
}
