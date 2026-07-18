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

export function buildProductPushPayload(item: Pick<MenuItem, 'name' | 'price' | 'wooCategoryId'>, now: Date = new Date()) {
  const payload: Record<string, unknown> = {
    name: item.name,
    regular_price: String(item.price ?? 0),
    meta_data: selfUpdateMeta(now),
  }
  if (item.wooCategoryId) {
    const id = parseInt(item.wooCategoryId, 10)
    if (!isNaN(id)) payload.categories = [{ id }]
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

async function getIntegration(venueId: string): Promise<WooIntegration | null> {
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

// Push a menu item's name / price / category to its linked WooCommerce product.
export async function pushProduct(menuItemId: string): Promise<void> {
  try {
    const item = await prisma.menuItem.findFirst({
      where: { id: menuItemId, deletedAt: null },
    })
    if (!item) return
    if (!item.wooProductId) {
      await logSync({
        venueId: item.venueId,
        direction: 'PUSH',
        entity: 'PRODUCT',
        status: 'SKIPPED',
        message: `PUSH SKIPPED — ${item.name} HAS NO LINKED WOOCOMMERCE PRODUCT`,
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
        externalId: item.wooProductId,
        message: `PUSH SKIPPED — NO ACTIVE WOOCOMMERCE INTEGRATION FOR VENUE`,
      })
      return
    }

    const payload = buildProductPushPayload(item)
    const res = await wooPut(integration, `products/${item.wooProductId}`, payload)

    await logSync({
      venueId: item.venueId,
      direction: 'PUSH',
      entity: 'PRODUCT',
      status: res.ok ? 'SUCCESS' : 'ERROR',
      externalId: item.wooProductId,
      message: res.ok
        ? `PUSHED ${item.name} TO WOOCOMMERCE (PRODUCT #${item.wooProductId})`
        : `PUSH FAILED FOR ${item.name} — HTTP ${res.status}`,
      detail: res.ok ? { payload } : { payload, response: res.body.slice(0, 1000) },
    })
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

// Push all linked menu items for a venue (manual PUSH NOW button).
export async function pushAllProducts(venueId: string): Promise<{ pushed: number; skipped: number }> {
  const items = await prisma.menuItem.findMany({
    where: { venueId, deletedAt: null },
    select: { id: true, wooProductId: true },
  })
  let pushed = 0
  let skipped = 0
  for (const item of items) {
    if (item.wooProductId) {
      await pushProduct(item.id)
      pushed++
    } else {
      skipped++
    }
  }
  return { pushed, skipped }
}

// Push a local order status change to the WooCommerce order.
export async function pushOrderStatus(orderId: string): Promise<void> {
  try {
    const order = await prisma.wooOrder.findFirst({
      where: { id: orderId, deletedAt: null },
    })
    if (!order) return

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
