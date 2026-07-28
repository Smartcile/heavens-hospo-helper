import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params {
  params: { id: string }
}

// PATCH /api/admin/menu-item-venues/[id] — update price override on a shared menu item
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.menuItemVenue.findUnique({
    where: { id: params.id },
    select: { venueId: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only managers/admins of the receiving venue can override the price
  if (session.user.role === 'MANAGER' && session.user.venueId !== existing.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { priceOverride } = body

  if (priceOverride !== undefined) {
    await prisma.menuItemVenue.update({
      where: { id: params.id },
      data: { priceOverride: priceOverride === null ? null : Number(priceOverride) },
    })
  }

  const updated = await prisma.menuItemVenue.findUnique({
    where: { id: params.id },
    include: { menuItem: { select: { id: true, name: true, price: true } } },
  })

  return NextResponse.json(updated)
}
