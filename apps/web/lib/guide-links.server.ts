// Server half of step links — the database work.
//
// Kept apart from `guide-links.ts` because the worker reader renders links in
// the browser; importing prisma from a module a client component touches pulls
// the pg driver into the client bundle and fails the build.
//
// Because targetId is polymorphic there is no FK, so this module does the two
// things an FK would have given for free:
//   1. batch-load targets — one query per KIND present, never one per step, so a
//      20-step guide costs ≤6 queries instead of ~100
//   2. survive a deleted target — a purged item renders as "ITEM REMOVED"
//      rather than throwing

import { prisma } from '@hospo-ops/db'
import {
  attachTargets,
  groupTargetIdsByKind,
  targetKey,
  type LinkTarget,
  type ResolvedStepLink,
  type StepLinkKind,
  type StepLinkRow,
} from '@/lib/guide-links'

/** InventoryItem stores photos as a JSON array; the first one is the thumbnail. */
function firstImage(imageUrls: unknown): string | null {
  if (Array.isArray(imageUrls) && typeof imageUrls[0] === 'string') return imageUrls[0]
  return null
}

/**
 * Load every link target in one batch per kind. Soft-deleted rows are excluded,
 * so an archived item correctly reads as missing.
 */
export async function buildTargetIndex(
  links: readonly StepLinkRow[],
): Promise<Map<string, LinkTarget>> {
  const grouped = groupTargetIdsByKind(links)
  const index = new Map<string, LinkTarget>()
  const add = (kind: StepLinkKind, t: Omit<LinkTarget, 'missing'>) =>
    index.set(targetKey(kind, t.id), { ...t, missing: false })

  const jobs: Promise<void>[] = []

  if (grouped.ITEM?.length) {
    jobs.push(
      prisma.inventoryItem
        .findMany({
          where: { id: { in: grouped.ITEM }, deletedAt: null },
          select: {
            id: true, name: true, unit: true, imageUrls: true,
            storageNotes: true,
            storageSection: {
              select: { name: true, department: { select: { name: true } } },
            },
          },
        })
        .then((rows) => {
          for (const r of rows) {
            const where = r.storageSection
              ? `${r.storageSection.department?.name ?? ''} → ${r.storageSection.name}`.replace(/^ → /, '')
              : null
            add('ITEM', {
              id: r.id,
              label: r.name,
              sub: [where, r.storageNotes].filter(Boolean).join(' · ') || r.unit || null,
              imageUrl: firstImage(r.imageUrls),
            })
          }
        }),
    )
  }

  if (grouped.TASK?.length) {
    jobs.push(
      prisma.task
        .findMany({
          where: { id: { in: grouped.TASK }, deletedAt: null },
          select: {
            id: true, title: true,
            department: { select: { name: true } },
            section: { select: { name: true } },
          },
        })
        .then((rows) => {
          for (const r of rows) {
            add('TASK', {
              id: r.id,
              label: r.title,
              sub: [r.department?.name, r.section?.name].filter(Boolean).join(' → ') || null,
              imageUrl: null,
            })
          }
        }),
    )
  }

  if (grouped.CHECKLIST?.length) {
    jobs.push(
      prisma.checklist
        .findMany({
          where: { id: { in: grouped.CHECKLIST }, deletedAt: null },
          select: { id: true, name: true, _count: { select: { tasks: true } } },
        })
        .then((rows) => {
          for (const r of rows) {
            add('CHECKLIST', {
              id: r.id,
              label: r.name,
              sub: `${r._count.tasks} TASK${r._count.tasks === 1 ? '' : 'S'}`,
              imageUrl: null,
            })
          }
        }),
    )
  }

  if (grouped.GUIDE?.length) {
    jobs.push(
      prisma.guide
        .findMany({
          where: { id: { in: grouped.GUIDE }, deletedAt: null },
          select: { id: true, title: true, status: true, category: true },
        })
        .then((rows) => {
          for (const r of rows) {
            add('GUIDE', {
              id: r.id,
              label: r.title,
              sub: [r.category, r.status].filter(Boolean).join(' · '),
              imageUrl: null,
            })
          }
        }),
    )
  }

  if (grouped.SECTION?.length) {
    jobs.push(
      prisma.section
        .findMany({
          where: { id: { in: grouped.SECTION }, deletedAt: null },
          select: { id: true, name: true, department: { select: { name: true } } },
        })
        .then((rows) => {
          for (const r of rows) {
            add('SECTION', {
              id: r.id,
              label: r.name,
              sub: r.department?.name ?? null,
              imageUrl: null,
            })
          }
        }),
    )
  }

  if (grouped.RECIPE?.length) {
    jobs.push(
      prisma.recipe
        .findMany({
          where: { id: { in: grouped.RECIPE }, deletedAt: null },
          select: { id: true, name: true, yieldQty: true, yieldUnit: { select: { name: true } } },
        })
        .then((rows) => {
          for (const r of rows) {
            add('RECIPE', {
              id: r.id,
              label: r.name,
              sub: r.yieldQty ? `YIELDS ${r.yieldQty} ${r.yieldUnit?.name ?? ''}`.trim() : null,
              imageUrl: null,
            })
          }
        }),
    )
  }

  await Promise.all(jobs)
  return index
}

/** Links with their targets resolved — the shape both the editor and reader use. */
export async function resolveStepLinks(
  links: readonly StepLinkRow[],
): Promise<ResolvedStepLink[]> {
  if (links.length === 0) return []
  return attachTargets(links, await buildTargetIndex(links))
}
