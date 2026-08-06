import { prisma } from '@hospo-ops/db'
import { logSync } from '@/lib/sync-log'
import { wooAuthHeader } from '@/lib/woo-sync'
import { oauthSignedUrl } from '@/lib/woo-oauth'
import { explodeRecipe } from '@/lib/inventory-engine'
import { getNextNumber } from '@/lib/gift-cards'
import { resolveOrderMeta, type ResolvedOrderMeta } from '@/lib/woo-meta-map'
import { resolveCustomer } from '@/lib/customer-match'
import { autoLinkBooking } from '@/lib/order-booking-link'
import { formatDateKey } from '@/lib/scheduling'
import { addMinutesHHMM, slotEndForTime, type ServiceScheduleInput } from '@/lib/service-schedule'
import type { PrismaClient, OrderStatus, OrderOpStatus, PaymentStatus } from '@prisma/client'

// ── Shared WooCommerce Order Processing ────────────────────────────────
// Used by both the webhook handler (instant) and the REST API pull
// (manual + scheduled). Handles upsert, recipe explosion, auto-seating,
// and gift card detection. Every step logs to SyncLog.
// ──────────────────────────────────────────────────────────────────────

export async function processWooOrder(
  venueId: string,
  integrationId: string,
  body: any,
  metaFieldMap?: unknown,
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
  const meta = resolveOrderMeta(metaData, metaFieldMap)
  const partySize = meta.partySize
  const notes = body.customer_note?.trim() || null

  // Auto-seating is opt-in per venue (default OFF — seats are assigned by
  // hand). bookTable comes from the HOSPO OPS plugin's checkout.
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { autoSeat: true },
  })

  // The service this order was placed against, resolved from the plugin's
  // `_hospo_service_id` meta. An unknown id clears the link (explicitly).
  const service = meta.serviceId
    ? await prisma.service.findFirst({
        where: { id: meta.serviceId, venueId, deletedAt: null },
        select: { id: true },
      })
    : null

  // Payment is WooCommerce's job — we only mirror what it reports.
  // Prefer `date_paid_gmt`: `date_paid` is in the store's local timezone with no
  // offset, so parsing it directly lands the stamp hours out.
  const paidAt = parseWooDate(body.date_paid_gmt, body.date_paid)
  const paymentMethod = body.payment_method_title?.trim() || null
  const paymentStatus: PaymentStatus =
    wooStatus === 'refunded' ? 'REFUNDED' : paidAt ? 'PAID' : 'UNPAID'

  /*
   * `fulfillmentDate` is still written alongside `serviceDate` because the FOH
   * and kitchen routes filter on it. Phase 4 moves them across; until then,
   * dropping it here would silently empty both screens.
   */
  const fulfillmentDate = combineDateTime(meta.serviceDate, meta.serviceTime)

  // Deduped customer record — the same person ordering online, by phone, and
  // via the booking form resolves to one row. See lib/customer-match.ts.
  const customerId = await resolveCustomer(prisma, venueId, {
    name: customerName,
    email: customerEmail,
    phone: customerPhone,
  })

  const order = await prisma.$transaction(async (tx) => {
    const woo = await tx.wooOrder.upsert({
      where: { wooOrderId },
      update: {
        status: mapWooStatus(wooStatus) as OrderStatus,
        totalAmount,
        customerName: customerName || undefined,
        customerEmail,
        customerPhone,
        customerId,
        partySize,
        fulfillmentDate,
        serviceDate: meta.serviceDate,
        serviceTime: meta.serviceTime,
        paymentStatus,
        paymentMethod,
        paidAt,
        notes,
        allergenNote: meta.allergens,
        serviceId: meta.serviceId ? (service?.id ?? null) : undefined,
        bookTable: meta.bookTable,
        syncedAt: new Date(),
        // `opStatus` and `fulfillmentType` are deliberately NOT updated — they
        // are our operational state. A staff member marking an order IN_PREP
        // must not be reset by the next webhook or 15-minute pull.
      },
      create: {
        venueId,
        wooOrderId,
        source: 'WOO',
        status: mapWooStatus(wooStatus) as OrderStatus,
        opStatus: mapWooOpStatus(wooStatus),
        fulfillmentType: meta.fulfillmentType ?? 'DINE_IN',
        totalAmount,
        customerName: customerName || null,
        customerEmail,
        customerPhone,
        customerId,
        partySize,
        fulfillmentDate,
        serviceDate: meta.serviceDate,
        serviceTime: meta.serviceTime,
        paymentStatus,
        paymentMethod,
        paidAt,
        notes,
        allergenNote: meta.allergens,
        serviceId: service?.id ?? null,
        bookTable: meta.bookTable,
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
            data: { qty, unitPrice, productName: li.name ?? null },
          })
          keptIds.add(existing.id)
        } else {
          const created = await tx.wooOrderItem.create({
            data: {
              orderId: woo.id,
              menuItemId: menuItem.id,
              qty,
              unitPrice,
              productName: li.name ?? null,
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
              productName: li.name ?? null,
              explodedIngredients: {
                recipeId: menuItem.recipeId,
                recipeName: menuItem.recipe?.name,
                orderQty: qty,
                ingredients: exploded,
              },
            },
          })
        }
      }
    }
  }

  // Auto-seating is off unless the venue explicitly opts in (Venue.autoSeat).
  if (venue?.autoSeat && partySize && partySize > 0 && fulfillmentDate) {
    try {
      // `wooOrderId` is nullable on the model (manual orders), but this path is
      // only ever reached for a Woo-sourced order — pass the known-good local.
      await tryAutoSeat({ ...order, wooOrderId }, venueId, partySize, fulfillmentDate)
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

  // The customer chose "book a table too" at checkout — that booking must
  // exist. No tables are auto-assigned; the venue seats manually.
  if (
    meta.bookTable &&
    !order.bookingId &&
    meta.serviceDate &&
    meta.serviceTime &&
    partySize &&
    mapWooStatus(wooStatus) !== 'CANCELLED'
  ) {
    try {
      await bookTableForOrder(order, venueId, meta, service, partySize)
    } catch (e) {
      console.error('Book-a-table failed (non-blocking):', e)
      await logSync({
        venueId,
        direction: 'WEBHOOK',
        entity: 'ORDER',
        status: 'ERROR',
        externalId: wooOrderId,
        message: `BOOK-A-TABLE FAILED FOR ORDER #${wooOrderId} (ORDER STILL SYNCED)`,
        detail: { error: String(e) },
      })
    }
  }

  // Attach the order to a table reservation for the same person, if one exists.
  // Only when not already linked, so an operator's manual correction sticks.
  if (!order.bookingId) {
    try {
      await autoLinkBooking(prisma, order.id, venueId, meta.serviceDate, {
        customerId,
        customerPhone,
        customerEmail,
        serviceTime: meta.serviceTime,
      })
    } catch (e) {
      console.error('Booking auto-link failed (non-blocking):', e)
    }
  }

  try {
    await detectGiftCards(lineItems, venueId, { ...order, wooOrderId }, customerName, customerEmail)
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
          await processWooOrder(integration.venueId, integration.id, order, integration.metaFieldMap)
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

/*
 * Creates the reservation the customer asked for at checkout ("book a table
 * too"). The slot's own end time is used when the service has one for that
 * time; otherwise the booking is 90 minutes. Never assigns tables — seating
 * stays manual.
 */
async function bookTableForOrder(
  order: { id: string; customerName: string | null; customerEmail: string | null; customerPhone: string | null },
  venueId: string,
  meta: ResolvedOrderMeta,
  service: { id: string } | null,
  partySize: number,
) {
  const serviceDate = meta.serviceDate as Date
  const serviceTime = meta.serviceTime as string

  let endTime = addMinutesHHMM(serviceTime, 90)
  if (service) {
    const svc = await prisma.service.findUnique({
      where: { id: service.id },
      include: { slots: true, exceptions: true },
    })
    if (svc) {
      const input: ServiceScheduleInput = {
        slots: svc.slots.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          maxCovers: s.maxCovers,
        })),
        exceptions: svc.exceptions.map((e) => ({
          date: e.date.toISOString().slice(0, 10),
          closed: e.closed,
          startTime: e.startTime,
          endTime: e.endTime,
          maxCovers: e.maxCovers,
        })),
      }
      endTime = slotEndForTime(input, formatDateKey(serviceDate), serviceTime) ?? endTime
    }
  }

  const booking = await prisma.booking.create({
    data: {
      venueId,
      date: serviceDate,
      startTime: serviceTime,
      endTime,
      partySize,
      contactName: order.customerName ?? 'WOO ORDER',
      contactPhone: order.customerPhone,
      contactEmail: order.customerEmail,
      source: 'WOOCOMMERCE',
      status: 'CONFIRMED',
    },
  })

  await prisma.wooOrder.update({
    where: { id: order.id },
    data: { bookingId: booking.id },
  })
}

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

/*
 * Our operational lifecycle seeded from the Woo status. Only ever applied when
 * an order is first created — see the upsert above for why.
 */
function mapWooOpStatus(status: string): OrderOpStatus {
  const map: Record<string, OrderOpStatus> = {
    pending: 'NEW',
    'on-hold': 'NEW',
    processing: 'CONFIRMED',
    completed: 'CONFIRMED',
    cancelled: 'CANCELLED',
    refunded: 'CANCELLED',
    failed: 'CANCELLED',
  }
  return map[status.toLowerCase()] ?? 'NEW'
}

/*
 * WooCommerce emits `*_gmt` fields as naive strings that are actually UTC, so
 * they need an explicit Z before parsing. Falls back to the local-time variant
 * when the GMT one is absent.
 */
function parseWooDate(gmt?: string | null, local?: string | null): Date | null {
  const raw = gmt || local
  if (!raw) return null
  const iso = gmt && !/[Zz]|[+-]\d{2}:?\d{2}$/.test(gmt) ? `${gmt}Z` : raw
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

/** Fold a "HH:mm" onto a UTC-midnight date for the legacy `fulfillmentDate`. */
function combineDateTime(date: Date | null, time: string | null): Date | null {
  if (!date) return null
  if (!time) return date

  const [h, m] = time.split(':').map(Number)
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h, m),
  )
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
