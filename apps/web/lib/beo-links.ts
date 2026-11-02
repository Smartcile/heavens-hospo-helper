// Pure helpers for the playbook references attached to a BEO block area.
// Prisma-free: the server loads `BeoBlockLink` rows and hands them here, and the
// same grouping decorates the library the builder, PDF and share view read.

import type { BeoBlockDef, BlockLibrary } from '@/lib/beo-blocks'

export const BEO_LINK_KINDS = ['GUIDE', 'TASK', 'CHECKLIST'] as const
export type BeoLinkKind = (typeof BEO_LINK_KINDS)[number]

/** A `BeoBlockLink` row (only the fields the pure helpers need). */
export interface BeoLinkRow {
  blockType: string
  kind: string
  targetId: string
  sortOrder?: number
}

export interface BlockLinkSets {
  guideIds: string[]
  taskIds: string[]
  checklistIds: string[]
}

export function emptyLinkSets(): BlockLinkSets {
  return { guideIds: [], taskIds: [], checklistIds: [] }
}

function bucket(sets: BlockLinkSets, kind: string): string[] | null {
  if (kind === 'GUIDE') return sets.guideIds
  if (kind === 'TASK') return sets.taskIds
  if (kind === 'CHECKLIST') return sets.checklistIds
  return null
}

/** Group link rows by block type, splitting each into guide/task/checklist ids. */
export function groupLinksByBlock(links: BeoLinkRow[] | null | undefined): Map<string, BlockLinkSets> {
  const map = new Map<string, BlockLinkSets>()
  const ordered = [...(links ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  for (const link of ordered) {
    const blockType = String(link.blockType ?? '')
    if (!blockType || !link.targetId) continue
    const sets = map.get(blockType) ?? emptyLinkSets()
    const list = bucket(sets, String(link.kind))
    if (list && !list.includes(link.targetId)) list.push(link.targetId)
    map.set(blockType, sets)
  }
  return map
}

/** Attach the grouped references to every matching def in a library. */
export function decorateLibrary(library: BlockLibrary, links: BeoLinkRow[]): BlockLibrary {
  const byBlock = groupLinksByBlock(links)
  if (byBlock.size === 0) return library
  return library.map((def) => {
    const sets = byBlock.get(def.type)
    return sets ? { ...def, ...sets } : def
  })
}

/** The ids a block area references of one kind. */
export function linkIdsFor(def: BeoBlockDef | undefined, kind: BeoLinkKind): string[] {
  if (!def) return []
  if (kind === 'GUIDE') return def.guideIds ?? []
  if (kind === 'TASK') return def.taskIds ?? []
  return def.checklistIds ?? []
}

/** A human label for a link kind. */
export function linkKindLabel(kind: string): string {
  if (kind === 'GUIDE') return 'GUIDE'
  if (kind === 'TASK') return 'TASK'
  if (kind === 'CHECKLIST') return 'CHECKLIST'
  return kind
}
