/*
 * Order view projections.
 *
 * One order payload, several ways of reading it. The kitchen wants dish totals
 * and allergy alerts; the floor wants orders grouped by table; the pass wants a
 * pick list. These are pure reshapes of the same data so a view switch never
 * costs a round-trip, and every projection is testable without a database.
 */

export interface OrderLineView {
  id: string
  menuItemId: string | null
  name: string
  qty: number
  unitPrice: number | null
  dietaryInfo: string | null
  customerNote: string | null
  allergenNote: string | null
  kitchenStatus: string
}

export interface OrderView {
  id: string
  ref: string
  source: string
  customerName: string | null
  customerPhone: string | null
  customerEmail: string | null
  serviceTime: string | null
  partySize: number | null
  fulfillmentType: string
  opStatus: string
  status: string
  paymentStatus: string
  paymentMethod: string | null
  totalAmount: number | null
  allergenNote: string | null
  notes: string | null
  menuName: string | null
  /** Set when the order is attached to a table reservation. */
  bookingId?: string | null
  tables: string[]
  items: OrderLineView[]
}

/** Split a comma-separated allergen string into clean uppercase tags. */
export function parseAllergens(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
}

// ── KITCHEN ────────────────────────────────────────────────────────────

export interface DishTotal {
  menuItemId: string | null
  name: string
  qty: number
  allergens: string[]
}

/** Total quantity per dish across every order — what the kitchen actually cooks. */
export function aggregateDishTotals(orders: OrderView[]): DishTotal[] {
  const byName = new Map<string, DishTotal>()

  for (const order of orders) {
    for (const item of order.items) {
      // Key on name, not id: the same dish sold as two Woo products should
      // still show the kitchen one number to cook.
      const key = item.name.toUpperCase()
      const existing = byName.get(key)
      if (existing) {
        existing.qty += item.qty
      } else {
        byName.set(key, {
          menuItemId: item.menuItemId,
          name: item.name.toUpperCase(),
          qty: item.qty,
          allergens: parseAllergens(item.dietaryInfo),
        })
      }
    }
  }

  return [...byName.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))
}

export interface CategoryTotal {
  category: string
  total: number
  items: { name: string; qty: number }[]
}

/*
 * Dish totals rolled up by inventory category, using a prebuilt lookup so this
 * stays a pure in-memory reshape — the caller resolves categories in one query
 * rather than one per line item.
 */
export function aggregateCategoryTotals(
  orders: OrderView[],
  categoryByMenuItem: Map<string, string[]>,
): CategoryTotal[] {
  const byCategory = new Map<string, CategoryTotal>()

  for (const dish of aggregateDishTotals(orders)) {
    const categories = dish.menuItemId ? categoryByMenuItem.get(dish.menuItemId) ?? [] : []
    const buckets = categories.length > 0 ? categories : ['UNCATEGORISED']

    for (const cat of buckets) {
      const entry = byCategory.get(cat) ?? { category: cat, total: 0, items: [] }
      entry.total += dish.qty
      entry.items.push({ name: dish.name, qty: dish.qty })
      byCategory.set(cat, entry)
    }
  }

  return [...byCategory.values()].sort((a, b) => b.total - a.total || a.category.localeCompare(b.category))
}

export interface AllergenAlert {
  orderId: string
  ref: string
  customerName: string | null
  tables: string[]
  serviceTime: string | null
  /** Free-text requirement the customer gave us — the thing that can hurt someone. */
  note: string
  dishes: string[]
}

/*
 * Customer-stated allergy requirements only.
 *
 * Deliberately NOT the dish's own allergen tags: those are on every card
 * already, and mixing them in here would bury the handful of orders that carry
 * a real "severe nut allergy" instruction under dozens of routine GLUTEN tags.
 */
export function collectAllergenAlerts(orders: OrderView[]): AllergenAlert[] {
  const alerts: AllergenAlert[] = []

  for (const order of orders) {
    const dishes: string[] = []
    const notes: string[] = []

    if (order.allergenNote?.trim()) notes.push(order.allergenNote.trim())

    for (const item of order.items) {
      if (item.allergenNote?.trim()) {
        notes.push(`${item.name.toUpperCase()}: ${item.allergenNote.trim()}`)
        dishes.push(item.name.toUpperCase())
      }
    }

    if (notes.length === 0) continue

    alerts.push({
      orderId: order.id,
      ref: order.ref,
      customerName: order.customerName,
      tables: order.tables,
      serviceTime: order.serviceTime,
      note: notes.join(' · '),
      dishes,
    })
  }

  return alerts
}

// ── FOH ────────────────────────────────────────────────────────────────

export interface TableGroupView {
  table: string
  orders: OrderView[]
  covers: number
}

/*
 * Orders grouped by assigned table. An order spanning several tables appears
 * under each of them — the section running table 12 needs to see it whether or
 * not it also touches table 13. Unassigned orders collect under a single
 * bucket rather than being dropped.
 */
export function groupByTable(orders: OrderView[], unassignedLabel = 'UNASSIGNED'): TableGroupView[] {
  const byTable = new Map<string, TableGroupView>()

  for (const order of orders) {
    const keys = order.tables.length > 0 ? order.tables : [unassignedLabel]
    for (const t of keys) {
      const entry = byTable.get(t) ?? { table: t, orders: [], covers: 0 }
      entry.orders.push(order)
      entry.covers += order.partySize ?? 0
      byTable.set(t, entry)
    }
  }

  return [...byTable.values()].sort((a, b) => {
    // Unassigned last; otherwise numeric table order where possible.
    if (a.table === unassignedLabel) return 1
    if (b.table === unassignedLabel) return -1
    const na = Number(a.table)
    const nb = Number(b.table)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return a.table.localeCompare(b.table)
  })
}

// ── SERVICE ────────────────────────────────────────────────────────────

export interface TimeSlotView {
  slot: string
  orders: OrderView[]
  covers: number
}

/** Round "HH:mm" down to the nearest slot boundary. */
export function slotFor(time: string | null, slotMinutes: number): string {
  if (!time) return 'NO TIME'
  const [h, m] = time.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return 'NO TIME'
  const total = h * 60 + m
  const floored = Math.floor(total / slotMinutes) * slotMinutes
  return `${String(Math.floor(floored / 60)).padStart(2, '0')}:${String(floored % 60).padStart(2, '0')}`
}

export function groupByTimeSlot(orders: OrderView[], slotMinutes = 30): TimeSlotView[] {
  const bySlot = new Map<string, TimeSlotView>()

  for (const order of orders) {
    const slot = slotFor(order.serviceTime, slotMinutes)
    const entry = bySlot.get(slot) ?? { slot, orders: [], covers: 0 }
    entry.orders.push(order)
    entry.covers += order.partySize ?? 0
    bySlot.set(slot, entry)
  }

  return [...bySlot.values()].sort((a, b) => {
    // Untimed orders sort last — they are not part of the service run-sheet.
    if (a.slot === 'NO TIME') return 1
    if (b.slot === 'NO TIME') return -1
    return a.slot.localeCompare(b.slot)
  })
}

// ── SUMMARY ────────────────────────────────────────────────────────────

export interface OrderSummary {
  orders: number
  covers: number
  revenue: number
  unpaid: number
  outstanding: number
}

export function summarise(orders: OrderView[]): OrderSummary {
  let covers = 0
  let revenue = 0
  let unpaid = 0
  let outstanding = 0

  for (const o of orders) {
    covers += o.partySize ?? 0
    revenue += o.totalAmount ?? 0
    if (o.paymentStatus !== 'PAID') {
      unpaid++
      outstanding += o.totalAmount ?? 0
    }
  }

  return {
    orders: orders.length,
    covers,
    revenue: Math.round(revenue * 100) / 100,
    unpaid,
    outstanding: Math.round(outstanding * 100) / 100,
  }
}

// ── FILTERING ──────────────────────────────────────────────────────────

export interface OrderFilters {
  search?: string
  opStatus?: string[]
  paymentStatus?: string[]
  fulfillmentType?: string[]
  menuId?: string | null
  allergensOnly?: boolean
}

/** Apply a saved view's filters. Empty/absent criteria mean "no restriction". */
export function applyFilters(orders: OrderView[], filters: OrderFilters): OrderView[] {
  const search = filters.search?.trim().toLowerCase()

  return orders.filter((o) => {
    if (filters.opStatus?.length && !filters.opStatus.includes(o.opStatus)) return false
    if (filters.paymentStatus?.length && !filters.paymentStatus.includes(o.paymentStatus)) return false
    if (filters.fulfillmentType?.length && !filters.fulfillmentType.includes(o.fulfillmentType)) return false

    if (filters.allergensOnly) {
      const hasAllergy =
        !!o.allergenNote?.trim() || o.items.some((i) => !!i.allergenNote?.trim())
      if (!hasAllergy) return false
    }

    if (search) {
      const haystack = [
        o.ref,
        o.customerName,
        o.customerPhone,
        o.customerEmail,
        ...o.items.map((i) => i.name),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(search)) return false
    }

    return true
  })
}
