import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const recipes = await prisma.recipe.findMany({
    where: { venueId: session.user.venueId, deletedAt: null },
    include: {
      yieldUnit: { select: { id: true, name: true } },
      lineItems: {
        include: {
          inventoryItem: { select: { id: true, name: true, unit: true, allergyInfo: true } },
          childRecipe: { select: { id: true, name: true } },
          uom: { select: { id: true, name: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
      menuItems: { select: { id: true, price: true, wooProductId: true, wooCategoryId: true, dietaryInfo: true } },
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

  const { name, yieldQty, yieldUnitId, instructions, prepTime, lineItems, linkToMenu, price, wooProductId, wooCategoryId, existingMenuItemId } = await req.json()
  if (!name?.trim() || !yieldUnitId) {
    return NextResponse.json({ error: 'name and yieldUnitId are required' }, { status: 400 })
  }

  const recipe = await prisma.$transaction(async (tx) => {
    const r = await tx.recipe.create({
      data: {
        venueId: session.user.venueId,
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
            sortOrder: idx,
          })),
        } : undefined,
      },
      include: { lineItems: true, yieldUnit: { select: { id: true, name: true } } },
    })

    if (linkToMenu) {
      if (existingMenuItemId) {
        await tx.menuItem.update({
          where: { id: existingMenuItemId },
          data: {
            recipeId: r.id,
            price: parseFloat(String(price)) || 0,
            wooCategoryId: wooCategoryId || null,
            dietaryInfo: dietaryInfo || null,
          },
        })
      } else {
        await tx.menuItem.create({
          data: {
            venueId: session.user.venueId,
            name: name.toUpperCase().trim(),
            recipeId: r.id,
            price: parseFloat(String(price)) || 0,
            wooProductId: wooProductId || null,
            wooCategoryId: wooCategoryId || null,
            dietaryInfo: dietaryInfo || null,
          },
        })
      }
    }

    return r
  })

  return NextResponse.json(recipe, { status: 201 })
}
