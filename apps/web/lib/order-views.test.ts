import { describe, it, expect } from 'vitest'
import {
  parseAllergens,
  aggregateDishTotals,
  aggregateCategoryTotals,
  collectAllergenAlerts,
  groupByTable,
  slotFor,
  groupByTimeSlot,
  summarise,
  applyFilters,
  spansMultipleDays,
  type OrderView,
  type OrderLineView,
} from '@/lib/order-views'

function line(over: Partial<OrderLineView> = {}): OrderLineView {
  return {
    id: 'l1',
    menuItemId: 'm1',
    name: 'SIRLOIN',
    qty: 1,
    unitPrice: 30,
    dietaryInfo: null,
    customerNote: null,
    allergenNote: null,
    kitchenStatus: 'PENDING',
    ...over,
  }
}

function order(over: Partial<OrderView> = {}): OrderView {
  return {
    id: 'o1',
    ref: '#1001',
    source: 'WOO',
    customerName: 'ADA LOVELACE',
    customerPhone: '0211111111',
    customerEmail: 'ada@example.com',
    serviceTime: '18:00',
    partySize: 4,
    fulfillmentType: 'DINE_IN',
    opStatus: 'CONFIRMED',
    status: 'PROCESSING',
    paymentStatus: 'PAID',
    paymentMethod: 'CARD',
    totalAmount: 120,
    allergenNote: null,
    notes: null,
    menuName: null,
    tables: [],
    items: [line()],
    ...over,
  }
}

describe('parseAllergens', () => {
  it('splits, trims and uppercases', () => {
    expect(parseAllergens('gluten, Milk ,peanut')).toEqual(['GLUTEN', 'MILK', 'PEANUT'])
  })
  it('returns empty for blank input', () => {
    expect(parseAllergens(null)).toEqual([])
    expect(parseAllergens('')).toEqual([])
    expect(parseAllergens(' , , ')).toEqual([])
  })
})

describe('spansMultipleDays', () => {
  it('is false for empty or single-day orders', () => {
    expect(spansMultipleDays([])).toBe(false)
    expect(
      spansMultipleDays([
        order({ serviceDate: '2026-08-14' }),
        order({ serviceDate: '2026-08-14' }),
      ]),
    ).toBe(false)
    expect(spansMultipleDays([order({ serviceDate: null })])).toBe(false)
  })

  it('is true when orders cover more than one day', () => {
    expect(
      spansMultipleDays([
        order({ serviceDate: '2026-08-10' }),
        order({ serviceDate: '2026-08-14' }),
      ]),
    ).toBe(true)
  })
})

describe('aggregateDishTotals', () => {
  it('sums the same dish across orders', () => {
    const orders = [
      order({ id: 'a', items: [line({ qty: 2 })] }),
      order({ id: 'b', items: [line({ qty: 3 })] }),
    ]
    const totals = aggregateDishTotals(orders)
    expect(totals).toHaveLength(1)
    expect(totals[0]).toMatchObject({ name: 'SIRLOIN', qty: 5 })
  })

  it('merges the same dish sold under different product ids', () => {
    // Two Woo products, one thing to cook.
    const orders = [
      order({ id: 'a', items: [line({ menuItemId: 'm1', name: 'Sirloin', qty: 1 })] }),
      order({ id: 'b', items: [line({ menuItemId: 'm2', name: 'SIRLOIN', qty: 2 })] }),
    ]
    const totals = aggregateDishTotals(orders)
    expect(totals).toHaveLength(1)
    expect(totals[0].qty).toBe(3)
  })

  it('sorts by quantity descending', () => {
    const orders = [
      order({ items: [line({ name: 'FISH', qty: 1 }), line({ id: 'l2', name: 'STEAK', qty: 9 })] }),
    ]
    expect(aggregateDishTotals(orders).map((d) => d.name)).toEqual(['STEAK', 'FISH'])
  })

  it('carries the dish allergen tags through', () => {
    const orders = [order({ items: [line({ dietaryInfo: 'GLUTEN,MILK' })] })]
    expect(aggregateDishTotals(orders)[0].allergens).toEqual(['GLUTEN', 'MILK'])
  })

  it('handles no orders', () => {
    expect(aggregateDishTotals([])).toEqual([])
  })
})

describe('aggregateCategoryTotals', () => {
  it('rolls dishes up by category', () => {
    const orders = [
      order({ items: [line({ menuItemId: 'm1', name: 'STEAK', qty: 4 })] }),
      order({ id: 'b', items: [line({ menuItemId: 'm2', name: 'SALAD', qty: 6 })] }),
    ]
    const map = new Map([['m1', ['PROTEIN']], ['m2', ['PRODUCE']]])
    const totals = aggregateCategoryTotals(orders, map)
    expect(totals.map((t) => [t.category, t.total])).toEqual([['PRODUCE', 6], ['PROTEIN', 4]])
  })

  it('counts a dish under every category it touches', () => {
    const orders = [order({ items: [line({ menuItemId: 'm1', qty: 2 })] })]
    const map = new Map([['m1', ['PROTEIN', 'DAIRY']]])
    const totals = aggregateCategoryTotals(orders, map)
    expect(totals).toHaveLength(2)
    expect(totals.every((t) => t.total === 2)).toBe(true)
  })

  it('buckets unmapped dishes rather than dropping them', () => {
    const orders = [order({ items: [line({ menuItemId: 'unknown', qty: 3 })] })]
    const totals = aggregateCategoryTotals(orders, new Map())
    expect(totals).toEqual([
      { category: 'UNCATEGORISED', total: 3, items: [{ name: 'SIRLOIN', qty: 3 }] },
    ])
  })
})

describe('collectAllergenAlerts', () => {
  it('surfaces an order-level allergy note', () => {
    const orders = [order({ serviceDate: '2026-08-14', allergenNote: 'SEVERE NUT ALLERGY' })]
    const alerts = collectAllergenAlerts(orders)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].note).toBe('SEVERE NUT ALLERGY')
    expect(alerts[0].serviceDate).toBe('2026-08-14')
  })

  it('surfaces a line-level allergy note with the dish name', () => {
    const orders = [order({ items: [line({ name: 'RISOTTO', allergenNote: 'NO PARMESAN' })] })]
    const alerts = collectAllergenAlerts(orders)
    expect(alerts[0].note).toBe('RISOTTO: NO PARMESAN')
    expect(alerts[0].dishes).toEqual(['RISOTTO'])
  })

  it('combines order-level and line-level notes', () => {
    const orders = [
      order({ allergenNote: 'COELIAC', items: [line({ name: 'PASTA', allergenNote: 'GF PLEASE' })] }),
    ]
    expect(collectAllergenAlerts(orders)[0].note).toBe('COELIAC · PASTA: GF PLEASE')
  })

  it('does NOT raise an alert for a dish that merely contains allergens', () => {
    // The critical distinction: routine dish tags must not drown the real
    // customer-stated requirements.
    const orders = [order({ items: [line({ dietaryInfo: 'GLUTEN,MILK' })] })]
    expect(collectAllergenAlerts(orders)).toEqual([])
  })

  it('ignores whitespace-only notes', () => {
    expect(collectAllergenAlerts([order({ allergenNote: '   ' })])).toEqual([])
  })
})

describe('groupByTable', () => {
  it('groups orders under their table', () => {
    const orders = [order({ id: 'a', tables: ['12'] }), order({ id: 'b', tables: ['13'] })]
    expect(groupByTable(orders).map((g) => g.table)).toEqual(['12', '13'])
  })

  it('shows a multi-table order under each of its tables', () => {
    const orders = [order({ id: 'a', tables: ['12', '13'], partySize: 8 })]
    const groups = groupByTable(orders)
    expect(groups).toHaveLength(2)
    expect(groups.every((g) => g.orders[0].id === 'a')).toBe(true)
  })

  it('collects unassigned orders instead of dropping them', () => {
    const groups = groupByTable([order({ tables: [] })])
    expect(groups[0].table).toBe('UNASSIGNED')
  })

  it('sorts tables numerically and pushes unassigned last', () => {
    const orders = [
      order({ id: 'a', tables: ['10'] }),
      order({ id: 'b', tables: [] }),
      order({ id: 'c', tables: ['2'] }),
    ]
    expect(groupByTable(orders).map((g) => g.table)).toEqual(['2', '10', 'UNASSIGNED'])
  })

  it('sums covers per table', () => {
    const orders = [order({ id: 'a', tables: ['5'], partySize: 4 }), order({ id: 'b', tables: ['5'], partySize: 2 })]
    expect(groupByTable(orders)[0].covers).toBe(6)
  })
})

describe('slotFor', () => {
  it('floors to the slot boundary', () => {
    expect(slotFor('18:20', 30)).toBe('18:00')
    expect(slotFor('18:45', 30)).toBe('18:30')
    expect(slotFor('18:05', 15)).toBe('18:00')
  })

  it('labels missing or invalid times', () => {
    expect(slotFor(null, 30)).toBe('NO TIME')
    expect(slotFor('later', 30)).toBe('NO TIME')
  })
})

describe('groupByTimeSlot', () => {
  it('groups and sorts chronologically', () => {
    const orders = [
      order({ id: 'a', serviceTime: '19:15' }),
      order({ id: 'b', serviceTime: '18:00' }),
      order({ id: 'c', serviceTime: '18:20' }),
    ]
    const slots = groupByTimeSlot(orders, 30)
    expect(slots.map((s) => s.slot)).toEqual(['18:00', '19:00'])
    expect(slots[0].orders).toHaveLength(2)
  })

  it('pushes untimed orders to the end', () => {
    const orders = [order({ id: 'a', serviceTime: null }), order({ id: 'b', serviceTime: '12:00' })]
    expect(groupByTimeSlot(orders).map((s) => s.slot)).toEqual(['12:00', 'NO TIME'])
  })
})

describe('summarise', () => {
  it('totals orders, covers and revenue', () => {
    const orders = [
      order({ id: 'a', partySize: 4, totalAmount: 100, paymentStatus: 'PAID' }),
      order({ id: 'b', partySize: 2, totalAmount: 50, paymentStatus: 'UNPAID' }),
    ]
    expect(summarise(orders)).toEqual({
      orders: 2, covers: 6, revenue: 150, unpaid: 1, outstanding: 50,
    })
  })

  it('treats partial payment as outstanding', () => {
    expect(summarise([order({ paymentStatus: 'PARTIAL', totalAmount: 80 })]).unpaid).toBe(1)
  })

  it('handles an empty day', () => {
    expect(summarise([])).toEqual({ orders: 0, covers: 0, revenue: 0, unpaid: 0, outstanding: 0 })
  })

  it('tolerates null amounts and party sizes', () => {
    expect(summarise([order({ partySize: null, totalAmount: null })])).toMatchObject({
      covers: 0, revenue: 0,
    })
  })
})

describe('applyFilters', () => {
  const orders = [
    order({ id: 'a', ref: '#1001', customerName: 'ADA', opStatus: 'NEW', paymentStatus: 'PAID' }),
    order({ id: 'b', ref: '#1002', customerName: 'BOB', customerEmail: 'bob@example.com',
      customerPhone: '0212222222', opStatus: 'READY', paymentStatus: 'UNPAID',
      allergenNote: 'NO NUTS' }),
  ]

  it('returns everything for empty filters', () => {
    expect(applyFilters(orders, {})).toHaveLength(2)
  })

  it('filters by operational status', () => {
    expect(applyFilters(orders, { opStatus: ['READY'] }).map((o) => o.id)).toEqual(['b'])
  })

  it('filters by payment status', () => {
    expect(applyFilters(orders, { paymentStatus: ['UNPAID'] }).map((o) => o.id)).toEqual(['b'])
  })

  it('filters to orders carrying an allergy requirement', () => {
    expect(applyFilters(orders, { allergensOnly: true }).map((o) => o.id)).toEqual(['b'])
  })

  it('searches ref, customer and dish names', () => {
    expect(applyFilters(orders, { search: '1002' }).map((o) => o.id)).toEqual(['b'])
    expect(applyFilters(orders, { search: 'ada' }).map((o) => o.id)).toEqual(['a'])
    expect(applyFilters(orders, { search: 'sirloin' })).toHaveLength(2)
  })

  it('combines criteria as AND', () => {
    expect(applyFilters(orders, { opStatus: ['READY'], search: 'ada' })).toEqual([])
  })
})
