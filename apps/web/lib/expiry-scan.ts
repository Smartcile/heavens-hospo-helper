import { prisma } from '@hospo-ops/db'

// ── Auto-Expiry Scan ──────────────────────────────────────────────────
// Shared by: the internal scheduler and GET /api/cron/expiry-scan.
// Finds expired InventoryItems, traces the BOM tree back to the parent
// WooCommerce product, and applies the item's fallbackCategoryId.
// ──────────────────────────────────────────────────────────────────────

export interface ExpiryScanResult {
  message: string
  scannedAt: string
  expiredCount: number
  fallbackAppliedCount: number
  results: { itemId: string; itemName: string; affectedProducts: string[]; appliedFallback: boolean }[]
}

export async function runExpiryScan(): Promise<ExpiryScanResult> {
  const now = new Date()

  // Find all non-deleted items with an elapsed expiry date
  const expiredItems = await prisma.inventoryItem.findMany({
    where: {
      expiryDate: { lte: now },
      deletedAt: null,
      venue: { isDemo: false },
    },
    include: {
      category: { select: { id: true, name: true } },
      recipeLineItems: {
        include: {
          recipe: {
            include: {
              menuItems: { select: { id: true, name: true, wooProductId: true } },
            },
          },
        },
      },
    },
  })

  if (expiredItems.length === 0) {
    return {
      message: 'No expired items found.',
      scannedAt: now.toISOString(),
      expiredCount: 0,
      fallbackAppliedCount: 0,
      results: [],
    }
  }

  const results: { itemId: string; itemName: string; affectedProducts: string[]; appliedFallback: boolean }[] = []

  for (const item of expiredItems) {
    // Trace BOM back to parent WooCommerce products
    const affectedProducts = new Set<string>()
    for (const li of item.recipeLineItems) {
      for (const menuItem of li.recipe.menuItems) {
        if (menuItem.wooProductId) {
          affectedProducts.add(menuItem.wooProductId)
        }
      }
    }

    const entry = {
      itemId: item.id,
      itemName: item.name,
      affectedProducts: [...affectedProducts],
      appliedFallback: false,
    }

    // Apply fallback category if set
    if (item.fallbackCategoryId) {
      await prisma.inventoryItem.update({
        where: { id: item.id },
        data: { categoryId: item.fallbackCategoryId, isActive: false },
      })
      entry.appliedFallback = true
    }

    results.push(entry)
  }

  const message = results.some((r) => r.affectedProducts.length > 0)
    ? `${results.length} items expired. ${results.filter((r) => r.affectedProducts.length > 0).length} items linked to WooCommerce products — manual review recommended for bulk WooCommerce category updates.`
    : `${results.length} items expired.`

  return {
    message,
    scannedAt: now.toISOString(),
    expiredCount: results.length,
    fallbackAppliedCount: results.filter((r) => r.appliedFallback).length,
    results,
  }
}
