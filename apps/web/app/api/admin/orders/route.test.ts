import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, resolveCustomer, autoLinkBooking, loadOptionGroupsForItems } =
  vi.hoisted(() => ({
    prisma: {
      menu: { findFirst: vi.fn() },
      wooOrder: { findFirst: vi.fn(), create: vi.fn(), count: vi.fn() },
      floorPlanSetup: { findMany: vi.fn() },
      recipe: { findMany: vi.fn() },
    },
    getServerSession: vi.fn(),
    guardAccess: vi.fn(),
    resolveCustomer: vi.fn(),
    autoLinkBooking: vi.fn(),
    loadOptionGroupsForItems: vi.fn(),
  }))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma, Prisma: { DbNull: null } }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/customer-match', () => ({ resolveCustomer }))
vi.mock('@/lib/order-booking-link', () => ({ autoLinkBooking }))
vi.mock('@/lib/order-options.server', () => ({ loadOptionGroupsForItems }))

import { POST } from './route'

const req = (body: unknown) =>
  ({ json: async () => body } as unknown as NextRequest)

const SESSION = { user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } }

const SIDE_GROUP = {
  id: 'g-side',
  name: 'SIDE',
  minSelect: 1,
  maxSelect: 1,
  sortOrder: 0,
  choices: [
    { id: 'c-fries', name: 'FRIES', priceDelta: 0, isDefault: true, sortOrder: 0 },
    { id: 'c-salad', name: 'SALAD', priceDelta: 3, isDefault: false, sortOrder: 1 },
  ],
}

const REQUIRED_NO_DEFAULT = {
  id: 'g-cook',
  name: 'COOKING',
  minSelect: 1,
  maxSelect: 1,
  sortOrder: 0,
  choices: [{ id: 'c-rare', name: 'RARE', priceDelta: 0, isDefault: false, sortOrder: 0 }],
}

function baseBody(items: unknown[]) {
  return {
    serviceDate: '2026-11-12',
    customerName: 'JANE',
    items,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue(SESSION)
  guardAccess.mockResolvedValue(null)
  resolveCustomer.mockResolvedValue('cust1')
  autoLinkBooking.mockResolvedValue(undefined)
  prisma.wooOrder.findFirst.mockResolvedValue(null)
  prisma.wooOrder.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'o1', ...data }))
  loadOptionGroupsForItems.mockResolvedValue({
    groupsByItem: new Map([['m1', [SIDE_GROUP]]]),
    priceByItem: new Map([['m1', 18]]),
    missingItemIds: [],
  })
})

describe('POST /api/admin/orders options', () => {
  it('persists the option snapshot and folds the upcharge into the stored price', async () => {
    const res = await POST(
      req(
        baseBody([
          {
            menuItemId: 'm1',
            qty: 2,
            unitPrice: 10,
            options: [
              { groupId: 'g-side', groupName: 'SIDE', choiceId: 'c-salad', choiceName: 'SALAD', priceDelta: 3 },
            ],
          },
        ]),
      ),
    )

    expect(res.status).toBe(201)
    const data = prisma.wooOrder.create.mock.calls[0][0].data
    expect(data.totalAmount).toBe(26) // (10 + 3) × 2
    expect(data.items.create[0]).toMatchObject({
      menuItemId: 'm1',
      qty: 2,
      unitPrice: 13,
      options: [
        { groupId: 'g-side', groupName: 'SIDE', choiceId: 'c-salad', choiceName: 'SALAD', priceDelta: 3 },
      ],
    })
  })

  it('applies a single default choice when none is submitted', async () => {
    const res = await POST(req(baseBody([{ menuItemId: 'm1', qty: 1, unitPrice: 10 }])))

    expect(res.status).toBe(201)
    const data = prisma.wooOrder.create.mock.calls[0][0].data
    expect(data.items.create[0].unitPrice).toBe(10)
    expect(data.items.create[0].options).toEqual([
      { groupId: 'g-side', groupName: 'SIDE', choiceId: 'c-fries', choiceName: 'FRIES', priceDelta: 0 },
    ])
  })

  it('falls back to the product price when unitPrice is null and an option has an upcharge', async () => {
    const res = await POST(
      req(
        baseBody([
          {
            menuItemId: 'm1',
            qty: 1,
            unitPrice: null,
            options: [
              { groupId: 'g-side', groupName: 'SIDE', choiceId: 'c-salad', choiceName: 'SALAD', priceDelta: 3 },
            ],
          },
        ]),
      ),
    )

    expect(res.status).toBe(201)
    const data = prisma.wooOrder.create.mock.calls[0][0].data
    // Product price 18 + SALAD 3 — never just the delta.
    expect(data.items.create[0].unitPrice).toBe(21)
    expect(data.totalAmount).toBe(21)
  })

  it('returns 422 when a required group has no choice', async () => {
    loadOptionGroupsForItems.mockResolvedValue({
      groupsByItem: new Map([['m1', [REQUIRED_NO_DEFAULT]]]),
      priceByItem: new Map([['m1', 18]]),
      missingItemIds: [],
    })

    const res = await POST(req(baseBody([{ menuItemId: 'm1', qty: 1, unitPrice: 10, options: [] }])))

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('Invalid product options')
    expect(body.violations[0].message).toBe('COOKING — CHOOSE AT LEAST 1')
    expect(body.violations[0].lineIndex).toBe(0)
    expect(prisma.wooOrder.create).not.toHaveBeenCalled()
  })

  it('returns 422 for an unknown choice', async () => {
    const res = await POST(
      req(
        baseBody([
          {
            menuItemId: 'm1',
            qty: 1,
            unitPrice: 10,
            options: [
              { groupId: 'g-side', groupName: 'SIDE', choiceId: 'c-nope', choiceName: 'NOPE', priceDelta: 0 },
            ],
          },
        ]),
      ),
    )

    expect(res.status).toBe(422)
    expect((await res.json()).violations[0].message).toBe('SIDE — UNKNOWN OPTION: NOPE')
  })

  it('stores no options when the product has none', async () => {
    loadOptionGroupsForItems.mockResolvedValue({
      groupsByItem: new Map(),
      priceByItem: new Map(),
      missingItemIds: [],
    })

    const res = await POST(req(baseBody([{ menuItemId: 'm1', qty: 1, unitPrice: 10 }])))

    expect(res.status).toBe(201)
    expect(prisma.wooOrder.create.mock.calls[0][0].data.items.create[0]).toMatchObject({
      unitPrice: 10,
      options: null,
    })
  })
})
