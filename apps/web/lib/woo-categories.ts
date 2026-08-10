import { prisma } from '@hospo-ops/db'
import { logSync } from '@/lib/sync-log'
import { wooAuthHeader, fetchWooCategories } from '@/lib/woo-sync'
import { oauthSignedUrl } from '@/lib/woo-oauth'
import { getIntegration } from '@/lib/woo-push'
import type { WooIntegration } from '@prisma/client'

// ── WooCommerce Category Sync (Menus ⇄ Categories) ────────────────────
// A Menu IS a WooCommerce category. Creating a menu with a name either links
// to the store category of that name or creates it; renaming a menu renames
// the category. All best-effort: they log to SyncLog and never throw.
// ──────────────────────────────────────────────────────────────────────

export interface WooCategoryRef {
  id: number
  name: string
}

/** Pure name match — case-insensitive, trimmed. The store's category names
 *  are free text, so exact-match on the visible label is the join key. */
export function matchCategoryByName(categories: WooCategoryRef[], name: string): WooCategoryRef | null {
  const q = name.trim().toLowerCase()
  if (!q) return null
  return categories.find((c) => c.name.trim().toLowerCase() === q) ?? null
}

async function wooJsonRequest(
  method: 'GET' | 'POST' | 'PUT',
  integration: WooIntegration,
  path: string,
  body?: unknown,
): Promise<Record<string, unknown> | null> {
  const baseUrl = integration.storeUrl.replace(/\/+$/, '')
  const url = `${baseUrl}/wp-json/wc/v3/${path}`
  const headers = {
    Authorization: wooAuthHeader(integration.consumerKey, integration.consumerSecret),
    'Content-Type': 'application/json',
  }
  const payload = body === undefined ? undefined : JSON.stringify(body)

  let response = await fetch(url, { method, headers, body: payload })
  // Fallback for hosts that strip the Authorization header (see woo-sync.ts).
  if (response.status === 401) {
    const sep = url.includes('?') ? '&' : '?'
    response = await fetch(
      `${url}${sep}consumer_key=${encodeURIComponent(integration.consumerKey)}&consumer_secret=${encodeURIComponent(integration.consumerSecret)}`,
      { method, headers: { 'Content-Type': 'application/json' }, body: payload },
    )
  }
  // Final fallback: OAuth 1.0a signed request (see woo-oauth.ts).
  if (response.status === 401) {
    response = await fetch(
      oauthSignedUrl(method, url, integration.consumerKey, integration.consumerSecret),
      { method, headers: { 'Content-Type': 'application/json' }, body: payload },
    )
  }

  if (!response.ok) return null
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Resolve the WooCommerce category id for a menu name: match an existing
 * category by name, or create one on the store. Returns null when there is
 * no active integration or the store call failed (menu still saves locally).
 */
export async function ensureWooCategory(venueId: string, name: string): Promise<string | null> {
  try {
    const integration = await getIntegration(venueId)
    if (!integration) {
      await logSync({
        venueId,
        direction: 'PUSH',
        entity: 'CATEGORY',
        status: 'SKIPPED',
        message: `CATEGORY "${name}" NOT SYNCED — NO ACTIVE WOOCOMMERCE INTEGRATION`,
      })
      return null
    }

    const existing = await fetchWooCategories(integration.storeUrl, integration.consumerKey, integration.consumerSecret)
    const match = matchCategoryByName(existing, name)
    if (match) {
      await logSync({
        venueId,
        direction: 'PUSH',
        entity: 'CATEGORY',
        status: 'SUCCESS',
        externalId: String(match.id),
        message: `MENU "${name}" SYNCED TO EXISTING WOO CATEGORY #${match.id}`,
      })
      return String(match.id)
    }

    const created = await wooJsonRequest('POST', integration, 'products/categories', { name })
    if (created?.id) {
      await logSync({
        venueId,
        direction: 'PUSH',
        entity: 'CATEGORY',
        status: 'SUCCESS',
        externalId: String(created.id),
        message: `CATEGORY "${name}" CREATED ON WOOCOMMERCE AS #${created.id}`,
      })
      return String(created.id)
    }

    await logSync({
      venueId,
      direction: 'PUSH',
      entity: 'CATEGORY',
      status: 'ERROR',
      message: `CATEGORY "${name}" NOT CREATED — STORE REJECTED THE REQUEST`,
    })
    return null
  } catch (e) {
    console.error('ensureWooCategory failed (non-blocking):', e)
    await logSync({
      venueId,
      direction: 'PUSH',
      entity: 'CATEGORY',
      status: 'ERROR',
      message: `CATEGORY SYNC FAILED — ${String(e)}`,
    })
    return null
  }
}

/** Rename the store category when a synced menu is renamed. Best-effort. */
export async function renameWooCategory(venueId: string, categoryId: string, newName: string): Promise<void> {
  try {
    const integration = await getIntegration(venueId)
    if (!integration) return
    const updated = await wooJsonRequest('PUT', integration, `products/categories/${categoryId}`, { name: newName })
    await logSync({
      venueId,
      direction: 'PUSH',
      entity: 'CATEGORY',
      status: updated?.id ? 'SUCCESS' : 'ERROR',
      externalId: categoryId,
      message: updated?.id
        ? `CATEGORY #${categoryId} RENAMED TO "${newName}" ON WOOCOMMERCE`
        : `CATEGORY RENAME FAILED FOR #${categoryId} — HTTP ERROR`,
    })
  } catch (e) {
    console.error('renameWooCategory failed (non-blocking):', e)
  }
}
