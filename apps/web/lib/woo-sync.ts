import { prisma } from '@hospo-ops/db'
import { logSync } from '@/lib/sync-log'

// ── WooCommerce Product Pull ──────────────────────────────────────────
// Shared by: the internal scheduler, GET /api/cron/woocommerce-sync,
// the /admin/sync PULL NOW button, and the product.* webhook handler.
// Fetches products from each active WooCommerce store and upserts them
// into the local MenuItem table. Every outcome is written to SyncLog.
// ──────────────────────────────────────────────────────────────────────

export interface ProductPullResult {
  venueId: string
  storeUrl: string
  created: number
  updated: number
  errors: number
  syncedAt: string
}

export function wooAuthHeader(consumerKey: string, consumerSecret: string): string {
  return `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')}`
}

async function fetchWooProducts(storeUrl: string, consumerKey: string, consumerSecret: string): Promise<any[]> {
  const baseUrl = storeUrl.replace(/\/+$/, '')
  const products: any[] = []
  let page = 1

  // Paginate until a short page comes back (WooCommerce caps per_page at 100)
  for (;;) {
    const response = await fetch(`${baseUrl}/wp-json/wc/v3/products?per_page=100&page=${page}`, {
      headers: {
        Authorization: wooAuthHeader(consumerKey, consumerSecret),
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch products from ${storeUrl}: HTTP ${response.status}`)
    }

    const batch: any[] = await response.json()
    products.push(...batch)
    if (batch.length < 100) break
    page++
  }

  return products
}

// Upsert a single WooCommerce product payload into the MenuItem table.
// Returns 'created' | 'updated'.
export async function upsertProductFromWoo(
  venueId: string,
  product: any,
): Promise<'created' | 'updated'> {
  const wooProductId = String(product.id)
  const name = product.name?.toUpperCase() ?? 'IMPORTED PRODUCT'
  const price = parseFloat(product.price ?? '0')
  const categoryId = product.categories?.[0]?.id ? String(product.categories[0].id) : null
  const imageUrl = product.images?.[0]?.src ?? null
  const description = product.description?.replace(/<[^>]*>/g, '').trim() ?? null

  const existing = await prisma.menuItem.findFirst({
    where: { wooProductId, venueId, deletedAt: null },
  })

  if (existing) {
    await prisma.menuItem.update({
      where: { id: existing.id },
      data: { name, price, wooCategoryId: categoryId, imageUrl, description },
    })
    return 'updated'
  }

  await prisma.menuItem.create({
    data: {
      venueId,
      name,
      recipeId: '', // placeholder — link recipe manually in admin
      price,
      wooProductId,
      wooCategoryId: categoryId,
      imageUrl,
      description,
    },
  })
  return 'created'
}

// Pull products for all active integrations (or a single venue).
export async function runProductPull(venueId?: string): Promise<ProductPullResult[]> {
  const integrations = await prisma.wooIntegration.findMany({
    where: { isActive: true, deletedAt: null, ...(venueId ? { venueId } : {}) },
  })

  const results: ProductPullResult[] = []

  for (const integration of integrations) {
    let created = 0
    let updated = 0
    let errors = 0

    try {
      const products = await fetchWooProducts(
        integration.storeUrl,
        integration.consumerKey,
        integration.consumerSecret,
      )

      for (const product of products) {
        try {
          const outcome = await upsertProductFromWoo(integration.venueId, product)
          if (outcome === 'created') created++
          else updated++
        } catch (e) {
          errors++
          await logSync({
            venueId: integration.venueId,
            direction: 'PULL',
            entity: 'PRODUCT',
            status: 'ERROR',
            externalId: String(product?.id ?? ''),
            message: `PRODUCT UPSERT FAILED: ${product?.name ?? 'UNKNOWN'}`,
            detail: { error: String(e) },
          })
        }
      }

      await prisma.wooIntegration.update({
        where: { id: integration.id },
        data: { lastSyncAt: new Date() },
      })

      await logSync({
        venueId: integration.venueId,
        direction: 'PULL',
        entity: 'PRODUCT',
        status: errors > 0 ? 'ERROR' : 'SUCCESS',
        message: `PULLED ${products.length} PRODUCTS FROM ${integration.storeUrl} — ${created} CREATED, ${updated} UPDATED${errors > 0 ? `, ${errors} FAILED` : ''}`,
        detail: { created, updated, errors, total: products.length },
      })
    } catch (e) {
      console.error(`Sync failed for ${integration.storeUrl}:`, e)
      errors++
      await logSync({
        venueId: integration.venueId,
        direction: 'PULL',
        entity: 'PRODUCT',
        status: 'ERROR',
        message: `PRODUCT PULL FAILED FOR ${integration.storeUrl}`,
        detail: { error: String(e) },
      })
    }

    results.push({
      venueId: integration.venueId,
      storeUrl: integration.storeUrl,
      created,
      updated,
      errors,
      syncedAt: new Date().toISOString(),
    })
  }

  return results
}
