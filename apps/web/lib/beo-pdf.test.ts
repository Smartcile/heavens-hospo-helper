import { describe, it, expect } from 'vitest'
import {
  generateBeoPdf,
  beoPdfToBuffer,
  beoPdfFilename,
  beoPdfShowsMoney,
  blocksForVariant,
  pdfBlockConfig,
  summaryRows,
  type BeoPdfBlock,
  type BeoPdfData,
  type BeoPdfLine,
} from '@/lib/beo-pdf'

const BLOCKS: BeoPdfBlock[] = [
  { type: 'CUSTOMER_DETAILS', title: null, config: {} },
  { type: 'MENU_SELECTION', title: null, config: { items: [{ menuItemId: 'm1', qty: 2 }] } },
  { type: 'DRINKS_SELECTION', title: null, config: { items: [{ menuItemId: 'm3', qty: 4 }] } },
  { type: 'DIETARY', title: null, config: { rows: [{ name: 'GUEST 1', requirement: 'GLUTEN FREE', count: 2 }] } },
  { type: 'TIMELINE', title: 'RUN SHEET', config: { rows: [{ time: '18:00', label: 'MAINS' }] } },
  { type: 'STAFFING', title: null, config: { rows: [{ role: 'FOH', count: 6 }] } },
  { type: 'NOTES', title: null, config: { text: 'INTERNAL WORKING NOTE' } },
  { type: 'PAYMENT', title: null, config: { method: 'INVOICE' } },
  { type: 'HISTORY', title: null, config: {} },
]

const DATA: BeoPdfData = {
  venueName: 'AKARANA EATERY',
  eventName: 'SMITH WEDDING',
  eventType: 'WEDDING',
  status: 'CONFIRMED',
  eventDate: '2026-11-14',
  startTime: '16:00',
  endTime: '23:00',
  guestCount: 96,
  diningStyle: 'PLATED',
  contactName: 'JANE SMITH',
  contactEmail: 'jane@example.com',
  contactPhone: '021 555 0101',
  menuName: 'WEDDING MENU',
  setupName: 'WEDDING RECEPTION',
  notes: 'CORNER TABLE FOR TWO.',
  internalNotes: 'ALLERGY CARD AT THE PASS.',
  blocks: BLOCKS,
  menuItems: [
    { id: 'm1', name: 'ROAST LAMB' },
    { id: 'm3', name: 'HOUSE RED' },
  ],
  totals: {
    subtotal: 133,
    deposit: 50,
    balance: 83,
    lines: [
      { name: 'ROAST LAMB', qty: 2, total: 85 },
      { name: 'HOUSE RED', qty: 4, total: 48 },
    ],
  },
}

describe('blocksForVariant', () => {
  it('FULL prints everything except the activity log', () => {
    const types = blocksForVariant(BLOCKS, 'FULL').map((b) => b.type)
    expect(types).not.toContain('HISTORY')
    expect(types).toContain('STAFFING')
    expect(types).toContain('NOTES')
    expect(types).toContain('PAYMENT')
  })

  it('CLIENT hides staffing, working notes and history', () => {
    const types = blocksForVariant(BLOCKS, 'CLIENT').map((b) => b.type)
    expect(types).not.toContain('STAFFING')
    expect(types).not.toContain('NOTES')
    expect(types).not.toContain('HISTORY')
    expect(types).toContain('MENU_SELECTION')
    expect(types).toContain('PAYMENT')
  })

  it('KITCHEN leads with dietary and keeps the dish blocks but not money', () => {
    const types = blocksForVariant(BLOCKS, 'KITCHEN').map((b) => b.type)
    expect(types).toEqual(['DIETARY', 'TIMELINE', 'MENU_SELECTION', 'DRINKS_SELECTION', 'NOTES', 'STAFFING'])
    expect(types).not.toContain('PAYMENT')
    expect(types).not.toContain('CUSTOMER_DETAILS')
  })

  it('preserves the incoming order for FULL and CLIENT', () => {
    expect(blocksForVariant(BLOCKS, 'FULL')[0].type).toBe('CUSTOMER_DETAILS')
    expect(blocksForVariant(BLOCKS, 'CLIENT')[0].type).toBe('CUSTOMER_DETAILS')
  })
})

describe('pdfBlockConfig', () => {
  it('strips reserved working keys from every PDF variant', () => {
    const blocks: BeoPdfBlock[] = [
      {
        type: 'MENU_SELECTION',
        title: null,
        config: { items: [{ menuItemId: 'm1', qty: 2 }], __state: 'CONFIRMED', __other: 'X' },
      },
    ]
    for (const variant of ['FULL', 'CLIENT', 'KITCHEN'] as const) {
      for (const block of blocksForVariant(blocks, variant)) {
        const keys = Object.keys(pdfBlockConfig(block.config))
        expect(keys.some((key) => key.startsWith('__'))).toBe(false)
        expect(pdfBlockConfig(block.config)).toEqual({ items: [{ menuItemId: 'm1', qty: 2 }] })
      }
    }
    // The source config still carries the state — only the print path strips it.
    expect(blocks[0].config.__state).toBe('CONFIRMED')
  })
})

describe('generateBeoPdf', () => {
  it('generates a valid PDF buffer for every variant', () => {
    for (const variant of ['FULL', 'CLIENT', 'KITCHEN'] as const) {
      const buffer = beoPdfToBuffer(generateBeoPdf(DATA, variant))
      expect(buffer).toBeInstanceOf(ArrayBuffer)
      expect(buffer.byteLength).toBeGreaterThan(100)
    }
  })

  it('defaults to the FULL variant', () => {
    expect(generateBeoPdf(DATA).getNumberOfPages()).toBeGreaterThanOrEqual(1)
  })

  it('adds pages for a very long event', () => {
    const blocks: BeoPdfBlock[] = Array.from({ length: 30 }, (_, i) => ({
      type: 'CUSTOM_TEXT',
      title: `SECTION ${i + 1}`,
      config: { body: 'The quick brown fox jumps over the lazy dog. '.repeat(12) },
    }))
    expect(generateBeoPdf({ ...DATA, blocks }, 'FULL').getNumberOfPages()).toBeGreaterThan(1)
  })

  it('renders with no blocks or totals without throwing', () => {
    const doc = generateBeoPdf({ ...DATA, blocks: [], totals: { subtotal: 0, deposit: 0, balance: 0, lines: [] } }, 'KITCHEN')
    expect(beoPdfToBuffer(doc).byteLength).toBeGreaterThan(100)
  })

  it('renders mixed units and grouped subtotals for every variant', () => {
    const totals: BeoPdfData['totals'] = {
      subtotal: 3650,
      deposit: 0,
      balance: 3650,
      byUnit: { EACH: 120, PER_PERSON: 3400, PER_PLATTER: 130 },
      lines: [
        { name: 'SET MENU', qty: 40, unit: 'PER_PERSON', total: 3400 },
        { name: 'PLATTER', qty: 2, unit: 'PER_PLATTER', servesMin: 4, servesMax: 6, total: 130 },
        { name: 'CANAPE', qty: 30, unit: 'EACH', total: 120 },
      ],
    }
    for (const variant of ['FULL', 'CLIENT', 'KITCHEN'] as const) {
      expect(beoPdfToBuffer(generateBeoPdf({ ...DATA, totals }, variant)).byteLength).toBeGreaterThan(100)
    }
  })
})

describe('beoPdfFilename', () => {
  it('sanitises the event name', () => {
    expect(beoPdfFilename('Smith Wedding & Co!!')).toBe('BEO - SMITH WEDDING CO.pdf')
  })

  it('suffixes non-full variants', () => {
    expect(beoPdfFilename('SMITH WEDDING', 'CLIENT')).toBe('BEO - SMITH WEDDING - CLIENT.pdf')
    expect(beoPdfFilename('SMITH WEDDING', 'KITCHEN')).toBe('BEO - SMITH WEDDING - KITCHEN.pdf')
  })

  it('falls back for a blank name', () => {
    expect(beoPdfFilename('   ')).toBe('BEO - EVENT.pdf')
  })
})

describe('summaryRows (#192)', () => {
  it('renders the unit and yield for a platter', () => {
    const { lines } = summaryRows({
      subtotal: 195,
      deposit: 0,
      balance: 195,
      lines: [
        { name: 'ANTIPASTO', qty: 3, unit: 'PER_PLATTER', servesMin: 4, servesMax: 6, total: 195 },
      ],
    })
    expect(lines[0].qtyText).toBe('3 PLATTERS · SERVES 4-6')
  })

  it('renders people for a per-person line and keeps legacy × qty', () => {
    const { lines } = summaryRows({
      subtotal: 100,
      deposit: 0,
      balance: 100,
      lines: [
        { name: 'SET MENU', qty: 40, unit: 'PER_PERSON', total: 3400 },
        { name: 'LEGACY', qty: 2, total: 10 },
      ],
    })
    expect(lines[0].qtyText).toBe('40 PEOPLE')
    expect(lines[1].qtyText).toBe('× 2')
  })

  it('groups the subtotal by unit, skipping empty groups', () => {
    const { groups } = summaryRows({
      subtotal: 3650,
      deposit: 0,
      balance: 3650,
      byUnit: { EACH: 120, PER_PERSON: 3400, PER_PLATTER: 130 },
      lines: [],
    })
    expect(groups).toEqual([
      { label: 'PER PERSON', amount: 3400 },
      { label: 'PER PLATTER', amount: 130 },
      { label: 'EACH', amount: 120 },
    ])
  })

  it('prints no groups when byUnit is not supplied', () => {
    expect(
      summaryRows({ subtotal: 10, deposit: 0, balance: 10, lines: [] }).groups,
    ).toEqual([])
  })

  it('shows the per-head price only when money is printed', () => {
    const totals = {
      subtotal: 9120,
      deposit: 0,
      balance: 9120,
      lines: [{ name: 'SET MENU', qty: 96, unit: 'PER_PERSON' as const, unitPrice: 95, total: 9120 }],
    }
    expect(summaryRows(totals).lines[0].qtyText).toBe('96 PEOPLE · $95.00/HEAD')
    expect(summaryRows(totals, { showMoney: false }).lines[0].qtyText).toBe('96 PEOPLE')
  })

  it('lists picks with their upcharge only when money is printed', () => {
    const totals = {
      subtotal: 880,
      deposit: 0,
      balance: 880,
      lines: [
        {
          name: 'SET MENU',
          qty: 10,
          unit: 'PER_PERSON' as const,
          unitPrice: 88,
          total: 880,
          choices: [
            { groupId: 'g-main', groupName: 'MAIN', choiceId: 'c1', choiceName: 'BEEF', priceDelta: 8 },
          ],
        },
      ],
    }
    expect(summaryRows(totals).lines[0].choices).toEqual([{ label: 'MAIN: BEEF', upcharge: 8 }])
    expect(summaryRows(totals, { showMoney: false }).lines[0].choices).toEqual([
      { label: 'MAIN: BEEF', upcharge: null },
    ])
  })

  it('never prints internal minimums or lead times', () => {
    const line = { name: 'X', qty: 5, unit: 'EACH', total: 20, minimum: 10, leadTimeDays: 3 } as BeoPdfLine
    const row = summaryRows({ subtotal: 20, deposit: 0, balance: 20, lines: [line] }).lines[0] as unknown as Record<string, unknown>
    expect(row).not.toHaveProperty('minimum')
    expect(row).not.toHaveProperty('leadTimeDays')
  })

  it('prints money for FULL + CLIENT but never for KITCHEN', () => {
    expect(beoPdfShowsMoney('FULL')).toBe(true)
    expect(beoPdfShowsMoney('CLIENT')).toBe(true)
    expect(beoPdfShowsMoney('KITCHEN')).toBe(false)
  })
})
