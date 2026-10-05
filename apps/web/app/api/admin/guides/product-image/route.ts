import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { pushProduct } from '@/lib/woo-push'

// Set a linked product's image from a product-reference table. The image is
// shared with the menu item (and pushed to WooCommerce), so the reference and
// the product — and the store — always show the same photo. Guarded by the
// playbook permission, since a reference author may not hold ops.*.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.edit')
  if (denied) return denied

  const { menuItemId, imageUrl } = (await req.json()) as {
    menuItemId?: string
    imageUrl?: string | null
  }
  if (!menuItemId) return NextResponse.json({ error: 'menuItemId is required' }, { status: 400 })

  const item = await prisma.menuItem.findFirst({
    where: { id: menuItemId, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && item.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.menuItem.update({ where: { id: item.id }, data: { imageUrl: imageUrl || null } })

  // Best-effort push — logs to SyncLog, never blocks the reference save.
  try {
    await pushProduct(item.id)
  } catch { /* ignore */ }

  return NextResponse.json({ success: true, imageUrl: imageUrl || null })
}
