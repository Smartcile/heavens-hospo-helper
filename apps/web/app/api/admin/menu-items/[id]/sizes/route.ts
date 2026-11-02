import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { pushProduct } from '@/lib/woo-push'
import { guardAccess } from '@/lib/permissions'
import { cleanSizes } from '@/lib/menu-lines'

/**
 * Save a product's size/price options. Sizes live on the product
 * (`MenuItem.variations`, shared across every menu it is on) — this is the
 * builder's write path. Existing variation objects are preserved by name so a
 * WooCommerce `wooVariationId` survives an edit.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.menus.edit')
  if (denied) return denied

  const item = await prisma.menuItem.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true, variations: true },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && item.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json()) as { sizes?: unknown }
  const sizes = cleanSizes(body.sizes)
  const previous = Array.isArray(item.variations)
    ? (item.variations as { name?: string; price?: number; wooVariationId?: string }[])
    : []
  const merged = sizes.map((s) => {
    const prev = previous.find((v) => String(v?.name ?? '').toUpperCase() === s.label)
    return prev ? { ...prev, name: s.label, price: s.price } : { name: s.label, price: s.price }
  })

  const updated = await prisma.menuItem.update({
    where: { id: params.id },
    data: { isVariable: merged.length > 0, variations: merged },
    include: { recipe: { select: { id: true, name: true } } },
  })

  // Best-effort push (creates/reconciles the store's variable product).
  await pushProduct(updated.id)

  return NextResponse.json(updated)
}
