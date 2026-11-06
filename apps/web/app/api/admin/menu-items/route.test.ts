import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    menuItem: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    menuItemVenue: { findMany: vi.fn(), createMany: vi.fn() },
    venue: { findMany: vi.fn() },
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

import { GET, POST } from './route'

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
    prisma.menuItem.findMany.mockResolvedValue([])
    prisma.menuItemVenue.findMany.mockResolvedValue([])
    prisma.venue.findMany.mockResolvedValue([])
    prisma.menuItem.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'm1', ...data }))
    prisma.recipe.count.mockResolvedValue(1)
  })

  it('GET derives locked allergens from the attached recipe', async () => {
    prisma.menuItem.findMany.mockResolvedValue([
      {
        id: 'm1', name: 'FISH & CHIPS', venueId: 'v1', wooCategoryId: null, recipeId: 'r1',
        price: 18, recipe: {
          id: 'r1', name: 'BATTER',
          lineItems: [
            { inventoryItem: { id: 'i1', name: 'WHEAT FLOUR', allergyInfo: 'GLUTEN' }, childRecipe: null },
          ],
        },
      },
    ])
    prisma.venue.findMany.mockResolvedValue([{ id: 'v1', giftCardWooCategoryId: null }])

    const res = await GET(new NextRequest('http://localhost/api/admin/menu-items?venueId=v1'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body[0].recipeAllergens).toEqual([
      { allergen: 'GLUTEN', source: 'WHEAT FLOUR', inherited: true },
    ])
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
