import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { db, tx, getServerSession, guardAccess } = vi.hoisted(() => {
  const tx = {
    menuItemOptionGroup: { update: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    menuItemOptionChoice: { update: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  }
  return {
    db: {
      menuItem: { findFirst: vi.fn() },
      menuItemOptionGroup: { findMany: vi.fn() },
      $transaction: vi.fn(),
    },
    tx,
    getServerSession: vi.fn(),
    guardAccess: vi.fn(),
  }
})

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@hospo-ops/db', () => ({ prisma: db }))

import { GET, PUT } from './route'

const params = { params: { id: 'p1' } }

function req(body?: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  db.menuItem.findFirst.mockResolvedValue({ id: 'p1', venueId: 'v1' })
  db.menuItemOptionGroup.findMany.mockResolvedValue([])
  db.$transaction.mockImplementation(async (cb: (client: typeof tx) => unknown) => cb(tx))
  tx.menuItemOptionGroup.create.mockResolvedValue({ id: 'g_new' })
  tx.menuItemOptionGroup.update.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id }))
  tx.menuItemOptionChoice.create.mockResolvedValue({ id: 'c_new' })
  tx.menuItemOptionChoice.update.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id }))
})

describe('GET /api/admin/menu-items/[id]/options', () => {
  it('returns the product’s live groups and choices', async () => {
    const groups = [{ id: 'g1', name: 'SIDE', choices: [{ id: 'c1', name: 'FRIES' }] }]
    db.menuItemOptionGroup.findMany.mockResolvedValue(groups)

    const res = await GET(req(), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(groups)
    expect(guardAccess).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'ops.menus.view')
  })

  it('is venue-locked for a manager', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u2', role: 'MANAGER', venueId: 'v2' } })

    const res = await GET(req(), params)
    expect(res.status).toBe(403)
  })
})

describe('PUT /api/admin/menu-items/[id]/options', () => {
  it('rejects an invalid max select', async () => {
    const res = await PUT(
      req({ groups: [{ name: 'SIDE', minSelect: 1, maxSelect: 3, choices: [{ name: 'FRIES' }] }] }),
      params,
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/MAX SELECT CANNOT EXCEED THE NUMBER OF CHOICES/)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('rejects more than one default in a single-select group', async () => {
    const res = await PUT(
      req({
        groups: [
          {
            name: 'SIDE',
            minSelect: 1,
            maxSelect: 1,
            choices: [
              { name: 'FRIES', isDefault: true },
              { name: 'SALAD', isDefault: true },
            ],
          },
        ],
      }),
      params,
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/ONLY ONE DEFAULT CHOICE/)
  })

  it('is venue-locked for a manager', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u2', role: 'MANAGER', venueId: 'v2' } })

    const res = await PUT(req({ groups: [] }), params)
    expect(res.status).toBe(403)
  })

  it('soft-deletes removed rows and revives soft-deleted rows by name', async () => {
    db.menuItemOptionGroup.findMany
      .mockResolvedValueOnce([
        {
          id: 'g1',
          name: 'SIDE',
          deletedAt: null,
          choices: [{ id: 'c1', name: 'FRIES', deletedAt: null }],
        },
        { id: 'g2', name: 'OLD', deletedAt: null, choices: [] },
        {
          id: 'g3',
          name: 'SAUCE',
          deletedAt: new Date('2026-01-01'),
          choices: [{ id: 'c3', name: 'GRAVY', deletedAt: new Date('2026-01-01') }],
        },
      ])
      .mockResolvedValueOnce([])

    const res = await PUT(
      req({
        groups: [
          { id: 'g1', name: 'SIDE', minSelect: 1, maxSelect: 1, choices: [{ id: 'c1', name: 'FRIES' }] },
          { name: 'SAUCE', minSelect: 0, maxSelect: 1, choices: [{ name: 'GRAVY' }] },
        ],
      }),
      params,
    )

    expect(res.status).toBe(200)
    // Existing live rows are updated in place (no recreate).
    expect(tx.menuItemOptionGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'g1' } }),
    )
    // A soft-deleted group + choice are revived, not created.
    expect(tx.menuItemOptionGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'g3' },
        data: expect.objectContaining({ deletedAt: null }),
      }),
    )
    expect(tx.menuItemOptionChoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c3' },
        data: expect.objectContaining({ deletedAt: null }),
      }),
    )
    expect(tx.menuItemOptionGroup.create).not.toHaveBeenCalled()
    expect(tx.menuItemOptionChoice.create).not.toHaveBeenCalled()
    // The group that was not in the payload (and its choices) is soft-deleted.
    expect(tx.menuItemOptionChoice.updateMany).toHaveBeenCalledWith({
      where: { groupId: { in: ['g2'] }, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    })
    expect(tx.menuItemOptionGroup.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['g2'] } },
      data: { deletedAt: expect.any(Date) },
    })
  })

  it('creates a brand-new group and its choices', async () => {
    tx.menuItemOptionGroup.create.mockResolvedValue({ id: 'g_new' })
    tx.menuItemOptionChoice.create.mockResolvedValueOnce({ id: 'c_new' })

    const res = await PUT(
      req({
        groups: [
          { name: 'COOKING', minSelect: 1, maxSelect: 1, choices: [{ name: 'RARE' }] },
        ],
      }),
      params,
    )

    expect(res.status).toBe(200)
    expect(tx.menuItemOptionGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ menuItemId: 'p1', name: 'COOKING', minSelect: 1, maxSelect: 1 }),
    })
    expect(tx.menuItemOptionChoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ groupId: 'g_new', name: 'RARE', priceDelta: 0 }),
    })
  })
})
