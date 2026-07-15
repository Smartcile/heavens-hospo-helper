import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { prisma } from '@hospo-ops/db'
import { explodeRecipe } from '@/lib/inventory-engine'
import { getNextNumber } from '@/lib/gift-cards'
import { upsertProductFromWoo, isWebhookPing } from '@/lib/woo-sync'
import { isSelfEcho } from '@/lib/woo-push'
import { logSync } from '@/lib/sync-log'
import type { PrismaClient, OrderStatus } from '@prisma/client'

// ═══════════════════════════════════════════
// WooCommerce Webhook Handler
// Receives order.created / order.updated and
// product.created / product.updated / product.deleted events
// Endpoint: POST /api/webhooks/woocommerce
// Auth: HMAC-SHA256 signature verification
// ═══════════════════════════════════════════

export async function POST(req: NextRequest) {
  // ── 1. Capture raw body and signature ──
  const rawBody = await req.text()
  const signature = req.headers.get('x-wc-webhook-signature')
  const topic = req.headers.get('x-wc-webhook-topic') ?? 'unknown'
  const entity = topic.startsWith('product') ? 'PRODUCT' : 'ORDER'

  // ── 1a. Acknowledge WooCommerce's unsigned activation ping ──
  // Sent when a webhook is saved/activated in wp-admin; must get a 2xx or
  // WooCommerce marks the webhook as failed and disables it.
  if (isWebhookPing(rawBody)) {
    await logSync({
      direction: 'WEBHOOK',
      entity,
      status: 'SUCCESS',
      message: `WEBHOOK ACTIVATION PING ACKNOWLEDGED (${rawBody.trim().toUpperCase()})`,
    })
    return NextResponse.json({ message: 'Webhook ping acknowledged' }, { status: 200 })
  }

  if (!signature) {
    await logSync({
      direction: 'WEBHOOK',
      entity,
      status: 'ERROR',
      message: `WEBHOOK REJECTED (${topic.toUpperCase()}) — MISSING SIGNATURE HEADER`,
    })
    return NextResponse.json({ error: 'Missing signature header' }, { status: 401 })
  }

  // ── 2. Resolve venue by trying all active WooIntegration webhook secrets ──
  const integrations = await prisma.wooIntegration.findMany({
    where: { isActive: true, deletedAt: null, webhookSecret: { not: null } },
    include: { venue: true },
  })

  let matched: (typeof integrations)[0] | null = null
  for (const integration of integrations) {
    const computed = createHmac('sha256', integration.webhookSecret!)
      .update(rawBody, 'utf-8')
      .digest('base64')
    if (computed === signature) {
      matched = integration
      break
    }
  }

  if (!matched) {
    await logSync({
      direction: 'WEBHOOK',
      entity,
      status: 'ERROR',
      message: `WEBHOOK REJECTED (${topic.toUpperCase()}) — SIGNATURE DID NOT MATCH ANY VENUE`,
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const venueId = matched.venueId

  // ── 3. Parse payload ──
  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    await logSync({
      venueId,
      direction: 'WEBHOOK',
      entity,
      status: 'ERROR',
      message: `WEBHOOK REJECTED (${topic.toUpperCase()}) — INVALID JSON PAYLOAD`,
    })
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── 4. Infinite-loop guard: skip echoes of our own recent pushes ──
  const metaData: any[] = body.meta_data ?? []
  if (isSelfEcho(metaData)) {
    await logSync({
      venueId,
      direction: 'WEBHOOK',
      entity,
      status: 'SKIPPED',
      externalId: String(body.id ?? ''),
      message: `WEBHOOK SKIPPED (${topic.toUpperCase()}) — ECHO OF OUR OWN PUSH`,
    })
    return NextResponse.json({ message: 'Skipped (self-triggered)' }, { status: 200 })
  }

  // ── 5. Product topics: upsert / soft-delete the MenuItem ──
  if (entity === 'PRODUCT') {
    return handleProductWebhook(venueId, matched.id, topic, body)
  }

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
  const partySize = extractMetaInt(metaData, ['party_size', 'partySize'])
  const fulfillmentDate = extractMetaDate(metaData, ['pickup_date', 'fulfillment_date', 'event_date'])
  const notes = body.customer_note?.trim() || null

  // ── 6. Upsert order + line items in a transaction ──
  const order = await prisma.$transaction(async (tx) => {
    // 6a. Upsert WooOrder
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

    // 6b. Sync line items — delete removed, upsert incoming
    const existingIds = new Set(
      (await tx.wooOrderItem.findMany({
        where: { orderId: woo.id },
        select: { id: true },
      })).map((i) => i.id),
    )
    const keptIds = new Set<string>()

    for (const li of lineItems) {
      // Match WooCommerce product to our MenuItem via wooProductId
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
        // Find existing line item by matching menuItemId + orderId
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
        } else {
          // Unrecognised product — skip (menuItemId is required)
        }
    }

    // Hard-delete removed line items
    const toDelete = [...existingIds].filter((id) => !keptIds.has(id))
    if (toDelete.length > 0) {
      await tx.wooOrderItem.deleteMany({ where: { id: { in: toDelete } } })
    }

    // 6c. Bump lastSyncAt on the integration
    await tx.wooIntegration.update({
      where: { id: matched.id },
      data: { lastSyncAt: new Date() },
    })

    return woo
  })

  // ── 7. Inventory deduction (recipe explosion → meta storage) ──
  // Phase 5 will reconcile base units back to item counts using reverse-UOM lookup.
  // For now we explode the recipe tree and store the result on each line item.
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

      // Convert Map → array for JSON storage
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

  // ── 8. Auto-seating engine (best-effort) ──
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

  // ── 9. Gift card auto-detection (best-effort) ──
  try {
    await detectGiftCards(lineItems, venueId, order, customerName, customerEmail)
  } catch (e) {
    console.error('Gift card detection failed (non-blocking):', e)
  }

  await logSync({
    venueId,
    direction: 'WEBHOOK',
    entity: 'ORDER',
    status: 'SUCCESS',
    externalId: wooOrderId,
    message: `ORDER #${wooOrderId} SYNCED (${topic.toUpperCase()}) — ${lineItems.length} LINE ITEMS, STATUS ${mapWooStatus(wooStatus)}`,
    detail: { topic, status: wooStatus, lineItems: lineItems.length, totalAmount },
  })

  return NextResponse.json({ success: true, orderId: order.id, topic })
}

// Handle product.created / product.updated / product.deleted webhooks.
async function handleProductWebhook(venueId: string, integrationId: string, topic: string, body: any) {
  const wooProductId = String(body.id ?? '')
  if (!wooProductId) {
    await logSync({
      venueId,
      direction: 'WEBHOOK',
      entity: 'PRODUCT',
      status: 'ERROR',
      message: `PRODUCT WEBHOOK (${topic.toUpperCase()}) — PAYLOAD HAS NO PRODUCT ID`,
    })
    return NextResponse.json({ error: 'Missing product id' }, { status: 400 })
  }

  try {
    if (topic === 'product.deleted') {
      const existing = await prisma.menuItem.findFirst({
        where: { wooProductId, venueId, deletedAt: null },
      })
      if (existing) {
        await prisma.menuItem.update({
          where: { id: existing.id },
          data: { deletedAt: new Date(), isActive: false },
        })
      }
      await logSync({
        venueId,
        direction: 'WEBHOOK',
        entity: 'PRODUCT',
        status: existing ? 'SUCCESS' : 'SKIPPED',
        externalId: wooProductId,
        message: existing
          ? `PRODUCT #${wooProductId} DELETED IN WOOCOMMERCE — MENU ITEM ${existing.name} SOFT-DELETED`
          : `PRODUCT #${wooProductId} DELETED IN WOOCOMMERCE — NO LOCAL MENU ITEM TO REMOVE`,
      })
      return NextResponse.json({ success: true, topic })
    }

    const outcome = await upsertProductFromWoo(venueId, body)
    await prisma.wooIntegration.update({
      where: { id: integrationId },
      data: { lastSyncAt: new Date() },
    })
    await logSync({
      venueId,
      direction: 'WEBHOOK',
      entity: 'PRODUCT',
      status: 'SUCCESS',
      externalId: wooProductId,
      message: `PRODUCT #${wooProductId} ${body.name ? String(body.name).toUpperCase() : ''} ${outcome.toUpperCase()} FROM WEBHOOK (${topic.toUpperCase()})`.replace(/\s+/g, ' '),
      detail: { topic, outcome },
    })
    return NextResponse.json({ success: true, topic, outcome })
  } catch (e) {
    console.error('Product webhook failed:', e)
    await logSync({
      venueId,
      direction: 'WEBHOOK',
      entity: 'PRODUCT',
      status: 'ERROR',
      externalId: wooProductId,
      message: `PRODUCT WEBHOOK FAILED (${topic.toUpperCase()}) FOR #${wooProductId}`,
      detail: { error: String(e) },
    })
    return NextResponse.json({ error: 'Product sync failed' }, { status: 500 })
  }
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

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

  // Get numbers already assigned in any setup (global pool usage)
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
  // Find venue's default floor plan
  const defaultPlan = await prisma.floorPlan.findFirst({
    where: { venueId, isDefault: true, deletedAt: null, isActive: true },
  })
  if (!defaultPlan) return

  // Create CalendarEvent for the order
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

  // Link order to event (auto-seating chain: Order → Event → Setup → Tables)
  await prisma.wooOrder.update({
    where: { id: order.id },
    data: { calendarEventId: event.id },
  })

  // Create FloorPlanSetup linked to the event
  const setup = await prisma.floorPlanSetup.create({
    data: {
      floorPlanId: defaultPlan.id,
      name: `${order.customerName ?? 'ORDER'} — ${partySize} PAX`.toUpperCase(),
      eventDate: fulfillmentDate,
      calendarEventId: event.id,
    },
  })

  // Load table profiles sorted by capacity descending
  const profiles = await prisma.tableProfile.findMany({
    where: { venueId, isActive: true, deletedAt: null },
    orderBy: { capacity: 'desc' },
  })
  if (profiles.length === 0) return

  // Greedy first-fit decreasing bin-packing
  let remaining = partySize
  const selected: { profileId: string; assignedNumber: string | null; capacity: number }[] = []

  // Pass 1: exact-fit — use largest table that fits remaining
  for (const p of profiles) {
    while (remaining >= p.capacity) {
      const assigned = await assignTableNumber(prisma, p.id, selected)
      if (!assigned) break
      selected.push({ profileId: p.id, assignedNumber: assigned, capacity: p.capacity })
      remaining -= p.capacity
    }
  }

  // Pass 2: overfill with smallest available if exact-fit exhausted
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

  // Place tables in a grid layout on the canvas
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

  // Group all tables together (if 2+)
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
