// Server half of product-reference tables: batch-load the linked menu items a
// table's rows point at, so a reference reads its derived price/description/
// image in one query. Prisma-backed — never import from a client component.

import { prisma } from '@hospo-ops/db'
import {
  displayCellImage,
  displayCellText,
  type ReferenceColumn,
  type ReferenceMenuItem,
} from '@/lib/reference-table'
import { loadImageDataUrl, type GuidePdfTableItem } from '@/lib/guide-pdf'
import { summariseMethods, summariseServes } from '@/lib/menu-serves'

/**
 * Load every referenced MenuItem in one query. Missing/soft-deleted ids are
 * simply absent from the map, so the caller renders a blank derived cell rather
 * than throwing.
 */
export async function loadMenuItemIndex(
  ids: readonly (string | null | undefined)[],
): Promise<Map<string, ReferenceMenuItem>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))]
  if (unique.length === 0) return new Map()
  const rows = await prisma.menuItem.findMany({
    where: { id: { in: unique }, deletedAt: null },
    select: {
      id: true,
      name: true,
      price: true,
      description: true,
      imageUrl: true,
      dietaryInfo: true,
      // Serves drive the derived METHOD / SERVE columns.
      serves: {
        where: { deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: {
          method: true,
          label: true,
          qty: true,
          uom: { select: { name: true } },
          recipe: { select: { name: true } },
          inventoryItem: { select: { name: true } },
        },
      },
    },
  })
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        price: r.price,
        description: r.description,
        imageUrl: r.imageUrl,
        dietaryInfo: r.dietaryInfo,
        serveMethod: summariseMethods(r.serves),
        serveSummary: summariseServes(r.serves),
      },
    ]),
  )
}

interface PdfTableRowInput {
  menuItemId: string | null
  cells: unknown
}

/**
 * Flatten a reference table into print-ready blocks: each row's item name as a
 * heading, its first image loaded as a data URL, and the remaining columns as
 * labelled fields. Returns null when there are no columns (a step guide).
 */
export async function buildPdfTable(
  columns: ReferenceColumn[],
  rows: PdfTableRowInput[],
): Promise<GuidePdfTableItem[] | null> {
  if (columns.length === 0) return null
  const menuIndex = await loadMenuItemIndex(rows.map((r) => r.menuItemId))
  const headingCol = columns.find((c) => c.type === 'MENU_ITEM')

  const items: GuidePdfTableItem[] = []
  for (const raw of rows) {
    const row = {
      menuItem: raw.menuItemId ? menuIndex.get(raw.menuItemId) ?? null : null,
      cells: (raw.cells && typeof raw.cells === 'object' ? raw.cells : {}) as Record<string, unknown>,
    }
    let imageUrl: string | null = null
    for (const col of columns) {
      const img = displayCellImage(row, col)
      if (img) {
        imageUrl = img
        break
      }
    }
    items.push({
      heading: headingCol ? displayCellText(row, headingCol) : null,
      imageDataUrl: imageUrl ? await loadImageDataUrl(imageUrl) : null,
      fields: columns
        .filter((c) => c.type !== 'MENU_ITEM' && !displayCellImage(row, c))
        .map((c) => ({ label: c.label, value: displayCellText(row, c) ?? '—' })),
    })
  }
  return items
}
