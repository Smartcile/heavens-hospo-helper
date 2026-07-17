import { prisma } from '@hospo-ops/db'
import { logSync } from '@/lib/sync-log'
import { wooAuthHeader } from '@/lib/woo-sync'
import { oauthSignedUrl } from '@/lib/woo-oauth'
import { explodeRecipe } from '@/lib/inventory-engine'
import { getNextNumber } from '@/lib/gift-cards'
import type { PrismaClient, OrderStatus } from '@prisma/client'

// ── Shared WooCommerce Order Processing ────────────────────────────────
// Used by both the webhook handler (instant) and the REST API pull
// (manual + scheduled). Handles upsert, recipe explosion, auto-seating,
// and gift card detection. Every step logs to SyncLog.
// ──────────────────────────────────────────────────────────────────────

export async function processWooOrder(
  venueId: string,
  integrationId: string,
  body: any,
): Promise<{ orderId: string; wooOrderId: string; lineItems: number }> {
  const wooOrderId = String(body.id)
  const wooStatus = body.status ?? 'pending'
  const lineItems: any[] = body.line_items ?? []
  const totalAmount = parseFloat(body.total ?? '0')
  const customerName = [
    body.billing?.first_name ?? '',
    body.billing?.last_name ?? '',
  ].join(' ').trim()
  const customerEmail = body.billing?.email ?? null
  const customerPhone = body.billing?.phone ?? null
  const metaData: any[] = body.meta_data ?? []
  const partySize = extractMetaInt(metaData, ['party_size', 'partySize'])
  const fulfillmentDate = extractMetaDate(metaData, ['pickup_date', 'fulfillment_date', 'event_date'])
  const notes = body.customer_note?.trim() || null

  const order = await prisma.$transaction(async (tx) => {
    const woo = await tx.wooOrder.upsert({
      where: { wooOrderId },
      update: {
        status: mapWooStatus(wooStatus) as OrderStatus,
        totalAmount,
        customerName: customerName || undefined,
        customerEmail,
        customerPhone,
        partySize,
        fulfillmentDate,
        notes,
        syncedAt: new Date(),
      },
      create: {
        venueId,
        wooOrderId,
        status: mapWooStatus(wooStatus) as OrderStatus,
        totalAmount,
        customerName: customerName || null,
        customerEmail,
        customerPhone,
        partySize,
        fulfillmentDate,
        notes,
        syncedAt: new Date(),
      },
    })

    const existingIds = new Set(
      (await tx.wooOrderItem.findMany({
        where: { orderId: woo.id },
        select: { id: true },
      })).map((i) => i.id),
    )
    const keptIds = new Set<string>()

    for (const li of lineItems) {
      const productId = String(li.product_id ?? li.id ?? '')
      const variationId = li.variation_id ? String(li.variation_id) : null

      const menuItem = await tx.menuItem.findFirst({
        where: {
          venueId,
          wooProductId: variationId ?? productId,
          deletedAt: null,
        },
      })

      const qty = li.quantity ?? 1
      const unitPrice = parseFloat(li.price ?? li.total ?? '0')

      if (menuItem) {
        const existing = await tx.wooOrderItem.findFirst({
          where: { orderId: woo.id, menuItemId: menuItem.id },
        })

        if (existing) {
          await tx.wooOrderItem.update({
            where: { id: existing.id },
            data: { qty, unitPrice, notes: li.name ?? null },
          })
          keptIds.add(existing.id)
        } else {
          const created = await tx.wooOrderItem.create({
            data: {
              orderId: woo.id,
              menuItemId: menuItem.id,
              qty,
              unitPrice,
              notes: li.name ?? null,
            },
          })
          keptIds.add(created.id)
        }
      }
    }

    const toDelete = [...existingIds].filter((id) => !keptIds.has(id))
    if (toDelete.length > 0) {
      await tx.wooOrderItem.deleteMany({ where: { id: { in: toDelete } } })
    }

    await tx.wooIntegration.update({
      where: { id: integrationId },
      data: { lastSyncAt: new Date() },
    })

    return woo
  })

  for (const li of lineItems) {
    const productId = String(li.product_id ?? li.id ?? '')
    const variationId = li.variation_id ? String(li.variation_id) : null

    const menuItem = await prisma.menuItem.findFirst({
      where: {
        venueId,
        wooProductId: variationId ?? productId,
        deletedAt: null,
      },
      include: { recipe: true },
    })

    if (menuItem?.recipeId) {
      const qty = li.quantity ?? 1
      const ingredients = await explodeRecipe(menuItem.recipeId, qty, prisma)

      const exploded: { inventoryItemId: string; requiredBaseQty: number }[] = []
      for (const [itemId, baseQty] of ingredients) {
        if (baseQty > 0) {
          exploded.push({ inventoryItemId: itemId, requiredBaseQty: baseQty })
        }
      }

      if (exploded.length > 0) {
        const orderItem = await prisma.wooOrderItem.findFirst({
          where: { orderId: order.id, menuItemId: menuItem.id },
        })
        if (orderItem) {
          await prisma.wooOrderItem.update({
            where: { id: orderItem.id },
            data: {
              notes: JSON.stringify({
                productName: li.name,
                recipeId: menuItem.recipeId,
                recipeName: menuItem.recipe?.name,
                orderQty: qty,
                explodedIngredients: exploded,
              }),
            },
          })
        }
      }
    }
  }

  if (partySize && partySize > 0 && fulfillmentDate) {
    try {
      await tryAutoSeat(order, venueId, partySize, fulfillmentDate)
    } catch (e) {
      console.error('Auto-seating failed (non-blocking):', e)
      await logSync({
        venueId,
        direction: 'WEBHOOK',
        entity: 'ORDER',
        status: 'ERROR',
        externalId: wooOrderId,
        message: `AUTO-SEATING FAILED FOR ORDER #${wooOrderId} (ORDER STILL SYNCED)`,
        detail: { error: String(e) },
      })
    }
  }

  try {
    await detectGiftCards(lineItems, venueId, order, customerName, customerEmail)
  } catch (e) {
    console.error('Gift card detection failed (non-blocking):', e)
  }

  return { orderId: order.id, wooOrderId, lineItems: lineItems.length }
}

// ── Order Pull (REST API) ──────────────────────────────────────────────

export interface OrderPullResult {
  venueId: string
  storeUrl: string
  synced: number
  errors: number
  syncedAt: string
}

async function fetchWooOrders(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
): Promise<any[]> {
  const baseUrl = storeUrl.replace(/\/+$/, '')
  const orders: any[] = []
  let page = 1

  for (;;) {
    const url = `${baseUrl}/wp-json/wc/v3/orders?per_page=100&page=${page}`
    let response = await fetch(url, {
      headers: {
        Authorization: wooAuthHeader(consumerKey, consumerSecret),
        'Content-Type': 'application/json',
      },
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

    const text = await response.text()

    if (!response.ok) {
      throw new Error(
        response.status === 401
          ? `HTTP 401 from ${baseUrl} (tried header, query-string AND OAuth1 auth) — re-check the Consumer Key/Secret in Settings and confirm the key has Read/Write permission: ${text.slice(0, 300)}`
          : `HTTP ${response.status} from ${baseUrl}: ${text.slice(0, 300)}`,
      )
    }

    let batch: any
    try {
      batch = JSON.parse(text)
    } catch {
      throw new Error(
        `Non-JSON response from ${baseUrl} (check STORE URL and no security plugin is intercepting /wp-json): ${text.slice(0, 300)}`,
      )
    }
    if (!Array.isArray(batch)) {
      throw new Error(`Unexpected response shape from ${baseUrl}: ${JSON.stringify(batch).slice(0, 300)}`)
    }

    orders.push(...batch)
    if (batch.length < 100) break
    page++
  }

  return orders
}

export async function runOrderPull(venueId?: string): Promise<OrderPullResult[]> {
  const integrations = await prisma.wooIntegration.findMany({
    where: { isActive: true, deletedAt: null, ...(venueId ? { venueId } : {}) },
  })

  const results: OrderPullResult[] = []

  for (const integration of integrations) {
    let synced = 0
    let errors = 0

    try {
      const orders = await fetchWooOrders(
        integration.storeUrl,
        integration.consumerKey,
        integration.consumerSecret,
      )

      for (const order of orders) {
        try {
          await processWooOrder(integration.venueId, integration.id, order)
          synced++
        } catch (e) {
          errors++
          const wooOrderId = String(order?.id ?? '')
          await logSync({
            venueId: integration.venueId,
            direction: 'PULL',
            entity: 'ORDER',
            status: 'ERROR',
            externalId: wooOrderId,
            message: `ORDER PULL UPSERT FAILED: ${String(order?.number ?? wooOrderId)}`,
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
        entity: 'ORDER',
        status: errors > 0 ? 'ERROR' : 'SUCCESS',
        message: `PULLED ${orders.length} ORDERS FROM ${integration.storeUrl} — ${synced} SYNCED${errors > 0 ? `, ${errors} FAILED` : ''}`,
        detail: { synced, errors, total: orders.length },
      })
    } catch (e) {
      console.error(`Order pull failed for ${integration.storeUrl}:`, e)
      await logSync({
        venueId: integration.venueId,
        direction: 'PULL',
        entity: 'ORDER',
        status: 'ERROR',
        message: `ORDER PULL FAILED FOR ${integration.storeUrl}`,
        detail: { error: String(e) },
      })
    }

    results.push({
      venueId: integration.venueId,
      storeUrl: integration.storeUrl,
      synced,
      errors,
      syncedAt: new Date().toISOString(),
    })
  }

  return results
}

// ── Helpers ────────────────────────────────────────────────────────────

function mapWooStatus(status: string): string {
  const s = status.toLowerCase()
  const map: Record<string, string> = {
    pending: 'PENDING',
    processing: 'PROCESSING',
    completed: 'COMPLETED',
    cancelled: 'CANCELLED',
    'on-hold': 'PENDING',
    refunded: 'CANCELLED',
    failed: 'CANCELLED',
  }
  return map[s] ?? 'PENDING'
}

async function detectGiftCards(
  lineItems: any[],
  venueId: string,
  order: { id: string; wooOrderId: string },
  customerName: string,
  customerEmail: string | null,
) {
  for (const li of lineItems) {
    const sku = String(li.sku ?? li.product_id ?? '').toUpperCase()
    if (!sku.includes('GIFT')) continue

    const amount = parseFloat(li.total ?? li.price ?? '0')
    if (amount <= 0) continue

    const qty = li.quantity ?? 1
    for (let i = 0; i < qty; i++) {
      const year = new Date().getFullYear()
      const number = await getNextNumber(venueId, year)

      await prisma.giftCard.create({
        data: {
          venueId,
          number,
          amount: amount / qty,
          customerName: customerName || null,
          customerEmail,
          wooOrderId: order.wooOrderId,
          notes: `Auto-created from WooCommerce order #${order.wooOrderId} (SKU: ${sku})`,
        },
      })
    }
  }
}

function extractMetaInt(meta: any[], keys: string[]): number | null {
  for (const key of keys) {
    const m = meta.find((x: any) => x.key === key)
    if (m?.value != null) {
      const n = parseInt(String(m.value))
      if (!isNaN(n)) return n
    }
  }
  return null
}

function extractMetaDate(meta: any[], keys: string[]): Date | null {
  for (const key of keys) {
    const m = meta.find((x: any) => x.key === key)
    if (m?.value) {
      const d = new Date(m.value)
      if (!isNaN(d.getTime())) return d
    }
  }
  return null
}

async function assignTableNumber(
  tx: PrismaClient,
  profileId: string,
  alreadySelected: { profileId: string; assignedNumber: string | null }[],
): Promise<string | null> {
  const profile = await tx.tableProfile.findUnique({
    where: { id: profileId },
    select: { tableNumbers: true },
  })
  const pool: string[] = Array.isArray((profile as any)?.tableNumbers)
    ? (profile as any).tableNumbers
    : []
  if (pool.length === 0) return null

  const existingItems = await tx.setupItem.findMany({
    where: { tableProfileId: profileId, assignedNumber: { not: null }, deletedAt: null },
    select: { assignedNumber: true },
  })

  const used = new Set([
    ...existingItems.filter((i) => i.assignedNumber).map((i) => i.assignedNumber!),
    ...alreadySelected.filter((t) => t.assignedNumber).map((t) => t.assignedNumber!),
  ])

  const sorted = [...pool].map(String).sort((a, b) => Number(a) - Number(b))
  for (const num of sorted) {
    if (!used.has(num)) return num
  }
  return null
}

async function tryAutoSeat(
  order: { id: string; wooOrderId: string; customerName: string | null; venueId: string },
  venueId: string,
  partySize: number,
  fulfillmentDate: Date,
) {
  const defaultPlan = await prisma.floorPlan.findFirst({
    where: { venueId, isDefault: true, deletedAt: null, isActive: true },
  })
  if (!defaultPlan) return

  const event = await prisma.calendarEvent.create({
    data: {
      venueId,
      source: 'MANUAL',
      uid: `woo-order-${order.wooOrderId}`,
      title: `${order.customerName ?? 'ORDER'} — ${partySize} PAX`.toUpperCase(),
      startsAt: fulfillmentDate,
      floorPlanSlug: defaultPlan.slug,
      floorPlanName: defaultPlan.name,
    },
  })

  await prisma.wooOrder.update({
    where: { id: order.id },
    data: { calendarEventId: event.id },
  })

  const setup = await prisma.floorPlanSetup.create({
    data: {
      floorPlanId: defaultPlan.id,
      name: `${order.customerName ?? 'ORDER'} — ${partySize} PAX`.toUpperCase(),
      eventDate: fulfillmentDate,
      calendarEventId: event.id,
    },
  })

  const profiles = await prisma.tableProfile.findMany({
    where: { venueId, isActive: true, deletedAt: null },
    orderBy: { capacity: 'desc' },
  })
  if (profiles.length === 0) return

  let remaining = partySize
  const selected: { profileId: string; assignedNumber: string | null; capacity: number }[] = []

  for (const p of profiles) {
    while (remaining >= p.capacity) {
      const assigned = await assignTableNumber(prisma, p.id, selected)
      if (!assigned) break
      selected.push({ profileId: p.id, assignedNumber: assigned, capacity: p.capacity })
      remaining -= p.capacity
    }
  }

  if (remaining > 0) {
    const smallest = [...profiles].reverse()
    for (const p of smallest) {
      const assigned = await assignTableNumber(prisma, p.id, selected)
      if (assigned) {
        selected.push({ profileId: p.id, assignedNumber: assigned, capacity: p.capacity })
        break
      }
    }
  }

  if (selected.length === 0) return

  const GRID_X = 200
  const GRID_Y = 200
  const SPACING = 180
  const COLS = 5

  for (let i = 0; i < selected.length; i++) {
    const t = selected[i]
    const col = i % COLS
    const row = Math.floor(i / COLS)
    await prisma.setupItem.create({
      data: {
        setupId: setup.id,
        tableProfileId: t.profileId,
        x: GRID_X + col * SPACING,
        y: GRID_Y + row * SPACING,
        assignedNumber: t.assignedNumber,
        label: t.assignedNumber ?? undefined,
      },
    })
  }

  const items = await prisma.setupItem.findMany({
    where: { setupId: setup.id, deletedAt: null },
    select: { id: true },
  })
  if (items.length >= 2) {
    const group = await prisma.tableGroup.create({
      data: { setupId: setup.id, name: order.customerName ?? 'ORDER' },
    })
    await prisma.setupItem.updateMany({
      where: { id: { in: items.map((i) => i.id) } },
      data: { tableGroupId: group.id },
    })
  }
}
