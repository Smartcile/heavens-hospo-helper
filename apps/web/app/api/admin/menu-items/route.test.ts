import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    menuItem: { findFirst: vi.fn(), create: vi.fn() },
    menuItemVenue: { createMany: vi.fn() },
    recipe: { count: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/menu-lines.server', () => ({ optionGroupInclude: {} }))
vi.mock('@/lib/gift-cards-woo', () => ({ isGiftCardCategorized: () => false }))

import { POST } from './route'

const req = (body: unknown = {}) =>
  ({
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  }) as unknown as NextRequest

const SESSION = { user: { id: 'st1', role: 'ADMIN', venueId: 'v1' } }

describe('/api/admin/menu-items POST', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerSession.mockResolvedValue(SESSION)
    guardAccess.mockResolvedValue(null)
    prisma.menuItem.findFirst.mockResolvedValue(null)
    prisma.menuItem.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'm1', ...data }))
    prisma.recipe.count.mockResolvedValue(1)
  })

  it('creates a menu item without a recipe', async () => {
    const res = await POST(req({ name: 'FISH & CHIPS', recipeId: null, price: 18 }))

    expect(res.status).toBe(201)
    expect(prisma.recipe.count).not.toHaveBeenCalled()
    expect(prisma.menuItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'FISH & CHIPS',
          recipeId: null,
          price: 18,
          dietaryInfo: null,
        }),
      }),
    )
  })

  it('rejects a recipe from another venue', async () => {
    prisma.recipe.count.mockResolvedValue(0)

    const res = await POST(req({ name: 'FISH & CHIPS', recipeId: 'other-recipe', price: 18 }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'RECIPE IS NOT IN THIS VENUE' })
    expect(prisma.menuItem.create).not.toHaveBeenCalled()
  })
})
