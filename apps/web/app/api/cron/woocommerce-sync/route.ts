import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'

// ── WooCommerce Product Sync Cron ─────────────────────────────────────
// Runs daily via external cron trigger. Fetches products from each active
// WooCommerce store and upserts them into the local MenuItem table.
//
// Trigger: GET /api/cron/woocommerce-sync
// Auth:    Authorization: Bearer <CRON_SECRET>
// ──────────────────────────────────────────────────────────────────────

async function authenticate(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

async function fetchWooProducts(storeUrl: string, consumerKey: string, consumerSecret: string): Promise<any[]> {
  const baseUrl = storeUrl.replace(/\/+$/, '')
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')

  const response = await fetch(`${baseUrl}/wp-json/wc/v3/products?per_page=100`, {
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    console.error(`Failed to fetch products from ${storeUrl}: ${response.status}`)
    return []
  }

  return response.json()
}

export async function GET(req: NextRequest) {
  if (!(await authenticate(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const integrations = await prisma.wooIntegration.findMany({
    where: { isActive: true, deletedAt: null },
  })

  const results: { venueId: string; storeUrl: string; created: number; updated: number; syncedAt: string }[] = []

  for (const integration of integrations) {
    let created = 0
    let updated = 0

    try {
      const products = await fetchWooProducts(
        integration.storeUrl,
        integration.consumerKey,
        integration.consumerSecret,
      )

      for (const product of products) {
        const wooProductId = String(product.id)
        const name = product.name?.toUpperCase() ?? 'IMPORTED PRODUCT'
        const price = parseFloat(product.price ?? '0')
        const categoryId = product.categories?.[0]?.id ? String(product.categories[0].id) : null

        const existing = await prisma.menuItem.findFirst({
          where: { wooProductId, venueId: integration.venueId, deletedAt: null },
        })

        if (existing) {
          await prisma.menuItem.update({
            where: { id: existing.id },
            data: {
              name,
              price,
              wooCategoryId: categoryId,
              imageUrl: product.images?.[0]?.src ?? null,
              description: product.description?.replace(/<[^>]*>/g, '').trim() ?? null,
            },
          })
          updated++
        } else {
          await prisma.menuItem.create({
            data: {
              venueId: integration.venueId,
              name,
              recipeId: '', // placeholder — link recipe manually in admin
              price,
              wooProductId,
              wooCategoryId: categoryId,
              imageUrl: product.images?.[0]?.src ?? null,
              description: product.description?.replace(/<[^>]*>/g, '').trim() ?? null,
            },
          })
          created++
        }
      }

      await prisma.wooIntegration.update({
        where: { id: integration.id },
        data: { lastSyncAt: new Date() },
      })

      results.push({
        venueId: integration.venueId,
        storeUrl: integration.storeUrl,
        created,
        updated,
        syncedAt: new Date().toISOString(),
      })
    } catch (e) {
      console.error(`Sync failed for ${integration.storeUrl}:`, e)
      results.push({
        venueId: integration.venueId,
        storeUrl: integration.storeUrl,
        created: 0,
        updated: 0,
        syncedAt: new Date().toISOString(),
      })
    }
  }

  const totalCreated = results.reduce((s, r) => s + r.created, 0)
  const totalUpdated = results.reduce((s, r) => s + r.updated, 0)

  return NextResponse.json({
    message: `Synced ${results.length} stores. ${totalCreated} products created, ${totalUpdated} updated.`,
    results,
  })
}
