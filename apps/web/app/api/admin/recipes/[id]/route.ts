import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { checkRecipeLineUnits } from '@/lib/recipe-line-kinds.server'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.recipes.edit')
  if (denied) return denied

  const recipe = await prisma.recipe.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && recipe.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, yieldQty, yieldUnitId, instructions, prepTime, lineItems, linkToMenu, price, wooProductId, wooCategoryId, imageUrl, shortDescription, isVariable, variations, dietaryInfo, swiftPosId, tastingNotes, vintage, howToServe } = await req.json()
  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = String(name).toUpperCase().trim()
  if (yieldQty !== undefined) data.yieldQty = parseFloat(String(yieldQty)) || 1
  if (yieldUnitId !== undefined) data.yieldUnitId = yieldUnitId
  if (instructions !== undefined) data.instructions = instructions || null
  if (prepTime !== undefined) data.prepTime = prepTime ? parseInt(String(prepTime)) : null

  if (lineItems !== undefined) {
    const lineError = await checkRecipeLineUnits(lineItems)
    if (lineError) return NextResponse.json({ error: lineError }, { status: 400 })
  }

  const txResult = await prisma.$transaction(async (tx) => {
    const r = await tx.recipe.update({ where: { id: params.id }, data })

    if (lineItems !== undefined) {
      await tx.recipeLineItem.deleteMany({ where: { recipeId: params.id } })
      if (Array.isArray(lineItems) && lineItems.length > 0) {
        for (let idx = 0; idx < lineItems.length; idx++) {
          const li = lineItems[idx]
          await tx.recipeLineItem.create({
            data: {
              recipeId: params.id,
              qty: parseFloat(String(li.qty)) || 1,
              uomId: li.uomId,
              inventoryItemId: li.inventoryItemId || null,
              childRecipeId: li.childRecipeId || null,
              ingredientReferenceId: li.ingredientReferenceId || null,
              sortOrder: idx,
            },
          })
        }
      }
    }

    // Recipes are prep/BOM only. Menu items (the sold products) are authored
    // separately in INVENTORY -> MENU ITEMS.
    const updated = await tx.recipe.findUnique({
      where: { id: params.id },
      include: {
        yieldUnit: { select: { id: true, name: true } },
        lineItems: {
          include: {
            inventoryItem: { select: { id: true, name: true, unit: true } },
            childRecipe: { select: { id: true, name: true } },
            ingredientReference: { select: { id: true, name: true, densityGramsPerMl: true, weightPerUnitGrams: true, notes: true } },
            uom: { select: { id: true, name: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
        menuItems: {
          select: { id: true, price: true, wooProductId: true, wooCategoryId: true, imageUrl: true, shortDescription: true, isVariable: true, variations: true, dietaryInfo: true, swiftPosId: true, tastingNotes: true, vintage: true, howToServe: true },
          where: { deletedAt: null },
        },
      },
    })
    return { updated }
  })

  const result = { ...(txResult.updated as any), menuItem: (txResult.updated as any)?.menuItems?.[0] ?? null }

  return NextResponse.json(result)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'ops.recipes.delete')
  if (denied) return denied

  const recipe = await prisma.recipe.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && recipe.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.recipe.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
