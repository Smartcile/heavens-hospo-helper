import { describe, it, expect } from 'vitest'
import {
  collectEventItems,
  collectPriceableLines,
  computeEventTotals,
  describeLineUnit,
  formatLineYield,
  parsePricingUnit,
  suggestPlatterCount,
  type MenuPrice,
} from '@/lib/event-pricing'

const MENU_ITEMS: MenuPrice[] = [
  { id: 'm1', name: 'ROAST LAMB', price: 42.5 },
  { id: 'm2', name: 'VEGAN RISOTTO', price: 30 },
  { id: 'm3', name: 'HOUSE RED', price: 12 },
]

describe('collectEventItems (legacy shape)', () => {
  it('collects items from menu and drinks blocks', () => {
    const items = collectEventItems([
      { type: 'MENU_SELECTION', config: { items: [{ menuItemId: 'm1', qty: 2 }] } },
      { type: 'DRINKS_SELECTION', config: { items: [{ menuItemId: 'm3', qty: 4 }] } },
    ])
    expect(items).toEqual([
      { menuItemId: 'm1', qty: 2 },
      { menuItemId: 'm3', qty: 4 },
    ])
  })

  it('ignores non-priced blocks', () => {
    const items = collectEventItems([
      { type: 'TIMELINE', config: { rows: [{ time: '18:00' }] } },
      { type: 'STAFFING', config: { rows: [{ role: 'FOH', count: 6 }] } },
    ])
    expect(items).toEqual([])
  })

  it('merges the same item across blocks', () => {
    const items = collectEventItems([
      { type: 'MENU_SELECTION', config: { items: [{ menuItemId: 'm1', qty: 2 }] } },
      { type: 'DRINKS_SELECTION', config: { items: [{ menuItemId: 'm1', qty: 3 }] } },
    ])
    expect(items).toEqual([{ menuItemId: 'm1', qty: 5 }])
  })

  it('skips blank ids and non-positive/invalid quantities', () => {
    const items = collectEventItems([
      {
        type: 'MENU_SELECTION',
        config: {
          items: [
            { menuItemId: '', qty: 2 },
            { menuItemId: 'm1', qty: 0 },
            { menuItemId: 'm2', qty: -1 },
            { menuItemId: 'm3', qty: 'x' },
            { menuItemId: 'm1', qty: 1 },
          ],
        },
      },
    ])
    expect(items).toEqual([{ menuItemId: 'm1', qty: 1 }])
  })

  it('tolerates missing/empty blocks and configs', () => {
    expect(collectEventItems(null)).toEqual([])
    expect(collectEventItems([{ type: 'MENU_SELECTION' }])).toEqual([])
    expect(collectEventItems([{ type: 'MENU_SELECTION', config: { items: 'nope' } }])).toEqual([])
  })
})

describe('collectPriceableLines', () => {
  it('keeps the same product on different units as separate lines', () => {
    const lines = collectPriceableLines([
      {
        type: 'MENU_SELECTION',
        config: {
          items: [
            { menuItemId: 'm1', qty: 2, unit: 'EACH' },
            { menuItemId: 'm1', qty: 10, unit: 'PER_PERSON' },
          ],
        },
      },
    ])
    expect(lines).toEqual([
      { menuItemId: 'm1', qty: 2, unit: 'EACH' },
      { menuItemId: 'm1', qty: 10, unit: 'PER_PERSON' },
    ])
  })

  it('merges the same item + unit across blocks', () => {
    const lines = collectPriceableLines([
      { type: 'MENU_SELECTION', config: { items: [{ menuItemId: 'm1', qty: 2, unit: 'PER_PLATTER' }] } },
      { type: 'DRINKS_SELECTION', config: { items: [{ menuItemId: 'm1', qty: 1, unit: 'PER_PLATTER' }] } },
    ])
    expect(lines).toEqual([{ menuItemId: 'm1', qty: 3, unit: 'PER_PLATTER' }])
  })

  it('defaults an unknown/absent unit to EACH', () => {
    const lines = collectPriceableLines([
      {
        type: 'MENU_SELECTION',
        config: { items: [{ menuItemId: 'm1', qty: 2, unit: 'BANANAS' }] },
      },
    ])
    expect(lines[0].unit).toBe('EACH')
  })

  it('collects a package line and folds an additive price delta', () => {
    const lines = collectPriceableLines([
      {
        type: 'MENU_SELECTION',
        config: {
          items: [
            { packageId: 'pkg1', qty: 1, unit: 'PER_PERSON' },
            { menuItemId: 'm1', qty: 1, priceDelta: 3 },
          ],
        },
      },
    ])
    expect(lines).toEqual([
      { packageId: 'pkg1', qty: 1, unit: 'PER_PERSON' },
      { menuItemId: 'm1', qty: 1, unit: 'EACH', priceDelta: 3 },
    ])
  })
})

describe('computeEventTotals', () => {
  const blocks = [
    { type: 'MENU_SELECTION', config: { items: [{ menuItemId: 'm1', qty: 2 }, { menuItemId: 'm2', qty: 1 }] } },
    { type: 'DRINKS_SELECTION', config: { items: [{ menuItemId: 'm3', qty: 4 }] } },
  ]

  it('prices each line and sums the subtotal', () => {
    const totals = computeEventTotals(blocks, MENU_ITEMS, null)
    expect(totals.lines).toEqual([
      { menuItemId: 'm1', name: 'ROAST LAMB', qty: 2, unit: 'EACH', unitPrice: 42.5, total: 85 },
      { menuItemId: 'm2', name: 'VEGAN RISOTTO', qty: 1, unit: 'EACH', unitPrice: 30, total: 30 },
      { menuItemId: 'm3', name: 'HOUSE RED', qty: 4, unit: 'EACH', unitPrice: 12, total: 48 },
    ])
    expect(totals.subtotal).toBe(163)
    expect(totals.deposit).toBe(0)
    expect(totals.balance).toBe(163)
    expect(totals.violations).toEqual([])
    expect(totals.byUnit).toEqual({ EACH: 163, PER_PERSON: 0, PER_PLATTER: 0 })
  })

  it('subtracts the deposit to give the balance', () => {
    const totals = computeEventTotals(blocks, MENU_ITEMS, 50)
    expect(totals.deposit).toBe(50)
    expect(totals.balance).toBe(113)
  })

  it('reports a credit (negative) balance when the deposit exceeds the total', () => {
    // Legitimate — the venue owes the customer the difference.
    expect(computeEventTotals(blocks, MENU_ITEMS, 999).balance).toBe(-836)
    expect(computeEventTotals([], MENU_ITEMS, 999).balance).toBe(-999)
  })

  it('prices legacy `{ menuItemId, qty }` blocks identically', () => {
    const legacy = computeEventTotals(blocks, MENU_ITEMS, 50)
    const explicit = computeEventTotals(
      [
        {
          type: 'MENU_SELECTION',
          config: {
            items: [
              { menuItemId: 'm1', qty: 2, unit: 'EACH' },
              { menuItemId: 'm2', qty: 1, unit: 'EACH' },
            ],
          },
        },
        { type: 'DRINKS_SELECTION', config: { items: [{ menuItemId: 'm3', qty: 4, unit: 'EACH' }] } },
      ],
      MENU_ITEMS,
      50,
    )
    expect(explicit.subtotal).toBe(legacy.subtotal)
    expect(explicit.balance).toBe(legacy.balance)
  })

  it('drives a PER_PERSON line from the guest count and follows a change', () => {
    const perPerson = [
      { type: 'MENU_SELECTION', config: { items: [{ menuItemId: 'm2', qty: 1, unit: 'PER_PERSON' }] } },
    ]
    const ninety = computeEventTotals(perPerson, MENU_ITEMS, null, { guestCount: 90 })
    expect(ninety.lines[0]).toMatchObject({ qty: 90, unit: 'PER_PERSON', total: 2700 })
    expect(ninety.byUnit.PER_PERSON).toBe(2700)

    const hundred = computeEventTotals(perPerson, MENU_ITEMS, null, { guestCount: 100 })
    expect(hundred.lines[0].qty).toBe(100)
    expect(hundred.lines[0].total).toBe(3000)
  })

  it("uses the product's pricingMode as the default unit when a line has none", () => {
    const totals = computeEventTotals(
      [{ type: 'MENU_SELECTION', config: { items: [{ menuItemId: 'set2', qty: 1 }] } }],
      [{ id: 'set2', name: 'SET MENU', price: 80, pricingMode: 'PER_PERSON' }],
      null,
      { guestCount: 10 },
    )
    expect(totals.lines[0]).toMatchObject({ qty: 10, unit: 'PER_PERSON', total: 800 })
  })

  it('falls back to the stored count for PER_PERSON when no guest count is supplied', () => {
    const totals = computeEventTotals(
      [{ type: 'MENU_SELECTION', config: { items: [{ menuItemId: 'm2', qty: 12, unit: 'PER_PERSON' }] } }],
      MENU_ITEMS,
      null,
    )
    expect(totals.lines[0].qty).toBe(12)
  })

  it('prices a PER_PLATTER line from its stored count and keeps the yield', () => {
    const platter = [
      { id: 'pl1', name: 'ANTIPASTO PLATTER', price: 65, servesMin: 4, servesMax: 6 },
    ]
    const totals = computeEventTotals(
      [{ type: 'MENU_SELECTION', config: { items: [{ menuItemId: 'pl1', qty: 3, unit: 'PER_PLATTER' }] } }],
      platter,
      null,
      { guestCount: 20 },
    )
    expect(totals.lines[0]).toMatchObject({
      qty: 3,
      unit: 'PER_PLATTER',
      servesMin: 4,
      servesMax: 6,
      total: 195,
    })
    expect(totals.byUnit).toEqual({ EACH: 0, PER_PERSON: 0, PER_PLATTER: 195 })
  })

  it('keeps mixed units as separate lines and splits the subtotal by unit', () => {
    const items: MenuPrice[] = [
      { id: 'set', name: '3 COURSE SET', price: 85 },
      { id: 'pl1', name: 'PLATTER', price: 65, servesMin: 4, servesMax: 6 },
      { id: 'can', name: 'CANAPE', price: 4 },
    ]
    const totals = computeEventTotals(
      [
        {
          type: 'MENU_SELECTION',
          config: {
            items: [
              { menuItemId: 'set', qty: 1, unit: 'PER_PERSON' },
              { menuItemId: 'pl1', qty: 2, unit: 'PER_PLATTER' },
              { menuItemId: 'can', qty: 30, unit: 'EACH' },
            ],
          },
        },
      ],
      items,
      null,
      { guestCount: 40 },
    )
    expect(totals.lines.map((l) => l.unit)).toEqual(['PER_PERSON', 'PER_PLATTER', 'EACH'])
    expect(totals.byUnit).toEqual({ EACH: 120, PER_PERSON: 3400, PER_PLATTER: 130 })
    expect(totals.subtotal).toBe(3650)
  })

  it('skips a purged product and reports a violation', () => {
    const totals = computeEventTotals(
      [{ type: 'MENU_SELECTION', config: { items: [{ menuItemId: 'gone', qty: 5 }] } }],
      MENU_ITEMS,
      null,
    )
    expect(totals.lines).toEqual([])
    expect(totals.subtotal).toBe(0)
    expect(totals.violations).toEqual([
      expect.objectContaining({ kind: 'MISSING_ITEM', menuItemId: 'gone' }),
    ])
  })

  it('prices a package line from the package per-head price', () => {
    const totals = computeEventTotals(
      [{ type: 'MENU_SELECTION', config: { items: [{ packageId: 'pkg1', qty: 1, unit: 'PER_PERSON' }] } }],
      MENU_ITEMS,
      null,
      {
        guestCount: 30,
        packages: [{ id: 'pkg1', name: 'WEDDING PACKAGE', price: 95 }],
      },
    )
    expect(totals.lines[0]).toMatchObject({
      menuItemId: 'pkg1',
      packageId: 'pkg1',
      name: 'WEDDING PACKAGE',
      qty: 30,
      unit: 'PER_PERSON',
      unitPrice: 95,
      total: 2850,
    })
  })

  it('skips a purged package and reports a violation', () => {
    const totals = computeEventTotals(
      [{ type: 'MENU_SELECTION', config: { items: [{ packageId: 'gone', qty: 1, unit: 'PER_PERSON' }] } }],
      MENU_ITEMS,
      null,
      { guestCount: 30, packages: [{ id: 'pkg1', name: 'WEDDING PACKAGE', price: 95 }] },
    )
    expect(totals.lines).toEqual([])
    expect(totals.violations).toEqual([
      expect.objectContaining({ kind: 'MISSING_PACKAGE', packageId: 'gone' }),
    ])
  })

  it('reports a minimum violation without clamping the quantity', () => {
    const items: MenuPrice[] = [{ id: 'can', name: 'CANAPE', price: 4, minQty: 20 }]
    const totals = computeEventTotals(
      [{ type: 'MENU_SELECTION', config: { items: [{ menuItemId: 'can', qty: 10 }] } }],
      items,
      null,
    )
    expect(totals.lines[0]).toMatchObject({ qty: 10, total: 40, minimum: 20 })
    expect(totals.violations).toEqual([
      expect.objectContaining({ kind: 'BELOW_MINIMUM', menuItemId: 'can' }),
    ])
  })

  it('does not report a minimum when nothing is ordered', () => {
    const items: MenuPrice[] = [{ id: 'can', name: 'CANAPE', price: 4, minQty: 20 }]
    const totals = computeEventTotals(
      [{ type: 'MENU_SELECTION', config: { items: [{ menuItemId: 'can', qty: 0 }] } }],
      items,
      null,
    )
    expect(totals.lines).toEqual([])
    expect(totals.violations).toEqual([])
  })

  it('flags a lead-time breach only when a lead time is set', () => {
    const items: MenuPrice[] = [
      { id: 'can', name: 'CANAPE', price: 4, leadTimeDays: 7 },
      { id: 'm2', name: 'VEGAN RISOTTO', price: 30 },
    ]
    const blocks = [
      {
        type: 'MENU_SELECTION',
        config: {
          items: [
            { menuItemId: 'can', qty: 30 },
            { menuItemId: 'm2', qty: 1 },
          ],
        },
      },
    ]
    const close = computeEventTotals(blocks, items, null, {
      eventDate: '2026-11-28',
      today: '2026-11-25',
    })
    expect(close.violations.filter((v) => v.kind === 'INSIDE_LEAD_TIME')).toHaveLength(1)
    expect(close.violations[0].menuItemId).toBe('can')

    const far = computeEventTotals(blocks, items, null, {
      eventDate: '2026-12-15',
      today: '2026-11-25',
    })
    expect(far.violations).toEqual([])

    const noDates = computeEventTotals(blocks, items, null, { guestCount: 40 })
    expect(noDates.violations).toEqual([])
  })

  it('rounds money to two decimals', () => {
    const totals = computeEventTotals(
      [{ type: 'MENU_SELECTION', config: { items: [{ menuItemId: 'x', qty: 3 }] } }],
      [{ id: 'x', name: 'PIE', price: 3.333 }],
      null,
    )
    expect(totals.lines[0].total).toBe(10)
    expect(totals.subtotal).toBe(10)
  })

  it('prices 0 heads for a supplied 0 guest count, and skips the line', () => {
    const totals = computeEventTotals(
      [{ type: 'MENU_SELECTION', config: { items: [{ menuItemId: 'm2', qty: 12, unit: 'PER_PERSON' }] } }],
      MENU_ITEMS,
      null,
      { guestCount: 0 },
    )
    expect(totals.lines).toEqual([])
    expect(totals.subtotal).toBe(0)
  })

  it('does not report a purged product when nothing is ordered', () => {
    const zero = computeEventTotals(
      [{ type: 'MENU_SELECTION', config: { items: [{ menuItemId: 'gone', qty: 0 }] } }],
      MENU_ITEMS,
      null,
      { guestCount: 0 },
    )
    expect(zero.lines).toEqual([])
    expect(zero.violations).toEqual([])

    const ordered = computeEventTotals(
      [{ type: 'MENU_SELECTION', config: { items: [{ menuItemId: 'gone', qty: 5 }] } }],
      MENU_ITEMS,
      null,
    )
    expect(ordered.violations).toEqual([expect.objectContaining({ kind: 'MISSING_ITEM' })])
  })
})

describe('bound per-person menu package (#192)', () => {
  const PACKAGE = { id: 'menu1', name: 'WEDDING SET MENU', price: 95 }

  it('prices the bound menu per head and follows the guest count', () => {
    const ninetysix = computeEventTotals([], [], null, {
      package: PACKAGE,
      packages: [PACKAGE],
      guestCount: 96,
    })
    expect(ninetysix.lines).toEqual([
      {
        menuItemId: 'menu1',
        packageId: 'menu1',
        name: 'WEDDING SET MENU',
        qty: 96,
        unit: 'PER_PERSON',
        unitPrice: 95,
        total: 9120,
      },
    ])
    expect(ninetysix.byUnit).toEqual({ EACH: 0, PER_PERSON: 9120, PER_PLATTER: 0 })

    const fifty = computeEventTotals([], [], null, {
      package: PACKAGE,
      packages: [PACKAGE],
      guestCount: 50,
    })
    expect(fifty.lines[0].qty).toBe(50)
    expect(fifty.lines[0].total).toBe(4750)
  })

  it('adds no package line with no guest count and none for 0 guests', () => {
    expect(computeEventTotals([], [], null, { package: PACKAGE }).lines).toEqual([])
    expect(computeEventTotals([], [], null, { package: PACKAGE, guestCount: 0 }).lines).toEqual([])
  })

  it('reports a purged bound menu and never prices it at $0', () => {
    const totals = computeEventTotals([], [], null, {
      missingPackage: { id: 'gone', name: 'OLD SET MENU' },
      guestCount: 20,
    })
    expect(totals.lines).toEqual([])
    expect(totals.subtotal).toBe(0)
    expect(totals.violations).toEqual([
      expect.objectContaining({ kind: 'MISSING_PACKAGE', packageId: 'gone' }),
    ])
  })

  it('does not double-count an explicit package line for the same menu', () => {
    const totals = computeEventTotals(
      [
        {
          type: 'MENU_SELECTION',
          config: { items: [{ packageId: 'menu1', qty: 1, unit: 'PER_PERSON' }] },
        },
      ],
      [],
      null,
      { package: PACKAGE, packages: [PACKAGE], guestCount: 10 },
    )
    expect(totals.lines).toHaveLength(1)
    expect(totals.lines[0]).toMatchObject({ packageId: 'menu1', qty: 10, total: 950 })
  })

  it('leaves a legacy block identical when no package is supplied', () => {
    const totals = computeEventTotals(
      [{ type: 'MENU_SELECTION', config: { items: [{ menuItemId: 'm1', qty: 2 }] } }],
      MENU_ITEMS,
      0,
    )
    expect(totals.lines).toHaveLength(1)
    expect(totals.lines[0]).toMatchObject({ menuItemId: 'm1', unit: 'EACH', total: 85 })
  })

  it('attaches block-level picks to the package line (one line, deltas on the per-head price)', () => {
    const totals = computeEventTotals(
      [
        {
          type: 'MENU_SELECTION',
          config: {
            packageChoices: [
              { groupId: 'g-main', groupName: 'MAIN', choiceId: 'beef', choiceName: 'BEEF', priceDelta: 0 },
              { groupId: 'g-main', groupName: 'MAIN', choiceId: 'lamb', choiceName: 'LAMB', priceDelta: 8 },
            ],
            items: [],
          },
        },
      ],
      [],
      null,
      {
        package: PACKAGE,
        packages: [PACKAGE],
        guestCount: 10,
        choiceGroups: [{ id: 'g-main', name: 'MAIN', minSelect: 1, maxSelect: 2 }],
      },
    )
    expect(totals.lines).toHaveLength(1)
    expect(totals.lines[0]).toMatchObject({
      menuItemId: 'menu1',
      unit: 'PER_PERSON',
      qty: 10,
      unitPrice: 103,
      total: 1030,
    })
    expect(totals.lines[0].choices).toHaveLength(2)
    expect(totals.violations).toEqual([])
  })

  it('folds a legacy per-line set menu into the package instead of double-charging', () => {
    const totals = computeEventTotals(
      [
        {
          type: 'MENU_SELECTION',
          config: {
            items: [
              {
                menuItemId: 'set',
                qty: 1,
                unit: 'PER_PERSON',
                choices: [
                  { groupId: 'g-main', groupName: 'MAIN', choiceId: 'beef', choiceName: 'BEEF', priceDelta: 8 },
                ],
              },
            ],
          },
        },
      ],
      [{ id: 'set', name: 'SET MENU PRODUCT', price: 80 }],
      null,
      {
        package: PACKAGE,
        packages: [PACKAGE],
        guestCount: 10,
        choiceGroups: [{ id: 'g-main', name: 'MAIN', minSelect: 1, maxSelect: 1 }],
      },
    )
    // One package line only; the $80 product line is not charged again.
    expect(totals.lines).toHaveLength(1)
    expect(totals.lines[0]).toMatchObject({ menuItemId: 'menu1', unitPrice: 103, total: 1030 })
    expect(totals.byUnit).toEqual({ EACH: 0, PER_PERSON: 1030, PER_PLATTER: 0 })
  })

  it('reports package pick min/max violations without clamping the per-head price', () => {
    const totals = computeEventTotals(
      [
        {
          type: 'MENU_SELECTION',
          config: {
            packageChoices: [
              { groupId: 'g-main', groupName: 'MAIN', choiceId: 'beef', choiceName: 'BEEF', priceDelta: 0 },
            ],
          },
        },
      ],
      [],
      null,
      {
        package: PACKAGE,
        guestCount: 10,
        choiceGroups: [
          { id: 'g-main', name: 'MAIN', minSelect: 1, maxSelect: 1 },
          { id: 'g-dessert', name: 'DESSERT', minSelect: 1, maxSelect: 1 },
        ],
      },
    )
    expect(totals.lines[0].unitPrice).toBe(95)
    expect(totals.violations).toEqual([
      expect.objectContaining({ kind: 'BELOW_MIN_SELECT', name: 'WEDDING SET MENU — DESSERT' }),
    ])
  })

  it('applies line and choice deltas to an explicit package line', () => {
    const totals = computeEventTotals(
      [
        {
          type: 'MENU_SELECTION',
          config: {
            items: [
              {
                packageId: 'pkg1',
                qty: 1,
                unit: 'PER_PERSON',
                priceDelta: 2,
                choices: [
                  { groupId: 'g-main', groupName: 'MAIN', choiceId: 'beef', choiceName: 'BEEF', priceDelta: 3 },
                ],
              },
            ],
          },
        },
      ],
      [],
      null,
      { packages: [{ id: 'pkg1', name: 'PKG', price: 100 }], guestCount: 10 },
    )
    expect(totals.lines[0]).toMatchObject({ unitPrice: 105, total: 1050 })
  })

  it('validates choice min/max on an explicit package line, not just the automatic one', () => {
    const totals = computeEventTotals(
      [
        {
          type: 'MENU_SELECTION',
          config: { items: [{ packageId: 'menu1', qty: 1, unit: 'PER_PERSON' }] },
        },
      ],
      [],
      null,
      {
        package: PACKAGE,
        packages: [PACKAGE],
        guestCount: 10,
        choiceGroups: [{ id: 'g-main', name: 'MAIN', minSelect: 1, maxSelect: 1 }],
      },
    )
    // The explicit line replaces the automatic one, but its group rules still apply.
    expect(totals.lines).toHaveLength(1)
    expect(totals.lines[0].total).toBe(950)
    expect(totals.violations).toEqual([
      expect.objectContaining({ kind: 'BELOW_MIN_SELECT', name: 'WEDDING SET MENU — MAIN' }),
    ])
  })
})

describe('choice-group picks (#192)', () => {
  const SET = [{ id: 'set', name: 'SET MENU', price: 80 }]
  const GROUPS = [
    { id: 'g-entree', name: 'ENTREE', minSelect: 1, maxSelect: 1 },
    { id: 'g-main', name: 'MAIN', minSelect: 1, maxSelect: 1 },
    { id: 'g-dessert', name: 'DESSERT', minSelect: 1, maxSelect: 2 },
  ]

  function setMenuLine(choices: Record<string, unknown>[]) {
    return [
      {
        type: 'MENU_SELECTION',
        config: {
          items: [{ menuItemId: 'set', qty: 1, unit: 'PER_PERSON', choices }],
        },
      },
    ]
  }

  const FULL_PICKS = [
    { groupId: 'g-entree', groupName: 'ENTREE', choiceId: 'e1', choiceName: 'SOUP', priceDelta: 0 },
    { groupId: 'g-main', groupName: 'MAIN', choiceId: 'm1', choiceName: 'LAMB', priceDelta: 0 },
    { groupId: 'g-dessert', groupName: 'DESSERT', choiceId: 'd1', choiceName: 'CAKE', priceDelta: 0 },
  ]

  it('includes picks in the per-head price by default', () => {
    const totals = computeEventTotals(setMenuLine(FULL_PICKS), SET, null, {
      guestCount: 10,
      choiceGroups: GROUPS,
    })
    expect(totals.lines[0]).toMatchObject({ unitPrice: 80, total: 800, qty: 10 })
    expect(totals.lines[0].choices).toHaveLength(3)
    expect(totals.violations).toEqual([])
  })

  it('adds a priceDelta on top of the base', () => {
    const totals = computeEventTotals(
      setMenuLine([
        FULL_PICKS[0],
        { groupId: 'g-main', groupName: 'MAIN', choiceId: 'm2', choiceName: 'BEEF', priceDelta: 8 },
        FULL_PICKS[2],
      ]),
      SET,
      null,
      { guestCount: 10, choiceGroups: GROUPS },
    )
    expect(totals.lines[0]).toMatchObject({ unitPrice: 88, total: 880 })
    expect(totals.violations).toEqual([])
  })

  it('reports min/max selection violations without clamping', () => {
    const missingDessert = computeEventTotals(setMenuLine([FULL_PICKS[0], FULL_PICKS[1]]), SET, null, {
      guestCount: 10,
      choiceGroups: GROUPS,
    })
    expect(missingDessert.lines[0].total).toBe(800)
    expect(missingDessert.violations).toEqual([
      expect.objectContaining({ kind: 'BELOW_MIN_SELECT', name: 'SET MENU — DESSERT' }),
    ])

    const tooMany = computeEventTotals(
      setMenuLine([
        ...FULL_PICKS,
        { groupId: 'g-dessert', groupName: 'DESSERT', choiceId: 'd2', choiceName: 'TART', priceDelta: 0 },
        { groupId: 'g-dessert', groupName: 'DESSERT', choiceId: 'd3', choiceName: 'CHEESE', priceDelta: 0 },
      ]),
      SET,
      null,
      { guestCount: 10, choiceGroups: GROUPS },
    )
    expect(tooMany.violations).toEqual([
      expect.objectContaining({ kind: 'ABOVE_MAX_SELECT', name: 'SET MENU — DESSERT' }),
    ])
  })

  it('degrades safely when a choice or group no longer exists', () => {
    const totals = computeEventTotals(
      setMenuLine([
        { groupId: 'g-gone', groupName: 'OLD GROUP', choiceId: 'x1', choiceName: 'GONE DISH', priceDelta: 5 },
        ...FULL_PICKS,
      ]),
      SET,
      null,
      { guestCount: 10, choiceGroups: GROUPS },
    )
    // The snapshot still prices (a non-cash fact), and the unknown group is
    // simply not validated — no crash, no phantom violation for it.
    expect(totals.lines[0]).toMatchObject({ unitPrice: 85, total: 850 })
    expect(totals.violations).toEqual([])
  })

  it('dedupes the same picks on duplicate product+unit lines', () => {
    const beef = {
      groupId: 'g-main',
      groupName: 'MAIN',
      choiceId: 'beef',
      choiceName: 'BEEF',
      priceDelta: 8,
    }
    const totals = computeEventTotals(
      [
        {
          type: 'MENU_SELECTION',
          config: { items: [{ menuItemId: 'set', qty: 1, unit: 'PER_PERSON', choices: [beef] }] },
        },
        {
          type: 'DRINKS_SELECTION',
          config: { items: [{ menuItemId: 'set', qty: 1, unit: 'PER_PERSON', choices: [beef] }] },
        },
      ],
      SET,
      null,
      {
        guestCount: 10,
        choiceGroups: [{ id: 'g-main', name: 'MAIN', minSelect: 1, maxSelect: 1 }],
      },
    )
    expect(totals.lines).toHaveLength(1)
    expect(totals.lines[0]).toMatchObject({ unitPrice: 88, total: 880 })
    expect(totals.lines[0].choices).toHaveLength(1)
    // The deduped pick count is 1, so the max of 1 is not breached.
    expect(totals.violations).toEqual([])
  })

  it('ignores a choice delta on a line that is not PER_PERSON', () => {
    const totals = computeEventTotals(
      [
        {
          type: 'MENU_SELECTION',
          config: {
            items: [
              {
                menuItemId: 'm1',
                qty: 2,
                unit: 'EACH',
                choices: [
                  { groupId: 'g-main', groupName: 'MAIN', choiceId: 'beef', choiceName: 'BEEF', priceDelta: 5 },
                ],
              },
            ],
          },
        },
      ],
      MENU_ITEMS,
      null,
    )
    expect(totals.lines[0]).toMatchObject({ unit: 'EACH', unitPrice: 42.5, total: 85 })
    expect(totals.lines[0].choices).toBeUndefined()
  })
})

describe('unit helpers', () => {
  it('parses a known unit and falls back to EACH', () => {
    expect(parsePricingUnit('PER_PERSON')).toBe('PER_PERSON')
    expect(parsePricingUnit('per_platter')).toBe('EACH')
    expect(parsePricingUnit(undefined)).toBe('EACH')
  })

  it('formats a platter yield', () => {
    expect(formatLineYield(4, 6)).toBe('SERVES 4-6')
    expect(formatLineYield(4, null)).toBe('SERVES 4')
    expect(formatLineYield(null, null)).toBeNull()
  })

  it('describes a line with its unit and yield', () => {
    expect(describeLineUnit({ unit: 'PER_PLATTER', qty: 3, servesMin: 4, servesMax: 6 })).toBe(
      '3 PLATTERS · SERVES 4-6',
    )
    expect(describeLineUnit({ unit: 'PER_PLATTER', qty: 1, servesMin: 4 })).toBe(
      '1 PLATTER · SERVES 4',
    )
    expect(describeLineUnit({ unit: 'PER_PERSON', qty: 40 })).toBe('40 PEOPLE')
    expect(describeLineUnit({ unit: 'PER_PERSON', qty: 0 })).toBe('0 PEOPLE')
    expect(describeLineUnit({ unit: 'EACH', qty: 1 })).toBe('1 EACH')
  })

  it('suggests a platter count from pax and yield', () => {
    expect(suggestPlatterCount(20, 4)).toBe(5)
    expect(suggestPlatterCount(21, 4)).toBe(6)
    expect(suggestPlatterCount(21, null)).toBeNull()
    expect(suggestPlatterCount(0, 4)).toBeNull()
  })
})
