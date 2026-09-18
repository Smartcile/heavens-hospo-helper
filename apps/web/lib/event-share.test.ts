import { describe, it, expect } from 'vitest'
import { buildPublicEventView, isPublicBlock, type PublicEventInput } from '@/lib/event-share'

const BASE: PublicEventInput = {
  name: 'SMITH WEDDING',
  eventType: 'WEDDING',
  status: 'CONFIRMED',
  eventDate: new Date('2026-11-14T00:00:00.000Z'),
  startTime: '16:00',
  endTime: '23:00',
  guestCount: 96,
  diningStyle: 'PLATED',
  contactName: 'JANE SMITH',
  customerApprovedAt: null,
  customerApprovedByName: null,
  venueName: 'AKARANA EATERY',
  menuName: 'WEDDING MENU',
  setupName: 'WEDDING RECEPTION',
  menuItems: [{ id: 'm1', name: 'ROAST LAMB' }],
  totals: {
    subtotal: 85,
    deposit: 50,
    balance: 35,
    lines: [{ menuItemId: 'm1', name: 'ROAST LAMB', qty: 2, unitPrice: 42.5, total: 85 }],
  },
  blocks: [
    { id: 'b2', type: 'MENU_SELECTION', title: null, config: { items: [{ menuItemId: 'm1', qty: 2 }] }, sortOrder: 1 },
    { id: 'b1', type: 'CUSTOMER_DETAILS', title: null, config: {}, sortOrder: 0 },
    { id: 'b3', type: 'STAFFING', title: null, config: { rows: [{ role: 'FOH', count: 6 }] }, sortOrder: 2 },
    { id: 'b4', type: 'NOTES', title: null, config: { text: 'INTERNAL ONLY' }, sortOrder: 3 },
    { id: 'b5', type: 'HISTORY', title: null, config: {}, sortOrder: 4 },
  ],
}

describe('isPublicBlock', () => {
  it('hides internal-only block types', () => {
    expect(isPublicBlock('STAFFING')).toBe(false)
    expect(isPublicBlock('NOTES')).toBe(false)
    expect(isPublicBlock('HISTORY')).toBe(false)
  })

  it('shows customer-relevant block types', () => {
    expect(isPublicBlock('MENU_SELECTION')).toBe(true)
    expect(isPublicBlock('ROOM_SETUP')).toBe(true)
    expect(isPublicBlock('PAYMENT')).toBe(true)
    expect(isPublicBlock('CUSTOM_TEXT')).toBe(true)
  })
})

describe('buildPublicEventView', () => {
  it('drops internal blocks and orders the rest by sortOrder', () => {
    const view = buildPublicEventView(BASE)
    expect(view.blocks.map((b) => b.id)).toEqual(['b1', 'b2'])
  })

  it('never exposes the Event internalNotes (absent from the input by design)', () => {
    const view = buildPublicEventView(BASE) as unknown as Record<string, unknown>
    expect(view).not.toHaveProperty('internalNotes')
  })

  it('maps the date to a YYYY-MM-DD key', () => {
    expect(buildPublicEventView(BASE).eventDate).toBe('2026-11-14')
  })

  it('carries venue, menu, layout and totals through', () => {
    const view = buildPublicEventView(BASE)
    expect(view.venueName).toBe('AKARANA EATERY')
    expect(view.menuName).toBe('WEDDING MENU')
    expect(view.setupName).toBe('WEDDING RECEPTION')
    expect(view.totals.subtotal).toBe(85)
    expect(view.menuItems).toEqual([{ id: 'm1', name: 'ROAST LAMB' }])
  })

  it('reports approval state and requests', () => {
    const view = buildPublicEventView({
      ...BASE,
      customerApprovedAt: new Date('2026-10-01T09:00:00.000Z'),
      customerApprovedByName: 'JANE SMITH',
      requests: [
        {
          id: 'r1',
          kind: 'EDIT',
          status: 'PENDING',
          message: 'ADD TWO VEGAN MAINS',
          responseNote: null,
          createdAt: '2026-09-20T00:00:00.000Z',
        },
      ],
    })
    expect(view.approvedAt).toBe('2026-10-01T09:00:00.000Z')
    expect(view.approvedByName).toBe('JANE SMITH')
    expect(view.requests).toHaveLength(1)
    expect(view.requests[0].message).toBe('ADD TWO VEGAN MAINS')
  })

  it('tolerates a null/garbage block config', () => {
    const view = buildPublicEventView({
      ...BASE,
      blocks: [{ id: 'x', type: 'NOTES2', title: null, config: null, sortOrder: 0 }],
    })
    expect(view.blocks[0].config).toEqual({})
  })
})
