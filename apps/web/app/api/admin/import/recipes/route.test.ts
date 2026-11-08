import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    recipe: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    inventoryItem: { findMany: vi.fn() },
    ingredientReference: { findMany: vi.fn() },
    unitOfMeasure: { findMany: vi.fn() },
    recipeLineItem: { deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))

import { GET, POST } from './route'

const getReq = (url = 'http://localhost/api/admin/import/recipes') =>
  ({ nextUrl: new URL(url) } as unknown as NextRequest)

const postReq = (body: unknown) =>
  ({ json: async () => body } as unknown as NextRequest)

function recipeRow(overrides: Record<string, unknown> = {}) {
  return {
    action: 'CREATE',
    values: {
      name: 'ROAST CHICKEN',
      yieldQty: 4,
      yieldUnit: 'PORTION',
      prepTime: 90,
      instructions: 'Roast it.',
      lines: [{ target: 'ITEM', name: 'CHICKEN WHOLE', qty: 1.5, uom: 'KG' }],
      replaceLines: false,
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  prisma.recipe.findMany.mockResolvedValue([
    { id: 'r1', name: 'SAUCE', yieldUnit: { kind: 'COUNT' } },
  ])
  prisma.inventoryItem.findMany.mockResolvedValue([
    { id: 'i1', name: 'CHICKEN WHOLE', unit: 'KG', densityGramsPerMl: null, weightPerUnitGrams: null },
  ])
  prisma.ingredientReference.findMany.mockResolvedValue([
    { id: 'p1', name: 'SALT', venueId: null },
  ])
  prisma.unitOfMeasure.findMany.mockResolvedValue([
    { id: 'u-kg', name: 'KG', baseUnit: 'g', conversionRatio: 1000, kind: 'MASS', venueId: null },
    { id: 'u-g', name: 'G', baseUnit: 'g', conversionRatio: 1, kind: 'MASS', venueId: null },
    { id: 'u-portion', name: 'PORTION', baseUnit: 'ea', conversionRatio: 1, kind: 'COUNT', venueId: null },
  ])
  prisma.recipe.findFirst.mockResolvedValue(null)
  prisma.recipe.create.mockResolvedValue({ id: 'new1' })
  prisma.recipe.update.mockResolvedValue({ id: 'r1' })
  prisma.recipeLineItem.deleteMany.mockResolvedValue({ count: 0 })
  prisma.recipeLineItem.createMany.mockResolvedValue({ count: 1 })
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
})

describe('GET /api/admin/import/recipes', () => {
  it('returns venue-scoped candidate lists', async () => {
    const res = await GET(getReq())
    const body = await res.json()

    expect(prisma.recipe.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ venueId: 'v1' }) }))
    expect(body.recipes).toEqual([{ id: 'r1', name: 'SAUCE', yieldUnitKind: 'COUNT' }])
    expect(body.items[0].name).toBe('CHICKEN WHOLE')
    expect(body.uoms.some((u: { name: string }) => u.name === 'KG')).toBe(true)
    expect(body.pantry).toEqual([{ id: 'p1', name: 'SALT' }])
  })

  it('locks a MANAGER to their own venue', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'MANAGER', venueId: 'vm' } })
    await GET(getReq('http://localhost/api/admin/import/recipes?venueId=other'))
    expect(prisma.recipe.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ venueId: 'vm' }) }))
  })
})

describe('POST /api/admin/import/recipes', () => {
  it('creates a recipe with resolved line ids', async () => {
    const res = await POST(postReq({ rows: [recipeRow()] }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.created).toBe(1)
    const create = prisma.recipe.create.mock.calls[0][0]
    expect(create.data).toMatchObject({
      venueId: 'v1',
      name: 'ROAST CHICKEN',
      yieldQty: 4,
      yieldUnitId: 'u-portion',
      prepTime: 90,
      instructions: 'Roast it.',
    })
    expect(create.data.lineItems.create).toEqual([
      expect.objectContaining({ qty: 1.5, uomId: 'u-kg', inventoryItemId: 'i1', childRecipeId: null, ingredientReferenceId: null }),
    ])
  })

  it('skips a row whose line target is unknown and never invents it', async () => {
    const row = recipeRow({
      values: {
        name: 'MYSTERY DISH',
        yieldQty: 1,
        yieldUnit: 'PORTION',
        lines: [{ target: 'ITEM', name: 'UNOBTAINIUM', qty: 1, uom: 'G' }],
        replaceLines: false,
      },
    })
    const res = await POST(postReq({ rows: [row] }))
    const body = await res.json()

    expect(body.created).toBe(0)
    expect(body.skipped).toBe(1)
    expect(body.warnings.some((w: string) => w.includes('NOT FOUND IN INVENTORY'))).toBe(true)
    expect(prisma.recipe.create).not.toHaveBeenCalled()
  })

  it('updates a recipe without touching lines unless REPLACE LINES is ticked', async () => {
    prisma.recipe.findFirst.mockResolvedValue({ id: 'r1' })
    const row = recipeRow({ action: 'UPDATE', targetId: 'r1' })

    const res = await POST(postReq({ rows: [row] }))
    const body = await res.json()

    expect(body.updated).toBe(1)
    expect(prisma.recipe.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'r1' } }))
    expect(prisma.recipeLineItem.deleteMany).not.toHaveBeenCalled()
    expect(prisma.recipeLineItem.createMany).not.toHaveBeenCalled()
  })

  it('replaces lines when REPLACE LINES is ticked', async () => {
    prisma.recipe.findFirst.mockResolvedValue({ id: 'r1' })
    const row = recipeRow({
      action: 'UPDATE',
      targetId: 'r1',
      values: {
        name: 'ROAST CHICKEN',
        yieldQty: 4,
        yieldUnit: 'PORTION',
        lines: [{ target: 'ITEM', name: 'CHICKEN WHOLE', qty: 2, uom: 'KG' }],
        replaceLines: true,
      },
    })

    const res = await POST(postReq({ rows: [row] }))
    const body = await res.json()

    expect(body.updated).toBe(1)
    expect(prisma.recipeLineItem.deleteMany).toHaveBeenCalledWith({ where: { recipeId: 'r1' } })
    expect(prisma.recipeLineItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ recipeId: 'r1', qty: 2, uomId: 'u-kg', inventoryItemId: 'i1' })],
    })
  })

  it('skips CREATE when an active recipe with that name exists', async () => {
    prisma.recipe.findFirst.mockResolvedValue({ id: 'r9' })

    const res = await POST(postReq({ rows: [recipeRow()] }))
    const body = await res.json()

    expect(body.created).toBe(0)
    expect(body.skipped).toBe(1)
    expect(body.warnings.some((w: string) => w.includes('ALREADY EXISTS'))).toBe(true)
    expect(prisma.recipe.create).not.toHaveBeenCalled()
  })

  it('requires edit permission for an UPDATE row', async () => {
    guardAccess.mockImplementation(async (_s: unknown, _r: unknown, key: string) =>
      key === 'ops.recipes.edit' ? { status: 403 } : null)
    prisma.recipe.findFirst.mockResolvedValue({ id: 'r1' })

    const res = await POST(postReq({ rows: [recipeRow({ action: 'UPDATE', targetId: 'r1' })] }))

    expect(res.status).toBe(403)
    expect(prisma.recipe.update).not.toHaveBeenCalled()
  })

  it('locks a MANAGER import to their own venue', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'MANAGER', venueId: 'vm' } })

    await POST(postReq({ venueId: 'other', rows: [recipeRow()] }))

    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ venueId: 'vm' }) }))
    expect(prisma.recipe.create.mock.calls[0][0].data.venueId).toBe('vm')
  })

  it('rejects an empty payload', async () => {
    const res = await POST(postReq({ rows: [] }))
    expect(res.status).toBe(400)
  })
})
