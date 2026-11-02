// Server-only data access for BEO block-area playbook links.

import { prisma } from '@hospo-ops/db'
import { BEO_LINK_KINDS, type BeoLinkRow } from '@/lib/beo-links'

/** Every live link row for a venue. */
export async function loadBlockLinks(venueId: string): Promise<BeoLinkRow[]> {
  const rows = await prisma.beoBlockLink.findMany({
    where: { venueId, deletedAt: null },
    select: { blockType: true, kind: true, targetId: true, sortOrder: true },
    orderBy: [{ blockType: 'asc' }, { kind: 'asc' }, { sortOrder: 'asc' }],
  })
  return rows
}

export interface BlockLinkInput {
  guideIds?: string[]
  taskIds?: string[]
  checklistIds?: string[]
}

function idsFor(kind: string, input: BlockLinkInput): string[] {
  if (kind === 'GUIDE') return input.guideIds ?? []
  if (kind === 'TASK') return input.taskIds ?? []
  if (kind === 'CHECKLIST') return input.checklistIds ?? []
  return []
}

/**
 * Replace every link for one block area. Rows no longer wanted are soft-deleted,
 * kept ones are upserted (reviving a soft-deleted row via the compound unique),
 * and `sortOrder` follows the incoming order within each kind.
 */
export async function saveBlockLinks(
  venueId: string,
  blockType: string,
  input: BlockLinkInput,
): Promise<void> {
  const desired = new Map<string, { kind: string; targetId: string; sortOrder: number }>()
  for (const kind of BEO_LINK_KINDS) {
    idsFor(kind, input).forEach((targetId, i) => {
      if (!targetId) return
      desired.set(`${kind}:${targetId}`, { kind, targetId, sortOrder: i })
    })
  }

  const existing = await prisma.beoBlockLink.findMany({
    where: { venueId, blockType },
    select: { id: true, kind: true, targetId: true, deletedAt: true },
  })

  const keptIds = new Set<string>()
  for (const row of existing) {
    const key = `${row.kind}:${row.targetId}`
    if (desired.has(key)) keptIds.add(row.id)
  }

  const removeIds = existing.filter((r) => !r.deletedAt && !keptIds.has(r.id)).map((r) => r.id)

  await prisma.$transaction(async (tx) => {
    if (removeIds.length > 0) {
      await tx.beoBlockLink.updateMany({
        where: { id: { in: removeIds } },
        data: { deletedAt: new Date() },
      })
    }
    for (const { kind, targetId, sortOrder } of desired.values()) {
      await tx.beoBlockLink.upsert({
        where: { venueId_blockType_kind_targetId: { venueId, blockType, kind, targetId } },
        update: { sortOrder, deletedAt: null },
        create: { venueId, blockType, kind, targetId, sortOrder },
      })
    }
  })
}
