// Server half of the menu-line model. Never imported by a client component —
// the pure types/helpers live in `menu-lines.ts`. Keeps the read shape of a
// menu (groups + lines) in one place so the list route and the detail route
// cannot drift.

import { Prisma } from '@hospo-ops/db'
import { cleanSizes, variationSizes, type ShapedMenuLine } from './menu-lines'

export type { ShapedMenuLine }

/** Prisma include for a menu with its groups and both kinds of line. */
export const menuInclude = {
  groups: {
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, sortOrder: true },
  },
  items: {
    where: {
      OR: [{ menuItem: { deletedAt: null } }, { inventoryItem: { deletedAt: null } }],
    },
    include: {
      menuItem: {
        select: { id: true, name: true, price: true, dietaryInfo: true, isActive: true, imageUrl: true, variations: true },
      },
      inventoryItem: { select: { id: true, name: true, unit: true, isActive: true } },
    },
    orderBy: { sortOrder: 'asc' },
  },
} satisfies Prisma.MenuInclude

type RawLine = {
  id: string
  groupId: string | null
  menuItemId: string | null
  inventoryItemId: string | null
  minQty: number | null
  maxQty: number | null
  sortOrder: number
  sizeOptions: unknown
  menuItem?: {
    id: string
    name: string
    price: number
    dietaryInfo: string | null
    isActive: boolean
    imageUrl: string | null
    variations: unknown
  } | null
  inventoryItem?: { id: string; name: string; unit: string; isActive: boolean } | null
}

/** Turn a raw Prisma menu line into the shape the builder consumes. */
export function shapeMenuLine(l: RawLine): ShapedMenuLine {
  const isProduct = !!l.menuItemId
  const src = isProduct ? l.menuItem : l.inventoryItem
  return {
    id: l.id,
    kind: isProduct ? 'PRODUCT' : 'STOCK',
    groupId: l.groupId,
    menuItemId: l.menuItemId,
    inventoryItemId: l.inventoryItemId,
    name: src?.name ?? 'REMOVED',
    price: isProduct ? l.menuItem?.price ?? 0 : null,
    dietaryInfo: isProduct ? l.menuItem?.dietaryInfo ?? null : null,
    isActive: src?.isActive ?? false,
    imageUrl: isProduct ? l.menuItem?.imageUrl ?? null : null,
    unit: isProduct ? null : l.inventoryItem?.unit ?? null,
    minQty: l.minQty,
    maxQty: l.maxQty,
    sortOrder: l.sortOrder,
    sizes: isProduct ? variationSizes(l.menuItem?.variations) : cleanSizes(l.sizeOptions),
  }
}
