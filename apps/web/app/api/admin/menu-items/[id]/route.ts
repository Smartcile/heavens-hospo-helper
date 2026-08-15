import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { pushProduct } from '@/lib/woo-push'
import { guardAccess } from '@/lib/permissions'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.menus.edit')
  if (denied) return denied

  const item = await prisma.menuItem.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && item.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, recipeId, price, wooProductId, wooCategoryId, imageUrl, shortDescription, isVariable, variations, description } = await req.json()
  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = String(name).toUpperCase().trim()
  if (recipeId !== undefined) data.recipeId = recipeId
  if (price !== undefined) data.price = parseFloat(String(price)) || 0
  if (wooProductId !== undefined) data.wooProductId = wooProductId || null
  if (wooCategoryId !== undefined) data.wooCategoryId = wooCategoryId || null
  if (imageUrl !== undefined) data.imageUrl = imageUrl || null
  if (shortDescription !== undefined) data.shortDescription = shortDescription || null
  if (isVariable !== undefined) data.isVariable = isVariable
  if (variations !== undefined) data.variations = variations
  if (description !== undefined) data.description = description || null

  const updated = await prisma.menuItem.update({
    where: { id: params.id },
    data,
    include: { recipe: { select: { id: true, name: true } } },
  })

  // Push the change to WooCommerce (best-effort — logs to SyncLog, never throws)
  await pushProduct(updated.id)

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'ops.menus.delete')
  if (denied) return denied

  const item = await prisma.menuItem.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && item.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.menuItem.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
