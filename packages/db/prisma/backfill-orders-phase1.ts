import { prisma } from '../index'
// Zero-dependency pure module — safe to pull across the workspace boundary.
import { resolveCustomer, type CustomerIdentity } from '../../../apps/web/lib/customer-match'

/*
 * Phase 1 orders backfill.
 *
 * 1. Builds `Customer` rows from existing bookings and Woo orders, deduped
 *    through the same matcher the live sync will use, and links each order to
 *    its customer.
 * 2. Splits `WooOrderItem.notes` — which historically held EITHER the Woo
 *    line-item name OR a JSON exploded-recipe blob — into the new
 *    `productName` / `explodedIngredients` columns, freeing `notes` for real
 *    operator notes.
 * 3. Copies `fulfillmentDate` into `serviceDate` / `serviceTime`.
 *
 * Idempotent: every step skips rows it has already converted, so this is safe
 * to re-run and safe to wire into the deploy entrypoint later.
 *
 * NOTE: payment fields are deliberately left at their defaults. Inferring
 * "COMPLETED means paid" would fabricate data; the Phase 2 sync reads the real
 * `date_paid` / `payment_method_title` from WooCommerce instead.
 */

async function backfillCustomers() {
  const venues = await prisma.venue.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  })

  const startCount = await prisma.customer.count()
  let linked = 0

  for (const venue of venues) {
    // Bookings first — historically the richest source of contact details, so
    // orders arriving later enrich an existing record rather than the reverse.
    const bookings = await prisma.booking.findMany({
      where: { venueId: venue.id, deletedAt: null },
      select: { contactName: true, contactPhone: true, contactEmail: true },
      orderBy: { createdAt: 'asc' },
    })

    for (const b of bookings) {
      const identity: CustomerIdentity = {
        name: b.contactName,
        email: b.contactEmail,
        phone: b.contactPhone,
      }
      await resolveCustomer(prisma, venue.id, identity)
    }

    const orders = await prisma.wooOrder.findMany({
      where: { venueId: venue.id, deletedAt: null, customerId: null },
      select: {
        id: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    for (const o of orders) {
      const identity: CustomerIdentity = {
        name: o.customerName,
        email: o.customerEmail,
        phone: o.customerPhone,
      }
      const customerId = await resolveCustomer(prisma, venue.id, identity)

      if (customerId) {
        await prisma.wooOrder.update({ where: { id: o.id }, data: { customerId } })
        linked++
      }
    }
  }

  const endCount = await prisma.customer.count()
  console.log(`  Customers created: ${endCount - startCount} (total now ${endCount})`)
  console.log(`  Orders linked to a customer: ${linked}`)
}

async function backfillOrderItems() {
  // `notes` is cleared once a row is split, so it is the whole idempotency
  // guard — a second run finds nothing left to do.
  const items = await prisma.wooOrderItem.findMany({
    where: { notes: { not: null } },
    select: { id: true, notes: true },
  })

  let asJson = 0
  let asName = 0

  for (const item of items) {
    const raw = item.notes ?? ''
    let parsed: unknown = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }

    // A bare product name like "12" parses as a JSON number — require an object.
    const isBlob =
      parsed !== null && typeof parsed === 'object' && 'explodedIngredients' in (parsed as object)

    if (isBlob) {
      const blob = parsed as {
        productName?: string
        recipeId?: string
        recipeName?: string
        orderQty?: number
        explodedIngredients?: { inventoryItemId: string; requiredBaseQty: number }[]
      }
      await prisma.wooOrderItem.update({
        where: { id: item.id },
        data: {
          productName: blob.productName ?? null,
          // Reshaped to match what the sync now writes: the ingredient array
          // moves under `ingredients` alongside its recipe context.
          explodedIngredients: {
            recipeId: blob.recipeId ?? null,
            recipeName: blob.recipeName ?? null,
            orderQty: blob.orderQty ?? null,
            ingredients: blob.explodedIngredients ?? [],
          },
          notes: null,
        },
      })
      asJson++
    } else {
      await prisma.wooOrderItem.update({
        where: { id: item.id },
        data: { productName: raw, notes: null },
      })
      asName++
    }
  }

  console.log(`  Line items with recipe JSON recovered: ${asJson}`)
  console.log(`  Line items with a product name recovered: ${asName}`)
}

async function backfillServiceDates() {
  const orders = await prisma.wooOrder.findMany({
    where: { fulfillmentDate: { not: null }, serviceDate: null, deletedAt: null },
    select: { id: true, fulfillmentDate: true },
  })

  for (const o of orders) {
    const d = o.fulfillmentDate!
    // Read UTC parts — a date-only meta value lands on UTC midnight, and using
    // local parts would shift it a day either side of the date line.
    const serviceDate = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    )
    const hh = d.getUTCHours()
    const mm = d.getUTCMinutes()
    const serviceTime =
      hh === 0 && mm === 0
        ? null
        : `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`

    await prisma.wooOrder.update({
      where: { id: o.id },
      data: { serviceDate, serviceTime },
    })
  }

  console.log(`  Orders given a service date: ${orders.length}`)
}

async function main() {
  console.log('=== ORDERS PHASE 1 BACKFILL ===')
  console.log(`Started: ${new Date().toISOString()}\n`)

  console.log('Customers:')
  await backfillCustomers()

  console.log('\nOrder line items:')
  await backfillOrderItems()

  console.log('\nService dates:')
  await backfillServiceDates()

  console.log('\nDone.')
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
