import { prisma } from '@hospo-ops/db'
import { logSync } from '@/lib/sync-log'
import { oauthSignedUrl } from '@/lib/woo-oauth'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

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

// WooCommerce sends an UNSIGNED activation ping (form body "webhook_id=N")
// when a webhook is saved or re-activated, and requires a 2xx response —
// otherwise wp-admin shows "Delivery URL returned response code: 401" and
// the webhook is disabled. There is nothing to process in a ping.
export function isWebhookPing(rawBody: string): boolean {
  return /^webhook_id=\d+$/.test(rawBody.trim())
}

async function fetchWooProducts(storeUrl: string, consumerKey: string, consumerSecret: string): Promise<any[]> {
  const baseUrl = storeUrl.replace(/\/+$/, '')
  const products: any[] = []
  let page = 1

  // Paginate until a short page comes back (WooCommerce caps per_page at 100)
  for (;;) {
    const url = `${baseUrl}/wp-json/wc/v3/products?per_page=100&page=${page}`
    let response = await fetch(url, {
      headers: {
        Authorization: wooAuthHeader(consumerKey, consumerSecret),
        'Content-Type': 'application/json',
      },
    })

    // Many WordPress hosts strip the Authorization header before it reaches
    // PHP, which makes Basic auth fail with 401 even when the keys are right.
    // WooCommerce's documented fallback is query-string credentials (HTTPS).
    if (response.status === 401) {
      response = await fetch(
        `${url}&consumer_key=${encodeURIComponent(consumerKey)}&consumer_secret=${encodeURIComponent(consumerSecret)}`,
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Behind proxies/tunnels (e.g. Cloudflare) WordPress often fails to detect
    // HTTPS (is_ssl() false) and rejects plain credentials with
    // "woocommerce_rest_cannot_view". OAuth 1.0a signed requests are
    // WooCommerce's required method in that case.
    if (response.status === 401) {
      response = await fetch(oauthSignedUrl('GET', url, consumerKey, consumerSecret), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const text = await response.text()

    if (!response.ok) {
      throw new Error(
        response.status === 401
          ? `HTTP 401 from ${baseUrl} (tried header, query-string AND OAuth1 auth) — re-check the Consumer Key/Secret in Settings (re-paste both; saved dots keep the OLD value) and confirm the key has Read/Write permission: ${text.slice(0, 300)}`
          : `HTTP ${response.status} from ${baseUrl}: ${text.slice(0, 300)}`,
      )
    }

    let batch: any
    try {
      batch = JSON.parse(text)
    } catch {
      throw new Error(
        `Non-JSON response from ${baseUrl} (check STORE URL points at the WordPress root and no security plugin is intercepting /wp-json): ${text.slice(0, 300)}`,
      )
    }
    if (!Array.isArray(batch)) {
      throw new Error(`Unexpected response shape from ${baseUrl}: ${JSON.stringify(batch).slice(0, 300)}`)
    }

    products.push(...batch)
    if (batch.length < 100) break
    page++
  }

  return products
}

// Fetch all product categories from a WooCommerce store.
// Uses the same three-tier auth fallback as fetchWooProducts.
export async function fetchWooCategories(storeUrl: string, consumerKey: string, consumerSecret: string): Promise<{ id: number; name: string }[]> {
  const baseUrl = storeUrl.replace(/\/+$/, '')
  const categories: { id: number; name: string }[] = []
  let page = 1

  for (;;) {
    const url = `${baseUrl}/wp-json/wc/v3/products/categories?per_page=100&page=${page}`
    let response = await fetch(url, {
      headers: { Authorization: wooAuthHeader(consumerKey, consumerSecret), 'Content-Type': 'application/json' },
    })
    if (response.status === 401) {
      response = await fetch(
        `${url}&consumer_key=${encodeURIComponent(consumerKey)}&consumer_secret=${encodeURIComponent(consumerSecret)}`,
        { headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (response.status === 401) {
      response = await fetch(oauthSignedUrl('GET', url, consumerKey, consumerSecret), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (!response.ok) break

    const text = await response.text()
    let batch: any
    try { batch = JSON.parse(text) } catch { break }
    if (!Array.isArray(batch)) break

    for (const cat of batch) {
      if (cat.id && cat.name) categories.push({ id: cat.id, name: cat.name })
    }
    if (batch.length < 100) break
    page++
  }

  return categories.sort((a, b) => a.name.localeCompare(b.name))
}

// Download an image from a URL and store it in the local uploads directory.
// Returns the relative URL path (e.g. /api/upload/uuid-filename.jpg) on success,
// or the original URL on failure (best-effort — never throws).
async function downloadAndStoreImage(imageUrl: string, productName: string): Promise<string> {
  try {
    const res = await fetch(imageUrl)
    if (!res.ok) return imageUrl
    const buffer = Buffer.from(await res.arrayBuffer())
    const uploadPath = process.env.UPLOAD_PATH ?? '/app/uploads'
    await mkdir(uploadPath, { recursive: true })
    const ext = imageUrl.split('.').pop()?.split('?')[0]?.replace(/[^a-z0-9]/gi, '') ?? 'jpg'
    const safeName = productName.replace(/[^a-z0-9]/gi, '_').slice(0, 40)
    const filename = `${crypto.randomUUID()}-${safeName}.${ext}`
    await writeFile(join(uploadPath, filename), buffer)
    return `/api/upload/${filename}`
  } catch {
    return imageUrl
  }
}

// Decode common HTML entities returned by WooCommerce (e.g. &amp; → &).
// Prevents double-encoding when the value is later uppercased and pushed back.
function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&#x0*27;/gi, "'")
}

// Upsert a single WooCommerce product payload into the MenuItem table.
// Returns 'created' | 'updated'.
export async function upsertProductFromWoo(
  venueId: string,
  product: any,
): Promise<'created' | 'updated'> {
  const wooProductId = String(product.id)
  const name = decodeEntities(product.name ?? 'IMPORTED PRODUCT').toUpperCase()
  const price = parseFloat(product.price ?? '0')
  const categoryId = product.categories?.[0]?.id ? String(product.categories[0].id) : null
  const remoteImageUrl = product.images?.[0]?.src ?? null
  const description = product.description?.replace(/<[^>]*>/g, '').trim() ?? null
  const cleanDescription = description ? decodeEntities(description) : null
  const shortDescription = product.short_description?.replace(/<[^>]*>/g, '').trim() ?? null
  const cleanShortDescription = shortDescription ? decodeEntities(shortDescription) : null
  const imageUrl = remoteImageUrl ? await downloadAndStoreImage(remoteImageUrl, name) : null
  const isVariable = product.type === 'variable'

  const existing = await prisma.menuItem.findFirst({
    where: { wooProductId, venueId, deletedAt: null },
  })

  if (existing) {
    await prisma.menuItem.update({
      where: { id: existing.id },
      data: { name, price, wooCategoryId: categoryId, imageUrl, description: cleanDescription, shortDescription: cleanShortDescription, isVariable },
    })
    return 'updated'
  }

  await prisma.menuItem.create({
    data: {
      venueId,
      name,
      recipeId: null, // link recipe manually in admin (Recipes & Menu Items)
      price,
      wooProductId,
      wooCategoryId: categoryId,
      imageUrl,
      description: cleanDescription,
      shortDescription: cleanShortDescription,
      isVariable,
    },
  })
  return 'created'
}

// Pull products for all active integrations (or a single venue). If the venue
// has sharedWooVenueId set, the source venue's integration is used instead.
export async function runProductPull(venueId?: string): Promise<ProductPullResult[]> {
  // Resolve shared Woo venue (source-venue model)
  let effectiveVenueId = venueId
  if (venueId) {
    const v = await prisma.venue.findUnique({
      where: { id: venueId, deletedAt: null },
      select: { sharedWooVenueId: true },
    })
    if (v?.sharedWooVenueId) effectiveVenueId = v.sharedWooVenueId
  }

  const integrations = await prisma.wooIntegration.findMany({
    where: { isActive: true, deletedAt: null, venue: { isDemo: false }, ...(effectiveVenueId ? { venueId: effectiveVenueId } : {}) },
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
