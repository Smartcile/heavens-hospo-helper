import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, resolveCustomer, logOrderEvent, loadOptionGroupsForItems } =
  vi.hoisted(() => ({
    prisma: {
      wooOrder: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      wooOrderItem: { findMany: vi.fn(), update: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
      $transaction: vi.fn(),
    },
    getServerSession: vi.fn(),
    guardAccess: vi.fn(),
    resolveCustomer: vi.fn(),
    logOrderEvent: vi.fn(),
    loadOptionGroupsForItems: vi.fn(),
  }))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma, Prisma: { DbNull: null } }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/customer-match', () => ({ resolveCustomer }))
vi.mock('@/lib/gift-card-history', () => ({ logOrderEvent }))
vi.mock('@/lib/order-options.server', () => ({ loadOptionGroupsForItems }))

import { PUT } from './route'

const SESSION = { user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } }
const params = { params: { id: 'o1' } }

const req = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)

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

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue(SESSION)
  guardAccess.mockResolvedValue(null)
  resolveCustomer.mockResolvedValue('cust1')
  logOrderEvent.mockResolvedValue(undefined)
  prisma.wooOrder.findFirst.mockResolvedValue({ id: 'o1', venueId: 'v1' })
  prisma.wooOrder.findUnique.mockResolvedValue({ id: 'o1', totalAmount: 26, items: [] })
  prisma.wooOrderItem.findMany.mockResolvedValue([{ id: 'li1' }])
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
  loadOptionGroupsForItems.mockResolvedValue({
    groupsByItem: new Map([['m1', [SIDE_GROUP]]]),
    missingItemIds: [],
  })
})

describe('PUT /api/admin/orders/[id] options', () => {
  it('re-validates, stores the snapshot and folds the upcharge into the line price', async () => {
    const res = await PUT(
      req({
        items: [
          {
            id: 'li1',
            menuItemId: 'm1',
            qty: 2,
            unitPrice: 10,
            options: [
              { groupId: 'g-side', groupName: 'SIDE', choiceId: 'c-salad', choiceName: 'SALAD', priceDelta: 3 },
            ],
          },
        ],
      }),
      params,
    )

    expect(res.status).toBe(200)
    expect(prisma.wooOrderItem.update).toHaveBeenCalledWith({
      where: { id: 'li1' },
      data: expect.objectContaining({
        qty: 2,
        unitPrice: 13,
        options: [
          { groupId: 'g-side', groupName: 'SIDE', choiceId: 'c-salad', choiceName: 'SALAD', priceDelta: 3 },
        ],
      }),
    })
    expect(prisma.wooOrder.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { totalAmount: 26 },
    })
  })

  it('returns 422 and writes nothing when a choice is unknown', async () => {
    const res = await PUT(
      req({
        items: [
          {
            id: 'li1',
            menuItemId: 'm1',
            qty: 1,
            unitPrice: 10,
            options: [
              { groupId: 'g-side', groupName: 'SIDE', choiceId: 'c-nope', choiceName: 'NOPE', priceDelta: 0 },
            ],
          },
        ],
      }),
      params,
    )

    expect(res.status).toBe(422)
    expect((await res.json()).violations[0].message).toBe('SIDE — UNKNOWN OPTION: NOPE')
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.wooOrderItem.update).not.toHaveBeenCalled()
  })

  it('clears the snapshot when a product has no option groups', async () => {
    loadOptionGroupsForItems.mockResolvedValue({ groupsByItem: new Map(), missingItemIds: [] })

    const res = await PUT(
      req({ items: [{ id: 'li1', menuItemId: 'm1', qty: 1, unitPrice: 10, options: [] }] }),
      params,
    )

    expect(res.status).toBe(200)
    expect(prisma.wooOrderItem.update).toHaveBeenCalledWith({
      where: { id: 'li1' },
      data: expect.objectContaining({ unitPrice: 10, options: null }),
    })
  })

  it('leaves a line untouched when the payload omits options', async () => {
    prisma.wooOrderItem.findMany.mockResolvedValue([
      {
        id: 'li1',
        unitPrice: 13,
        options: [
          { groupId: 'g-side', groupName: 'SIDE', choiceId: 'c-salad', choiceName: 'SALAD', priceDelta: 3 },
        ],
      },
    ])

    const res = await PUT(
      req({ items: [{ id: 'li1', menuItemId: 'm1', qty: 2, unitPrice: 13 }] }),
      params,
    )

    expect(res.status).toBe(200)
    const data = prisma.wooOrderItem.update.mock.calls[0][0].data
    expect(data.unitPrice).toBe(13)
    expect(data.options).toBeUndefined()
  })

  it('rejects a product that is not in the order venue', async () => {
    loadOptionGroupsForItems.mockResolvedValue({
      groupsByItem: new Map(),
      missingItemIds: ['m1'],
    })

    const res = await PUT(
      req({ items: [{ id: 'li1', menuItemId: 'm1', qty: 1, unitPrice: 10, options: [] }] }),
      params,
    )

    expect(res.status).toBe(422)
    expect((await res.json()).violations[0].message).toContain('NOT FOUND IN THIS VENUE')
  })
})
