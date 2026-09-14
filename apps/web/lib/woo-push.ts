import { prisma } from '@hospo-ops/db'
import { logSync } from '@/lib/sync-log'
import { wooAuthHeader } from '@/lib/woo-sync'
import { oauthSignedUrl } from '@/lib/woo-oauth'
import type { MenuItem, OrderStatus, WooIntegration } from '@prisma/client'

// ── WooCommerce Push (App → WordPress) ────────────────────────────────
// Pushes local changes back to the WooCommerce store via the REST API.
// Every pushed payload is stamped with meta_data `_updated_by: hospo-ops`
// so the returning webhook is skipped (infinite-loop guard).
// All pushes are best-effort: they log to SyncLog and never throw.
// ──────────────────────────────────────────────────────────────────────

export const SELF_UPDATE_META = { key: '_updated_by', value: 'hospo-ops' }

// WooCommerce persists meta_data forever, so `_updated_by` alone can't be the
// loop guard (it would skip every future genuine edit of a once-pushed record).
// Each push also stamps `_hospo_ops_pushed_at`; the webhook only skips echoes
// that arrive within this window of the push.
export const PUSH_ECHO_WINDOW_MS = 2 * 60 * 1000

export function selfUpdateMeta(now: Date = new Date()) {
  return [SELF_UPDATE_META, { key: '_hospo_ops_pushed_at', value: now.toISOString() }]
}

// True when a webhook payload is just the echo of our own recent push.
export function isSelfEcho(metaData: { key: string; value: unknown }[], now: Date = new Date()): boolean {
  const updatedBy = metaData.find((m) => m.key === '_updated_by')
  if (updatedBy?.value !== 'hospo-ops') return false
  const pushedAt = metaData.find((m) => m.key === '_hospo_ops_pushed_at')
  if (!pushedAt?.value) return false
  const ts = new Date(String(pushedAt.value)).getTime()
  if (isNaN(ts)) return false
  return now.getTime() - ts < PUSH_ECHO_WINDOW_MS
}

// OrderStatus enum → WooCommerce status slug
export function mapStatusToWoo(status: OrderStatus): string {
  const map: Record<OrderStatus, string> = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  }
  return map[status] ?? 'pending'
}

// Operational terminal states sync back to the store's status — a floor
// marking an order FINALISED means completed, CANCELLED means cancelled.
// Every other opStatus is internal-only (nothing pushes to Woo for it).
export function opStatusToWooStatus(opStatus: string): OrderStatus | null {
  if (opStatus === 'FINALISED') return 'COMPLETED'
  if (opStatus === 'CANCELLED') return 'CANCELLED'
  return null
}

export function buildProductPushPayload(item: Pick<MenuItem, 'name' | 'price' | 'wooCategoryId' | 'imageUrl' | 'shortDescription' | 'isVariable' | 'variations' | 'wooProductId'> & { wooImageId?: string | null }, now: Date = new Date(), opts: { status?: string } = {}) {
  const payload: Record<string, unknown> = {
    name: item.name,
    regular_price: String(item.price ?? 0),
    meta_data: selfUpdateMeta(now),
  }
  if (opts.status) payload.status = opts.status
  if (item.isVariable) {
    payload.type = 'variable'
    const variations = item.variations as any[] | undefined
    if (variations?.length) {
      const names = variations.map((v: any) => v.name).filter(Boolean)
      if (names.length) payload.attributes = [{ name: 'Size', options: names, variation: true, visible: true }]
    }
  }
  if (item.wooCategoryId) {
    const id = parseInt(item.wooCategoryId, 10)
    if (!isNaN(id) && id > 0) {
      payload.categories = [{ id }]
    } else if (item.wooProductId) {
      // Stored category is not a valid WooCommerce id — treat as no category.
      payload.categories = []
    }
  } else if (item.wooProductId) {
    // A previously-linked product saved with no category moves to the store's
    // default "uncategorized" term. WooCommerce's product data store assigns
    // `default_product_cat` on any save with no category ids, so an explicit
    // empty array is the reliable way to clear a stale category. (A brand-new
    // product with no wooProductId gets uncategorized automatically on POST.)
    payload.categories = []
  }
  if (item.imageUrl) {
    const src = item.imageUrl.startsWith('http')
      ? item.imageUrl
      : `${process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? ''}${item.imageUrl}`
    payload.images = [{ src }]
  } else if (item.wooImageId && item.wooProductId) {
    // We pushed the image before and it has since been removed locally —
    // clear it from the store product (reconcile then deletes the media).
    payload.images = []
  }
  if (item.shortDescription) {
    payload.short_description = item.shortDescription
  }
  return payload
}

export function buildOrderStatusPayload(status: OrderStatus, now: Date = new Date()) {
  return {
    status: mapStatusToWoo(status),
    meta_data: selfUpdateMeta(now),
  }
}

async function resolveWooVenueId(venueId: string): Promise<string> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId, deletedAt: null },
    select: { sharedWooVenueId: true },
  })
  return venue?.sharedWooVenueId ?? venueId
}

export async function getIntegration(venueId: string): Promise<WooIntegration | null> {
  const wcVenueId = await resolveWooVenueId(venueId)
  return prisma.wooIntegration.findFirst({
    where: { venueId: wcVenueId, isActive: true, deletedAt: null },
  })
}

async function wooPut(
  integration: WooIntegration,
  path: string,
  payload: unknown,
): Promise<{ ok: boolean; status: number; body: string }> {
  const baseUrl = integration.storeUrl.replace(/\/+$/, '')
  const url = `${baseUrl}/wp-json/wc/v3/${path}`
  const body = JSON.stringify(payload)

  let response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: wooAuthHeader(integration.consumerKey, integration.consumerSecret),
      'Content-Type': 'application/json',
    },
    body,
  })

  // Fallback for hosts that strip the Authorization header (see woo-sync.ts).
  if (response.status === 401) {
    const sep = url.includes('?') ? '&' : '?'
    response = await fetch(
      `${url}${sep}consumer_key=${encodeURIComponent(integration.consumerKey)}&consumer_secret=${encodeURIComponent(integration.consumerSecret)}`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body },
    )
  }

  // Final fallback: OAuth 1.0a signed request — required when WordPress
  // can't detect HTTPS behind a proxy/tunnel (see woo-oauth.ts).
  if (response.status === 401) {
    response = await fetch(
      oauthSignedUrl('PUT', url, integration.consumerKey, integration.consumerSecret),
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body },
    )
  }

  const responseBody = await response.text()
  return { ok: response.ok, status: response.status, body: responseBody }
}

async function wooPost(
  integration: WooIntegration,
  path: string,
  payload: unknown,
): Promise<{ ok: boolean; status: number; body: string }> {
  const baseUrl = integration.storeUrl.replace(/\/+$/, '')
  const url = `${baseUrl}/wp-json/wc/v3/${path}`
  const body = JSON.stringify(payload)

  let response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: wooAuthHeader(integration.consumerKey, integration.consumerSecret),
      'Content-Type': 'application/json',
    },
    body,
  })

  if (response.status === 401) {
    const sep = url.includes('?') ? '&' : '?'
    response = await fetch(
      `${url}${sep}consumer_key=${encodeURIComponent(integration.consumerKey)}&consumer_secret=${encodeURIComponent(integration.consumerSecret)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
    )
  }

  if (response.status === 401) {
    response = await fetch(
      oauthSignedUrl('POST', url, integration.consumerKey, integration.consumerSecret),
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
    )
  }

  const responseBody = await response.text()
  return { ok: response.ok, status: response.status, body: responseBody }
}

// Push a menu item's name / price / category / image to its linked WooCommerce product.
// If no wooProductId exists, creates the product on WooCommerce via POST and
// stores the returned ID. If a PUT fails because the product doesn't exist,
// falls back to POST creation. `opts.status` (e.g. "publish") is sent verbatim —
// omitted on a normal save so an operator's manual store status is not clobbered.
export async function pushProduct(menuItemId: string, opts: { status?: string } = {}): Promise<void> {
  try {
    const item = await prisma.menuItem.findFirst({
      where: { id: menuItemId, deletedAt: null },
    })
    if (!item) return

    const integration = await getIntegration(item.venueId)
    if (!integration) {
      await logSync({
        venueId: item.venueId,
        direction: 'PUSH',
        entity: 'PRODUCT',
        status: 'SKIPPED',
        message: `PUSH SKIPPED — NO ACTIVE WOOCOMMERCE INTEGRATION FOR VENUE`,
      })
      return
    }

    const payload = buildProductPushPayload(item, undefined, opts)

    // If we have a wooProductId, try PUT first.
    if (item.wooProductId) {
      const res = await wooPut(integration, `products/${item.wooProductId}`, payload)
      if (res.ok) {
        await logSync({
          venueId: item.venueId,
          direction: 'PUSH',
          entity: 'PRODUCT',
          status: 'SUCCESS',
          externalId: item.wooProductId,
          message: `PUSHED ${item.name} TO WOOCOMMERCE (PRODUCT #${item.wooProductId})`,
          detail: { payload },
        })
        await reconcileProductImage(item, integration, res.body)
        await pushVariationPrices(item, integration)
        return
      }
      // If the product doesn't exist on WooCommerce, fall through to POST create.
      if (res.status !== 400 && res.status !== 404) {
        await logSync({
          venueId: item.venueId,
          direction: 'PUSH',
          entity: 'PRODUCT',
          status: 'ERROR',
          externalId: item.wooProductId,
          message: `PUSH FAILED FOR ${item.name} — HTTP ${res.status}`,
          detail: { payload, response: res.body.slice(0, 1000) },
        })
        return
      }
    }

    // No wooProductId or PUT returned 400/404 — create via POST.
    const postRes = await wooPost(integration, 'products', payload)
    if (!postRes.ok) {
      await logSync({
        venueId: item.venueId,
        direction: 'PUSH',
        entity: 'PRODUCT',
        status: 'ERROR',
        externalId: item.wooProductId,
        message: `PUSH FAILED FOR ${item.name} — POST CREATE HTTP ${postRes.status}`,
        detail: { payload, response: postRes.body.slice(0, 1000) },
      })
      return
    }

    // Parse the created product's ID from the response and store it.
    let newWooId: string | null = null
    try {
      const created = JSON.parse(postRes.body)
      if (created?.id) newWooId = String(created.id)
    } catch { /* best-effort */ }

    if (newWooId) {
      await prisma.menuItem.update({
        where: { id: item.id },
        data: { wooProductId: newWooId },
      })
    }

    await logSync({
      venueId: item.venueId,
      direction: 'PUSH',
      entity: 'PRODUCT',
      status: 'SUCCESS',
      externalId: newWooId ?? undefined,
      message: newWooId
        ? `PUSHED ${item.name} — CREATED ON WOOCOMMERCE AS PRODUCT #${newWooId}`
        : `PUSHED ${item.name} — CREATED ON WOOCOMMERCE`,
      detail: { payload },
    })
    await reconcileProductImage(item, integration, postRes.body)
    await pushVariationPrices(item, integration)
  } catch (e) {
    console.error('pushProduct failed (non-blocking):', e)
    await logSync({
      direction: 'PUSH',
      entity: 'PRODUCT',
      status: 'ERROR',
      message: `PUSH FAILED — ${String(e)}`,
    })
  }
}

// ── Product image ↔ WordPress media tracking ────────────────────────────
// When a product image is pushed, WooCommerce copies it into its own media
// library. We record the resulting attachment id (MenuItem.wooImageId) so
// the app can remove that WordPress copy when the local image changes or the
// local file is deleted — while keeping the local file itself (it may still
// be referenced elsewhere or simply kept as history).

type StoredMenuItem = NonNullable<Awaited<ReturnType<typeof prisma.menuItem.findFirst>>>

function imageIdFromProductBody(body: string): string | null {
  try {
    const product = JSON.parse(body)
    const images = Array.isArray(product?.images) ? product.images : []
    if (images.length === 0) return null
    return images[0]?.id != null ? String(images[0].id) : null
  } catch {
    return null
  }
}

/** DELETE /wp-json/wp/v2/media/{id}?force=true via the Woo keys (they are
 *  WordPress REST users — the same auth chain as the wc calls). */
async function wooMediaDelete(integration: WooIntegration, mediaId: string): Promise<boolean> {
  const baseUrl = integration.storeUrl.replace(/\/+$/, '')
  const url = `${baseUrl}/wp-json/wp/v2/media/${encodeURIComponent(mediaId)}?force=true`
  let response = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: wooAuthHeader(integration.consumerKey, integration.consumerSecret) },
  })
  if (response.status === 401) {
    const sep = url.includes('?') ? '&' : '?'
    response = await fetch(
      `${url}${sep}consumer_key=${encodeURIComponent(integration.consumerKey)}&consumer_secret=${encodeURIComponent(integration.consumerSecret)}`,
      { method: 'DELETE' },
    )
  }
  if (response.status === 401) {
    response = await fetch(
      oauthSignedUrl('DELETE', url, integration.consumerKey, integration.consumerSecret),
      { method: 'DELETE' },
    )
  }
  return response.ok || response.status === 404
}

/**
 * After a successful product push, keep `wooImageId` in step with the store:
 * store the new attachment id, and when the old pushed image is gone from the
 * product (replaced, or cleared because the local image was removed) delete
 * the old WordPress media attachment. Never throws.
 */
async function reconcileProductImage(item: StoredMenuItem, integration: WooIntegration, productBody: string) {
  try {
    const newId = imageIdFromProductBody(productBody)
    const prevId = item.wooImageId ?? null

    if (newId) {
      if (newId !== prevId) {
        await prisma.menuItem.update({
          where: { id: item.id },
          data: { wooImageId: newId },
        })
        if (prevId) await deleteWooMedia(item, integration, prevId)
      }
      return
    }

    // No images on the store product now.
    if (prevId && !item.imageUrl) {
      await prisma.menuItem.update({
        where: { id: item.id },
        data: { wooImageId: null },
      })
      await deleteWooMedia(item, integration, prevId)
    }
  } catch (e) {
    console.error('reconcileProductImage failed (non-blocking):', e)
  }
}

async function deleteWooMedia(item: StoredMenuItem, integration: WooIntegration, mediaId: string) {
  const ok = await wooMediaDelete(integration, mediaId)
  if (!ok) {
    await logSync({
      venueId: item.venueId,
      direction: 'PUSH',
      entity: 'PRODUCT',
      status: 'ERROR',
      externalId: mediaId,
      message: `OLD PRODUCT IMAGE #${mediaId} COULD NOT BE REMOVED FROM WORDPRESS`,
    })
  }
}

// Push variation prices for a variable product to WooCommerce.
// Only pushes variations that already have a wooVariationId (pulled from Woo).
async function pushVariationPrices(item: NonNullable<Awaited<ReturnType<typeof prisma.menuItem.findFirst>>>, integration: WooIntegration) {
  const variations = item.variations as any[] | undefined
  if (!item.wooProductId || !variations?.length) return

  for (const v of variations) {
    if (!v.wooVariationId || v.price == null) continue
    const payload = { regular_price: String(v.price), meta_data: selfUpdateMeta() }
    const path = `products/${item.wooProductId}/variations/${v.wooVariationId}`
    const res = await wooPut(integration, path, payload)
    if (!res.ok) {
      await logSync({
        venueId: item.venueId,
        direction: 'PUSH',
        entity: 'PRODUCT',
        status: 'ERROR',
        externalId: String(v.wooVariationId),
        message: `VARIATION #${v.wooVariationId} (${v.name ?? ''}) PUSH FAILED — HTTP ${res.status}`,
      })
    }
  }
}

async function wooGet(
  integration: WooIntegration,
  path: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const baseUrl = integration.storeUrl.replace(/\/+$/, '')
  const url = `${baseUrl}/wp-json/wc/v3/${path}`

  let response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: wooAuthHeader(integration.consumerKey, integration.consumerSecret) },
  })
  if (response.status === 401) {
    const sep = url.includes('?') ? '&' : '?'
    response = await fetch(
      `${url}${sep}consumer_key=${encodeURIComponent(integration.consumerKey)}&consumer_secret=${encodeURIComponent(integration.consumerSecret)}`,
    )
  }
  if (response.status === 401) {
    response = await fetch(
      oauthSignedUrl('GET', url, integration.consumerKey, integration.consumerSecret),
    )
  }
  const responseBody = await response.text()
  return { ok: response.ok, status: response.status, body: responseBody }
}

async function wooDelete(
  integration: WooIntegration,
  path: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const baseUrl = integration.storeUrl.replace(/\/+$/, '')
  const url = `${baseUrl}/wp-json/wc/v3/${path}`

  let response = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: wooAuthHeader(integration.consumerKey, integration.consumerSecret) },
  })
  if (response.status === 401) {
    const sep = url.includes('?') ? '&' : '?'
    response = await fetch(
      `${url}${sep}consumer_key=${encodeURIComponent(integration.consumerKey)}&consumer_secret=${encodeURIComponent(integration.consumerSecret)}`,
      { method: 'DELETE' },
    )
  }
  if (response.status === 401) {
    response = await fetch(
      oauthSignedUrl('DELETE', url, integration.consumerKey, integration.consumerSecret),
      { method: 'DELETE' },
    )
  }
  const responseBody = await response.text()
  return { ok: response.ok, status: response.status, body: responseBody }
}

const VARIATION_ATTRIBUTE_NAME = 'Size'

interface StoreVariation {
  id: string
  option: string | null
  price: string | null
}

/**
 * Reconcile a variable menu item's store variations against a set of desired
 * denominations. Creates missing variations, updates prices/option text of
 * changed ones, and deletes previously-app-managed variations that were
 * removed. Persists the denomination rows (with their store variation ids)
 * back onto the item's `variations` JSON.
 *
 * Returns { ok, error? } — failures are also logged to the SyncLog.
 */
export async function syncProductVariations(
  menuItemId: string,
  denominations: number[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    interface DenomRow { name: string; price: number; wooVariationId?: string }
    const rows: DenomRow[] = [...new Set(denominations)]
      .filter((d) => Number.isFinite(d) && d > 0)
      .sort((a, b) => a - b)
      .map((d) => ({ name: `$${d}`, price: d }))
    if (rows.length === 0) return { ok: false, error: 'At least one denomination is required' }

    let item = await prisma.menuItem.findFirst({ where: { id: menuItemId, deletedAt: null } })
    if (!item) return { ok: false, error: 'Product not found' }

    const integration = await getIntegration(item.venueId)
    if (!integration) return { ok: false, error: 'NO ACTIVE WOOCOMMERCE INTEGRATION FOR VENUE' }

    // Make sure the variable product exists on the store first.
    if (!item.wooProductId) {
      await pushProduct(item.id)
      item = (await prisma.menuItem.findFirst({ where: { id: menuItemId, deletedAt: null } })) ?? item
    }
    if (!item.wooProductId) return { ok: false, error: 'Could not create the product on the store' }

    const previous = (item.variations as unknown as { name: string; price: number; wooVariationId?: string }[]) ?? []
    const optionNames = rows.map((r) => r.name)

    // Attribute options must stay in step so variation creates match the
    // product-level Size attribute (options: [] on a non-variable reset).
    const attrRes = await wooPut(integration, `products/${item.wooProductId}`, {
      type: 'variable',
      attributes: [{ name: VARIATION_ATTRIBUTE_NAME, options: optionNames, variation: true, visible: true }],
      meta_data: selfUpdateMeta(),
    })
    if (!attrRes.ok) return { ok: false, error: `Could not update the product attributes (HTTP ${attrRes.status})` }

    const listRes = await wooGet(integration, `products/${item.wooProductId}/variations?per_page=100`)
    if (!listRes.ok) return { ok: false, error: `Could not read the store variations (HTTP ${listRes.status})` }

    let storeVariations: StoreVariation[] = []
    try {
      const parsed = JSON.parse(listRes.body)
      storeVariations = (Array.isArray(parsed) ? parsed : []).map((v: any) => ({
        id: String(v.id),
        option: Array.isArray(v.attributes)
          ? String(v.attributes.find((a: any) => a.option != null)?.option ?? '')
          : null,
        price: v.price != null ? String(v.price) : null,
      }))
    } catch {
      return { ok: false, error: 'Could not parse the store variation list' }
    }

    const previousIds = new Set(previous.map((p) => p.wooVariationId).filter(Boolean) as string[])
    // Store variations the app manages (have a persisted store id that still exists).
    const byStoreId = new Map(storeVariations.map((s) => [s.id, s]))
    const owned = previous
      .filter((p) => p.wooVariationId && byStoreId.has(String(p.wooVariationId)))
      .map((p) => ({ ...p, storeId: String(p.wooVariationId) }))
    const used = new Set<string>()
    const keptStoreIds = new Set<string>()
    let firstError: string | null = null

    for (const row of rows) {
      // Match by name first, then fall back to any still-unused managed
      // variation (keeps price updates aligned when a denomination was added
      // in the middle of the list).
      const managed =
        owned.find((p) => p.name === row.name && !used.has(p.storeId)) ??
        owned.find((p) => !used.has(p.storeId))
      const match = managed ? byStoreId.get(managed.storeId) : undefined
      const payload = {
        regular_price: String(row.price),
        attributes: [{ name: VARIATION_ATTRIBUTE_NAME, option: row.name }],
        meta_data: selfUpdateMeta(),
      }
      let res: { ok: boolean; status: number; body: string }
      if (match) {
        keptStoreIds.add(match.id)
        if (managed) used.add(managed.storeId)
        res = await wooPut(integration, `products/${item.wooProductId}/variations/${match.id}`, payload)
      } else {
        res = await wooPost(integration, `products/${item.wooProductId}/variations`, payload)
        if (res.ok) {
          try {
            const created = JSON.parse(res.body)
            if (created?.id) row.wooVariationId = String(created.id)
          } catch { /* best-effort */ }
        }
      }
      if (!res.ok && !firstError) firstError = `Variation ${row.name} failed (HTTP ${res.status})`
    }

    // Remove store variations we previously managed that are no longer wanted.
    for (const sv of storeVariations) {
      if (keptStoreIds.has(sv.id)) continue
      if (!previousIds.has(sv.id)) continue // never managed by the app — leave it
      const del = await wooDelete(integration, `products/${item.wooProductId}/variations/${sv.id}?force=true`)
      if (!del.ok && !firstError) firstError = `Could not remove variation ${sv.id} (HTTP ${del.status})`
    }

    const persisted = rows.map((r) => ({
      name: r.name,
      price: r.price,
      ...(r.wooVariationId ? { wooVariationId: r.wooVariationId } : {}),
    }))
    await prisma.menuItem.update({
      where: { id: item.id },
      data: { isVariable: true, variations: JSON.parse(JSON.stringify(persisted)) },
    })

    return { ok: firstError === null, ...(firstError ? { error: firstError } : {}) }
  } catch (e) {
    console.error('syncProductVariations failed (non-blocking):', e)
    return { ok: false, error: String(e) }
  }
}

// Disconnect a menu item from its WooCommerce product: hides the product
// (status → draft) and moves it to the store's default "uncategorized" term.
// Called when LINK TO WOO is unticked — the product stays draft and
// uncategorised until the item is reconnected (which pushes status → publish).
// Reads the row including soft-deleted ones, because the item is deleted from
// the menu before this runs.
export async function pushProductDisconnect(menuItemId: string): Promise<void> {
  try {
    const item = await prisma.menuItem.findFirst({ where: { id: menuItemId } })
    if (!item) return

    if (!item.wooProductId) {
      await logSync({
        venueId: item.venueId,
        direction: 'PUSH',
        entity: 'PRODUCT',
        status: 'SKIPPED',
        message: `DISCONNECT SKIPPED FOR ${item.name} — NO WOOCOMMERCE PRODUCT TO HIDE`,
      })
      return
    }

    const integration = await getIntegration(item.venueId)
    if (!integration) {
      await logSync({
        venueId: item.venueId,
        direction: 'PUSH',
        entity: 'PRODUCT',
        status: 'SKIPPED',
        message: `DISCONNECT SKIPPED FOR ${item.name} — NO ACTIVE WOOCOMMERCE INTEGRATION`,
      })
      return
    }

    const payload = { ...buildProductPushPayload(item), status: 'draft', categories: [] }
    const res = await wooPut(integration, `products/${item.wooProductId}`, payload)

    await logSync({
      venueId: item.venueId,
      direction: 'PUSH',
      entity: 'PRODUCT',
      status: res.ok ? 'SUCCESS' : 'ERROR',
      externalId: item.wooProductId,
      message: res.ok
        ? `DISCONNECTED ${item.name} — PRODUCT #${item.wooProductId} SET TO DRAFT + UNCATEGORISED`
        : `DISCONNECT PUSH FAILED FOR ${item.name} — HTTP ${res.status}`,
      detail: { payload, response: res.ok ? undefined : res.body.slice(0, 1000) },
    })
  } catch (e) {
    console.error('pushProductDisconnect failed (non-blocking):', e)
    await logSync({
      direction: 'PUSH',
      entity: 'PRODUCT',
      status: 'ERROR',
      message: `DISCONNECT PUSH FAILED — ${String(e)}`,
    })
  }
}

// Push an edited pre-order's line items back to the WooCommerce order. The
// store replaces the full line set when `line_items` is passed, so this only
// runs when EVERY line maps to a Woo line id + product id — otherwise a
// partial push would silently drop the unmappable lines.
export async function pushOrderItems(orderId: string): Promise<void> {
  try {
    const order = await prisma.wooOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        items: {
          include: { menuItem: { select: { wooProductId: true } } },
        },
      },
    })
    if (!order) return

    if (order.source !== 'WOO' || !order.wooOrderId) {
      await logSync({
        venueId: order.venueId,
        direction: 'PUSH',
        entity: 'ORDER',
        status: 'SKIPPED',
        externalId: order.wooOrderId ?? undefined,
        message: `LINE ITEM PUSH SKIPPED — ${order.source} ORDER ${order.orderNumber ?? order.id} IS LOCAL-ONLY`,
      })
      return
    }

    const lines = order.items.map((i) => ({
      lineItemId: i.wooLineItemId,
      productId: i.menuItem?.wooProductId ?? null,
      quantity: i.qty,
    }))
    if (lines.length === 0) return
    if (lines.some((l) => !l.lineItemId || !l.productId)) {
      await logSync({
        venueId: order.venueId,
        direction: 'PUSH',
        entity: 'ORDER',
        status: 'SKIPPED',
        externalId: order.wooOrderId,
        message: `LINE ITEM PUSH SKIPPED FOR ORDER #${order.wooOrderId} — NOT EVERY LINE MAPS TO A WOO PRODUCT (LOCAL-ONLY LINES CANNOT BE REPLACED SAFELY)`,
      })
      return
    }

    const integration = await getIntegration(order.venueId)
    if (!integration) {
      await logSync({
        venueId: order.venueId,
        direction: 'PUSH',
        entity: 'ORDER',
        status: 'SKIPPED',
        externalId: order.wooOrderId,
        message: `LINE ITEM PUSH SKIPPED — NO ACTIVE WOOCOMMERCE INTEGRATION FOR VENUE`,
      })
      return
    }

    const payload = {
      line_items: lines.map((l) => ({
        id: Number(l.lineItemId),
        product_id: Number(l.productId),
        quantity: l.quantity,
      })),
      meta_data: selfUpdateMeta(),
    }

    const res = await wooPut(integration, `orders/${order.wooOrderId}`, payload)
    await logSync({
      venueId: order.venueId,
      direction: 'PUSH',
      entity: 'ORDER',
      status: res.ok ? 'SUCCESS' : 'ERROR',
      externalId: order.wooOrderId,
      message: res.ok
        ? `PUSHED LINE ITEMS FOR ORDER #${order.wooOrderId} (${lines.length} LINES)`
        : `LINE ITEM PUSH FAILED FOR ORDER #${order.wooOrderId} — HTTP ${res.status}`,
      detail: { payload, response: res.ok ? undefined : res.body.slice(0, 1000) },
    })
  } catch (e) {
    console.error('pushOrderItems failed (non-blocking):', e)
    await logSync({
      direction: 'PUSH',
      entity: 'ORDER',
      status: 'ERROR',
      message: `LINE ITEM PUSH FAILED — ${String(e)}`,
    })
  }
}

// Push all linked menu items for a venue (manual PUSH NOW button).
export async function pushAllProducts(venueId: string): Promise<{ pushed: number }> {
  const items = await prisma.menuItem.findMany({
    where: { venueId, deletedAt: null },
    select: { id: true },
  })
  for (const item of items) {
    await pushProduct(item.id)
  }
  return { pushed: items.length }
}

// Push a local order status change to the WooCommerce order.
export async function pushOrderStatus(orderId: string): Promise<void> {
  try {
    const order = await prisma.wooOrder.findFirst({
      where: { id: orderId, deletedAt: null },
    })
    if (!order) return

    // Orders raised in-app have no WooCommerce counterpart. Pushing one would
    // PUT to `orders/null` and log a spurious failure on every status change.
    if (order.source !== 'WOO' || !order.wooOrderId) {
      await logSync({
        venueId: order.venueId,
        direction: 'PUSH',
        entity: 'ORDER',
        status: 'SKIPPED',
        message: `PUSH SKIPPED — ${order.source} ORDER ${order.orderNumber ?? order.id} IS LOCAL-ONLY`,
      })
      return
    }

    const integration = await getIntegration(order.venueId)
    if (!integration) {
      await logSync({
        venueId: order.venueId,
        direction: 'PUSH',
        entity: 'ORDER',
        status: 'SKIPPED',
        externalId: order.wooOrderId,
        message: `PUSH SKIPPED — NO ACTIVE WOOCOMMERCE INTEGRATION FOR VENUE`,
      })
      return
    }

    const payload = buildOrderStatusPayload(order.status)
    const res = await wooPut(integration, `orders/${order.wooOrderId}`, payload)

    await logSync({
      venueId: order.venueId,
      direction: 'PUSH',
      entity: 'ORDER',
      status: res.ok ? 'SUCCESS' : 'ERROR',
      externalId: order.wooOrderId,
      message: res.ok
        ? `PUSHED ORDER #${order.wooOrderId} STATUS → ${payload.status.toUpperCase()}`
        : `ORDER STATUS PUSH FAILED FOR #${order.wooOrderId} — HTTP ${res.status}`,
      detail: res.ok ? { payload } : { payload, response: res.body.slice(0, 1000) },
    })
  } catch (e) {
    console.error('pushOrderStatus failed (non-blocking):', e)
    await logSync({
      direction: 'PUSH',
      entity: 'ORDER',
      status: 'ERROR',
      message: `ORDER STATUS PUSH FAILED — ${String(e)}`,
    })
  }
}

/**
 * Confirm cash payment on the store: move the order to `completed` so it
 * leaves the pending list. (WooCommerce's REST API ignores `date_paid`, so
 * the app records the paid state itself — see the confirm route.)
 * Returns { ok, error? } and logs to SyncLog.
 */
export async function pushOrderPaid(
  venueId: string,
  wooOrderId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const integration = await getIntegration(venueId)
    if (!integration) {
      return { ok: false, error: 'NO ACTIVE WOOCOMMERCE INTEGRATION FOR VENUE' }
    }
    const payload = {
      status: 'completed',
      meta_data: selfUpdateMeta(),
    }
    const res = await wooPut(integration, `orders/${wooOrderId}`, payload)
    if (!res.ok) {
      await logSync({
        venueId,
        direction: 'PUSH',
        entity: 'ORDER',
        status: 'ERROR',
        externalId: wooOrderId,
        message: `PAYMENT CONFIRMATION PUSH FAILED FOR ORDER #${wooOrderId} �?" HTTP ${res.status}`,
        detail: { payload, response: res.body.slice(0, 1000) },
      })
      return { ok: false, error: `STORE REJECTED THE UPDATE (HTTP ${res.status})` }
    }
    await logSync({
      venueId,
      direction: 'PUSH',
      entity: 'ORDER',
      status: 'SUCCESS',
      externalId: wooOrderId,
      message: `ORDER #${wooOrderId} MARKED PAID ON THE STORE`,
      detail: { payload },
    })
    return { ok: true }
  } catch (e) {
    console.error('pushOrderPaid failed (non-blocking):', e)
    return { ok: false, error: String(e) }
  }
}
