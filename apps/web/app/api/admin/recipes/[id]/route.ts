import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { pushProduct, pushProductDisconnect } from '@/lib/woo-push'
import { syncMenuItemCategory } from '@/lib/menu-sync'

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

  const { name, yieldQty, yieldUnitId, instructions, prepTime, lineItems, linkToMenu, price, wooProductId, wooCategoryId, imageUrl, shortDescription, isVariable, variations, dietaryInfo } = await req.json()
  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = String(name).toUpperCase().trim()
  if (yieldQty !== undefined) data.yieldQty = parseFloat(String(yieldQty)) || 1
  if (yieldUnitId !== undefined) data.yieldUnitId = yieldUnitId
  if (instructions !== undefined) data.instructions = instructions || null
  if (prepTime !== undefined) data.prepTime = prepTime ? parseInt(String(prepTime)) : null

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

    // Sync menu item link. `existing` is found with no deletedAt filter so
    // unchecking LINK TO WOO and re-checking it reconnects the SAME local row
    // (and its WooCommerce product id) instead of creating a duplicate.
    let revived = false
    let disconnectedId: string | null = null
    if (linkToMenu !== undefined) {
      const existing = await tx.menuItem.findFirst({
        where: { recipeId: params.id },
      })
      const wasDeleted = existing?.deletedAt != null
      if (linkToMenu) {
        const menuData: any = {
          price: parseFloat(String(price)) || 0,
          // On reconnect the form has no product id — keep the old one so the
          // product is re-enabled rather than duplicated on the store.
          wooProductId: wooProductId || existing?.wooProductId || null,
          wooCategoryId: wooCategoryId || null,
          imageUrl: imageUrl || null,
          shortDescription: shortDescription || null,
          isVariable: isVariable || false,
          variations: variations || null,
          deletedAt: wasDeleted ? null : undefined,
        }
        if (dietaryInfo !== undefined) menuData.dietaryInfo = dietaryInfo || null
        if (existing) {
          await tx.menuItem.update({ where: { id: existing.id }, data: menuData })
          revived = wasDeleted
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
      } else if (existing && !wasDeleted) {
        // Unticked: remove from menus, drop the category, and hide the store
        // product (draft + uncategorised) until it is reconnected.
        await tx.menuItem.update({
          where: { id: existing.id },
          data: { deletedAt: new Date(), wooCategoryId: null },
        })
        disconnectedId = existing.id
      }
    }

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
          select: { id: true, price: true, wooProductId: true, wooCategoryId: true, imageUrl: true, shortDescription: true, isVariable: true, variations: true, dietaryInfo: true },
          where: { deletedAt: null },
        },
      },
    })
    return { updated, revived, disconnectedId }
  })

  const result = { ...(txResult.updated as any), menuItem: (txResult.updated as any)?.menuItems?.[0] ?? null }

  // Push linked menu item changes to WooCommerce (best-effort — logs to SyncLog)
  const linkedMenuItem = (txResult.updated as any)?.menuItems?.[0]
  if (txResult.disconnectedId) {
    // Unticked — the local row is soft-deleted but still holds the product id.
    await pushProductDisconnect(txResult.disconnectedId)
  } else if (linkedMenuItem) {
    if (txResult.revived) {
      // Reconnected — restore the category from its menu memberships and
      // re-publish the store product (it was set to draft on disconnect).
      await syncMenuItemCategory(linkedMenuItem.id)
      await pushProduct(linkedMenuItem.id, { status: 'publish' })
    } else {
      await pushProduct(linkedMenuItem.id)
    }
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
