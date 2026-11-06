import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, tx, getServerSession, guardAccess, checkRecipeLineUnits } = vi.hoisted(() => {
  const tx = {
    recipe: { create: vi.fn() },
    menuItem: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  }
  return {
    prisma: { $transaction: vi.fn() },
    tx,
    getServerSession: vi.fn(),
    guardAccess: vi.fn(),
    checkRecipeLineUnits: vi.fn(),
  }
})

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/recipe-line-kinds.server', () => ({ checkRecipeLineUnits }))

import { POST } from './route'

const req = (body: unknown = {}) =>
  ({
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  }) as unknown as NextRequest

const SESSION = { user: { id: 'st1', role: 'ADMIN', venueId: 'v1' } }

describe('/api/admin/recipes POST', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerSession.mockResolvedValue(SESSION)
    guardAccess.mockResolvedValue(null)
    checkRecipeLineUnits.mockResolvedValue(null)
    tx.recipe.create.mockResolvedValue({ id: 'r1', name: 'BATTER' })
    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
  })

  it('creates a recipe without creating or updating a menu item', async () => {
    const res = await POST(
      req({
        name: 'BATTER',
        yieldQty: 1,
        lineItems: [],
        linkToMenu: true,
        price: 18,
        existingMenuItemId: 'm1',
      }),
    )

    expect(res.status).toBe(201)
    expect(tx.recipe.create).toHaveBeenCalled()
    expect(tx.menuItem.create).not.toHaveBeenCalled()
    expect(tx.menuItem.update).not.toHaveBeenCalled()
  })
})
