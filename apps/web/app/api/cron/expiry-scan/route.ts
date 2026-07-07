import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'

// ── Auto-Expiry Cron ──────────────────────────────────────────────────
// Runs daily via external cron trigger. Finds expired InventoryItems,
// traces the BOM tree back to the parent WooCommerce product, and
// applies the item's fallbackCategoryId.
//
// Trigger: GET /api/cron/expiry-scan
// Auth:    Authorization: Bearer <CRON_SECRET>
// ──────────────────────────────────────────────────────────────────────

async function authenticate(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!(await authenticate(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Find all non-deleted items with an elapsed expiry date
  const expiredItems = await prisma.inventoryItem.findMany({
    where: {
      expiryDate: { lte: now },
      deletedAt: null,
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
    return NextResponse.json({ message: 'No expired items found.', scannedAt: now.toISOString(), expiredCount: 0 })
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

  return NextResponse.json({
    message,
    scannedAt: now.toISOString(),
    expiredCount: results.length,
    fallbackAppliedCount: results.filter((r) => r.appliedFallback).length,
    results,
  })
}
