import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { checkRecipeLineUnits } from '@/lib/recipe-line-kinds.server'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.recipes.view')
  if (denied) return denied

  const venueId = session.user.role === 'MANAGER'
    ? session.user.venueId
    : req.nextUrl.searchParams.get('venueId') || session.user.venueId

  const recipes = await prisma.recipe.findMany({
    where: { venueId, deletedAt: null },
    include: {
      yieldUnit: { select: { id: true, name: true } },
      lineItems: {
        include: {
          inventoryItem: { select: { id: true, name: true, unit: true, allergyInfo: true } },
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
    orderBy: { name: 'asc' },
  })
  // Flatten menuItems to single menuItem for the first linked item
  const result = recipes.map(({ menuItems, ...r }) => ({
    ...r,
    menuItem: menuItems.length > 0 ? menuItems[0] : null,
  }))
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.recipes.create')
  if (denied) return denied

  const { name, yieldQty, yieldUnitId, instructions, prepTime, lineItems, linkToMenu, price, wooProductId, wooCategoryId, imageUrl, shortDescription, isVariable, variations, existingMenuItemId, dietaryInfo, swiftPosId, tastingNotes, vintage, howToServe, venueId: bodyVenueId } = await req.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const lineError = await checkRecipeLineUnits(lineItems)
  if (lineError) return NextResponse.json({ error: lineError }, { status: 400 })

  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : (bodyVenueId || session.user.venueId)

  const recipe = await prisma.$transaction(async (tx) => {
    const r = await tx.recipe.create({
      data: {
        venueId,
        name: name.toUpperCase().trim(),
        yieldQty: parseFloat(String(yieldQty)) || 1,
        yieldUnitId,
        instructions: instructions || null,
        prepTime: prepTime ? parseInt(String(prepTime)) : null,
        lineItems: lineItems?.length ? {
          create: lineItems.map((li: any, idx: number) => ({
            qty: parseFloat(String(li.qty)) || 1,
            uomId: li.uomId,
            inventoryItemId: li.inventoryItemId || null,
            childRecipeId: li.childRecipeId || null,
            ingredientReferenceId: li.ingredientReferenceId || null,
            sortOrder: idx,
          })),
        } : undefined,
      },
      include: { lineItems: true, yieldUnit: { select: { id: true, name: true } } },
    })
    // Recipes are prep/BOM only. Menu items (the sold products) are authored
    // separately in INVENTORY -> MENU ITEMS.
    return r
  })

  return NextResponse.json(recipe, { status: 201 })
}
