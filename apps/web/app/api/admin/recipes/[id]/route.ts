import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { pushProduct } from '@/lib/woo-push'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const recipe = await prisma.recipe.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && recipe.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, yieldQty, yieldUnitId, instructions, prepTime, lineItems, linkToMenu, price, wooProductId, wooCategoryId, dietaryInfo } = await req.json()
  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = String(name).toUpperCase().trim()
  if (yieldQty !== undefined) data.yieldQty = parseFloat(String(yieldQty)) || 1
  if (yieldUnitId !== undefined) data.yieldUnitId = yieldUnitId
  if (instructions !== undefined) data.instructions = instructions || null
  if (prepTime !== undefined) data.prepTime = prepTime ? parseInt(String(prepTime)) : null

  const updated = await prisma.$transaction(async (tx) => {
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
              sortOrder: idx,
            },
          })
        }
      }
    }

    // Sync menu item link
    if (linkToMenu !== undefined) {
      const existing = await tx.menuItem.findFirst({
        where: { recipeId: params.id, deletedAt: null },
      })
      if (linkToMenu) {
        const menuData: any = {
          price: parseFloat(String(price)) || 0,
          wooProductId: wooProductId || null,
          wooCategoryId: wooCategoryId || null,
        }
        if (dietaryInfo !== undefined) menuData.dietaryInfo = dietaryInfo || null
        if (existing) {
          await tx.menuItem.update({ where: { id: existing.id }, data: menuData })
        } else {
          await tx.menuItem.create({
            data: {
              venueId: session.user.venueId,
              name: String(data.name),
              recipeId: params.id,
              ...menuData,
            },
          })
        }
      } else if (existing) {
        await tx.menuItem.update({ where: { id: existing.id }, data: { deletedAt: new Date() } })
      }
    }

    return tx.recipe.findUnique({
      where: { id: params.id },
      include: {
        yieldUnit: { select: { id: true, name: true } },
        lineItems: {
          include: {
            inventoryItem: { select: { id: true, name: true, unit: true } },
            childRecipe: { select: { id: true, name: true } },
            uom: { select: { id: true, name: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
        menuItems: { select: { id: true, price: true, wooProductId: true, wooCategoryId: true, dietaryInfo: true } },
      },
    })
  })

  const result = { ...(updated as any), menuItem: (updated as any)?.menuItems?.[0] ?? null }

  // Push linked menu item changes to WooCommerce (best-effort — logs to SyncLog)
  const linkedMenuItem = (updated as any)?.menuItems?.[0]
  if (linkedMenuItem) {
    await pushProduct(linkedMenuItem.id)
  }

  return NextResponse.json(result)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
