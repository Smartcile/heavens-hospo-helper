import { describe, it, expect } from 'vitest'
import {
  generateBeoPdf,
  beoPdfToBuffer,
  beoPdfFilename,
  blocksForVariant,
  type BeoPdfBlock,
  type BeoPdfData,
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
